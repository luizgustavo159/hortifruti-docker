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

const createAuditLog = (action, details, performed_by, type = 'info', level = 'low') => {
  db.run("INSERT INTO audit_logs (action, details, performed_by, type, level) VALUES (?, ?, ?, ?, ?)",
    [action, JSON.stringify(details), performed_by, type, level], (err) => {
      if (err) console.error("Erro ao gravar log de auditoria:", err);
    });
};

const router = express.Router();
const { JWT_SECRET } = config;

/**
 * @route POST /api/auth/login
 * @desc Autenticar usuário e retornar tokens
 */
router.post("/login", validate(loginSchema), async (req, res) => {
  const { email: identifier, password } = req.validated;

  try {
    // Busca flexível: por e-mail completo OU por prefixo (antes do @)
    const query = identifier.includes('@') 
      ? "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL"
      : "SELECT * FROM users WHERE email LIKE ? AND deleted_at IS NULL";
    const params = identifier.includes('@') ? [identifier] : [`${identifier}@%`];

    db.get(query, params, async (err, user) => {
      if (err) {
        console.error("Erro ao buscar usuário:", err);
        createAuditLog("ERRO_LOGIN_DB", { error: err.message, identifier }, null, 'error', 'high');
        return res.status(500).json({ message: "Erro interno do servidor." });
      }

      if (!user) {
        createAuditLog("LOGIN_FALHA_USUARIO_INEXISTENTE", { identifier }, null, 'warning', 'medium');
        return res.status(401).json({ message: "Credenciais inválidas." });
      }

      // Verificar se o usuário está em penalidade de tempo (trava progressiva)
      if (user.locked_at) {
        const lockedAt = new Date(user.locked_at).getTime();
        const now = new Date().getTime();
        const attempts = user.login_attempts_count || 0;
        
        // Cálculo da penalidade: a cada 3 erros, dobra o tempo (30s, 60s, 120s...)
        // 3-5 erros: 30s | 6-8 erros: 60s | 9-11 erros: 120s | 12+ erros: 240s...
        const penaltyLevel = Math.floor(attempts / 3);
        if (penaltyLevel > 0) {
          const waitSeconds = 30 * Math.pow(2, penaltyLevel - 1);
          const waitMillis = waitSeconds * 1000;
          
          if (now < lockedAt + waitMillis) {
            const remainingSeconds = Math.ceil((lockedAt + waitMillis - now) / 1000);
            return res.status(429).json({ 
              message: `Muitas tentativas. Tente novamente em ${remainingSeconds} segundos.`,
              remainingSeconds,
              locked: true
            });
          }
        }
      }

      // Verificar se o usuário comum está bloqueado permanentemente
      if (!user.is_active && user.role !== 'admin') {
        return res.status(403).json({ 
          message: "Usuário bloqueado. Procure o administrador para redefinir sua senha.",
          blocked: true 
        });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      
      if (!isMatch) {
        const newCount = (user.login_attempts_count || 0) + 1;
        
        // Atualizar contagem e data do último erro para cálculo da penalidade
        db.run("UPDATE users SET login_attempts_count = ?, locked_at = CURRENT_TIMESTAMP WHERE id = ?", [newCount, user.id]);
        
        db.run("INSERT INTO login_attempts (email, ip) VALUES (?, ?)", [user.email, req.ip]);
        createAuditLog("LOGIN_FALHA_SENHA_INCORRETA", { email: user.email, attempts: newCount }, user.id, 'warning', 'medium');

        // Bloqueio permanente apenas para NÃO-ADMINS
        if (newCount >= 10 && user.role !== 'admin') {
          db.run("UPDATE users SET is_active = FALSE WHERE id = ?", [user.id]);
          createAuditLog("USUARIO_BLOQUEADO_FORCA_BRUTA", { email: user.email }, user.id, 'security', 'high');
          return res.status(403).json({ 
            message: "Muitas tentativas falhas. Usuário bloqueado.",
            attempts: newCount,
            blocked: true
          });
        }

        // Retornar penalidade se atingiu múltiplo de 3
        if (newCount >= 3) {
          const penaltyLevel = Math.floor(newCount / 3);
          const waitSeconds = 30 * Math.pow(2, penaltyLevel - 1);
          return res.status(429).json({ 
            message: `Credenciais inválidas. Aguarde ${waitSeconds} segundos para tentar novamente.`,
            attempts: newCount,
            remainingSeconds: waitSeconds,
            locked: true
          });
        }

        return res.status(401).json({ 
          message: "Credenciais inválidas.",
          attempts: newCount 
        });
      }

      // Login sucesso: resetar contagem de falhas
      db.run("UPDATE users SET login_attempts_count = 0, locked_at = NULL WHERE id = ?", [user.id]);

      const accessToken = generateAccessToken(user.id, user.email, user.role);
      const refreshToken = generateRefreshToken(user.id, user.email, user.role);

      db.run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [user.id, accessToken]);

      const { password_hash, login_attempts_count, locked_at, ...userWithoutSensitiveData } = user;

      res.json({
        accessToken,
        refreshToken,
        user: userWithoutSensitiveData
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
    
    db.get("SELECT * FROM users WHERE id = ? AND is_active = TRUE AND deleted_at IS NULL", [decoded.id], (err, user) => {
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
