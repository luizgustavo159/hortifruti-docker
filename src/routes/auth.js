const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../../db");
const config = require("../../config");
const { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  addToBlacklist
} = require("../middleware/tokenManagement");
const { loginSchema, validate } = require("../validators/schemas");

const router = express.Router();
const { JWT_SECRET } = config;

/**
 * @route POST /api/auth/login
 * @desc Autenticar usuário e retornar tokens
 */
router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.validated;

  try {
    db.get("SELECT * FROM users WHERE email = ? AND is_active = 1", [email], async (err, user) => {
      if (err) {
        console.error("Erro ao buscar usuário:", err);
        return res.status(500).json({ message: "Erro interno do servidor." });
      }

      if (!user) {
        return res.status(401).json({ message: "Credenciais inválidas." });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        // Registrar tentativa falha (opcional, para segurança futura)
        db.run("INSERT INTO login_attempts (email, ip) VALUES (?, ?)", [email, req.ip]);
        return res.status(401).json({ message: "Credenciais inválidas." });
      }

      const accessToken = generateAccessToken(user.id, user.email, user.role);
      const refreshToken = generateRefreshToken(user.id, user.email, user.role);

      // Salvar sessão no banco
      db.run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [user.id, accessToken]);

      // Remover hash da senha antes de enviar
      const { password_hash, ...userWithoutPassword } = user;

      res.json({
        accessToken,
        refreshToken,
        user: userWithoutPassword
      });
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc Renovar access token usando refresh token
 */
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token é obrigatório." });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    
    db.get("SELECT * FROM users WHERE id = ? AND is_active = 1", [decoded.id], (err, user) => {
      if (err || !user) {
        return res.status(401).json({ message: "Usuário inválido ou inativo." });
      }

      const newAccessToken = generateAccessToken(user.id, user.email, user.role);
      const newRefreshToken = generateRefreshToken(user.id, user.email, user.role);

      // Salvar nova sessão
      db.run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [user.id, newAccessToken]);

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      });
    });
  } catch (error) {
    res.status(401).json({ message: "Refresh token inválido ou expirado." });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Retornar dados do usuário autenticado
 */
router.get("/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Não autorizado." });

  const token = authHeader.replace("Bearer ", "");
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Token inválido." });

    db.get("SELECT id, name, email, role, permissions FROM users WHERE id = ?", [decoded.id], (err, user) => {
      if (err || !user) return res.status(404).json({ message: "Usuário não encontrado." });
      res.json(user);
    });
  });
});

/**
 * @route POST /api/auth/logout
 * @desc Encerrar sessão e invalidar token
 */
router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    await addToBlacklist(token);
    db.run("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token = ?", [token]);
  }
  res.json({ message: "Logout realizado com sucesso." });
});

module.exports = router;
