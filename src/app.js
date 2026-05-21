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
const {
  router,
  sendAlertNotification,
  ALERT_SLOW_THRESHOLD_MS,
  METRICS_ENABLED,
} = require("./routes");
const { checkBlacklist } = require("./middleware/tokenManagement");

const app = express();
const requestMetrics = {
  total: 0,
  byRoute: {},
  startedAt: Date.now(),
};

const { LOG_LEVEL, corsOrigin } = config;

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));
const logger = pino({ level: LOG_LEVEL });
app.use(
  pinoHttp({
    logger,
    genReqId: () => crypto.randomUUID(),
  })
);
app.use((req, res, next) => {
  req.requestId = req.id;
  res.setHeader("x-request-id", req.requestId);
  next();
});
app.use((req, res, next) => {
  requestMetrics.total += 1;
  const key = `${req.method} ${req.path}`;
  requestMetrics.byRoute[key] = (requestMetrics.byRoute[key] || 0) + 1;
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (METRICS_ENABLED) {
      db.run(
        "INSERT INTO request_metrics (method, path, status, duration_ms) VALUES (?, ?, ?, ?)",
        [req.method, req.path, res.statusCode, Math.round(durationMs)]
      );
    }
    const isSlow = durationMs > ALERT_SLOW_THRESHOLD_MS;
    const isError = res.statusCode >= 500;
    if (isSlow || isError || (res.statusCode >= 400 && res.statusCode < 500)) {
      const level = res.statusCode >= 500 ? "error" : (isSlow ? "warning" : "info");
      const message = res.statusCode >= 500 ? "Erro de API" : (isSlow ? "Resposta lenta" : "Erro de Cliente");
      const context = {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Math.round(durationMs),
        request_id: req.requestId,
        user_id: req.user?.id || null
      };

      // Registrar Alerta para erros graves ou lentidão
      if (isSlow || isError) {
        db.run(
          "INSERT INTO alerts (level, message, context) VALUES (?, ?, ?)",
          [level, message, JSON.stringify(context)],
          (err) => {
            if (err) {
              logger.error({ err }, "Erro ao registrar alerta.");
              return;
            }
            sendAlertNotification({ level, message, context }).catch((notifyErr) => {
              logger.error({ err: notifyErr }, "Erro ao enviar alerta.");
            });
          }
        );
      }

      // Registrar no Audit Logs para TODOS os erros (4xx e 5xx)
      if (res.statusCode >= 400) {
        db.run(
          "INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)",
          [
            res.statusCode >= 500 ? "system_error" : "client_error",
            JSON.stringify({
              ...context,
              error_message: res.statusMessage || "Error"
            }),
            req.user?.id || null
          ]
        );
      }
    }
  });
  req.requestMetrics = {
    ...requestMetrics,
    uptimeSeconds: Math.floor((Date.now() - requestMetrics.startedAt) / 1000),
  };
  next();
});
app.use(express.static(path.join(__dirname, "..", "public")));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", limiter);
app.use(checkBlacklist);
app.use(router);
app.use("/api", (req, res) => {
  res.status(404).json({ message: "Rota de API não encontrada." });
});
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});
app.use((err, req, res, _next) => {
  logger.error({ err, requestId: req.requestId }, "Erro não tratado.");
  
  // Registrar erro fatal no audit_logs
  db.run(
    "INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)",
    [
      "unhandled_exception",
      JSON.stringify({
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        requestId: req.requestId
      }),
      req.user?.id || null
    ]
  );

  res.status(500).json({ message: "Erro interno do servidor." });
});

module.exports = { app, db };
