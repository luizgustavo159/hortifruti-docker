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

const roleLevels = { operator: 1, supervisor: 2, manager: 3, admin: 4 };
const hasRole = (user, role) => (roleLevels[user?.role] || 0) >= roleLevels[role];
const requireRole = (role) => (req, res, next) => hasRole(req.user, role) ? next() : res.status(403).json({ message: "Acesso não autorizado." });

const requireAdmin = requireRole("admin");
const requireSupervisor = requireRole("supervisor");

const parseDateRange = (req) => {
  const { start, end } = req.query;
  return { 
    start: start ? new Date(start).toISOString().split('T')[0] : null, 
    end: end ? new Date(end).toISOString().split('T')[0] : null 
  };
};

const buildDateFilter = (field, range) => {
  const conditions = [];
  const params = [];
  if (range.start) { conditions.push(`${field} >= ?`); params.push(range.start); }
  if (range.end) { conditions.push(`${field} <= ?`); params.push(range.end); }
  return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
};

// --- ROTAS DE AUTENTICAÇÃO ---

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (err || !user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }
    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id, user.email, user.role);
    db.run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [user.id, accessToken], () => {
      res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken, refreshToken });
    });
  });
});

router.get("/auth/me", authenticateToken, (req, res) => {
  db.get("SELECT id, name, email, role FROM users WHERE id = ?", [req.user.id], (err, user) => {
    res.json(user);
  });
});

router.post("/auth/refresh", refreshTokenMiddleware);
router.post("/auth/logout", logoutMiddleware);

// --- ROTAS DE RELATÓRIOS (DASHBOARD) ---

router.get("/reports/summary", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req);
  const filter = buildDateFilter("created_at", range);
  
  const sql = `
    SELECT 
      COALESCE(SUM(final_total), 0) as total_sales,
      0 as total_losses,
      COALESCE(SUM(final_total * 0.3), 0) as estimated_profit
    FROM sales ${filter.clause}
  `;
  
  db.get(sql, filter.params, (err, row) => {
    if (err) return res.status(500).json({ message: err.message });
    
    db.all("SELECT id, name, current_stock, min_stock FROM products WHERE current_stock <= min_stock", [], (err2, lowStock) => {
      res.json({ ...row, low_stock: lowStock || [] });
    });
  });
});

router.get("/reports/by-operator", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req);
  const filter = buildDateFilter("s.created_at", range);
  const sql = `
    SELECT u.name, SUM(s.final_total) as total_sales, COUNT(s.id) as total_items
    FROM sales s
    JOIN users u ON s.sold_by = u.id
    ${filter.clause}
    GROUP BY u.id, u.name
  `;
  db.all(sql, filter.params, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

router.get("/reports/by-category", authenticateToken, requireSupervisor, (req, res) => {
  const range = parseDateRange(req);
  const filter = buildDateFilter("s.created_at", range);
  const sql = `
    SELECT c.name as category, SUM(s.final_total) as total_sales, COUNT(s.id) as total_items
    FROM sales s
    JOIN products p ON s.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    ${filter.clause}
    GROUP BY c.id, c.name
  `;
  db.all(sql, filter.params, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(rows);
  });
});

// --- OUTRAS ROTAS ---

router.get("/health", (req, res) => res.json({ status: "ok" }));

router.get("/products", authenticateToken, (req, res) => {
  db.all("SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id", [], (err, rows) => {
    res.json(rows);
  });
});

router.get("/categories", authenticateToken, (req, res) => {
  db.all("SELECT * FROM categories", [], (err, rows) => res.json(rows));
});

router.get("/cash/sessions", authenticateToken, (req, res) => {
  db.all("SELECT s.*, u.name as operator_name FROM cash_sessions s JOIN users u ON s.operator_id = u.id ORDER BY opened_at DESC", [], (err, rows) => res.json(rows));
});

module.exports = { router, ALERT_SLOW_THRESHOLD_MS, METRICS_ENABLED };
