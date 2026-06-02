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

const inferAuditType = (action = "") => {
  if (action.includes("sale")) return "sale";
  if (action.includes("stock") || action.includes("purchase")) return "stock";
  if (action.includes("user") || action.includes("admin")) return "user";
  if (action.includes("auth") || action.includes("login") || action.includes("password")) return "auth";
  if (action.includes("discount")) return "discount";
  if (action.includes("finance") || action.includes("approval")) return "system";
  return "system";
};

const inferAuditLevel = (action = "") => {
  if (action.includes("loss") || action.includes("cancel") || action.includes("override")) return "warning";
  if (action.includes("failed") || action.includes("error")) return "error";
  return "info";
};

const parseAuditDetails = (details) => {
  if (!details) return "";
  if (typeof details !== "string") return JSON.stringify(details);
  try {
    return JSON.stringify(JSON.parse(details));
  } catch (_err) {
    return details;
  }
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

router.get("/api/health", (req, res) => {
  db.get("SELECT 1 AS ok", [], (err) => {
    if (err) {
      return res.status(500).json({ status: "error", db: "down", uptime: process.uptime() });
    }
    return res.json({ status: "ok", db: "ok", uptime: process.uptime() });
  });
});

router.get("/api/metrics", authenticateToken, requireAdmin, (req, res) => {
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

router.get("/api/alerts", authenticateToken, requireAdmin, (req, res) => {
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
  "/api/auth/register",
  [
    body("name").trim().notEmpty().withMessage("Nome é obrigatório."),
    body("email").isEmail().withMessage("Email inválido."),
    body("password").isLength({ min: 8 }).withMessage("Senha deve ter 8+ caracteres."),
    body("phone")
      .optional()
      .matches(/^[0-9()+\-\s]{6,20}$/)
      .withMessage("Telefone inválido."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, phone = null } = req.body;
    const passwordHash = bcrypt.hashSync(password, 10);

    db.get(
      "INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?) RETURNING id",
      [name, email, phone, passwordHash],
      (err, row) => {
        if (err) {
          return res.status(400).json({ message: "Email já cadastrado." });
        }
        return res.status(201).json({ id: row.id, name, email, phone });
      }
    );
  }
);

router.post(
  "/api/auth/bootstrap",
  [
    body("token").notEmpty().withMessage("Token de bootstrap é obrigatório."),
    body("name").trim().notEmpty().withMessage("Nome é obrigatório."),
    body("email").isEmail().withMessage("Email inválido."),
    body("password").isLength({ min: 8 }).withMessage("Senha deve ter 8+ caracteres."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, name, email, password } = req.body;

    if (!ADMIN_BOOTSTRAP_TOKEN || token !== ADMIN_BOOTSTRAP_TOKEN) {
      return res.status(403).json({ message: "Token de bootstrap inválido ou não configurado." });
    }

    db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1", [], (checkErr, existing) => {
      if (existing) {
        return res.status(400).json({ message: "Administrador já configurado." });
      }

      const passwordHash = bcrypt.hashSync(password, 10);
      const permissions = JSON.stringify(["admin", "logs", "relatorios", "descontos", "estoque", "caixa"]);

      db.get(
        "INSERT INTO users (name, email, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?) RETURNING id",
        [name, email, passwordHash, "admin", permissions],
        (err, row) => {
          if (err) {
            return res.status(400).json({ message: "Erro ao criar administrador." });
          }
          return res.status(201).json({ id: row.id, name, email });
        }
      );
    });
  }
);

router.post(
  "/api/auth/login",
  [
    body("email").isEmail().withMessage("Email inválido."),
    body("password").notEmpty().withMessage("Senha é obrigatória."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
      if (err || !user) {
        db.run("INSERT INTO login_attempts (email, ip) VALUES (?, ?)", [email, req.ip]);
        return res.status(401).json({ message: "Credenciais inválidas." });
      }

      if (user.is_active === 0) {
        return res.status(403).json({ message: "Conta desativada." });
      }

      const isValid = bcrypt.compareSync(password, user.password_hash);
      if (!isValid) {
        db.run("INSERT INTO login_attempts (email, ip) VALUES (?, ?)", [email, req.ip]);
        return res.status(401).json({ message: "Credenciais inválidas." });
      }

      const accessToken = generateAccessToken(user.id, user.email, user.role);
      const refreshToken = generateRefreshToken(user.id, user.email, user.role);

      db.run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [user.id, accessToken], (sessionErr) => {
        if (sessionErr) {
          return res.status(500).json({ message: "Erro ao criar sessão." });
        }
        return res.json({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            permissions: user.permissions ? JSON.parse(user.permissions) : [],
          },
          accessToken,
          refreshToken,
        });
      });
    });
  }
);

router.post("/api/auth/refresh", refreshTokenMiddleware);
router.post("/api/auth/logout", logoutMiddleware);

router.get("/api/auth/me", authenticateToken, (req, res) => {
  db.get("SELECT id, name, email, role, phone, permissions FROM users WHERE id = ?", [req.user.id], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }
    return res.json({
      ...user,
      permissions: user.permissions ? JSON.parse(user.permissions) : [],
    });
  });
});

router.post("/api/auth/forgot-password", [body("email").isEmail()], (req, res) => {
  const { email } = req.body;
  db.get("SELECT id FROM users WHERE email = ?", [email], (err, user) => {
    if (err || !user) {
      return res.json({ message: "Se o email existir, as instruções foram enviadas." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60000);

    db.run(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [user.id, tokenHash, expiresAt],
      (resetErr) => {
        if (resetErr) return res.status(500).json({ message: "Erro ao processar." });
        
        sendPasswordResetNotification(email, token).catch(console.error);
        return res.json({ message: "Se o email existir, as instruções foram enviadas." });
      }
    );
  });
});

router.post(
  "/api/auth/reset-password",
  [
    body("token").notEmpty(),
    body("password").isLength({ min: 8 }),
  ],
  (req, res) => {
    const { token, password } = req.body;
    const tokenHash = hashToken(token);

    db.get(
      "SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP",
      [tokenHash],
      (err, reset) => {
        if (err || !reset) {
          return res.status(400).json({ message: "Token inválido ou expirado." });
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        db.run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, reset.user_id], (updErr) => {
          if (updErr) return res.status(500).json({ message: "Erro ao atualizar." });
          
          db.run("UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?", [reset.id]);
          return res.json({ message: "Senha atualizada com sucesso." });
        });
      }
    );
  }
);

router.get("/api/users", authenticateToken, requireAdmin, (req, res) => {
  db.all("SELECT id, name, email, role, phone, is_active, created_at FROM users ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar usuários." });
    return res.json(rows);
  });
});

router.post("/api/users", authenticateToken, requireAdmin, (req, res) => {
  const { name, email, password, role, phone, permissions } = req.body;
  const passwordHash = bcrypt.hashSync(password, 10);
  db.get(
    "INSERT INTO users (name, email, password_hash, role, phone, permissions) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    [name, email, passwordHash, role, phone, JSON.stringify(permissions || [])],
    (err, row) => {
      if (err) return res.status(400).json({ message: "Email já cadastrado." });
      return res.status(201).json({ id: row.id, name, email, role });
    }
  );
});

router.put("/api/users/:id", authenticateToken, requireAdmin, (req, res) => {
  const { name, email, role, phone, is_active, permissions, password } = req.body;
  let sql = "UPDATE users SET name = ?, email = ?, role = ?, phone = ?, is_active = ?, permissions = ?";
  const params = [name, email, role, phone, is_active, JSON.stringify(permissions || [])];

  if (password) {
    sql += ", password_hash = ?";
    params.push(bcrypt.hashSync(password, 10));
  }

  sql += " WHERE id = ?";
  params.push(req.params.id);

  db.run(sql, params, (err) => {
    if (err) return res.status(400).json({ message: "Erro ao atualizar usuário." });
    return res.json({ message: "Usuário atualizado." });
  });
});

router.get("/api/categories", authenticateToken, (req, res) => {
  db.all("SELECT * FROM categories ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar categorias." });
    return res.json(rows);
  });
});

router.post("/api/categories", authenticateToken, requireManager, (req, res) => {
  const { name, description } = req.body;
  db.get("INSERT INTO categories (name, description) VALUES (?, ?) RETURNING id", [name, description], (err, row) => {
    if (err) return res.status(400).json({ message: "Categoria já existe." });
    return res.status(201).json({ id: row.id, name });
  });
});

router.get("/api/suppliers", authenticateToken, (req, res) => {
  db.all("SELECT * FROM suppliers ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar fornecedores." });
    return res.json(rows);
  });
});

router.post("/api/suppliers", authenticateToken, requireManager, (req, res) => {
  const { name, contact, phone, email } = req.body;
  db.get(
    "INSERT INTO suppliers (name, contact, phone, email) VALUES (?, ?, ?, ?) RETURNING id",
    [name, contact, phone, email],
    (err, row) => {
      if (err) return res.status(400).json({ message: "Fornecedor já existe." });
      return res.status(201).json({ id: row.id, name });
    }
  );
});

router.get("/api/products", authenticateToken, (req, res) => {
  const sql = `
    SELECT p.*, c.name AS category_name, s.name AS supplier_name 
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ORDER BY p.name
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar produtos." });
    return res.json(rows);
  });
});

router.post("/api/products", authenticateToken, requireManager, (req, res) => {
  const { name, sku, unit_type, supplier_id, category_id, min_stock, max_stock, price } = req.body;
  db.get(
    `INSERT INTO products (name, sku, unit_type, supplier_id, category_id, min_stock, max_stock, price) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [name, sku, unit_type, supplier_id, category_id, min_stock, max_stock, price],
    (err, row) => {
      if (err) return res.status(400).json({ message: "SKU já cadastrado." });
      return res.status(201).json({ id: row.id, name, sku });
    }
  );
});

router.put("/api/products/:id", authenticateToken, requireManager, (req, res) => {
  const { name, sku, unit_type, supplier_id, category_id, min_stock, max_stock, price } = req.body;
  db.run(
    `UPDATE products SET name = ?, sku = ?, unit_type = ?, supplier_id = ?, category_id = ?, 
     min_stock = ?, max_stock = ?, price = ? WHERE id = ?`,
    [name, sku, unit_type, supplier_id, category_id, min_stock, max_stock, price, req.params.id],
    (err) => {
      if (err) return res.status(400).json({ message: "Erro ao atualizar produto." });
      return res.json({ message: "Produto atualizado." });
    }
  );
});

router.post("/api/stock/move", authenticateToken, (req, res) => {
  const { product_id, type, delta, reason, unit_cost = 0 } = req.body;
  const finalDelta = Number(delta);

  if (Number.isNaN(finalDelta)) {
    return res.status(400).json({ message: "Quantidade inválida." });
  }

  runWithTransaction((tx, finish) => {
    tx.get("SELECT current_stock FROM products WHERE id = ?", [product_id], (err, product) => {
      if (err || !product) {
        finish({ status: 404, message: "Produto não encontrado." });
        return;
      }

      const nextStock = Number(product.current_stock) + finalDelta;
      if (nextStock < 0) {
        finish({ status: 400, message: "Estoque não pode ser negativo." });
        return;
      }

      const saveMovement = () => {
        tx.run(
          "INSERT INTO stock_movements (product_id, type, delta, reason, performed_by, unit_cost) VALUES (?, ?, ?, ?, ?, ?)",
          [product_id, type, finalDelta, reason, req.user.id, unit_cost || 0],
          (moveErr) => {
            if (moveErr) {
              finish(moveErr);
              return;
            }
            finish(null);
          }
        );
      };

      if (finalDelta > 0 && unit_cost > 0) {
        tx.get("SELECT current_stock, avg_cost FROM products WHERE id = ?", [product_id], (prodErr, p) => {
          if (prodErr) { finish(prodErr); return; }
          const currentQty = Number(p.current_stock) || 0;
          const currentAvgCost = Number(p.avg_cost) || 0;
          const totalQty = currentQty + finalDelta;
          const nextAvgCost = totalQty > 0 ? ((currentQty * currentAvgCost) + (finalDelta * unit_cost)) / totalQty : unit_cost;

          tx.run(
            "UPDATE products SET current_stock = ?, avg_cost = ?, last_cost = ? WHERE id = ?",
            [nextStock, nextAvgCost, unit_cost, product_id],
            (updErr) => {
              if (updErr) { finish(updErr); return; }
              saveMovement();
            }
          );
        });
      } else {
        tx.run("UPDATE products SET current_stock = ? WHERE id = ?", [nextStock, product_id], (updErr) => {
          if (updErr) { finish(updErr); return; }
          saveMovement();
        });
      }
    });
  }, (transactionErr) => {
    if (transactionErr) {
      return res.status(transactionErr.status || 500).json({ message: transactionErr.message || "Erro ao mover estoque." });
    }
    logAudit({
      action: "movimentacao_estoque",
      details: { product_id, delta: finalDelta, type, reason },
      performedBy: req.user.id
    });
    return res.json({ status: "ok" });
  });
});

router.get("/api/stock/movements", authenticateToken, (req, res) => {
  const { product_id, type, start, end, limit = 100 } = req.query;
  const params = [];
  const filters = [];

  if (product_id) {
    filters.push("product_id = ?");
    params.push(product_id);
  }
  if (type) {
    filters.push("type = ?");
    params.push(type);
  }
  
  const range = parseDateRange(req, res);
  if (range?.start) {
    filters.push("created_at >= ?");
    params.push(range.start);
  }
  if (range?.end) {
    filters.push("created_at <= ?");
    params.push(range.end);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const sql = `
    SELECT m.*, p.name AS product_name 
    FROM stock_movements m
    JOIN products p ON m.product_id = p.id
    ${where}
    ORDER BY m.created_at DESC
    LIMIT ?
  `;
  params.push(limit);

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar movimentações." });
    return res.json(rows);
  });
});

router.post("/api/sales", authenticateToken, (req, res) => {
  const { items, payment_method, amount_received = 0, change_amount = 0, discount_id = null, manual_discount = 0, approval_token = null } = req.body;
  const globalManualDiscount = Number(manual_discount || 0);

  const itemsFromBody = Array.isArray(items) ? items : [{
    product_id: req.body.product_id,
    quantity: req.body.quantity,
    discount_id: req.body.discount_id ?? null,
    manual_discount: req.body.manual_discount ?? null
  }];

  if (itemsFromBody.some(i => !i?.product_id || !i?.quantity)) {
    return res.status(400).json({ message: "Itens inválidos." });
  }

  db.get(
    "SELECT id FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1",
    [req.user.id],
    (cashErr, cashSession) => {
      if (cashErr) return res.status(500).json({ message: "Erro ao verificar caixa." });
      if (!cashSession) return res.status(400).json({ message: "Abra o caixa primeiro." });

      processSale(cashSession);
    }
  );

  function processSale(cashSession) {
    let responsePayload = null;
    const saleItems = [];

    const processSaleItem = (tx, item, done) => {
      const { product_id, quantity, discount_id = null, manual_discount = null, calculated_discount = null } = item;
      tx.get("SELECT * FROM products WHERE id = ?", [product_id], (err, product) => {
        if (err || !product) return done(err || { status: 404, message: "Produto não encontrado." });
        if (Number(product.current_stock) < Number(quantity)) return done({ status: 400, message: "Estoque insuficiente." });

        const total = Number(product.price) * Number(quantity);
        const applySale = (discount, discountAmount) => {
          const nextStock = Number(product.current_stock) - Number(quantity);
          const finalTotal = Math.max(total - discountAmount, 0);

          tx.run("UPDATE products SET current_stock = ? WHERE id = ?", [nextStock, product_id], (updErr) => {
            if (updErr) return done(updErr);
            tx.get(
              `INSERT INTO sales (product_id, quantity, total, discount_id, discount_amount, final_total, payment_method, sold_by, amount_received, change_amount)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
              [product_id, quantity, total, discount?.id || null, discountAmount, finalTotal, payment_method, req.user.id, payment_method === "cash" ? (amount_received / itemsFromBody.length) : 0, payment_method === "cash" ? (change_amount / itemsFromBody.length) : 0],
              (saleErr, row) => {
                if (saleErr) return done(saleErr);
                const documentNumber = buildDocumentNumber(row.id);
                tx.run("UPDATE sales SET document_number = ?, fiscal_status = 'issued' WHERE id = ?", [documentNumber, row.id], (docErr) => {
                  if (docErr) return done(docErr);
                  tx.run("INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, 'sale', ?, 'Venda PDV', ?)", [product_id, -Number(quantity), req.user.id], (mvErr) => {
                    if (mvErr) return done(mvErr);
                    saleItems.push({ id: row.id, document_number: documentNumber, product_id, quantity, total, discount_amount: discountAmount, final_total: finalTotal });
                    done(null);
                  });
                });
              }
            );
          });
        };

        if (calculated_discount !== null) { applySale({ id: discount_id }, Number(calculated_discount)); return; }
        if (manual_discount > 0) { applySale(null, Number(manual_discount)); return; }
        if (!discount_id) { applySale(null, 0); return; }

        tx.get("SELECT * FROM discounts WHERE id = ? AND active = 1", [discount_id], (discErr, discount) => {
          if (discErr || !discount) return applySale(null, 0);
          let amount = 0;
          if (discount.type === "percent") amount = total * (Number(discount.value) / 100);
          else if (discount.type === "fixed") amount = Number(discount.value);
          applySale(discount, amount);
        });
      });
    };

    const checkApproval = (cb) => {
      if (!(itemsFromBody.some(i => i.manual_discount > 0) || globalManualDiscount > 0)) return cb(null);
      if (!approval_token) return res.status(403).json({ message: "Desconto requer autorização." });
      verifyApprovalToken(approval_token, "discount_override", (err, apprv) => {
        if (err || !apprv) return res.status(403).json({ message: "Token inválido." });
        cb(null);
      });
    };

    checkApproval((err) => {
      if (err) return;
      runWithTransaction((tx, finish) => {
        const processNext = (index) => {
          if (index >= itemsFromBody.length) {
            const totals = saleItems.reduce((acc, i) => { acc.total += i.total; acc.discount_amount += i.discount_amount; acc.final_total += i.final_total; return acc; }, { total: 0, discount_amount: 0, final_total: 0 });
            totals.discount_amount += globalManualDiscount;
            totals.final_total = Math.max(totals.final_total - globalManualDiscount, 0);
            responsePayload = { items: saleItems, ...totals, global_manual_discount: globalManualDiscount };
            if (payment_method === "cash") {
              tx.run("UPDATE cash_sessions SET expected_amount = expected_amount + ? WHERE id = ?", [totals.final_total, cashSession.id], (updErr) => finish(updErr));
            } else finish(null);
            return;
          }
          processSaleItem(tx, itemsFromBody[index], (itemErr) => {
            if (itemErr) return finish(itemErr);
            processNext(index + 1);
          });
        };
        processNext(0);
      }, (transactionErr) => {
        if (transactionErr) return res.status(500).json({ message: "Erro ao registrar venda." });
        logAudit({ action: "venda_realizada", details: responsePayload, performedBy: req.user.id });
        return res.status(201).json(responsePayload);
      });
    });
  }
});

router.get("/api/reports/summary", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const salesFilter = buildDateFilter("sales.created_at", range);
  const sql = `
    SELECT 
      COUNT(*)::int AS total_sales,
      SUM(final_total)::numeric AS total_revenue,
      SUM(discount_amount)::numeric AS total_discounts
    FROM sales
    ${salesFilter.clause}
  `;
  db.get(sql, salesFilter.params, (err, row) => {
    if (err) return res.status(500).json({ message: "Erro ao gerar relatório." });
    return res.json(row || { total_sales: 0, total_revenue: 0, total_discounts: 0 });
  });
});

router.get("/api/reports/products", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const filter = buildDateFilter("s.created_at", range);
  const sql = `
    SELECT p.name, SUM(s.quantity)::numeric AS quantity, SUM(s.final_total)::numeric AS revenue
    FROM sales s
    JOIN products p ON s.product_id = p.id
    ${filter.clause}
    GROUP BY p.id, p.name
    ORDER BY revenue DESC
  `;
  db.all(sql, filter.params, (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao gerar relatório." });
    return res.json(rows);
  });
});

router.get("/api/reports/payment-methods", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const filter = buildDateFilter("created_at", range);
  const sql = `
    SELECT payment_method, COUNT(*)::int AS count, SUM(final_total)::numeric AS total
    FROM sales
    ${filter.clause}
    GROUP BY payment_method
  `;
  db.all(sql, filter.params, (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao gerar relatório." });
    return res.json(rows);
  });
});

router.get("/api/audit-logs", authenticateToken, requireAdmin, (req, res) => {
  const { action, performed_by, start, end, limit = 100 } = req.query;
  const filters = [];
  const params = [];

  if (action) { filters.push("action = ?"); params.push(action); }
  if (performed_by) { filters.push("performed_by = ?"); params.push(performed_by); }
  
  const range = parseDateRange(req, res);
  if (range?.start) { filters.push("created_at >= ?"); params.push(range.start); }
  if (range?.end) { filters.push("created_at <= ?"); params.push(range.end); }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const sql = `
    SELECT l.*, u.name AS user_name 
    FROM audit_logs l
    LEFT JOIN users u ON l.performed_by = u.id
    ${where}
    ORDER BY l.created_at DESC
    LIMIT ?
  `;
  params.push(limit);

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar logs." });
    return res.json(rows);
  });
});

router.get("/api/cash/sessions", authenticateToken, (req, res) => {
  db.all("SELECT s.*, u.name AS operator_name FROM cash_sessions s JOIN users u ON s.operator_id = u.id ORDER BY s.opened_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "Erro ao listar sessões." });
    return res.json(rows);
  });
});

router.post("/api/cash/open", authenticateToken, (req, res) => {
  const { initial_amount } = req.body;
  db.get("SELECT id FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (err, existing) => {
    if (existing) return res.status(400).json({ message: "Você já tem um caixa aberto." });
    db.run("INSERT INTO cash_sessions (operator_id, opened_at, initial_amount, expected_amount) VALUES (?, CURRENT_TIMESTAMP, ?, ?)", [req.user.id, initial_amount, initial_amount], (insErr) => {
      if (insErr) return res.status(500).json({ message: "Erro ao abrir caixa." });
      return res.status(201).json({ message: "Caixa aberto." });
    });
  });
});

router.post("/api/cash/close", authenticateToken, (req, res) => {
  const { final_amount, notes } = req.body;
  db.get("SELECT * FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL", [req.user.id], (err, session) => {
    if (!session) return res.status(400).json({ message: "Nenhum caixa aberto encontrado." });
    const diff = Number(final_amount) - Number(session.expected_amount);
    db.run(
      "UPDATE cash_sessions SET closed_at = CURRENT_TIMESTAMP, final_amount = ?, difference = ?, notes = ? WHERE id = ?",
      [final_amount, diff, notes, session.id],
      (updErr) => {
        if (updErr) return res.status(500).json({ message: "Erro ao fechar caixa." });
        return res.json({ message: "Caixa fechado.", difference: diff });
      }
    );
  });
});

module.exports = { router, sendAlertNotification, ALERT_SLOW_THRESHOLD_MS, METRICS_ENABLED };
