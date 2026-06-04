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

const createAuditLog = (action, details, performed_by, type = 'info', level = 'low') => {
  db.run("INSERT INTO audit_logs (action, details, performed_by, type, level) VALUES (?, ?, ?, ?, ?)",
    [action, JSON.stringify(details), performed_by, type, level], (err) => {
      if (err) console.error("Erro ao gravar log de auditoria:", err);
    });
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
    SELECT 
      p.*,
      c.name AS category_name, 
      s.name AS supplier_name, 
      c.target_margin as category_margin,
      COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) as target_margin,
      CASE 
        WHEN p.avg_cost > 0 AND p.price > 0 THEN ROUND(((p.price - p.avg_cost) / p.avg_cost) * 100, 2)
        ELSE 0
      END as current_margin_percent,
      CASE 
        WHEN p.avg_cost > 0 AND p.price > 0 THEN
          CASE 
            WHEN ROUND(((p.price - p.avg_cost) / p.avg_cost) * 100, 2) < COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) THEN 'low_margin'
            WHEN ROUND(((p.price - p.avg_cost) / p.avg_cost) * 100, 2) > (COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) + 10) THEN 'high_margin'
            ELSE 'ok'
          END
        ELSE 'no_cost'
      END as margin_status
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.name
  `, [], (err, rows) => res.json(rows || []));
});

router.post("/products", authenticateToken, requireRole("supervisor"), (req, res) => {
  const { name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost, profit_margin, image_url } = req.body;
  db.get(
    "INSERT INTO products (name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost, product_profit_margin, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
    [name, sku, unit_type, price, category_id, supplier_id, min_stock, avg_cost || 0, profit_margin || null, image_url || null],
    (err, row) => {
      if (err) return res.status(400).json({ message: "Erro ao criar produto: " + err.message });
      res.status(201).json(row);
    }
  );
});

router.put("/products/:id/price", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { price } = req.body;
    db.run("UPDATE products SET price = ? WHERE id = ?", [price, req.params.id], (err) => {
        if (err) return res.status(500).json({ message: "Erro ao atualizar preço." });
        db.get("SELECT * FROM products WHERE id = ?", [req.params.id], (errGet, product) => {
            res.json(product || { status: "ok" });
        });
    });
});

router.put("/products/:id", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, sku, unit_type, price, category_id, supplier_id, min_stock, current_stock, avg_cost, profit_margin, image_url } = req.body;
    db.run(
        "UPDATE products SET name=?, sku=?, unit_type=?, price=?, category_id=?, supplier_id=?, min_stock=?, current_stock=?, avg_cost=?, product_profit_margin=?, image_url=? WHERE id=?",
        [name, sku, unit_type, price, category_id, supplier_id, min_stock, current_stock, avg_cost || 0, profit_margin || null, image_url || null, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ message: "Erro ao atualizar produto: " + err.message });
            db.get("SELECT * FROM products WHERE id = ?", [req.params.id], (errGet, product) => {
                res.json(product || { status: "ok" });
            });
        }
    );
});

// --- ESTOQUE ---
router.post("/stock/adjust", authenticateToken, requireRole("supervisor"), (req, res) => {
  const { product_id, delta, reason, unit_cost } = req.body;
  runWithTransaction((tx, finish) => {
    // Buscar dados atuais para cálculo de custo médio
    tx.get("SELECT current_stock, avg_cost FROM products WHERE id = ?", [product_id], (err, p) => {
      if (err || !p) return finish(err || new Error("Produto não encontrado"));

      let newAvgCost = p.avg_cost;
      const currentStock = Number(p.current_stock);
      const deltaQty = Number(delta);
      const cost = Number(unit_cost || 0);

      // Cálculo de Custo Médio Automático (apenas em entradas positivas com custo informado)
      if (deltaQty > 0 && cost > 0) {
        const totalValue = (currentStock * p.avg_cost) + (deltaQty * cost);
        const totalQty = currentStock + deltaQty;
        newAvgCost = totalQty > 0 ? totalValue / totalQty : cost;
      }

      tx.run("UPDATE products SET current_stock = current_stock + ?, avg_cost = ?, last_cost = ? WHERE id = ?", 
        [deltaQty, newAvgCost, deltaQty > 0 ? cost : p.last_cost, product_id], (errU) => {
          if (errU) return finish(errU);
          
          // Se for entrada (compra), cria um novo lote
          if (deltaQty > 0) {
            tx.run("INSERT INTO product_batches (product_id, initial_quantity, current_quantity, unit_cost) VALUES (?, ?, ?, ?)",
              [product_id, deltaQty, deltaQty, cost], (errB) => {
                if (errB) return finish(errB);
                tx.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
                  [product_id, 'inbound', deltaQty, reason, req.user.id], (errM) => finish(errM));
              });
          } else {
            // Se for saída, consome os lotes (FIFO)
            let remainingToConsume = Math.abs(deltaQty);
            tx.all("SELECT id, current_quantity FROM product_batches WHERE product_id = ? AND current_quantity > 0 ORDER BY received_at ASC", [product_id], (errL, batches) => {
              if (errL) return finish(errL);
              
              const consumeNextBatch = (index) => {
                if (index >= batches.length || remainingToConsume <= 0) {
                  return tx.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
                    [product_id, 'outbound', deltaQty, reason, req.user.id], (errM) => finish(errM));
                }
                
                const batch = batches[index];
                const consumeAmount = Math.min(batch.current_quantity, remainingToConsume);
                remainingToConsume -= consumeAmount;
                
                tx.run("UPDATE product_batches SET current_quantity = current_quantity - ? WHERE id = ?", [consumeAmount, batch.id], (errCB) => {
                  if (errCB) return finish(errCB);
                  consumeNextBatch(index + 1);
                });
              };
              
              consumeNextBatch(0);
            });
          }
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
      createAuditLog("CAIXA_ABERTO", { opening_amount, notes }, req.user.id, 'system', 'medium');
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
  const { items, payment_method, customer_id, manual_discount } = req.body;
  const manualDiscountAmount = parseFloat(manual_discount) || 0;

  runWithTransaction((tx, finish) => {
    // --- VALIDAÇÃO DE FIADO ---
    const validateFiado = (callback) => {
      if (payment_method === "Fiado") {
        if (!customer_id) return finish(new Error("Cliente não informado para pagamento em Fiado."));
        tx.get("SELECT credit_limit, current_debt FROM customers WHERE id = ?", [customer_id], (err, customer) => {
          if (err || !customer) return finish(new Error("Cliente não encontrado para validação de fiado."));
          
          const totalGeralBruto = items.reduce((acc, it) => acc + (it.price * it.quantity), 0);
          const totalComDesconto = totalGeralBruto - manualDiscountAmount;
          
          if (customer.current_debt + totalComDesconto > customer.credit_limit) {
            return finish(new Error(`Limite de crédito excedido. Limite: R$ ${customer.credit_limit}. Dívida atual: R$ ${customer.current_debt}.`));
          }
          
          // Atualizar dívida do cliente
          tx.run("UPDATE customers SET current_debt = current_debt + ? WHERE id = ?", [totalComDesconto, customer_id], (errU) => {
            if (errU) return finish(errU);
            callback();
          });
        });
      } else {
        callback();
      }
    };

    validateFiado(() => {
      const processItem = (idx) => {
        if (idx >= items.length) return finish(null);
        const item = items[idx];
        tx.get("SELECT * FROM products WHERE id = ?", [item.product_id], (err, p) => {
          if (!p) return finish(new Error(`Produto ID ${item.product_id} não encontrado`));

          // --- TRAVA DE ESTOQUE NEGATIVO ---
          if (Number(p.current_stock) < Number(item.quantity)) {
            return finish(new Error(`Estoque insuficiente para ${p.name}. Disponível: ${p.current_stock}`));
          }

          const subtotal = p.price * item.quantity;
          const totalGeralBruto = items.reduce((acc, it) => acc + (it.price * it.quantity), 0);
          const itemProportionalDiscount = totalGeralBruto > 0 ? (subtotal / totalGeralBruto) * manualDiscountAmount : 0;
          const finalTotal = subtotal - itemProportionalDiscount;

        tx.run(
          "INSERT INTO sales (product_id, quantity, total, discount_amount, final_total, payment_method, sold_by, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [item.product_id, item.quantity, subtotal, itemProportionalDiscount, finalTotal, payment_method, req.user.id, customer_id],
          (errS) => {
            if (errS) return finish(errS);
            tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [item.quantity, item.product_id], (errU) => {
              if (errU) return finish(errU);
              createAuditLog("VENDA_REALIZADA", { product_id: item.product_id, quantity: item.quantity, total: finalTotal }, req.user.id, 'sale', 'low');
              processItem(idx + 1);
            });
          }
        );
        });
      };
      processItem(0);
    });
  }, (err) => err ? res.status(400).json({ message: err.message }) : res.json({ status: "ok" }));
});

// --- CATEGORIAS E FORNECEDORES ---
router.get("/categories", authenticateToken, (req, res) => { db.all("SELECT id, name, description, created_at FROM categories ORDER BY name", [], (err, rows) => res.json(rows || [])); });
router.post("/categories", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, description } = req.body;
    db.get("INSERT INTO categories (name, description) VALUES (?, ?) RETURNING id", [name, description], (err, row) => {
        if (err) return res.status(400).json({ message: "Erro ao criar categoria." });
        res.status(201).json(row);
    });
});
router.put("/categories/:id", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, description } = req.body;
    db.run("UPDATE categories SET name=?, description=? WHERE id=?", [name, description, req.params.id], (err) => {
        if (err) return res.status(400).json({ message: "Erro ao atualizar categoria." });
        res.json({ status: "ok" });
    });
});
router.delete("/categories/:id", authenticateToken, requireRole("manager"), (req, res) => {
    db.run("DELETE FROM categories WHERE id=?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: "Erro ao excluir categoria." });
        res.json({ status: "ok" });
    });
});

router.get("/suppliers", authenticateToken, (req, res) => { db.all("SELECT * FROM suppliers", [], (err, rows) => res.json(rows)); });
router.post("/suppliers", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, contact, phone, email } = req.body;
    db.get("INSERT INTO suppliers (name, contact, phone, email) VALUES (?, ?, ?, ?) RETURNING id", [name, contact, phone, email], (err, row) => {
        if (err) return res.status(400).json({ message: "Erro ao criar fornecedor." });
        res.status(201).json(row);
    });
});
router.put("/suppliers/:id", authenticateToken, requireRole("supervisor"), (req, res) => {
    const { name, contact, phone, email } = req.body;
    db.run("UPDATE suppliers SET name=?, contact=?, phone=?, email=? WHERE id=?", [name, contact, phone, email, req.params.id], (err) => {
        if (err) return res.status(400).json({ message: "Erro ao atualizar fornecedor." });
        res.json({ status: "ok" });
    });
});
router.delete("/suppliers/:id", authenticateToken, requireRole("manager"), (req, res) => {
    db.run("DELETE FROM suppliers WHERE id=?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: "Erro ao excluir fornecedor." });
        res.json({ status: "ok" });
    });
});

// --- REPOSIÇÃO ---
router.get("/stock/restock-suggestions", authenticateToken, (req, res) => {
    db.all(`
        SELECT p.*, c.name as category_name, s.name as supplier_name 
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.current_stock <= p.min_stock
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar sugestões." });
        res.json(rows);
    });
});

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

// --- RELATÓRIOS ---
router.get("/reports/summary", authenticateToken, requireRole("manager"), (req, res) => {
    const { start, end } = req.query;
    db.get(`
        SELECT 
            COUNT(*) as total_sales,
            SUM(total) as total_revenue,
            (SELECT COUNT(*) FROM products WHERE current_stock <= min_stock) as critical_items
        FROM sales 
        WHERE created_at BETWEEN ? AND ?
    `, [start + " 00:00:00", end + " 23:59:59"], (err, row) => {
        if (err) return res.status(500).json({ message: "Erro ao gerar resumo." });
        res.json([row]);
    });
});

router.get("/reports/by-operator", authenticateToken, requireRole("manager"), (req, res) => {
    const { start, end } = req.query;
    db.all(`
        SELECT u.name as operator_name, COUNT(s.id) as sales_count, SUM(s.total) as total_revenue
        FROM sales s
        JOIN users u ON s.sold_by = u.id
        WHERE s.created_at BETWEEN ? AND ?
        GROUP BY u.id
    `, [start + " 00:00:00", end + " 23:59:59"], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao gerar relatório por operador." });
        res.json(rows);
    });
});

router.get("/reports/by-category", authenticateToken, requireRole("manager"), (req, res) => {
    const { start, end } = req.query;
    db.all(`
        SELECT c.name as category_name, COUNT(s.id) as sales_count, SUM(s.total) as total_revenue
        FROM sales s
        JOIN products p ON s.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        WHERE s.created_at BETWEEN ? AND ?
        GROUP BY c.id
    `, [start + " 00:00:00", end + " 23:59:59"], (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao gerar relatório por categoria." });
        res.json(rows);
    });
});

// --- AUDITORIA (LOGS) ---
router.get("/logs", authenticateToken, requireRole("manager"), (req, res) => {
    const { start, end, type, level } = req.query;
    let query = `
        SELECT l.*, u.name as user_name 
        FROM audit_logs l
        LEFT JOIN users u ON l.performed_by = u.id
        WHERE l.created_at BETWEEN ? AND ?
    `;
    const params = [start + " 00:00:00", end + " 23:59:59"];

    if (type && type !== 'all') {
        query += " AND l.type = ?";
        params.push(type);
    }
    if (level && level !== 'all') {
        query += " AND l.level = ?";
        params.push(level);
    }

    query += " ORDER BY l.created_at DESC LIMIT 500";

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ message: "Erro ao buscar logs: " + err.message });
        res.json(rows);
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
