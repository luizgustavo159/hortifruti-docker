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
  
  // No Postgres, usamos a sintaxe de placeholder $1, $2. 
  // O db.js já faz a conversão de ? para $, mas para queries manuais com filtros dinâmicos, 
  // precisamos garantir que os parâmetros batam com a posição.
  
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
    body("name").trim().notEmpty().withMessage("Nome é obrigatório."),
    body("email").isEmail().withMessage("Email inválido."),
    body("password").isLength({ min: 8 }).withMessage("Senha deve ter 8+ caracteres."),
    body("phone")
      .optional()
      .matches(/^[0-9()+\-\s]{6,20}$/)
      .withMessage("Telefone inválido."),
  ],
  (req, res) => {
    if (!ADMIN_BOOTSTRAP_TOKEN) {
      return res.status(500).json({ message: "Bootstrap não configurado." });
    }
    const bootstrapToken = req.headers["x-bootstrap-token"];
    if (bootstrapToken !== ADMIN_BOOTSTRAP_TOKEN) {
      return res.status(403).json({ message: "Token de bootstrap inválido." });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1", [], (err, row) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao verificar administradores." });
      }
      if (row) {
        return res.status(409).json({ message: "Administrador já configurado." });
      }

      const { name, email, password, phone = null } = req.body;
      const passwordHash = bcrypt.hashSync(password, 10);
      const permissions = ["admin", "logs", "relatorios", "descontos", "estoque", "caixa"];

      db.get(
        "INSERT INTO users (name, email, phone, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
        [name, email, phone, passwordHash, "admin", JSON.stringify(permissions)],
        (insertErr, row) => {
          if (insertErr) {
            return res.status(500).json({ message: "Erro ao criar administrador." });
          }
          logAudit({
            action: "inicializacao_admin",
            details: { id_usuario: row.id, email_usuario: email, mensagem: "Administrador inicializado via bootstrap" },
            performedBy: row.id,
            approvedBy: row.id,
          });
          return res.status(201).json({ id: row.id });
        }
      );
    });
  }
);

router.post("/api/auth/logout", authenticateToken, logoutMiddleware);
router.post("/api/auth/refresh", refreshTokenMiddleware);

router.post(
  "/api/auth/request-password-reset",
  [body("email").isEmail().withMessage("Email inválido.")],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email } = req.body;
    db.get("SELECT id, email, phone FROM users WHERE email = ?", [email], (err, user) => {
      if (err || !user) {
        return res.status(200).json({ status: "ok" });
      }
      const hasEmailChannel = Boolean(config.SMTP_HOST && config.RESET_EMAIL_FROM && user.email);
      const hasSmsChannel = Boolean(config.RESET_SMS_WEBHOOK_URL && user.phone);
      if (!hasEmailChannel && !hasSmsChannel) {
        return res.status(500).json({ message: "Canal de reset não configurado." });
      }
      const token = crypto.randomBytes(20).toString("hex");
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000).toISOString();

      db.run(
        `INSERT INTO password_resets (user_id, token_hash, expires_at)
         VALUES (?, ?, ?)`,
        [user.id, tokenHash, expiresAt],
        (insertErr) => {
          if (insertErr) {
            return res.status(500).json({ message: "Erro ao criar reset." });
          }
          sendPasswordResetNotification({ user, token, expiresAt })
            .then(() => {
              logAudit({
                action: "solicitacao_recuperacao_senha",
                details: { id_usuario: user.id, email_usuario: user.email, mensagem: "Solicitação de redefinição de senha enviada" },
                performedBy: user.id,
              });
              return res.json({ status: "ok" });
            })
            .catch((notifyErr) => {
              return res.status(500).json({ message: "Erro ao enviar reset.", detail: notifyErr.message });
            });
        }
      );
    });
  }
);

router.post(
  "/api/auth/reset-password",
  [
    body("token").trim().notEmpty().withMessage("Token é obrigatório."),
    body("password").isLength({ min: 8 }).withMessage("Senha deve ter 8+ caracteres."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { token, password } = req.body;
    const tokenHash = hashToken(token);
    db.get(
      "SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL",
      [tokenHash],
      (err, reset) => {
        if (err || !reset) {
          return res.status(400).json({ message: "Token inválido." });
        }
        const expiresAt = new Date(reset.expires_at);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
          return res.status(400).json({ message: "Token expirado." });
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        runWithTransaction((tx, finish) => {
          tx.run(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            [passwordHash, reset.user_id],
            (updateErr) => {
              if (updateErr) {
                finish(updateErr);
                return;
              }
              tx.run(
                "UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?",
                [reset.id],
                (resetErr) => {
                  if (resetErr) {
                    finish(resetErr);
                    return;
                  }
                  tx.run(
                    "UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL",
                    [reset.user_id],
                    (sessionErr) => {
                      if (sessionErr) {
                        finish(sessionErr);
                        return;
                      }
                      finish(null);
                    }
                  );
                }
              );
            }
          );
        }, (transactionErr) => {
          if (transactionErr) {
            return res.status(500).json({ message: "Erro ao atualizar senha." });
          }
          logAudit({
            action: "recuperacao_senha_concluida",
            details: { id_usuario: reset.user_id, mensagem: "Senha redefinida com sucesso pelo usuário" },
            performedBy: reset.user_id,
          });
          return res.json({ status: "ok" });
        });
      }
    );
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
    const ip = req.ip;
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
      if (err || !user) {
        return res.status(401).json({ message: "Credenciais inválidas." });
      }
      if (user.locked_until) {
        const lockedUntil = new Date(user.locked_until);
        if (!Number.isNaN(lockedUntil.getTime()) && lockedUntil > new Date()) {
          return res.status(403).json({ message: "Usuário bloqueado temporariamente." });
        }
      }
      if (!user.is_active) {
        return res.status(403).json({ message: "Usuário inativo." });
      }

      const valid = bcrypt.compareSync(password, user.password_hash);
      if (!valid) {
        return getSettings(["login_attempts", "lock_minutes"], (settings) => {
          const maxAttempts = Number(settings.login_attempts || 5);
          const lockMinutes = Number(settings.lock_minutes || 10);
          db.run(
            "INSERT INTO login_attempts (email, ip) VALUES (?, ?)",
            [email, ip],
            () => {
              db.all(
                `SELECT COUNT(*)::int as attempts
                 FROM login_attempts
                 WHERE email = ?
                 AND created_at >= NOW() - ?::interval`,
                [email, `${lockMinutes} minutes`],
                (countErr, rows) => {
                  const attempts = countErr ? 0 : rows?.[0]?.attempts || 0;
                  if (attempts >= maxAttempts) {
                    const lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000).toISOString();
                    db.run("UPDATE users SET locked_until = ? WHERE email = ?", [lockedUntil, email]);
                    return res.status(403).json({ message: "Usuário bloqueado por tentativas." });
                  }
                  return res.status(401).json({ message: "Credenciais inválidas." });
                }
              );
            }
          );
        });
      }

      const accessToken = generateAccessToken(user.id, user.email, user.role);
      const refreshToken = generateRefreshToken(user.id, user.email, user.role);

      db.run("DELETE FROM login_attempts WHERE email = ?", [email]);
      db.run("UPDATE users SET locked_until = NULL WHERE email = ?", [email]);
      db.run(
        "INSERT INTO sessions (user_id, token) VALUES (?, ?)",
        [user.id, accessToken],
        (sessionErr) => {
          if (sessionErr) {
            return res.status(500).json({ message: "Erro ao criar sessão." });
          }
          return res.json({
            accessToken,
            refreshToken,
            token: accessToken, // Compatibilidade com testes legados
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
            },
          });
        }
      );
    });
  }
);

router.get("/api/auth/me", authenticateToken, (req, res) => {
  db.get(
    "SELECT id, name, email, role, is_active FROM users WHERE id = ?",
    [req.user.id],
    (err, user) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao carregar usuário." });
      }
      if (!user || !user.is_active) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }
      return res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    }
  );
});

router.get("/api/categories", authenticateToken, (req, res) => {
  db.all("SELECT * FROM categories ORDER BY name", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Erro ao buscar categorias." });
    }
    return res.json(rows);
  });
});

router.post(
  "/api/categories",
  authenticateToken,
  requireManager,
  [body("name").trim().notEmpty().withMessage("Nome é obrigatório.")],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description = "" } = req.body;
    db.get(
      "INSERT INTO categories (name, description) VALUES (?, ?) RETURNING id",
      [name, description],
      (err, row) => {
        if (err) {
          return res.status(400).json({ message: "Categoria já cadastrada." });
        }
        return res.status(201).json({ id: row.id });
      }
    );
  }
);

router.get("/api/suppliers", authenticateToken, requireSupervisor, (req, res) => {
  db.all("SELECT * FROM suppliers ORDER BY name", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Erro ao buscar fornecedores." });
    }
    return res.json(rows);
  });
});

router.post(
  "/api/suppliers",
  authenticateToken,
  requireSupervisor,
  [body("name").trim().notEmpty().withMessage("Nome é obrigatório.")],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, contact = "", phone = "", email = "" } = req.body;

    db.get(
      "INSERT INTO suppliers (name, contact, phone, email) VALUES (?, ?, ?, ?) RETURNING id",
      [name, contact, phone, email],
      (err, row) => {
        if (err) {
          return res.status(400).json({ message: "Erro ao cadastrar fornecedor." });
        }
        return res.status(201).json({ id: row.id });
      }
    );
  }
);

router.get("/api/products", authenticateToken, (req, res) => {
  db.all(
    `SELECT products.*, categories.name AS category_name, suppliers.name AS supplier_name
     FROM products
     LEFT JOIN categories ON categories.id = products.category_id
     LEFT JOIN suppliers ON suppliers.id = products.supplier_id
     ORDER BY products.created_at DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao buscar produtos." });
      }
      return res.json(rows);
    }
  );
});

router.post(
  "/api/products",
  authenticateToken,
  requireSupervisor,
  [
    body("name").trim().notEmpty().withMessage("Nome é obrigatório."),
    body("sku").trim().notEmpty().withMessage("SKU é obrigatório."),
    body("unit_type").trim().notEmpty().withMessage("Unidade é obrigatória."),
    body("price").isFloat({ min: 0 }).withMessage("Preço inválido."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const payload = req.body;
    db.get(
      `INSERT INTO products
       (name, sku, unit_type, price, current_stock, min_stock, max_stock, category_id, supplier_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        payload.name,
        payload.sku,
        payload.unit_type,
        payload.price,
        payload.current_stock || 0,
        payload.min_stock || 0,
        payload.max_stock || 0,
        payload.category_id || null,
        payload.supplier_id || null,
        payload.expires_at || null,
      ],
      (err, row) => {
        if (err) {
          return res.status(400).json({ message: "Erro ao cadastrar produto." });
        }
        logAudit({
          action: "produto_criado",
          details: { id_produto: row.id, nome_produto: payload.name, sku_produto: payload.sku, mensagem: "Novo produto cadastrado no sistema" },
          performedBy: req.user.id
        });
        return res.status(201).json({ id: row.id });
      }
    );
  }
);

router.post(
  "/api/stock/loss",
  authenticateToken,
  [
    body("product_id").isInt({ min: 1 }).withMessage("Produto inválido."),
    body("quantity").isFloat({ min: 0.001 }).withMessage("Quantidade inválida."),
    body("reason").trim().notEmpty().withMessage("Motivo é obrigatório."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { product_id, quantity, reason } = req.body;

    return getSettings(["max_losses"], (settings) => {
      const maxLosses = Number(settings.max_losses || 0);
      if (maxLosses > 0 && quantity > maxLosses) {
        return verifyApprovalToken(req.headers["x-approval-token"], "stock_loss", (error) => {
          if (error) {
            return res.status(error.status).json({ message: error.message });
          }
          return saveLoss();
        });
      }
      return saveLoss();
    });

    function saveLoss() {
      let productData = null;
      runWithTransaction((tx, finish) => {
        tx.get("SELECT * FROM products WHERE id = ?", [product_id], (err, product) => {
          if (err) {
            finish(err);
            return;
          }
          if (!product) {
            finish({ status: 404, message: "Produto não encontrado." });
            return;
          }
          productData = product;
          if (product.current_stock < quantity) {
            finish({ status: 400, message: "Estoque insuficiente para registrar perda." });
            return;
          }
          
          const nextStock = product.current_stock - Number(quantity);
          
          tx.run(
            "UPDATE products SET current_stock = ? WHERE id = ?",
            [nextStock, product_id],
            (updateErr) => {
              if (updateErr) {
                finish(updateErr);
                return;
              }
              tx.run(
                "INSERT INTO stock_losses (product_id, quantity, reason, reported_by) VALUES (?, ?, ?, ?)",
                [product_id, quantity, reason, req.user.id],
                (lossErr) => {
                  if (lossErr) {
                    finish(lossErr);
                    return;
                  }
                  tx.run(
                    "INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
                    [product_id, "loss", -Number(quantity), `Perda: ${reason}`, req.user.id],
                    (movementErr) => {
                      if (movementErr) {
                        finish(movementErr);
                        return;
                      }
                      finish(null);
                    }
                  );
                }
              );
            }
          );
        });
      }, (transactionErr) => {
        if (transactionErr) {
          if (transactionErr.status) {
            return res.status(transactionErr.status).json({ message: transactionErr.message });
          }
          return res.status(500).json({ message: "Erro ao registrar perda." });
        }
        logAudit({
          action: "perda_estoque",
          details: { 
            id_produto: product_id, 
            nome_produto: productData?.name, 
            quantidade_perda: quantity, 
            motivo_perda: reason,
            estoque_anterior: productData?.stock,
            estoque_atual: (productData?.stock || 0) - quantity,
            mensagem: "Registro de perda de mercadoria"
          },
          performedBy: req.user.id
        });
        return res.status(201).json({ status: "ok" });
      });
    }
  }
);

router.post(
  "/api/stock/adjust",
  authenticateToken,
  requireSupervisor,
  [
    body("product_id").isInt({ min: 1 }).withMessage("Produto inválido."),
    body("delta").isFloat().withMessage("Delta inválido."),
    body("reason").trim().notEmpty().withMessage("Motivo é obrigatório."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { product_id, delta, reason } = req.body;

    return getSettings(["max_stock_adjust"], (settings) => {
      const maxStockAdjust = Number(settings.max_stock_adjust || 0);
      if (maxStockAdjust > 0 && Math.abs(Number(delta)) > maxStockAdjust) {
        return verifyApprovalToken(req.headers["x-approval-token"], "stock_adjust", (error, approval) => {
          if (error) {
            return res.status(error.status).json({ message: error.message });
          }
          return saveAdjustment(approval);
        });
      }
      return saveAdjustment();
    });

    function saveAdjustment(approval) {
      let updatedStock = null;
      let productData = null;
      runWithTransaction((tx, finish) => {
        tx.get("SELECT * FROM products WHERE id = ?", [product_id], (err, product) => {
          if (err) {
            finish(err);
            return;
          }
          if (!product) {
            finish({ status: 404, message: "Produto não encontrado." });
            return;
          }
          productData = product;

          const nextStock = product.current_stock + Number(delta);
          updatedStock = nextStock;
          if (nextStock < 0) {
            finish({ status: 400, message: "Estoque não pode ficar negativo." });
            return;
          }

          tx.run(
            "UPDATE products SET current_stock = ? WHERE id = ?",
            [nextStock, product_id],
            (updateErr) => {
              if (updateErr) {
                finish(updateErr);
                return;
              }
              tx.run(
                "INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
                [product_id, "adjustment", delta, reason, req.user.id],
                (movementErr) => {
                  if (movementErr) {
                    finish(movementErr);
                    return;
                  }
                  finish(null);
                }
              );
            }
          );
        });
      }, (transactionErr) => {
        if (transactionErr) {
          if (transactionErr.status) {
            return res.status(transactionErr.status).json({ message: transactionErr.message });
          }
          return res.status(500).json({ message: "Erro ao ajustar estoque." });
        }
        logAudit({
          action: "ajuste_estoque",
          details: { 
            id_produto: product_id, 
            nome_produto: productData?.name,
            variacao_estoque: delta, 
            motivo_ajuste: reason,
            estoque_anterior: productData?.stock,
            estoque_atual: (productData?.stock || 0) + delta,
            mensagem: "Ajuste manual de estoque realizado"
          },
          performedBy: req.user.id,
          approvedBy: req.approval?.performed_by
        });
        return res.status(201).json({ status: "ok", current_stock: updatedStock });
      });
    }
  }
);

router.post(
  "/api/stock/move",
  authenticateToken,
  requireSupervisor,
  [
    body("product_id").isInt({ min: 1 }).withMessage("Produto inválido."),
    body("delta").optional().isFloat().not().equals("0").withMessage("Delta inválido."),
    body("quantity").optional().isFloat({ min: 0.001 }).withMessage("Quantidade inválida."),
    body("type").isIn(["inbound", "outbound", "transfer", "return"]).withMessage("Tipo inválido."),
    body("reason").optional().trim().isString().withMessage("Motivo inválido."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { product_id, delta, quantity, type, reason = "" } = req.body;
    const deltaValue = delta !== undefined ? delta : (quantity !== undefined ? quantity : 0);
    const finalDelta = type === "outbound" ? -Math.abs(deltaValue) : Math.abs(deltaValue);

    runWithTransaction((tx, finish) => {
      tx.get("SELECT current_stock FROM products WHERE id = ?", [product_id], (err, product) => {
        if (err || !product) {
          finish({ status: 404, message: "Produto não encontrado." });
          return;
        }
        const nextStock = product.current_stock + finalDelta;
        if (nextStock < 0) {
          finish({ status: 400, message: "Estoque insuficiente." });
          return;
        }
        tx.run("UPDATE products SET current_stock = ? WHERE id = ?", [nextStock, product_id], (updErr) => {
          if (updErr) {
            finish(updErr);
            return;
          }
          tx.run(
            "INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
            [product_id, type, finalDelta, reason, req.user.id],
            (moveErr) => {
              if (moveErr) {
                finish(moveErr);
                return;
              }
              finish(null);
            }
          );
        });
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
  }
);

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
  if (start) {
    filters.push(`created_at::date >= $${params.length + 1}::date`);
    params.push(start);
  }
  if (end) {
    filters.push(`created_at::date <= $${params.length + 1}::date`);
    params.push(end);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  params.push(Number(limit));

  db.all(
    `SELECT stock_movements.*, products.name AS product_name
     FROM stock_movements
     JOIN products ON products.id = stock_movements.product_id
     ${where}
     ORDER BY stock_movements.created_at DESC
     LIMIT ?`,
    params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao buscar movimentações." });
      }
      return res.json(rows);
    }
  );
});

router.get("/api/stock/restock-suggestions", authenticateToken, (req, res) => {
  db.all(
    `SELECT products.*, categories.name AS category_name,
            suppliers.name AS supplier_name, suppliers.id AS supplier_id
     FROM products
     LEFT JOIN categories ON categories.id = products.category_id
     LEFT JOIN suppliers ON suppliers.id = products.supplier_id
     WHERE products.current_stock <= products.min_stock
     ORDER BY products.current_stock ASC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao buscar sugestões." });
      }
      return res.json(rows);
    }
  );
});

router.post(
  "/api/purchase-orders",
  authenticateToken,
  requireManager,
  [
    body("supplier_id").isInt({ min: 1 }).withMessage("Fornecedor inválido."),
    body("items").isArray({ min: 1 }).withMessage("Itens inválidos."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { supplier_id, items } = req.body;

    runWithTransaction((tx, finish) => {
      tx.get(
        "INSERT INTO purchase_orders (supplier_id, created_by) VALUES (?, ?) RETURNING id",
        [supplier_id, req.user.id],
        (err, row) => {
          if (err) {
            finish(err);
            return;
          }
          const orderId = row.id;
          let processed = 0;
          items.forEach((item) => {
            tx.run(
              "INSERT INTO purchase_order_items (order_id, product_id, quantity) VALUES (?, ?, ?)",
              [orderId, item.product_id, item.quantity],
              (itemErr) => {
                if (itemErr) {
                  finish(itemErr);
                  return;
                }
                processed += 1;
                if (processed === items.length) {
                  finish(null);
                }
              }
            );
          });
        }
      );
    }, (transactionErr) => {
      if (transactionErr) {
        return res.status(500).json({ message: "Erro ao criar pedido." });
      }
      return res.status(201).json({ status: "ok" });
    });
  }
);

router.get("/api/purchase-orders", authenticateToken, requireManager, (req, res) => {
  db.all(
    `SELECT purchase_orders.*, suppliers.name AS supplier_name
     FROM purchase_orders
     LEFT JOIN suppliers ON suppliers.id = purchase_orders.supplier_id
     ORDER BY purchase_orders.created_at DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao buscar pedidos." });
      }
      return res.json(rows);
    }
  );
});

router.get("/api/purchase-orders/:id/items", authenticateToken, requireManager, (req, res) => {
  const orderId = Number(req.params.id);
  db.all(
    `SELECT purchase_order_items.*, products.name AS product_name
     FROM purchase_order_items
     JOIN products ON products.id = purchase_order_items.product_id
     WHERE purchase_order_items.order_id = ?`,
    [orderId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao buscar itens." });
      }
      return res.json(rows);
    }
  );
});

router.post(
  "/api/purchase-orders/:id/receive",
  authenticateToken,
  requireManager,
  (req, res) => {
    const orderId = Number(req.params.id);
    runWithTransaction((tx, finish) => {
      tx.get("SELECT * FROM purchase_orders WHERE id = ?", [orderId], (err, order) => {
        if (err || !order) {
          finish({ status: 404, message: "Pedido não encontrado." });
          return;
        }
        if (order.status === "received") {
          finish({ status: 400, message: "Pedido já recebido." });
          return;
        }
        tx.all(
          "SELECT * FROM purchase_order_items WHERE order_id = ?",
          [orderId],
          (itemsErr, items) => {
            if (itemsErr) {
              finish(itemsErr);
              return;
            }
            let processed = 0;
            items.forEach((item) => {
              tx.run(
                "UPDATE products SET current_stock = current_stock + ? WHERE id = ?",
                [item.quantity, item.product_id],
                (updateErr) => {
                  if (updateErr) {
                    finish(updateErr);
                    return;
                  }
                  tx.run(
                    "INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
                    [item.product_id, "inbound", item.quantity, "Recebimento de pedido", req.user.id],
                    (movementErr) => {
                      if (movementErr) {
                        finish(movementErr);
                        return;
                      }
                      processed += 1;
                      if (processed === items.length) {
                        tx.run(
                          "UPDATE purchase_orders SET status = 'received', received_at = CURRENT_TIMESTAMP WHERE id = ?",
                          [orderId],
                          (finalErr) => {
                            if (finalErr) {
                              finish(finalErr);
                              return;
                            }
                            finish(null);
                          }
                        );
                      }
                    }
                  );
                }
              );
            });
          }
        );
      });
    }, (transactionErr) => {
      if (transactionErr) {
        return res.status(transactionErr.status || 500).json({ message: transactionErr.message || "Erro ao receber pedido." });
      }
      logAudit({
        action: "pedido_compra_recebido",
        details: { id: orderId },
        performedBy: req.user.id,
      });
      return res.json({ status: "ok" });
    });
  }
);

router.get("/api/discounts", authenticateToken, requireSupervisor, (req, res) => {
  db.all("SELECT * FROM discounts ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Erro ao buscar descontos." });
    }
    return res.json(rows);
  });
});

router.post(
  "/api/discounts",
  authenticateToken,
  requireSupervisor,
  [
    body("name").trim().notEmpty().withMessage("Nome é obrigatório."),
    body("type").isIn(["percent", "fixed", "buy_x_get_y", "fixed_bundle", "percentage", "bulk"]).withMessage("Tipo inválido."),
    body("value").optional().isFloat({ min: 0 }).withMessage("Valor inválido."),
    body("min_quantity").optional({ checkFalsy: true }).toInt().isInt({ min: 0 }).withMessage("Quantidade inválida."),
    body("buy_quantity").optional({ checkFalsy: true }).toInt().isInt({ min: 1 }).withMessage("Quantidade inválida."),
    body("get_quantity").optional({ checkFalsy: true }).toInt().isInt({ min: 1 }).withMessage("Quantidade inválida."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const payload = req.body;
    // Mapear tipos do frontend para o backend
    let type = payload.type;
    if (type === "percentage") type = "percent";
    if (type === "bulk") type = "buy_x_get_y";
    if (type === "combo") type = "fixed_bundle";

    if (type === "fixed_bundle" && (!payload.buy_quantity || !payload.value)) {
      return res.status(400).json({ message: "Quantidade e preço do combo são obrigatórios." });
    }
    if (type === "buy_x_get_y" && (!payload.buy_quantity || !payload.get_quantity)) {
      return res.status(400).json({ message: "Informe a quantidade de compra e quantidade grátis." });
    }

    return getSettings(["max_discount"], (settings) => {
      const maxDiscount = Number(settings.max_discount || 0);
      if (type === "percent" && maxDiscount > 0 && Number(payload.value) > maxDiscount) {
        return res.status(403).json({ message: "Desconto acima do limite permitido." });
      }

      db.get(
        `INSERT INTO discounts (
           name, type, value, min_quantity, buy_quantity, get_quantity, target_type, target_value,
           days_of_week, starts_at, ends_at, starts_time, ends_time, stacking_rule, criteria, priority, active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          payload.name,
          type,
          payload.value != null ? payload.value : 0,
          payload.min_quantity != null ? Number(payload.min_quantity) : 0,
          payload.buy_quantity != null ? Number(payload.buy_quantity) : 0,
          payload.get_quantity != null ? Number(payload.get_quantity) : 0,
          payload.target_type || "all",
          payload.target_value || null,
          Array.isArray(payload.days_of_week) ? JSON.stringify(payload.days_of_week) : (payload.days_of_week || null),
          payload.starts_at || null,
          payload.ends_at || null,
          payload.starts_time || null,
          payload.ends_time || null,
          payload.stacking_rule || "exclusive",
          Array.isArray(payload.criteria) ? JSON.stringify(payload.criteria) : (payload.criteria || null),
          payload.priority != null ? Number(payload.priority) : 0,
          payload.active !== false ? 1 : 0,
        ],
        (err, row) => {
          if (err) {
            return res.status(500).json({ message: "Erro ao cadastrar desconto." });
          }
          logAudit({
            action: "desconto_criado",
            details: { id: row.id, name: payload.name, type: type, value: payload.value },
            performedBy: req.user.id,
          });
          return res.status(201).json({ id: row.id });
        }
      );
    });
  }
);

router.put(
  "/api/discounts/:id",
  authenticateToken,
  requireSupervisor,
  [
    body("name").trim().notEmpty().withMessage("Nome é obrigatório."),
    body("type").isIn(["percent", "fixed", "buy_x_get_y", "fixed_bundle", "percentage", "bulk"]).withMessage("Tipo inválido."),
    body("value").optional().isFloat({ min: 0 }).withMessage("Valor inválido."),
  ],
  (req, res) => {
    const id = Number(req.params.id);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const payload = req.body;
    let type = payload.type;
    if (type === "percentage") type = "percent";
    if (type === "bulk") type = "buy_x_get_y";
    if (type === "combo") type = "fixed_bundle";

    db.run(
      `UPDATE discounts SET 
         name = ?, type = ?, value = ?, min_quantity = ?, buy_quantity = ?, get_quantity = ?, 
         target_type = ?, target_value = ?, days_of_week = ?, starts_at = ?, ends_at = ?, 
         starts_time = ?, ends_time = ?, stacking_rule = ?, priority = ?, active = ?
       WHERE id = ?`,
      [
        payload.name,
        type,
        payload.value != null ? payload.value : 0,
        payload.min_quantity != null ? Number(payload.min_quantity) : 0,
        payload.buy_quantity != null ? Number(payload.buy_quantity) : 0,
        payload.get_quantity != null ? Number(payload.get_quantity) : 0,
        payload.target_type || "all",
        payload.target_value || null,
        Array.isArray(payload.days_of_week) ? JSON.stringify(payload.days_of_week) : (payload.days_of_week || null),
        payload.starts_at || null,
        payload.ends_at || null,
        payload.starts_time || null,
        payload.ends_time || null,
        payload.stacking_rule || "exclusive",
        payload.priority != null ? Number(payload.priority) : 0,
        payload.active != null ? Number(payload.active) : 1,
        id
      ],
      (err) => {
        if (err) {
          return res.status(500).json({ message: "Erro ao atualizar desconto." });
        }
        logAudit({
          action: "desconto_atualizado",
          details: { id, name: payload.name, type, value: payload.value },
          performedBy: req.user.id,
        });
        return res.json({ status: "ok" });
      }
    );
  }
);

router.delete("/api/discounts/:id", authenticateToken, requireSupervisor, (req, res) => {
  const id = Number(req.params.id);
  db.run("DELETE FROM discounts WHERE id = ?", [id], (err) => {
    if (err) {
      return res.status(500).json({ message: "Erro ao deletar desconto." });
    }
    logAudit({ action: "desconto_deletado", details: { id }, performedBy: req.user.id });
    return res.json({ status: "ok" });
  });
});

router.post(
  "/api/sales",
  authenticateToken,
  [
    body("payment_method").trim().notEmpty().withMessage("Pagamento é obrigatório."),
    body("product_id").optional().isInt({ min: 1 }).withMessage("Produto inválido."),
    body("quantity").optional().isFloat({ min: 0.001 }).withMessage("Quantidade inválida."),
    body("discount_id").optional().isInt({ min: 1 }).withMessage("Desconto inválido."),
    body("items")
      .optional()
      .isArray({ min: 1 })
      .withMessage("Itens da venda inválidos."),
    body("items.*.product_id").optional().isInt({ min: 1 }).withMessage("Produto inválido."),
    body("items.*.quantity").optional().isFloat({ min: 0.001 }).withMessage("Quantidade inválida."),
    body("items.*.discount_id").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Desconto inválido."),
    body("items.*.manual_discount").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("Desconto manual inválido."),
    body("manual_discount").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("Desconto manual inválido."),
    body("approval_token").optional({ nullable: true }).trim(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { payment_method, manual_discount: globalManualDiscount, approval_token } = req.body;
    const itemsFromBody = Array.isArray(req.body.items)
      ? req.body.items
      : [{ 
          product_id: req.body.product_id, 
          quantity: req.body.quantity, 
          discount_id: req.body.discount_id ?? null,
          manual_discount: req.body.manual_discount ?? null
        }];

    const hasInvalidItems = itemsFromBody.some((item) => !item?.product_id || !item?.quantity);
    if (hasInvalidItems) {
      return res.status(400).json({ message: "Todos os itens devem ter produto e quantidade válidos." });
    }

    // Verificar se o operador possui caixa aberto antes de registrar a venda
    return db.get(
      "SELECT id FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1",
      [req.user.id],
      (cashErr, cashSession) => {
        if (cashErr) {
          return res.status(500).json({ message: "Erro ao verificar sessão de caixa." });
        }
        if (!cashSession) {
          logAudit({
            action: "tentativa_venda_caixa_fechado",
            details: {
              mensagem: "Tentativa de venda bloqueada: o caixa está fechado",
              quantidade_itens: itemsFromBody.length,
              forma_pagamento: payment_method,
              orientacao: "O operador deve abrir o caixa antes de realizar qualquer venda"
            },
            performedBy: req.user.id
          });
          return res.status(400).json({ message: "O caixa precisa estar aberto para registrar vendas. Abra o caixa antes de continuar." });
        }

        return processSale();
      }
    );

    function processSale() {
    let responsePayload = null;
    const saleItems = [];

    const processSaleItem = (tx, item, done) => {
      const { product_id, quantity, discount_id = null, manual_discount = null, calculated_discount = null } = item;

      tx.get("SELECT * FROM products WHERE id = ?", [product_id], (err, product) => {
        if (err) {
          done(err);
          return;
        }
        if (!product) {
          done({ status: 404, message: "Produto não encontrado." });
          return;
        }
        if (Number(product.current_stock) < Number(quantity)) {
          done({ status: 400, message: "Estoque insuficiente." });
          return;
        }

        const total = Number(product.price) * Number(quantity);
        const applySale = (discount, discountAmount) => {
          const nextStock = Number(product.current_stock) - Number(quantity);
          const finalTotal = Math.max(total - discountAmount, 0);

          tx.run(
            "UPDATE products SET current_stock = ? WHERE id = ?",
            [nextStock, product_id],
            (updateErr) => {
              if (updateErr) {
                done(updateErr);
                return;
              }

              tx.get(
                `INSERT INTO sales (product_id, quantity, total, discount_id, discount_amount, final_total, payment_method, sold_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
                [
                  product_id,
                  quantity,
                  total,
                  discount?.id || null,
                  discountAmount,
                  finalTotal,
                  payment_method,
                  req.user.id,
                ],
                (saleErr, row) => {
                  if (saleErr) {
                    done(saleErr);
                    return;
                  }
                  const documentNumber = buildDocumentNumber(row.id);
                  tx.run(
                    "UPDATE sales SET document_number = ?, fiscal_status = COALESCE(fiscal_status, 'issued') WHERE id = ?",
                    [documentNumber, row.id],
                    (docErr) => {
                      if (docErr) {
                        done(docErr);
                        return;
                      }
                      tx.run(
                        "INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
                        [product_id, "sale", -Number(quantity), "Venda PDV", req.user.id],
                        (movementErr) => {
                          if (movementErr) {
                            done(movementErr);
                            return;
                          }
                          saleItems.push({
                            id: row.id,
                            document_number: documentNumber,
                            product_id,
                            quantity: Number(quantity),
                            total,
                            discount_amount: discountAmount,
                            final_total: finalTotal,
                          });
                          done(null);
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        };

        if (calculated_discount !== null && calculated_discount !== undefined) {
          applySale({ id: discount_id }, Number(calculated_discount));
          return;
        }

        if (manual_discount > 0) {
          applySale(null, Number(manual_discount));
          return;
        }

        if (!discount_id) {
          applySale(null, 0);
          return;
        }

        tx.get("SELECT * FROM discounts WHERE id = ? AND active = 1", [discount_id], (discountErr, discount) => {
          if (discountErr) {
            done(discountErr);
            return;
          }
          if (!discount) {
            done({ status: 400, message: "Desconto inválido." });
            return;
          }

          let discountAmount = 0;
          if (discount.type === "percent") {
            discountAmount = total * (Number(discount.value) / 100);
          } else if (discount.type === "fixed") {
            discountAmount = Number(discount.value);
          } else if (discount.type === "buy_x_get_y") {
            const buyQty = Number(discount.buy_quantity);
            const getQty = Number(discount.get_quantity);
            if (buyQty > 0 && quantity >= buyQty) {
              discountAmount = Number(product.price) * getQty;
            }
          } else if (discount.type === "fixed_bundle") {
            const bundleQty = Number(discount.buy_quantity);
            const bundlePrice = Number(discount.value);
            if (bundleQty > 0 && bundlePrice >= 0) {
              const bundles = Math.floor(quantity / bundleQty);
              const remainder = quantity % bundleQty;
              const bundleTotal = bundles * bundlePrice;
              const remainderTotal = remainder * Number(product.price);
              discountAmount = total - (bundleTotal + remainderTotal);
            }
          }

          if (discount.min_quantity && quantity < Number(discount.min_quantity)) {
            discountAmount = 0;
          }

          if (discountAmount < 0) {
            discountAmount = 0;
          }

          getSettings(["max_discount"], (settings) => {
            const maxDiscount = Number(settings.max_discount || 0);
            const discountPercent = total > 0 ? (discountAmount / total) * 100 : 0;
            if (maxDiscount > 0 && discountPercent > maxDiscount) {
              done({ status: 403, message: "Desconto acima do limite permitido." });
              return;
            }
            applySale(discount, discountAmount);
          });
        });
      });
    };

    const checkApproval = (callback) => {
      const hasManualDiscount = itemsFromBody.some(i => i.manual_discount > 0) || globalManualDiscount > 0;
      if (!hasManualDiscount) return callback(null);
      
      if (!approval_token) {
        return res.status(403).json({ message: "Desconto manual requer autorização do supervisor." });
      }
      
      verifyApprovalToken(approval_token, "discount_override", (err, approval) => {
        if (err || !approval) {
          return res.status(403).json({ message: "Token de autorização inválido ou expirado." });
        }
        callback(null);
      });
    };

    checkApproval((err) => {
      if (err) return;

      runWithTransaction((tx, finish) => {
        const processNext = (index) => {
        if (index >= itemsFromBody.length) {
          const totals = saleItems.reduce(
            (acc, item) => {
              acc.total += item.total;
              acc.discount_amount += item.discount_amount;
              acc.final_total += item.final_total;
              return acc;
            },
            { total: 0, discount_amount: 0, final_total: 0 }
          );
          const globalDiscount = Number(globalManualDiscount || 0);
          totals.discount_amount += globalDiscount;
          totals.final_total = Math.max(totals.final_total - globalDiscount, 0);

          responsePayload = {
            items: saleItems,
            ...totals,
            global_manual_discount: globalDiscount
          };
          if (saleItems.length === 1) {
            responsePayload = {
              id: saleItems[0].id,
              document_number: saleItems[0].document_number,
              ...totals,
              items: saleItems,
            };
          }
          finish(null);
          return;
        }
        processSaleItem(tx, itemsFromBody[index], (itemErr) => {
          if (itemErr) {
            finish(itemErr);
            return;
          }
          processNext(index + 1);
        });
      };
      processNext(0);
    }, (transactionErr) => {
      if (transactionErr) {
        if (transactionErr.status) {
          return res.status(transactionErr.status).json({ message: transactionErr.message });
        }
        return res.status(500).json({ message: "Erro ao registrar venda." });
      }
      logAudit({
        action: "venda_realizada",
        details: {
          sale_ids: responsePayload.items.map((item) => item.id),
          document_numbers: responsePayload.items.map((item) => item.document_number),
          items: responsePayload.items,
          total: responsePayload.total,
          discount_amount: responsePayload.discount_amount,
          final_total: responsePayload.final_total,
          payment_method,
        },
        performedBy: req.user.id,
      });
      return res.status(201).json(responsePayload);
    });
  });
    } // fim processSale
});

router.get("/api/reports/summary", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) {
    return;
  }
  const salesFilter = buildDateFilter("sales.created_at", range);
  db.get(
    `SELECT SUM(final_total) AS total_sales FROM sales ${salesFilter.clause}`,
    salesFilter.params,
    (salesErr, salesRow) => {
      if (salesErr) {
        return res.status(500).json({ message: "Erro ao gerar relatório." });
      }

      const lossFilter = buildDateFilter("stock_losses.created_at", range);
      db.get(
        `SELECT SUM(products.price * stock_losses.quantity) AS total_losses
         FROM stock_losses
         JOIN products ON products.id = stock_losses.product_id
         ${lossFilter.clause}`,
        lossFilter.params,
        (lossErr, lossRow) => {
          if (lossErr) {
            return res.status(500).json({ message: "Erro ao gerar relatório." });
          }

          db.all(
            `SELECT id, name, current_stock, min_stock
             FROM products
             WHERE current_stock <= min_stock`,
            [],
            (stockErr, lowStockRows) => {
              if (stockErr) {
                return res.status(500).json({ message: "Erro ao gerar relatório." });
              }

              db.all(
                `SELECT id, name, expires_at
                 FROM products
                 WHERE expires_at IS NOT NULL
                 ORDER BY expires_at ASC
                 LIMIT 10`,
                [],
                (expErr, expRows) => {
                  if (expErr) {
                    return res.status(500).json({ message: "Erro ao gerar relatório." });
                  }

                  return res.json({
                    total_sales: salesRow?.total_sales || 0,
                    total_losses: lossRow?.total_losses || 0,
                    low_stock: lowStockRows,
                    expiring_products: expRows,
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

router.get("/api/reports/sales", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const { operator_id, category_id } = req.query;
  const params = [];
  const conditions = [];

  if (range.start) {
    conditions.push(`CAST(sales.created_at AS DATE) >= ?`);
    params.push(range.start);
  }
  if (range.end) {
    conditions.push(`CAST(sales.created_at AS DATE) <= ?`);
    params.push(range.end);
  }
  if (operator_id) {
    conditions.push(`sales.sold_by = $${params.length + 1}`);
    params.push(Number(operator_id));
  }
  if (category_id) {
    conditions.push(`products.category_id = $${params.length + 1}`);
    params.push(Number(category_id));
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  db.all(
    `SELECT sales.id, sales.created_at, products.name as product, categories.name as category, sales.quantity, sales.total, sales.final_total, users.name as operator
     FROM sales
     JOIN products ON products.id = sales.product_id
     LEFT JOIN categories ON categories.id = products.category_id
     JOIN users ON users.id = sales.sold_by
     ${whereClause}
     ORDER BY sales.created_at DESC`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Erro ao gerar relatório." });
      return res.json(rows || []);
    }
  );
});

router.get("/api/reports/cash-flow", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const filter = buildDateFilter("occurred_at", range);
  db.all(
    `SELECT id, occurred_at, type, category, amount, reference, notes
     FROM finance_transactions
     ${filter.clause}
     ORDER BY occurred_at DESC`,
    filter.params,
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Erro ao gerar relatório." });
      return res.json(rows);
    }
  );
});

router.get("/api/reports/payables", authenticateToken, requireSupervisor, (req, res) => {
  db.all(
    `SELECT id, partner_name, description, amount, due_date, status
     FROM finance_accounts
     WHERE kind = 'payable'
     ORDER BY due_date ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Erro ao gerar relatório." });
      return res.json(rows);
    }
  );
});

router.get("/api/reports/receivables", authenticateToken, requireSupervisor, (req, res) => {
  db.all(
    `SELECT id, partner_name, description, amount, due_date, status
     FROM finance_accounts
     WHERE kind = 'receivable'
     ORDER BY due_date ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Erro ao gerar relatório." });
      return res.json(rows);
    }
  );
});

router.get("/api/reports/inventory", authenticateToken, requireSupervisor, (req, res) => {
  db.all(
    `SELECT products.name, categories.name as category, products.current_stock, products.unit_type, products.price, (products.current_stock * products.price) as inventory_value
     FROM products
     LEFT JOIN categories ON categories.id = products.category_id
     ORDER BY products.name ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Erro ao gerar relatório." });
      return res.json(rows);
    }
  );
});

const auditLogsHandler = (req, res) => {
  const { start, end, type = "all", level = "all" } = req.query;
  const params = [];
  const filters = [];

  if (start) {
    filters.push(`audit_logs.created_at >= $${params.length + 1}`);
    params.push(`${start}T00:00:00.000Z`);
  }
  if (end) {
    filters.push(`audit_logs.created_at <= $${params.length + 1}`);
    params.push(`${end}T23:59:59.999Z`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  db.all(
    `SELECT audit_logs.*, users.name AS performed_by_name, approvers.name AS approved_by_name
     FROM audit_logs
     LEFT JOIN users ON users.id = audit_logs.performed_by
     LEFT JOIN users AS approvers ON approvers.id = audit_logs.approved_by
     ${whereClause}
     ORDER BY audit_logs.created_at DESC
     LIMIT 500`,
    params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao buscar logs." });
      }

      const normalizedRows = rows.map((row) => {
        const normalizedType = inferAuditType(row.action);
        const normalizedLevel = inferAuditLevel(row.action);
        return {
          ...row,
          type: normalizedType,
          level: normalizedLevel,
          user_name: row.performed_by_name || "Sistema",
          approved_by_name: row.approved_by_name || null,
          details: parseAuditDetails(row.details),
        };
      }).filter((row) => {
        const matchesType = type === "all" || row.type === type;
        const matchesLevel = level === "all" || row.level === level;
        return matchesType && matchesLevel;
      });

      return res.json(normalizedRows);
    }
  );
};

router.get("/api/audit-logs", authenticateToken, requireManager, auditLogsHandler);
router.get("/api/logs", authenticateToken, requireManager, auditLogsHandler);

router.post(
  "/api/finance/cashflow",
  authenticateToken,
  requireSupervisor,
  [
    body("type").isIn(["in", "out"]).withMessage("Tipo inválido."),
    body("category").trim().notEmpty().withMessage("Categoria é obrigatória."),
    body("amount").isFloat({ gt: 0 }).withMessage("Valor inválido."),
    body("reference").optional().isString().withMessage("Referência inválida."),
    body("notes").optional().isString().withMessage("Observação inválida."),
    body("occurred_at").optional().isISO8601().withMessage("Data inválida."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { type, category, amount, reference = "", notes = "", occurred_at = null } = req.body;

    db.get(
      `INSERT INTO finance_transactions (type, category, amount, reference, notes, recorded_by, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
       RETURNING id, type, category, amount, reference, notes, recorded_by, occurred_at`,
      [type, category, amount, reference, notes, req.user.id, occurred_at],
      (err, row) => {
        if (err) {
          return res.status(500).json({ message: "Erro ao registrar fluxo de caixa." });
        }
        logAudit({
          action: "fluxo_caixa_registrado",
          details: { id: row.id, type, category, amount: Number(amount), reference },
          performedBy: req.user.id,
        });
        return res.status(201).json(row);
      }
    );
  }
);

router.get("/api/finance/cashflow", authenticateToken, requireSupervisor, (req, res) => {
  const limit = Number(req.query.limit || 100);
  const safeLimit = Number.isNaN(limit) ? 100 : Math.min(Math.max(limit, 1), 500);
  const range = parseDateRange(req, res);
  if (!range) {
    return;
  }

  const dateFilter = buildDateFilter("occurred_at", range);
  db.all(
    `SELECT finance_transactions.*, users.name AS recorded_by_name
     FROM finance_transactions
     LEFT JOIN users ON users.id = finance_transactions.recorded_by
     ${dateFilter.clause}
     ORDER BY occurred_at DESC
     LIMIT ?`,
    [...dateFilter.params, safeLimit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao listar fluxo de caixa." });
      }
      return res.json(rows);
    }
  );
});

router.get("/api/finance/daily-close", authenticateToken, requireSupervisor, (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  if (Number.isNaN(new Date(date).getTime())) {
    return res.status(400).json({ message: "Data inválida." });
  }

  db.get(
    `SELECT COALESCE(SUM(final_total), 0) AS sales_total
     FROM sales
     WHERE created_at::date = $1::date AND cancelled_at IS NULL`,
    [date],
    (salesErr, salesRow) => {
      if (salesErr) {
        return res.status(500).json({ message: "Erro ao consolidar fechamento diário." });
      }
      db.get(
        `SELECT COALESCE(SUM(products.price * stock_losses.quantity), 0) AS losses_total
         FROM stock_losses
         JOIN products ON products.id = stock_losses.product_id
         WHERE stock_losses.created_at::date = $1::date`,
        [date],
        (lossErr, lossRow) => {
          if (lossErr) {
            return res.status(500).json({ message: "Erro ao consolidar fechamento diário." });
          }
          db.get(
            `SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS finance_net
             FROM finance_transactions
             WHERE occurred_at::date = $1::date`,
            [date],
            (financeErr, financeRow) => {
              if (financeErr) {
                return res.status(500).json({ message: "Erro ao consolidar fechamento diário." });
              }
              db.get(
                `SELECT COALESCE(SUM(CASE WHEN type = 'supply' THEN amount ELSE -amount END), 0) AS cash_adjustments_net
                 FROM cash_movements
                 WHERE created_at::date = $1::date`,
                [date],
                (cashErr, cashRow) => {
                  if (cashErr) {
                    return res.status(500).json({ message: "Erro ao consolidar fechamento diário." });
                  }
                  return res.json({
                    date,
                    sales_total: Number(salesRow?.sales_total || 0),
                    losses_total: Number(lossRow?.losses_total || 0),
                    finance_net: Number(financeRow?.finance_net || 0),
                    cash_adjustments_net: Number(cashRow?.cash_adjustments_net || 0),
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

router.post(
  "/api/finance/accounts",
  authenticateToken,
  requireSupervisor,
  [
    body("kind").isIn(["payable", "receivable"]).withMessage("Tipo de conta inválido."),
    body("partner_name").trim().notEmpty().withMessage("Parceiro é obrigatório."),
    body("description").trim().notEmpty().withMessage("Descrição é obrigatória."),
    body("amount").isFloat({ gt: 0 }).withMessage("Valor inválido."),
    body("due_date").isISO8601().withMessage("Vencimento inválido."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { kind, partner_name, description, amount, due_date } = req.body;
    db.get(
      `INSERT INTO finance_accounts (kind, partner_name, description, amount, due_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, kind, partner_name, description, amount, due_date, status, created_at`,
      [kind, partner_name, description, amount, due_date, req.user.id],
      (err, row) => {
        if (err) {
          return res.status(500).json({ message: "Erro ao registrar conta." });
        }
        logAudit({
          action: "conta_financeira_criada",
          details: { id_conta: row.id, tipo_conta: kind, nome_parceiro: partner_name, valor: Number(amount), data_vencimento: due_date, mensagem: "Nova conta a pagar ou receber registrada" },
          performedBy: req.user.id,
        });
        return res.status(201).json(row);
      }
    );
  }
);

router.get("/api/finance/accounts", authenticateToken, requireSupervisor, (req, res) => {
  const kind = req.query.kind || null;
  const status = req.query.status || null;
  const clauses = [];
  const params = [];
  if (kind) {
    clauses.push("kind = ?");
    params.push(kind);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  db.all(
    `SELECT finance_accounts.*, creator.name AS created_by_name, settler.name AS settled_by_name
     FROM finance_accounts
     LEFT JOIN users AS creator ON creator.id = finance_accounts.created_by
     LEFT JOIN users AS settler ON settler.id = finance_accounts.settled_by
     ${where}
     ORDER BY due_date ASC, created_at DESC`,
    params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao listar contas." });
      }
      return res.json(rows);
    }
  );
});

router.post("/api/finance/accounts/:id/settle", authenticateToken, requireSupervisor, (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId < 1) {
    return res.status(400).json({ message: "Conta inválida." });
  }

  runWithTransaction((tx, finish) => {
    tx.get("SELECT * FROM finance_accounts WHERE id = ?", [accountId], (accountErr, account) => {
      if (accountErr) {
        finish(accountErr);
        return;
      }
      if (!account) {
        finish({ status: 404, message: "Conta não encontrada." });
        return;
      }
      if (account.status === "settled") {
        finish({ status: 409, message: "Conta já liquidada." });
        return;
      }

      tx.run(
        "UPDATE finance_accounts SET status = 'settled', settled_at = CURRENT_TIMESTAMP, settled_by = ? WHERE id = ?",
        [req.user.id, accountId],
        (updateErr) => {
          if (updateErr) {
            finish(updateErr);
            return;
          }
          const cashflowType = account.kind === "payable" ? "out" : "in";
          tx.run(
            `INSERT INTO finance_transactions (type, category, amount, reference, notes, recorded_by, occurred_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [cashflowType, `account_${account.kind}`, account.amount, `ACC-${account.id}`, account.description, req.user.id],
            (flowErr) => {
              if (flowErr) {
                finish(flowErr);
                return;
              }
              finish(null);
            }
          );
        }
      );
    });
  }, (transactionErr) => {
    if (transactionErr) {
      if (transactionErr.status) {
        return res.status(transactionErr.status).json({ message: transactionErr.message });
      }
      return res.status(500).json({ message: "Erro ao liquidar conta." });
    }
    logAudit({
      action: "conta_financeira_liquidada",
      details: { id_conta: accountId, mensagem: "Conta financeira liquidada (paga ou recebida)" },
      performedBy: req.user.id,
    });
    return res.json({ status: "ok", account_id: accountId });
  });
});

router.get("/api/reports/by-operator", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) {
    return;
  }
  const salesFilter = buildDateFilter("sales.created_at", range);
  db.all(
    `SELECT users.id, users.name, SUM(sales.final_total) AS total_sales, SUM(sales.quantity) AS total_items
     FROM sales
     LEFT JOIN users ON users.id = sales.sold_by
     ${salesFilter.clause}
     GROUP BY users.id, users.name
     ORDER BY total_sales DESC`,
    salesFilter.params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao gerar relatório." });
      }
      return res.json(rows);
    }
  );
});

router.get("/api/reports/by-category", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) {
    return;
  }
  const salesFilter = buildDateFilter("sales.created_at", range);
  db.all(
    `SELECT categories.name AS category, SUM(sales.final_total) AS total_sales, SUM(sales.quantity) AS total_items
     FROM sales
     JOIN products ON products.id = sales.product_id
     LEFT JOIN categories ON categories.id = products.category_id
     ${salesFilter.clause}
     GROUP BY categories.name
     ORDER BY total_sales DESC`,
    salesFilter.params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao gerar relatório." });
      }
      return res.json(rows);
    }
  );
});

router.get("/api/reports/hourly-sales", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req, res);
  if (!range) return;
  const salesFilter = buildDateFilter("sales.created_at", range);
  
  // No Postgres, extraímos a hora usando DATE_PART
  db.all(
    `SELECT 
        CAST(DATE_PART('hour', sales.created_at) AS INTEGER) as hora,
        SUM(sales.final_total) as vendas
     FROM sales
     ${salesFilter.clause}
     GROUP BY DATE_PART('hour', sales.created_at)
     ORDER BY hora ASC`,
    salesFilter.params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao gerar relatório de vendas horárias." });
      }
      
      // Preencher horas vazias para o gráfico ficar completo (0-23)
      const hourlyMap = {};
      for (let i = 0; i < 24; i++) hourlyMap[i] = 0;
      rows.forEach(row => {
        hourlyMap[row.hora] = Number(row.vendas);
      });
      
      const fullRows = Object.keys(hourlyMap).map(h => ({
        hora: `${h}:00`,
        vendas: hourlyMap[h]
      }));
      
      return res.json(fullRows);
    }
  );
});

router.post(
  "/api/approvals",
  [
    body("email").isEmail().withMessage("Email inválido."),
    body("password").notEmpty().withMessage("Senha é obrigatória."),
    body("action")
      .isIn(["remove_item", "discount_override", "cancel_sale", "user_update", "stock_loss", "stock_adjust", "open_cash_session", "cash_withdrawal"])
      .withMessage("Ação inválida."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, action, reason = "", metadata = {} } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
      if (err || !user) {
        return res.status(401).json({ message: "Credenciais inválidas." });
      }
      if (!hasRole(user, "manager")) {
        return res.status(403).json({ message: "Aprovação requer gerente ou admin." });
      }
      const valid = bcrypt.compareSync(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ message: "Credenciais inválidas." });
      }

      const token = crypto.randomBytes(16).toString("hex");
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      db.run(
        `INSERT INTO approvals (token_hash, action, reason, metadata, approved_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tokenHash, action, reason, JSON.stringify(metadata), user.id, expiresAt],
        function handleInsert(err) {
          if (err) {
            return res.status(500).json({ message: "Erro ao registrar aprovação." });
          }
          logAudit({
            action: "aprovacao_concedida",
            details: { acao_autorizada: action, motivo: reason, metadados: metadata, mensagem: "Aprovação de segurança concedida por gerente" },
            performedBy: user.id,
            approvedBy: user.id,
          });
          return res.status(201).json({ token, expires_at: expiresAt });
        }
      );
    });
  }
);

router.post(
  "/api/pos/remove-item",
  authenticateToken,
  requireApproval("remove_item"),
  [
    body("item").trim().notEmpty().withMessage("Item é obrigatório."),
    body("reason").trim().notEmpty().withMessage("Motivo é obrigatório."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { item, reason } = req.body;
    logAudit({
      action: "item_removido",
      details: { item_removido: item, motivo: reason, mensagem: "Item removido do carrinho com autorização" },
      performedBy: req.user.id,
      approvedBy: req.approval?.approved_by,
    });
    return res.json({ status: "ok" });
  }
);

router.post(
  "/api/pos/discount-override",
  authenticateToken,
  [
    body("amount").isFloat({ min: 0 }).withMessage("Valor inválido."),
    body("subtotal").optional().isFloat({ min: 0 }).withMessage("Subtotal inválido."),
    body("reason").trim().notEmpty().withMessage("Motivo é obrigatório."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, reason, subtotal = 0 } = req.body;
    const baseTotal = Number(subtotal) || 0;
    const discountPercent = baseTotal > 0 ? (Number(amount) / baseTotal) * 100 : 0;
    return getSettings(["max_discount", "approval_threshold"], (settings) => {
      const maxDiscount = Number(settings.max_discount || 0);
      if ((maxDiscount > 0 || Number(settings.approval_threshold || 0) > 0) && baseTotal <= 0 && Number(amount) > 0) {
        return res.status(400).json({ message: "Subtotal obrigatório para validar o desconto." });
      }
      if (maxDiscount > 0 && discountPercent > maxDiscount) {
        return res.status(403).json({ message: "Desconto acima do limite permitido." });
      }

      const approvalThreshold = Number(settings.approval_threshold || 0);
      const needsApproval = approvalThreshold > 0 && discountPercent >= approvalThreshold;
      const approvalToken = req.headers["x-approval-token"];

      const finalize = (approval) => {
        logAudit({
          action: "desconto_manual_autorizado",
          details: { valor_desconto: amount, motivo: reason, subtotal_venda: baseTotal, porcentagem_desconto: discountPercent, mensagem: "Desconto manual aplicado na venda" },
          performedBy: req.user.id,
          approvedBy: approval?.approved_by,
        });
        return res.json({ status: "ok" });
      };

      if (needsApproval) {
        return verifyApprovalToken(approvalToken, "discount_override", (error, approval) => {
          if (error) {
            return res.status(error.status).json({ message: error.message });
          }
          return finalize(approval);
        });
      }

      return finalize(null);
    });
  }
);

router.post(
  "/api/pos/cancel-sale",
  authenticateToken,
  requireApproval("cancel_sale"),
  [
    body("reason").trim().notEmpty().withMessage("Motivo é obrigatório."),
    body("sale_id").isInt({ min: 1 }).withMessage("Venda inválida."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { reason, sale_id } = req.body;
    runWithTransaction((tx, finish) => {
      tx.get("SELECT * FROM sales WHERE id = ?", [sale_id], (saleErr, sale) => {
        if (saleErr) {
          finish(saleErr);
          return;
        }
        if (!sale) {
          finish({ status: 404, message: "Venda não encontrada." });
          return;
        }
        if (sale.cancelled_at) {
          finish({ status: 409, message: "Venda já cancelada." });
          return;
        }

        tx.run(
          "UPDATE products SET current_stock = current_stock + ? WHERE id = ?",
          [sale.quantity, sale.product_id],
          (stockErr) => {
            if (stockErr) {
              finish(stockErr);
              return;
            }

            tx.run(
              `UPDATE sales
               SET cancelled_at = CURRENT_TIMESTAMP,
                   cancel_reason = ?,
                   cancelled_by = ?,
                   fiscal_status = 'cancelled'
               WHERE id = ?`,
              [reason, req.user.id, sale_id],
              (updateErr) => {
                if (updateErr) {
                  finish(updateErr);
                  return;
                }
                tx.run(
                  "INSERT INTO stock_movements (product_id, type, delta, reason, performed_by) VALUES (?, ?, ?, ?, ?)",
                  [sale.product_id, "cancellation", Number(sale.quantity), `Cancelamento venda #${sale_id}: ${reason}`, req.user.id],
                  (movementErr) => {
                    if (movementErr) {
                      finish(movementErr);
                      return;
                    }
                    finish(null);
                  }
                );
              }
            );
          }
        );
      });
    }, (transactionErr) => {
      if (transactionErr) {
        if (transactionErr.status) {
          return res.status(transactionErr.status).json({ message: transactionErr.message });
        }
        return res.status(500).json({ message: "Erro ao cancelar venda." });
      }
      logAudit({
        action: "venda_cancelada",
        details: { reason, sale_id },
        performedBy: req.user.id,
        approvedBy: req.approval?.approved_by,
      });
      return res.json({ status: "ok" });
    });
  }
);

router.get("/api/pos/cash-session/current", authenticateToken, (req, res) => {
  db.get(
    `SELECT cash_sessions.*,
            users.name AS operator_name
     FROM cash_sessions
     JOIN users ON users.id = cash_sessions.operator_id
     WHERE cash_sessions.operator_id = ? AND cash_sessions.closed_at IS NULL
     ORDER BY cash_sessions.opened_at DESC
     LIMIT 1`,
    [req.user.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao buscar sessão de caixa." });
      }
      if (!row) {
        return res.json(null);
      }
      // Calcular expected_amount dinamicamente
      db.all(
        "SELECT type, amount FROM cash_movements WHERE session_id = ?",
        [row.id],
        (moveErr, movements) => {
          if (moveErr) {
            return res.json(row);
          }
          const movementNet = (movements || []).reduce((acc, movement) => {
            const value = Number(movement.amount || 0);
            return movement.type === "supply" ? acc + value : acc - value;
          }, 0);
          const expectedAmount = Number(row.opening_amount || 0) + movementNet;
          return res.json({
            ...row,
            expected_amount: expectedAmount
          });
        }
      );
    }
  );
});

router.post(
  "/api/pos/cash-session/open",
  authenticateToken,
  [
    body("opening_amount").isFloat({ min: 0 }).withMessage("Valor de abertura inválido."),
    body("notes").optional().isString().withMessage("Observação inválida."),
    body("approval_token").notEmpty().withMessage("Aprovação de superior é obrigatória para abrir o caixa."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { opening_amount, notes = "", approval_token } = req.body;

    // Verificar aprovação do superior
    verifyApprovalToken(approval_token, "open_cash_session", (err, approval) => {
      if (err) {
        return res.status(err.status || 401).json({ message: err.message || "Aprovação inválida." });
      }

      db.get(
        "SELECT id FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL LIMIT 1",
        [req.user.id],
        (lookupErr, existing) => {
          if (lookupErr) {
            return res.status(500).json({ message: "Erro ao abrir caixa." });
          }
          if (existing) {
            return res.status(409).json({ message: "Já existe um caixa aberto para este operador." });
          }

          return db.get(
            `INSERT INTO cash_sessions (operator_id, opening_amount, notes, approved_by, approval_token)
             VALUES (?, ?, ?, ?, ?) RETURNING id, operator_id, opening_amount, opened_at, notes`,
            [req.user.id, opening_amount, notes, approval.approved_by, approval_token],
            (insertErr, session) => {
              if (insertErr) {
                return res.status(500).json({ message: "Erro ao abrir caixa." });
              }
              logAudit({
                action: "caixa_aberto",
                details: { 
                  session_id: session.id, 
                  opening_amount: Number(opening_amount), 
                  notes,
                  approved_by: approval.approved_by 
                },
                performedBy: req.user.id,
                approvedBy: approval.approved_by
              });
              return res.status(201).json(session);
            }
          );
        }
      );
    });
  }
);

router.get("/api/pos/cash-session/movement", authenticateToken, (req, res) => {
  const limit = Number(req.query.limit || 50);
  db.all(
    `SELECT cash_movements.*, users.name AS performed_by_name
     FROM cash_movements
     JOIN users ON users.id = cash_movements.performed_by
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Erro ao buscar movimentos." });
      return res.json({ data: rows }); // Envelopado para compatibilidade com frontend
    }
  );
});

router.post(
  "/api/pos/cash-session/movement",
  authenticateToken,
  [
    body("type").isIn(["withdrawal", "supply", "deposit"]).withMessage("Tipo de movimentação inválido."),
    body("amount").isFloat({ gt: 0 }).withMessage("Valor inválido."),
    body("reason").optional().trim().isString().withMessage("Motivo inválido."),
    body("description").optional().trim().isString().withMessage("Descrição inválida."),
    body("session_id").optional().isInt({ min: 1 }).withMessage("Sessão inválida."),
    body("approval_token").optional().isString().withMessage("Token de aprovação inválido."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, amount, reason, description, session_id, approval_token } = req.body;
    const finalReason = reason || description || "Movimentação manual";
    let finalType = type;
    if (type === "deposit") finalType = "supply";

    // Sangrias (withdrawal) exigem aprovação de superior
    const needsApproval = finalType === "withdrawal";

    const finalizeMovement = (approval = null) => {
      const loadSql = session_id
        ? "SELECT * FROM cash_sessions WHERE id = ? AND closed_at IS NULL"
        : "SELECT * FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1";
      const params = session_id ? [session_id] : [req.user.id];

      db.get(loadSql, params, (sessionErr, session) => {
        if (sessionErr) {
          return res.status(500).json({ message: "Erro ao registrar movimentação de caixa." });
        }
        if (!session) {
          return res.status(404).json({ message: "Sessão de caixa aberta não encontrada." });
        }

        return db.get(
          `INSERT INTO cash_movements (session_id, type, amount, reason, performed_by)
           VALUES (?, ?, ?, ?, ?) RETURNING id, session_id, type, amount, reason, performed_by, created_at`,
          [session.id, finalType, amount, finalReason, req.user.id],
          (insertErr, movement) => {
            if (insertErr) {
              return res.status(500).json({ message: "Erro ao registrar movimentação de caixa." });
            }
            logAudit({
              action: "movimentacao_caixa",
              details: { 
                session_id: session.id, 
                type: finalType, 
                amount: Number(amount), 
                reason: finalReason,
                approved_by: approval?.approved_by
              },
              performedBy: req.user.id,
              approvedBy: approval?.approved_by
            });
            return res.status(201).json(movement);
          }
        );
      });
    };

    if (needsApproval) {
      if (!approval_token) {
        return res.status(403).json({ message: "Sangria requer aprovação de um superior." });
      }
      return verifyApprovalToken(approval_token, "cash_withdrawal", (err, approval) => {
        if (err) return res.status(err.status || 401).json({ message: err.message });
        return finalizeMovement(approval);
      });
    }

    return finalizeMovement();
  }
);

router.post(
  "/api/pos/cash-session/close",
  authenticateToken,
  [
    body("closing_amount").optional().isFloat({ min: 0 }).withMessage("Valor de fechamento inválido."),
    body("total_counted").optional().isFloat({ min: 0 }).withMessage("Valor contado inválido."),
    body("notes").optional().isString().withMessage("Observação inválida."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const closing_amount = req.body.closing_amount ?? req.body.total_counted;
    if (typeof closing_amount === "undefined") {
      return res.status(400).json({ message: "Valor de fechamento é obrigatório." });
    }
    const { notes = "" } = req.body;

    let closedPayload = null;

    return runWithTransaction((tx, finish) => {
      tx.get(
        "SELECT * FROM cash_sessions WHERE operator_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1",
        [req.user.id],
        (sessionErr, session) => {
          if (sessionErr) {
            finish(sessionErr);
            return;
          }
          if (!session) {
            finish({ status: 404, message: "Nenhum caixa aberto para este operador." });
            return;
          }

          tx.all("SELECT type, amount FROM cash_movements WHERE session_id = ?", [session.id], (moveErr, movements) => {
            if (moveErr) {
              finish(moveErr);
              return;
            }

            const movementNet = (movements || []).reduce((acc, movement) => {
              const value = Number(movement.amount || 0);
              return movement.type === "supply" ? acc + value : acc - value;
            }, 0);
            const expectedAmount = Number(session.opening_amount || 0) + movementNet;
            const differenceAmount = Number(closing_amount) - expectedAmount;

            tx.run(
              `UPDATE cash_sessions
               SET closed_at = CURRENT_TIMESTAMP,
                   closing_amount = ?,
                   expected_amount = ?,
                   difference_amount = ?,
                   notes = CASE WHEN ? <> '' THEN ? ELSE notes END
               WHERE id = ?`,
              [closing_amount, expectedAmount, differenceAmount, notes, notes, session.id],
              (updateErr) => {
                if (updateErr) {
                  finish(updateErr);
                  return;
                }
                closedPayload = {
                  id: session.id,
                  opening_amount: Number(session.opening_amount),
                  closing_amount: Number(closing_amount),
                  expected_amount: expectedAmount,
                  difference_amount: differenceAmount,
                };
                finish(null);
              }
            );
          });
        }
      );
    }, (transactionErr) => {
      if (transactionErr) {
        if (transactionErr.status) {
          return res.status(transactionErr.status).json({ message: transactionErr.message });
        }
        return res.status(500).json({ message: "Erro ao fechar caixa." });
      }
      logAudit({
        action: "caixa_fechado",
        details: closedPayload,
        performedBy: req.user.id,
      });
      return res.json(closedPayload);
    });
  }
);

router.get("/api/pos/devices", authenticateToken, (req, res) => {
  db.all("SELECT * FROM pos_devices ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Erro ao buscar dispositivos." });
    }
    return res.json(rows);
  });
});

router.post(
  "/api/pos/devices",
  authenticateToken,
  requireAdmin,
  [
    body("type").isIn(["scanner", "scale"]).withMessage("Tipo inválido."),
    body("name").trim().notEmpty().withMessage("Nome é obrigatório."),
    body("connection").trim().notEmpty().withMessage("Conexão é obrigatória."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, name, connection, config: deviceConfig = "", active = 1 } = req.body;

    db.get(
      "INSERT INTO pos_devices (type, name, connection, config, active) VALUES (?, ?, ?, ?, ?) RETURNING id",
      [type, name, connection, JSON.stringify(deviceConfig), active ? 1 : 0],
      (err, row) => {
        if (err) {
          return res.status(400).json({ message: "Erro ao cadastrar dispositivo." });
        }
        return res.status(201).json({ id: row.id });
      }
    );
  }
);

router.get("/api/users", authenticateToken, requireSupervisor, (req, res) => {
  const role = req.query.role || null;
  const sql = role 
    ? "SELECT id, name, email, phone, role, is_active, permissions, created_at FROM users WHERE role = ?"
    : "SELECT id, name, email, phone, role, is_active, permissions, created_at FROM users";
  const params = role ? [role] : [];

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Erro ao buscar usuários." });
    }
    const users = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      is_active: row.is_active,
      permissions: row.permissions ? JSON.parse(row.permissions) : [],
      created_at: row.created_at,
    }));
    return res.json(users);
  });
});

router.post(
  "/api/users",
  authenticateToken,
  requireAdmin,
  [
    body("name").trim().notEmpty().withMessage("Nome é obrigatório."),
    body("email").isEmail().withMessage("Email inválido."),
    body("password").isLength({ min: 8 }).withMessage("Senha deve ter 8+ caracteres."),
    body("role").isIn(["operator", "supervisor", "manager", "admin"]).withMessage("Perfil inválido."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone = "", password, role, permissions = [] } = req.body;
    const passwordHash = bcrypt.hashSync(password, 10);

    db.get(
      "INSERT INTO users (name, email, phone, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
      [name, email, phone, passwordHash, role, JSON.stringify(permissions)],
      (err, row) => {
        if (err) {
          return res.status(400).json({ message: "Email já cadastrado." });
        }
        logAudit({ action: "usuario_criado", details: { id_usuario: row.id, email_usuario: email, mensagem: "Novo usuário cadastrado pelo administrador" }, performedBy: req.user.id });
        return res.status(201).json({ id: row.id });
      }
    );
  }
);

router.put(
  "/api/users/:id",
  authenticateToken,
  requireAdmin,
  [
    body("name").optional().trim().notEmpty().withMessage("Nome inválido."),
    body("email").optional().isEmail().withMessage("Email inválido."),
    body("role").optional().isIn(["operator", "supervisor", "manager", "admin"]).withMessage("Perfil inválido."),
    body("password").optional().isLength({ min: 8 }).withMessage("Senha inválida."),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = Number(req.params.id);
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
      if (err || !user) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const payload = req.body || {};
      const updated = {
        name: payload.name ?? user.name,
        email: payload.email ?? user.email,
        phone: payload.phone ?? user.phone,
        role: payload.role ?? user.role,
        is_active: typeof payload.is_active === "undefined" ? user.is_active : payload.is_active ? 1 : 0,
        password_hash: payload.password ? bcrypt.hashSync(payload.password, 10) : user.password_hash,
        permissions: Array.isArray(payload.permissions) ? JSON.stringify(payload.permissions) : user.permissions,
      };

      db.run(
        "UPDATE users SET name = ?, email = ?, phone = ?, role = ?, is_active = ?, password_hash = ?, permissions = ? WHERE id = ?",
        [
          updated.name,
          updated.email,
          updated.phone,
          updated.role,
          updated.is_active,
          updated.password_hash,
          updated.permissions,
          userId,
        ],
        (updateErr) => {
          if (updateErr) {
            return res.status(500).json({ message: "Erro ao atualizar usuário." });
          }
          logAudit({
            action: "usuario_atualizado",
            details: { id_usuario: userId, email_usuario: updated.email, perfil_usuario: updated.role, mensagem: "Dados cadastrais do usuário atualizados" },
            performedBy: req.user.id,
          });
          return res.json({ id: userId });
        }
      );
    });
  }
);

router.get("/api/sessions", authenticateToken, requireAdmin, (req, res) => {
  const userId = req.query.user_id ? Number(req.query.user_id) : null;
  const sql = userId
    ? "SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC"
    : "SELECT * FROM sessions WHERE revoked_at IS NULL ORDER BY created_at DESC";
  const params = userId ? [userId] : [];
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Erro ao buscar sessões." });
    }
    return res.json(rows);
  });
});

router.delete("/api/sessions/:id", authenticateToken, requireAdmin, (req, res) => {
  const sessionId = Number(req.params.id);
  db.run(
    "UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?",
    [sessionId],
    (err) => {
      if (err) {
        return res.status(500).json({ message: "Erro ao encerrar sessão." });
      }
      return res.json({ status: "ok" });
    }
  );
});

router.get("/api/settings", authenticateToken, requireAdmin, (req, res) => {
  db.all("SELECT key, value FROM settings", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Erro ao buscar configurações." });
    }
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    return res.json(settings);
  });
});

router.put("/api/settings", authenticateToken, requireAdmin, (req, res) => {
  const settings = req.body || {};
  const entries = Object.entries(settings);
  if (!entries.length) {
    return res.status(400).json({ message: "Nenhuma configuração enviada." });
  }
  const promises = entries.map(([key, value]) => new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
      [key, String(value)],
      (err) => { if (err) reject(err); else resolve(); }
    );
  }));
  Promise.all(promises)
    .then(() => res.json({ updated: entries.length }))
    .catch(() => res.status(500).json({ message: "Erro ao salvar configurações." }));
});

router.delete("/api/users/:id", authenticateToken, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "ID do usuário inválido." });
  }

  // Validação: não permitir auto-exclusão
  if (userId === req.user.id) {
    return res.status(403).json({ message: "Não é possível excluir sua própria conta." });
  }

  // Validação: não permitir exclusão do último admin
  db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND id != ?", [userId], (countErr, countRow) => {
    if (countErr) {
      return res.status(500).json({ message: "Erro ao validar administradores." });
    }
    if (countRow.count === 0) {
      return res.status(403).json({ message: "Não é possível excluir o último administrador." });
    }

    runWithTransaction((tx, finish) => {
      // Revogar todas as sessões do usuário
      tx.run("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?", [userId], (revokeErr) => {
        if (revokeErr) {
          finish(revokeErr);
          return;
        }
        // Marcar usuário como inativo (soft delete)
        tx.run("UPDATE users SET is_active = 0 WHERE id = ?", [userId], (deactivateErr) => {
          if (deactivateErr) {
            finish(deactivateErr);
            return;
          }
          finish(null);
        });
      });
    }, (transactionErr) => {
      if (transactionErr) {
        return res.status(500).json({ message: "Erro ao excluir usuário." });
      }
      logAudit({
        action: "usuario_deletado",
        details: { id_usuario: userId, mensagem: "Usuário removido permanentemente do sistema" },
        performedBy: req.user.id
      });
      return res.json({ status: "ok", message: "Usuário excluído com sucesso." });
    });
  });
});

module.exports = {
  router,
  sendAlertNotification,
  ALERT_SLOW_THRESHOLD_MS,
  METRICS_ENABLED,
};
