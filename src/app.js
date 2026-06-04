const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const pino = require("pino");
const pinoHttp = require("pino-http");
const db = require("../db");
const config = require("../config");
const { router } = require("./routes");
const { isTokenBlacklisted } = require("./middleware/tokenManagement");

const app = express();
const { LOG_LEVEL, corsOrigin, METRICS_ENABLED, ALERT_SLOW_THRESHOLD_MS } = config;

app.use(helmet({
  contentSecurityPolicy: false, // Necessário para SPAs com build local
}));
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: LOG_LEVEL,
  transport: {
    targets: [
      {
        target: 'pino/file',
        options: { destination: path.join(__dirname, "..", "logs", "app.log"), mkdir: true },
        level: LOG_LEVEL
      },
      // Em produção, evitamos o pino-pretty para não causar erro se não estiver no bundle
      ...(!isProduction ? [{
        target: 'pino-pretty',
        options: { colorize: true },
        level: LOG_LEVEL
      }] : [])
    ]
  }
});
app.use(pinoHttp({ logger, genReqId: () => crypto.randomUUID() }));

// Health Check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Servir Frontend Estático
app.use(express.static(path.join(__dirname, "..", "public")));

// API Routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // Aumentado para uso profissional
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware global de validação de token (blacklist) para API
app.use("/api", async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    if (await isTokenBlacklisted(token)) {
      return res.status(401).json({ message: "Sessão encerrada ou token inválido." });
    }
  }
  next();
});

app.use("/api", limiter, router);

// Fallback para SPA (Frontend)
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ message: "Rota de API não encontrada." });
  }
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error({ err, requestId: req.id }, "Erro não tratado.");
  res.status(500).json({ message: "Erro interno do servidor." });
});

module.exports = { app, db };
