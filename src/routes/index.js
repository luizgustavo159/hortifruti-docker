const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { calculateWeightedAverageCost } = require("../helpers/pricing-helpers");

const jwt = require("jsonwebtoken");
const db = require("../../db");
const config = require("../../config");
const { 
  generateAccessToken, 
  generateRefreshToken, 
  refreshTokenMiddleware,
  logoutMiddleware 
} = require("../middleware/tokenManagement");

const router = express.Router();
const { JWT_SECRET } = config;

// --- MIDDLEWARES ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Token não informado." });
  const token = authHeader.replace("Bearer ", "");
  return jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Token inválido." });
    db.get("SELECT * FROM sessions WHERE token = ? AND revoked_at IS NULL", [token], (sessionErr, session) => {
      if (sessionErr || !session) return res.status(401).json({ message: "Sessão expirada." });
      req.user = user;
      return next();
    });
  });
};

const requireRole = (role) => (req, res, next) => {
  const levels = { operator: 1, supervisor: 2, manager: 3, admin: 4 };
  if ((levels[req.user?.role] || 0) < levels[role]) return res.status(403).json({ message: "Acesso não autorizado." });
  next();
};

const runWithTransaction = (work, callback) => {
  db.withTransaction((tx, finish) => { work(tx, finish); }, callback);
};

const logAudit = ({ action, details, performedBy, type = "system" }) => {
  db.run("INSERT INTO audit_logs (action, details, performed_by, type) VALUES (?, ?, ?, ?)", [action, JSON.stringify(details), performedBy, type]);
};

// --- CLIENTES (FIADO) ---
router.get("/customers", authenticateToken, (req, res) => {
    db.all("SELECT * FROM customers ORDER BY name", [], (err, rows) => res.json(rows));
});

router.post("/customers", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, phone, credit_limit } = req.body;
    db.get("INSERT INTO customers (name, phone, credit_limit) VALUES (?, ?, ?) RETURNING id", [name, phone, credit_limit], (err, row) => {
        if (err) return res.status(400).json({ message: "Erro ao criar cliente." });
        res.status(201).json(row);
    });
});

// --- PRODUTOS ---
router.get("/products", authenticateToken, (req, res) => {
  db.all(`
    SELECT p.*, c.name AS category_name, s.name AS supplier_name,
    (SELECT MIN(received_at) FROM product_batches WHERE product_id = p.id AND current_quantity > 0) as oldest_batch
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.name
  `, [], (err, rows) => res.json(rows));
});

// --- ESTOQUE (LOTES FIFO) ---
router.post("/stock/adjust", authenticateToken, requireRole("supervisor"), (req, res) => {
  const { product_id, delta, reason, unit_cost, supplier_id } = req.body;
  
  runWithTransaction((tx, finish) => {
    tx.get("SELECT * FROM products WHERE id = ?", [product_id], (err, p) => {
        if (!p) return finish({ status: 404, message: "Produto não encontrado." });

        if (delta > 0) { // Entrada de Lote
            tx.get("INSERT INTO product_batches (product_id, initial_quantity, current_quantity, unit_cost, supplier_id) VALUES (?, ?, ?, ?, ?) RETURNING id", 
                [product_id, delta, delta, unit_cost || p.avg_cost, supplier_id], (errB, batch) => {
                
                const newAvgCost = calculateWeightedAverageCost(p.current_stock, p.avg_cost, delta, unit_cost || p.avg_cost);
                tx.run("UPDATE products SET current_stock = current_stock + ?, avg_cost = ?, last_cost = ? WHERE id = ?", [delta, newAvgCost, unit_cost || p.avg_cost, product_id]);
                tx.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by, batch_id) VALUES (?, 'inbound', ?, ?, ?, ?)", [product_id, delta, reason, req.user.id, batch.id]);
                finish(null);
            });
        } else { // Saída/Ajuste (FIFO)
            let remainingToDeduct = Math.abs(delta);
            tx.all("SELECT * FROM product_batches WHERE product_id = ? AND current_quantity > 0 ORDER BY received_at ASC", [product_id], (errL, batches) => {
                for (const b of batches) {
                    if (remainingToDeduct <= 0) break;
                    const deduct = Math.min(b.current_quantity, remainingToDeduct);
                    tx.run("UPDATE product_batches SET current_quantity = current_quantity - ? WHERE id = ?", [deduct, b.id]);
                    remainingToDeduct -= deduct;
                }
                tx.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [delta, product_id]);
                tx.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, 'adjust', ?, ?, ?)", [product_id, delta, reason, req.user.id]);
                finish(null);
            });
        }
    });
  }, (err) => err ? res.status(err.status || 500).json({ message: err.message }) : res.json({ status: "ok" }));
});

router.post("/stock/loss", authenticateToken, (req, res) => {
    const { product_id, quantity, reason } = req.body;
    runWithTransaction((tx, finish) => {
        let remaining = quantity;
        tx.all("SELECT * FROM product_batches WHERE product_id = ? AND current_quantity > 0 ORDER BY received_at ASC", [product_id], (err, batches) => {
            for (const b of batches) {
                if (remaining <= 0) break;
                const deduct = Math.min(b.current_quantity, remaining);
                tx.run("UPDATE product_batches SET current_quantity = current_quantity - ? WHERE id = ?", [deduct, b.id]);
                tx.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by, batch_id) VALUES (?, 'loss', ?, ?, ?, ?)", [product_id, -deduct, reason, req.user.id, b.id]);
                remaining -= deduct;
            }
            tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [quantity, product_id]);
            finish(null);
        });
    }, (err) => res.json({ status: "ok" }));
});

// --- VENDAS (BAIXA FIFO) ---
router.post("/sales", authenticateToken, (req, res) => {
  const { items, payment_method, customer_id, amount_received } = req.body;
  
  runWithTransaction((tx, finish) => {
    const processItem = (idx) => {
        if (idx >= items.length) return finish(null);
        const item = items[idx];
        
        tx.get("SELECT * FROM products WHERE id = ?", [item.product_id], (err, p) => {
            const total = p.price * item.quantity;
            tx.run("INSERT INTO sales (product_id, quantity, total, payment_method, sold_by, customer_id) VALUES (?, ?, ?, ?, ?, ?)", 
                [item.product_id, item.quantity, total, payment_method, req.user.id, customer_id]);
            
            // Baixa FIFO nos lotes
            let remaining = item.quantity;
            tx.all("SELECT * FROM product_batches WHERE product_id = ? AND current_quantity > 0 ORDER BY received_at ASC", [item.product_id], (errB, batches) => {
                for (const b of batches) {
                    if (remaining <= 0) break;
                    const deduct = Math.min(b.current_quantity, remaining);
                    tx.run("UPDATE product_batches SET current_quantity = current_quantity - ? WHERE id = ?", [deduct, b.id]);
                    remaining -= deduct;
                }
                tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [item.quantity, item.product_id]);
                
                if (payment_method === 'fiado' && customer_id) {
                    tx.run("UPDATE customers SET current_debt = current_debt + ? WHERE id = ?", [total, customer_id]);
                }
                processItem(idx + 1);
            });
        });
    };
    processItem(0);
  }, (err) => res.json({ status: "ok" }));
});

// --- CATEGORIAS, FORNECEDORES, ETC (OMITIDOS PARA BREVIDADE) ---
router.get("/categories", authenticateToken, (req, res) => { db.all("SELECT * FROM categories", [], (err, rows) => res.json(rows)); });
router.get("/suppliers", authenticateToken, (req, res) => { db.all("SELECT * FROM suppliers", [], (err, rows) => res.json(rows)); });
router.get("/pos/cash-session/current", authenticateToken, (req, res) => { db.get("SELECT * FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (err, row) => res.json(row)); });

module.exports = { router };
