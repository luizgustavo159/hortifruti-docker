const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../../db");
const config = require("../../config");
const { isTokenBlacklisted } = require("../middleware/tokenManagement");

const router = express.Router();
const authRouter = require("./auth");
const { JWT_SECRET } = config;

// --- AUTH ROUTES ---
router.use("/auth", authRouter);

// --- MIDDLEWARES ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Token não informado." });
  const token = authHeader.replace("Bearer ", "");
  
  return jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ message: "Token inválido." });
    
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({ message: "Sessão encerrada." });
    }

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

// --- CLIENTES ---
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
    SELECT p.*, c.name AS category_name, s.name AS supplier_name, c.target_margin as category_margin
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.name
  `, [], (err, rows) => res.json(rows));
});

router.post("/products", authenticateToken, requireRole("supervisor"), (req, res) => {
  const { name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost } = req.body;
  db.get(
    "INSERT INTO products (name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost || 0],
    (err, row) => {
      if (err) return res.status(400).json({ message: "Erro ao criar produto." });
      res.status(201).json(row);
    }
  );
});

router.put("/products/:id/price", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { price } = req.body;
    db.run("UPDATE products SET price = ? WHERE id = ?", [price, req.params.id], (err) => {
        if (err) return res.status(500).json({ message: "Erro ao atualizar preço." });
        res.json({ status: "ok" });
    });
});

// --- ESTOQUE ---
router.post("/stock/adjust", authenticateToken, requireRole("supervisor"), (req, res) => {
  const { product_id, delta, reason } = req.body;
  runWithTransaction((tx, finish) => {
    tx.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [delta, product_id], (err) => {
      if (err) return finish(err);
      tx.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
        [product_id, delta > 0 ? 'inbound' : 'outbound', delta, reason, req.user.id], (errM) => {
          finish(errM);
        });
    });
  }, (err) => err ? res.status(500).json({ message: "Erro ao ajustar estoque." }) : res.json({ status: "ok" }));
});

router.post("/stock/loss", authenticateToken, (req, res) => {
    const { product_id, quantity, reason } = req.body;
    runWithTransaction((tx, finish) => {
      tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [quantity, product_id], (err) => {
        if (err) return finish(err);
        tx.run("INSERT INTO stock_losses (product_id, quantity, reason) VALUES (?, ?, ?)",
          [product_id, quantity, reason], (errL) => {
            finish(errL);
          });
      });
    }, (err) => err ? res.status(500).json({ message: "Erro ao registrar perda." }) : res.json({ status: "ok" }));
});

// --- DESCONTOS ---
router.get("/discounts", authenticateToken, (req, res) => {
  db.all("SELECT * FROM discounts ORDER BY priority DESC, created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao buscar descontos." });
    res.json(rows);
  });
});

router.post("/discounts", authenticateToken, requireRole("manager"), (req, res) => {
  const { name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active } = req.body;
  db.get(`
    INSERT INTO discounts (name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `, [name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active], 
  (err, row) => {
    if (err) return res.status(400).json({ message: "Erro ao criar desconto." });
    res.status(201).json(row);
  });
});

router.put("/discounts/:id", authenticateToken, requireRole("manager"), (req, res) => {
  const { name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active } = req.body;
  db.run(`
    UPDATE discounts SET name=?, type=?, value=?, description=?, target_type=?, target_value=?, min_quantity=?, buy_quantity=?, get_quantity=?, starts_at=?, ends_at=?, starts_time=?, ends_time=?, days_of_week=?, stacking_rule=?, priority=?, active=?
    WHERE id = ?
  `, [name, type, value, description, target_type, target_value, min_quantity, buy_quantity, get_quantity, starts_at, ends_at, starts_time, ends_time, days_of_week, stacking_rule, priority, active, req.params.id], 
  (err) => {
    if (err) return res.status(400).json({ message: "Erro ao atualizar desconto." });
    res.json({ status: "ok" });
  });
});

router.delete("/discounts/:id", authenticateToken, requireRole("manager"), (req, res) => {
  db.run("DELETE FROM discounts WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: "Erro ao excluir desconto." });
    res.json({ status: "ok" });
  });
});

// --- CAIXA (POS) ---
router.get("/pos/cash-session/current", authenticateToken, (req, res) => {
  db.get("SELECT * FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ message: "Erro ao buscar sessão de caixa." });
    res.json(row || null);
  });
});

router.post("/pos/cash-session/open", authenticateToken, (req, res) => {
  const { opening_amount, notes } = req.body;
  db.get("INSERT INTO cash_sessions (operator_id, opening_amount, notes) VALUES (?, ?, ?) RETURNING *",
    [req.user.id, opening_amount, notes], (err, row) => {
      if (err) return res.status(400).json({ message: "Erro ao abrir caixa." });
      res.status(201).json(row);
    });
});

router.post("/pos/cash-session/close", authenticateToken, (req, res) => {
  const { closing_amount, notes } = req.body;
  db.run("UPDATE cash_sessions SET closed_at = CURRENT_TIMESTAMP, closing_amount = ?, notes = ? WHERE operator_id = ? AND closed_at IS NULL",
    [closing_amount, notes, req.user.id], (err) => {
      if (err) return res.status(400).json({ message: "Erro ao fechar caixa." });
      res.json({ status: "ok" });
    });
});

router.get("/pos/cash-session/movement", authenticateToken, (req, res) => {
  db.all(`
    SELECT m.*, u.name as performed_by_name 
    FROM cash_movements m
    JOIN cash_sessions s ON m.session_id = s.id
    JOIN users u ON m.performed_by = u.id
    WHERE s.operator_id = ? AND s.closed_at IS NULL
    ORDER BY m.created_at DESC
  `, [req.user.id], (err, rows) => {
    res.json(rows);
  });
});

router.post("/pos/cash-session/movement", authenticateToken, (req, res) => {
  const { type, amount, reason } = req.body;
  db.get("SELECT id FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (err, session) => {
    if (!session) return res.status(400).json({ message: "Nenhum caixa aberto." });
    db.run("INSERT INTO cash_movements (session_id, type, amount, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
      [session.id, type, amount, reason, req.user.id], (errM) => {
        if (errM) return res.status(400).json({ message: "Erro ao registrar movimento." });
        res.json({ status: "ok" });
      });
  });
});

// --- VENDAS ---
router.get("/sales/recent", authenticateToken, (req, res) => {
    db.all(`
        SELECT s.*, p.name as product_name, c.name as customer_name 
        FROM sales s 
        JOIN products p ON s.product_id = p.id 
        LEFT JOIN customers c ON s.customer_id = c.id
        ORDER BY s.created_at DESC LIMIT 50
    `, [], (err, rows) => res.json(rows));
});

router.post("/sales", authenticateToken, (req, res) => {
  const { items, payment_method, customer_id } = req.body;
  runWithTransaction((tx, finish) => {
    const processItem = (idx) => {
        if (idx >= items.length) return finish(null);
        const item = items[idx];
        tx.get("SELECT * FROM products WHERE id = ?", [item.product_id], (err, p) => {
            if (!p) return finish(new Error("Produto não encontrado"));
            const total = p.price * item.quantity;
            tx.run("INSERT INTO sales (product_id, quantity, total, payment_method, sold_by, customer_id) VALUES (?, ?, ?, ?, ?, ?)", 
                [item.product_id, item.quantity, total, payment_method, req.user.id, customer_id], (errS) => {
                  if (errS) return finish(errS);
                  tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [item.quantity, item.product_id], (errU) => {
                    if (errU) return finish(errU);
                    processItem(idx + 1);
                  });
                });
        });
    };
    processItem(0);
  }, (err) => err ? res.status(500).json({ message: "Erro ao processar venda." }) : res.json({ status: "ok" }));
});

// --- CATEGORIAS E FORNECEDORES ---
router.get("/categories", authenticateToken, (req, res) => { db.all("SELECT * FROM categories", [], (err, rows) => res.json(rows)); });
router.get("/suppliers", authenticateToken, (req, res) => { db.all("SELECT * FROM suppliers", [], (err, rows) => res.json(rows)); });

// --- USUÁRIOS ---
router.get("/users", authenticateToken, (req, res) => {
  db.all("SELECT id, name, email, role, is_active, phone, permissions, created_at FROM users WHERE is_active = 1", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao buscar usuários." });
    res.json(rows);
  });
});

router.post("/users", authenticateToken, requireRole("admin"), async (req, res) => {
  const { name, email, password, role, is_active } = req.body;
  const bcrypt = require("bcryptjs");
  const password_hash = await bcrypt.hash(password, 10);
  db.get("INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?) RETURNING id",
    [name, email, password_hash, role, is_active ? 1 : 0], (err, row) => {
      if (err) return res.status(400).json({ message: "Erro ao criar usuário: " + err.message });
      res.status(201).json(row);
    });
});

router.put("/users/:id", authenticateToken, requireRole("admin"), async (req, res) => {
  const { name, email, password, role, is_active } = req.body;
  if (password) {
    const bcrypt = require("bcryptjs");
    const password_hash = await bcrypt.hash(password, 10);
    db.run("UPDATE users SET name=?, email=?, password_hash=?, role=?, is_active=? WHERE id=?",
      [name, email, password_hash, role, is_active ? 1 : 0, req.params.id], (err) => {
        if (err) return res.status(400).json({ message: "Erro ao atualizar usuário." });
        res.json({ status: "ok" });
      });
  } else {
    db.run("UPDATE users SET name=?, email=?, role=?, is_active=? WHERE id=?",
      [name, email, role, is_active ? 1 : 0, req.params.id], (err) => {
        if (err) return res.status(400).json({ message: "Erro ao atualizar usuário." });
        res.json({ status: "ok" });
      });
  }
});

router.delete("/users/:id", authenticateToken, requireRole("admin"), (req, res) => {
  db.run("UPDATE users SET is_active = 0 WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: "Erro ao desativar usuário." });
    res.json({ status: "ok" });
  });
});

// --- CONFIGURAÇÕES ---
router.get("/settings", authenticateToken, (req, res) => {
  db.all("SELECT * FROM settings", [], (err, rows) => {
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  });
});

router.put("/settings", authenticateToken, requireRole("admin"), (req, res) => {
  const settings = req.body;
  runWithTransaction((tx, finish) => {
    Object.keys(settings).forEach(key => {
      tx.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [key, settings[key]]);
    });
    finish(null);
  }, (err) => res.json({ status: "ok" }));
});

// --- RELATÓRIOS (PLACEHOLDERS) ---
router.get("/reports/summary", authenticateToken, (req, res) => {
  res.json({ total_sales: 0, total_losses: 0, real_profit: 0, low_stock: [] });
});
router.get("/reports/by-operator", authenticateToken, (req, res) => { res.json([]); });
router.get("/reports/by-category", authenticateToken, (req, res) => { res.json([]); });
router.get("/reports/hourly-sales", authenticateToken, (req, res) => { res.json([]); });

// --- APROVAÇÕES ---
router.post("/approvals", authenticateToken, (req, res) => {
  res.json({ token: "dummy-token" });
});

module.exports = { router };
