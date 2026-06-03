const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { calculateWeightedAverageCost, calculateSuggestedPrice, calculateCurrentMarginPercent, calculateProfitPerUnit, calculateTotalProfitInStock, determineMarginStatus, calculateMarginDifference } = require("./helpers/pricing-helpers");

const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const db = require("../../db");
const config = require("../../config");
const {
  sendAlertNotification,
  sendPasswordResetNotification,
} = require("../services/notifications");
const { 
  generateAccessToken, 
  generateRefreshToken, 
  refreshTokenMiddleware,
  logoutMiddleware 
} = require("../middleware/tokenManagement");

const router = express.Router();

const {
  JWT_SECRET,
  ADMIN_BOOTSTRAP_TOKEN,
  PASSWORD_RESET_TTL_MINUTES,
  ALERT_SLOW_THRESHOLD_MS,
  METRICS_ENABLED,
} = config;

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Token não informado." });
  }
  const token = authHeader.replace("Bearer ", "");
  return jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token inválido." });
    }
    db.get(
      "SELECT * FROM sessions WHERE token = ? AND revoked_at IS NULL",
      [token],
      (sessionErr, session) => {
        if (sessionErr || !session) {
          return res.status(401).json({ message: "Sessão expirada." });
        }
        req.user = user;
        return next();
      }
    );
  });
};

const roleLevels = {
  operator: 1,
  supervisor: 2,
  manager: 3,
  admin: 4,
};

const hasRole = (user, role) => {
  const current = roleLevels[user?.role] || 0;
  return current >= roleLevels[role];
};

const requireRole = (role) => (req, res, next) => {
  if (!hasRole(req.user, role)) {
    return res.status(403).json({ message: "Acesso não autorizado." });
  }
  return next();
};

const requireAdmin = requireRole("admin");
const requireManager = requireRole("manager");
const requireSupervisor = requireRole("supervisor");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const runWithTransaction = (work, callback) => {
  db.withTransaction((tx, finish) => {
    work(tx, finish);
  }, callback);
};

const buildDocumentNumber = (saleId) => {
  const now = new Date();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate()
  ).padStart(2, "0")}`;
  return `PDV-${date}-${String(saleId).padStart(6, "0")}`;
};

const logAudit = ({ action, details, performedBy, approvedBy }) => {
  db.run(
    "INSERT INTO audit_logs (action, details, performed_by, approved_by) VALUES (?, ?, ?, ?)",
    [action, details ? JSON.stringify(details) : null, performedBy, approvedBy]
  );
};

const getSettings = (keys, callback) => {
  if (!keys.length) {
    callback({});
    return;
  }
  const placeholders = keys.map(() => "?").join(",");
  db.all(`SELECT key, value FROM settings WHERE key IN (${placeholders})`, keys, (err, rows) => {
    if (err) {
      callback({});
      return;
    }
    const result = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    callback(result);
  });
};

const parseDateRange = (req, res) => {
  const { start, end } = req.query;
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (start && Number.isNaN(startDate?.getTime())) {
    res.status(400).json({ message: "Data inicial inválida." });
    return null;
  }
  if (end && Number.isNaN(endDate?.getTime())) {
    res.status(400).json({ message: "Data final inválida." });
    return null;
  }
  if (startDate && endDate && startDate > endDate) {
    res.status(400).json({ message: "Intervalo de datas inválido." });
    return null;
  }
  return { start: start || null, end: end || null };
};

const buildDateFilter = (field, range) => {
  const conditions = [];
  const params = [];
  if (range?.start) {
    conditions.push(`CAST(${field} AS DATE) >= ?`);
    params.push(range.start);
  }
  if (range?.end) {
    conditions.push(`CAST(${field} AS DATE) <= ?`);
    params.push(range.end);
  }
  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
};

const verifyApprovalToken = (token, action, callback) => {
  if (!token) {
    callback({ status: 401, message: "Aprovação necessária." });
    return;
  }
  const tokenHash = hashToken(token);
  db.get(
    "SELECT * FROM approvals WHERE token_hash = ? AND action = ? AND used_at IS NULL",
    [tokenHash, action],
    (err, approval) => {
      if (err || !approval) {
        callback({ status: 403, message: "Aprovação inválida." });
        return;
      }
      const expiresAt = new Date(approval.expires_at);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
        callback({ status: 403, message: "Aprovação expirada." });
        return;
      }
      db.run("UPDATE approvals SET used_at = CURRENT_TIMESTAMP WHERE id = ?", [approval.id]);
      callback(null, approval);
    }
  );
};

const requireApproval = (action) => (req, res, next) => {
  const token = req.headers["x-approval-token"];
  verifyApprovalToken(token, action, (error, approval) => {
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }
    req.approval = approval;
    return next();
  });
};

// --- ROTAS DE AUTENTICAÇÃO ---

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"] || "0.0.0.0";

  db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }
    if (!user.is_active) {
      return res.status(403).json({ message: "Usuário inativo." });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return getSettings(["login_attempts", "lock_minutes"], (settings) => {
        const maxAttempts = Number(settings.login_attempts || 5);
        const lockMinutes = Number(settings.lock_minutes || 10);
        db.run("INSERT INTO login_attempts (email, ip) VALUES (?, ?)", [email, ip], () => {
          db.get("SELECT COUNT(*)::int as attempts FROM login_attempts WHERE email = ? AND created_at >= NOW() - INTERVAL '10 minutes'", [email], (countErr, row) => {
            const attempts = row?.attempts || 0;
            if (attempts >= maxAttempts) {
              return res.status(403).json({ message: "Muitas tentativas. Tente novamente mais tarde." });
            }
            return res.status(401).json({ message: "Credenciais inválidas." });
          });
        });
      });
    }

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id, user.email, user.role);

    db.run("DELETE FROM login_attempts WHERE email = ?", [email]);
    db.run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [user.id, accessToken], () => {
      res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      });
    });
  });
});

router.get("/auth/me", authenticateToken, (req, res) => {
  db.get("SELECT id, name, email, role FROM users WHERE id = ?", [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ message: "Usuário não encontrado." });
    res.json(user);
  });
});

router.post("/auth/logout", authenticateToken, logoutMiddleware);
router.post("/auth/refresh", refreshTokenMiddleware);

// --- CATEGORIAS ---

router.get("/categories", authenticateToken, (req, res) => {
  db.all("SELECT * FROM categories ORDER BY name", [], (err, rows) => res.json(rows));
});

router.post("/categories", authenticateToken, requireManager, (req, res) => {
  const { name, description = "" } = req.body;
  db.get("INSERT INTO categories (name, description) VALUES (?, ?) RETURNING id", [name, description], (err, row) => {
    if (err) return res.status(400).json({ message: "Erro ao criar categoria." });
    res.status(201).json({ id: row.id });
  });
});

router.put("/categories/:id", authenticateToken, requireManager, (req, res) => {
  const { name, description = "" } = req.body;
  db.run("UPDATE categories SET name = ?, description = ? WHERE id = ?", [name, description, req.params.id], (err) => {
    if (err) return res.status(400).json({ message: "Erro ao atualizar categoria." });
    res.json({ message: "Categoria atualizada." });
  });
});

router.delete("/categories/:id", authenticateToken, requireApproval("user_update"), (req, res) => {
  db.run("DELETE FROM categories WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(400).json({ message: "Erro ao excluir categoria." });
    res.json({ message: "Categoria excluída." });
  });
});

// --- FORNECEDORES ---

router.get("/suppliers", authenticateToken, requireSupervisor, (req, res) => {
  db.all("SELECT * FROM suppliers ORDER BY name", [], (err, rows) => res.json(rows));
});

router.post("/suppliers", authenticateToken, requireSupervisor, (req, res) => {
  const { name, contact = "", phone = "", email = "" } = req.body;
  db.get("INSERT INTO suppliers (name, contact, phone, email) VALUES (?, ?, ?, ?) RETURNING id", [name, contact, phone, email], (err, row) => {
    if (err) return res.status(400).json({ message: "Erro ao criar fornecedor." });
    res.status(201).json({ id: row.id });
  });
});

// --- PRODUTOS ---

router.get("/products", authenticateToken, (req, res) => {
  db.all(`
    SELECT p.*, c.name AS category_name, s.name AS supplier_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.name
  `, [], (err, rows) => res.json(rows));
});

router.post("/products", authenticateToken, requireSupervisor, (req, res) => {
  const p = req.body;
  db.get(`
    INSERT INTO products (name, sku, unit_type, price, current_stock, min_stock, max_stock, category_id, supplier_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `, [p.name, p.sku, p.unit_type, p.price, p.current_stock || 0, p.min_stock || 0, p.max_stock || 0, p.category_id, p.supplier_id, p.expires_at], (err, row) => {
    if (err) return res.status(400).json({ message: "Erro ao criar produto." });
    res.status(201).json({ id: row.id });
  });
});

// --- ESTOQUE ---

router.post("/stock/loss", authenticateToken, (req, res) => {
  const { product_id, quantity, reason } = req.body;
  runWithTransaction((tx, finish) => {
    tx.get("SELECT current_stock FROM products WHERE id = ?", [product_id], (err, p) => {
      if (!p || p.current_stock < quantity) return finish({ status: 400, message: "Estoque insuficiente." });
      tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [quantity, product_id], (err) => {
        if (err) return finish(err);
        tx.run("INSERT INTO stock_losses (product_id, quantity, reason, reported_by) VALUES (?, ?, ?, ?)", [product_id, quantity, reason, req.user.id], finish);
      });
    });
  }, (err) => err ? res.status(err.status || 500).json({ message: err.message }) : res.json({ status: "ok" }));
});

router.post("/stock/adjust", authenticateToken, requireSupervisor, (req, res) => {
  const { product_id, delta, reason } = req.body;
  db.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [delta, product_id], (err) => {
    if (err) return res.status(400).json({ message: "Erro ao ajustar estoque." });
    db.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, 'adjust', ?, ?, ?)", [product_id, delta, reason, req.user.id]);
    res.json({ status: "ok" });
  });
});

router.post("/stock/move", authenticateToken, requireSupervisor, (req, res) => {
  const { product_id, quantity, type, reason } = req.body;
  const delta = type === "inbound" ? quantity : -quantity;
  db.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [delta, product_id], (err) => {
    if (err) return res.status(400).json({ message: "Erro ao mover estoque." });
    db.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)", [product_id, type, delta, reason, req.user.id]);
    res.json({ status: "ok" });
  });
});

router.get("/stock/restock-suggestions", authenticateToken, (req, res) => {
  db.all("SELECT * FROM products WHERE current_stock <= min_stock", [], (err, rows) => res.json(rows));
});

// --- VENDAS E PDV ---

router.get("/pos/cash-session/current", authenticateToken, (req, res) => {
  db.get("SELECT * FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (err, row) => res.json(row || null));
});

router.post("/pos/cash-session/open", authenticateToken, (req, res) => {
  const { opening_amount, notes, approval_token } = req.body;
  verifyApprovalToken(approval_token, "open_cash_session", (err, approval) => {
    if (err) return res.status(err.status).json({ message: err.message });
    db.get("INSERT INTO cash_sessions (operator_id, opening_amount, expected_amount, notes) VALUES (?, ?, ?, ?) RETURNING id", [req.user.id, opening_amount, opening_amount, notes], (err, row) => {
      if (err) return res.status(500).json({ message: "Erro ao abrir caixa." });
      res.status(201).json(row);
    });
  });
});

router.post("/sales", authenticateToken, (req, res) => {
  const { items, payment_method, amount_received, change_amount } = req.body;
  
  if (!items || !items.length) {
    return res.status(400).json({ message: "Nenhum item enviado." });
  }

  runWithTransaction((tx, finish) => {
    let processed = 0;
    const saleItems = [];

    const processItem = (index) => {
      if (index >= items.length) {
        return finish(null, saleItems);
      }

      const item = items[index];
      tx.get("SELECT price, current_stock FROM products WHERE id = ?", [item.product_id], (err, product) => {
        if (err || !product) return finish(err || new Error("Produto não encontrado"));
        
        const total = Number(product.price) * Number(item.quantity);
        const discount = Number(item.calculated_discount || 0);
        const finalTotal = total - discount;

        tx.get(
          "INSERT INTO sales (product_id, quantity, total, discount_amount, final_total, payment_method, sold_by, amount_received, change_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
          [item.product_id, item.quantity, total, discount, finalTotal, payment_method, req.user.id, amount_received || 0, change_amount || 0],
          (saleErr, row) => {
            if (saleErr) return finish(saleErr);
            
            const docNum = buildDocumentNumber(row.id);
            tx.run("UPDATE sales SET document_number = ? WHERE id = ?", [docNum, row.id]);
            tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [item.quantity, item.product_id]);
            
            saleItems.push({ id: row.id, document_number: docNum });
            processItem(index + 1);
          }
        );
      });
    };

    processItem(0);
  }, (err, saleItems) => {
    if (err) return res.status(500).json({ message: "Erro ao registrar venda." });
    res.status(201).json({ status: "ok", items: saleItems });
  });
});

// --- RELATÓRIOS ---

router.get("/reports/summary", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const filter = buildDateFilter("s.created_at", range);
  
  const sql = `
    SELECT 
      COALESCE(SUM(s.final_total), 0) as total_sales,
      COALESCE(SUM(s.quantity * p.avg_cost), 0) as total_costs,
      COALESCE(SUM(s.final_total - (s.quantity * p.avg_cost)), 0) as real_profit
    FROM sales s
    JOIN products p ON s.product_id = p.id
    ${filter.clause}
  `;
  
  db.get(sql, filter.params, (err, row) => {
    if (err) return res.status(500).json({ message: "Erro ao gerar resumo." });
    
    db.all("SELECT id, name, current_stock, min_stock FROM products WHERE current_stock <= min_stock", [], (err2, lowStock) => {
      res.json({ 
        total_sales: Number(row.total_sales), 
        total_costs: Number(row.total_costs),
        real_profit: Number(row.real_profit),
        low_stock: lowStock || [] 
      });
    });
  });
});

// --- CONFIGURAÇÕES E USUÁRIOS ---

router.get("/settings", authenticateToken, requireAdmin, (req, res) => {
  db.all("SELECT key, value FROM settings", [], (err, rows) => {
    res.json(rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {}));
  });
});

router.put("/settings", authenticateToken, requireAdmin, (req, res) => {
  const entries = Object.entries(req.body);
  const promises = entries.map(([k, v]) => new Promise(res => db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value", [k, String(v)], res)));
  Promise.all(promises).then(() => res.json({ status: "ok" }));
});

router.get("/users", authenticateToken, requireAdmin, (req, res) => {
  db.all("SELECT id, name, email, role, is_active FROM users", [], (err, rows) => res.json(rows));
});

router.post("/users", authenticateToken, requireAdmin, (req, res) => {
  const { name, email, password, role, permissions } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.get("INSERT INTO users (name, email, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?) RETURNING id", [name, email, hash, role, JSON.stringify(permissions)], (err, row) => {
    if (err) return res.status(400).json({ message: "Erro ao criar usuário." });
    res.status(201).json({ id: row.id });
  });
});

router.delete("/users/:id", authenticateToken, requireAdmin, (req, res) => {
  db.run("UPDATE users SET is_active = 0 WHERE id = ?", [req.params.id], (err) => res.json({ status: "ok" }));
});

router.post("/approvals", (req, res) => {
  const { email, password, action } = req.body;
  db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (!user || !bcrypt.compareSync(password, user.password_hash) || !hasRole(user, "manager")) return res.status(401).json({ message: "Não autorizado." });
    const token = crypto.randomBytes(16).toString("hex");
    const hash = hashToken(token);
    db.run("INSERT INTO approvals (token_hash, action, approved_by, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL '10 minutes')", [hash, action, user.id], () => res.json({ token }));
  });
});

router.get("/health", (req, res) => res.json({ status: "ok" }));

module.exports = { router, ALERT_SLOW_THRESHOLD_MS, METRICS_ENABLED };
