const jwt = require("jsonwebtoken");
const { client, connectRedis } = require("../services/redis");

/**
 * Adicionar token à blacklist (logout)
 */
const addToBlacklist = async (token) => {
  try {
    await connectRedis();
    if (!client.isOpen) return; // Pular se Redis não estiver disponível
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      const expiryTime = decoded.exp - Math.floor(Date.now() / 1000);
      if (expiryTime > 0) {
        // Armazenar no Redis com TTL baseado na expiração do token
        await client.set(`blacklist:${token}`, '1', {
          EX: expiryTime
        });
      }
    }
  } catch (err) {
    console.error("Erro ao adicionar token à blacklist no Redis:", err);
  }
};

/**
 * Verificar se token está na blacklist
 */
const isTokenBlacklisted = async (token) => {
  try {
    await connectRedis();
    if (!client.isOpen) return false; // Pular se Redis não estiver disponível
    const result = await client.get(`blacklist:${token}`);
    return result === '1';
  } catch (err) {
    console.error("Erro ao verificar blacklist no Redis:", err);
    return false;
  }
};

/**
 * Middleware para verificar blacklist
 */
const checkBlacklist = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (token && await isTokenBlacklisted(token)) {
    return res.status(401).json({
      message: 'Sessão encerrada. Por favor, faça login novamente.',
    });
  }
  
  next();
};

/**
 * Gerar refresh token
 */
const generateRefreshToken = (userId, email, role) => {
  return jwt.sign(
    { id: userId, email, role, type: "refresh" },
    process.env.JWT_REFRESH_SECRET || "refresh-secret",
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d" }
  );
};

/**
 * Gerar access token
 */
const generateAccessToken = (userId, email, role) => {
  return jwt.sign(
    { id: userId, email, role, type: "access" },
    process.env.JWT_SECRET || "secret",
    { expiresIn: process.env.JWT_EXPIRY || "1h" }
  );
};

/**
 * Verificar e renovar refresh token
 */
const verifyRefreshToken = (refreshToken) => {
  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'refresh-secret'
    );
    
    if (decoded.type !== 'refresh') {
      throw new Error('Tipo de token inválido');
    }
    
    return decoded;
  } catch (error) {
    throw new Error('Refresh token inválido ou expirado');
  }
};

/**
 * Middleware para renovar token automaticamente
 */
const refreshTokenMiddleware = async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token é obrigatório' });
  }
  
  try {
    const decoded = verifyRefreshToken(refreshToken);
    
    const newAccessToken = generateAccessToken(decoded.id, decoded.email, decoded.role);
    const newRefreshToken = generateRefreshToken(decoded.id, decoded.email, decoded.role);
    
    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

/**
 * Logout - adicionar token à blacklist
 */
const logoutMiddleware = async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const db = require("../../db");

  if (token) {
    await addToBlacklist(token);
    // Revogar no banco de dados para garantir persistência e compatibilidade com testes
    db.run("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token = ?", [token]);
  }

  res.json({ message: "Logout realizado com sucesso" });
};

module.exports = {
  addToBlacklist,
  isTokenBlacklisted,
  checkBlacklist,
  generateRefreshToken,
  generateAccessToken,
  verifyRefreshToken,
  refreshTokenMiddleware,
  logoutMiddleware,
};
