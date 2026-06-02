const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
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

// --- ROTAS DA API ---

router.get("/health", (req, res) => {
  db.get("SELECT 1 AS ok", [], (err) => {
    if (err) {
      return res.status(500).json({ status: "error", db: "down", uptime: process.uptime() });
    }
    return res.json({ status: "ok", db: "ok", uptime: process.uptime() });
  });
});

router.get("/metrics", authenticateToken, requireAdmin, (req, res) => {
  db.get(
    `SELECT COUNT(*)::int AS total,
            SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END)::int AS errors
     FROM request_metrics
     WHERE created_at >= NOW() - INTERVAL '24 hours'`,
    [],
    (err, row) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao buscar métricas." });
      }
      return res.json({
        total_requests: req.requestMetrics?.total || 0,
        by_route: req.requestMetrics?.byRoute || {},
        uptime_seconds: req.requestMetrics?.uptimeSeconds || 0,
        last_24h: row || { total: 0, errors: 0 },
      });
    }
  );
});

router.get("/alerts", authenticateToken, requireAdmin, (req, res) => {
  const limit = Number(req.query.limit || 50);
  const safeLimit = Number.isNaN(limit) ? 50 : Math.min(Math.max(limit, 1), 200);
  db.all(
    "SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?",
    [safeLimit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao buscar alertas." });
      }
      return res.json(rows);
    }
  );
});

router.post(
  "/auth/register",
  [
    body("name").trim().notEmpty().withMessage("Nome é obrigatório."),
    body("email").isEmail().withMessage("Email inválido."),
    body("password").isLength({ min: 8 }).withMessage("Senha deve ter 8+ caracteres."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, phone = null } = req.body;
    const passwordHash = bcrypt.hashSync(password, 10);

    db.get(
      "INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?) RETURNING id",
      [name, email, phone, passwordHash],
      (err, row) => {
        if (err) return res.status(400).json({ message: "Email já cadastrado." });
        return res.status(201).json({ id: row.id, name, email, phone });
      }
    );
  }
);

router.post(
  "/auth/bootstrap",
  [
    body("token").notEmpty(),
    body("name").trim().notEmpty(),
    body("email").isEmail(),
    body("password").isLength({ min: 8 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { token, name, email, password } = req.body;
    if (!ADMIN_BOOTSTRAP_TOKEN || token !== ADMIN_BOOTSTRAP_TOKEN) {
      return res.status(403).json({ message: "Token inválido." });
    }

    db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1", [], (checkErr, existing) => {
      if (existing) return res.status(400).json({ message: "Administrador já configurado." });

      const passwordHash = bcrypt.hashSync(password, 10);
      const permissions = JSON.stringify(["admin", "logs", "relatorios", "descontos", "estoque", "caixa"]);

      db.get(
        "INSERT INTO users (name, email, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?) RETURNING id",
        [name, email, passwordHash, "admin", permissions],
        (err, row) => {
          if (err) return res.status(400).json({ message: "Erro ao criar." });
          return res.status(201).json({ id: row.id, name, email });
        }
      );
    });
  }
);

router.post(
  "/auth/login",
  [
    body("email").isEmail(),
    body("password").notEmpty(),
  ],
  (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
      if (err || !user || user.is_active === 0 || !bcrypt.compareSync(password, user.password_hash)) {
        db.run("INSERT INTO login_attempts (email, ip) VALUES (?, ?)", [email, req.ip]);
        return res.status(401).json({ message: "Credenciais inválidas." });
      }

      const accessToken = generateAccessToken(user.id, user.email, user.role);
      const refreshToken = generateRefreshToken(user.id, user.email, user.role);

      db.run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [user.id, accessToken], (sessionErr) => {
        if (sessionErr) return res.status(500).json({ message: "Erro ao criar sessão." });
        return res.json({
          user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions ? JSON.parse(user.permissions) : [] },
          accessToken,
          refreshToken,
        });
      });
    });
  }
);

router.post("/auth/refresh", refreshTokenMiddleware);
router.post("/auth/logout", logoutMiddleware);

router.get("/auth/me", authenticateToken, (req, res) => {
  db.get("SELECT id, name, email, role, phone, permissions FROM users WHERE id = ?", [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ message: "Não encontrado." });
    return res.json({ ...user, permissions: user.permissions ? JSON.parse(user.permissions) : [] });
  });
});

router.get("/users", authenticateToken, requireAdmin, (req, res) => {
  db.all("SELECT id, name, email, role, phone, is_active, created_at FROM users ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar." });
    return res.json(rows);
  });
});

router.get("/categories", authenticateToken, (req, res) => {
  db.all("SELECT * FROM categories ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar." });
    return res.json(rows);
  });
});

router.get("/suppliers", authenticateToken, (req, res) => {
  db.all("SELECT * FROM suppliers ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar." });
    return res.json(rows);
  });
});

router.get("/products", authenticateToken, (req, res) => {
  const sql = `
    SELECT p.*, c.name AS category_name, s.name AS supplier_name 
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ORDER BY p.name
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar." });
    return res.json(rows);
  });
});

router.post("/stock/move", authenticateToken, (req, res) => {
  const { product_id, type, delta, reason, unit_cost = 0 } = req.body;
  const finalDelta = Number(delta);
  if (Number.isNaN(finalDelta)) return res.status(400).json({ message: "Inválido." });

  runWithTransaction((tx, finish) => {
    tx.get("SELECT current_stock, avg_cost FROM products WHERE id = ?", [product_id], (err, product) => {
      if (err || !product) return finish({ status: 404, message: "Não encontrado." });
      const nextStock = Number(product.current_stock) + finalDelta;
      if (nextStock < 0) return finish({ status: 400, message: "Estoque negativo." });

      const currentQty = Number(product.current_stock) || 0;
      const currentAvgCost = Number(product.avg_cost) || 0;
      const totalQty = currentQty + (finalDelta > 0 ? finalDelta : 0);
      const nextAvgCost = (finalDelta > 0 && totalQty > 0) ? ((currentQty * currentAvgCost) + (finalDelta * unit_cost)) / totalQty : currentAvgCost;

      tx.run(
        "UPDATE products SET current_stock = ?, avg_cost = ?, last_cost = ? WHERE id = ?",
        [nextStock, nextAvgCost, finalDelta > 0 ? unit_cost : product.last_cost, product_id],
        (updErr) => {
          if (updErr) return finish(updErr);
          tx.run(
            "INSERT INTO stock_movements (product_id, type, delta, reason, performed_by, unit_cost) VALUES (?, ?, ?, ?, ?, ?)",
            [product_id, type, finalDelta, reason, req.user.id, unit_cost || 0],
            (moveErr) => finish(moveErr)
          );
        }
      );
    });
  }, (transactionErr) => {
    if (transactionErr) return res.status(500).json({ message: "Erro ao mover." });
    logAudit({ action: "movimentacao_estoque", details: { product_id, delta: finalDelta, type }, performedBy: req.user.id });
    return res.json({ status: "ok" });
  });
});

router.post("/sales", authenticateToken, (req, res) => {
  const { items, payment_method, amount_received = 0, change_amount = 0, manual_discount = 0, approval_token = null } = req.body;
  const itemsFromBody = Array.isArray(items) ? items : [req.body];

  db.get(
    "SELECT id FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1",
    [req.user.id],
    (cashErr, cashSession) => {
      if (cashErr || !cashSession) return res.status(400).json({ message: "Caixa fechado." });
      
      let saleItems = [];
      runWithTransaction((tx, finish) => {
        const processNext = (idx) => {
          if (idx >= itemsFromBody.length) {
            const totals = saleItems.reduce((acc, i) => { acc.final_total += i.final_total; return acc; }, { final_total: 0 });
            if (payment_method === "cash") {
              tx.run("UPDATE cash_sessions SET expected_amount = expected_amount + ? WHERE id = ?", [totals.final_total, cashSession.id], (updErr) => finish(updErr));
            } else finish(null);
            return;
          }
          const item = itemsFromBody[idx];
          tx.get("SELECT * FROM products WHERE id = ?", [item.product_id], (err, product) => {
            if (err || !product || product.current_stock < item.quantity) return finish({ status: 400, message: "Erro no item." });
            const finalTotal = (product.price * item.quantity) - (item.calculated_discount || 0);
            tx.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [item.quantity, item.product_id], (updErr) => {
              if (updErr) return finish(updErr);
              tx.get(
                "INSERT INTO sales (product_id, quantity, total, final_total, payment_method, sold_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
                [item.product_id, item.quantity, product.price * item.quantity, finalTotal, payment_method, req.user.id],
                (saleErr, row) => {
                  if (saleErr) return finish(saleErr);
                  saleItems.push({ id: row.id, final_total: finalTotal });
                  processNext(idx + 1);
                }
              );
            });
          });
        };
        processNext(0);
      }, (err) => {
        if (err) return res.status(500).json({ message: "Erro na venda." });
        return res.status(201).json({ status: "ok" });
      });
    }
  );
});

router.get("/reports/summary", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const filter = buildDateFilter("created_at", range);
  db.get(`SELECT COUNT(*)::int AS total_sales, SUM(final_total)::numeric AS total_revenue FROM sales ${filter.clause}`, filter.params, (err, row) => {
    if (err) return res.status(500).json({ message: "Erro." });
    return res.json(row || { total_sales: 0, total_revenue: 0 });
  });
});

router.get("/cash/sessions", authenticateToken, (req, res) => {
  db.all("SELECT s.*, u.name AS operator_name FROM cash_sessions s JOIN users u ON s.operator_id = u.id ORDER BY s.opened_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro." });
    return res.json(rows);
  });
});

router.post("/cash/open", authenticateToken, (req, res) => {
  const { initial_amount } = req.body;
  db.run("INSERT INTO cash_sessions (operator_id, opened_at, initial_amount, expected_amount) VALUES (?, CURRENT_TIMESTAMP, ?, ?)", [req.user.id, initial_amount, initial_amount], (err) => {
    if (err) return res.status(500).json({ message: "Erro." });
    return res.status(201).json({ message: "Aberto." });
  });
});

router.post("/cash/close", authenticateToken, (req, res) => {
  const { final_amount, notes } = req.body;
  db.get("SELECT * FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (err, session) => {
    if (!session) return res.status(400).json({ message: "Não encontrado." });
    db.run("UPDATE cash_sessions SET closed_at = CURRENT_TIMESTAMP, final_amount = ?, difference = ? - expected_amount, notes = ? WHERE id = ?", [final_amount, final_amount, notes, session.id], (updErr) => {
      if (updErr) return res.status(500).json({ message: "Erro." });
      return res.json({ status: "ok" });
    });
  });
});

module.exports = { router, sendAlertNotification, ALERT_SLOW_THRESHOLD_MS, METRICS_ENABLED };
