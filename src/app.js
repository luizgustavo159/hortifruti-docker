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
      const message = res.statusCode >= 500 
        ? "O servidor encontrou um problema interno ao processar sua solicitação" 
        : (isSlow ? "A operação demorou mais tempo que o normal para ser concluída" : "O sistema recusou uma ação por falta de permissão ou dados inválidos");
      
      const context = {
        metodo: req.method,
        pagina: req.path,
        status: res.statusCode,
        duracao: Math.round(durationMs),
        id_requisicao: req.requestId,
        id_usuario: req.user?.id || null,
        mensagem: message
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

      // Registrar no Audit Logs para erros relevantes (4xx e 5xx)
      // Ignorar 401 em rotas de check de auth para evitar poluição (ruído de sistema)
      const isAuthCheck = req.path === "/api/auth/me" || req.path === "/api/auth/check";
      const shouldLog = res.statusCode >= 400 && !(res.statusCode === 401 && isAuthCheck);

      if (shouldLog) {
        db.run(
          "INSERT INTO audit_logs (action, details, performed_by) VALUES (?, ?, ?)",
          [
            res.statusCode >= 500 ? "erro_sistema" : "erro_cliente",
            JSON.stringify({
              ...context,
              id_usuario: req.user?.id || "anonimo",
              erro: res.statusMessage || (res.statusCode === 401 ? "Não Autenticado" : "Não especificado"),
              detalhe: res.statusCode === 401 
                ? `Tentativa de acesso anônimo à página restrita: ${req.path}`
                : `Falha ao tentar acessar a página ${req.path}`
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
app.get("/health", (req, res) => res.redirect("/api/health"));
app.use(express.static(path.join(__dirname, "..", "public")));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", limiter);
app.use(checkBlacklist);
app.use("/api", router);
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
      "excecao_nao_tratada",
      JSON.stringify({
        mensagem: "Ocorreu uma falha grave inesperada no sistema",
        erro_tecnico: err.message,
        pilha_erro: err.stack,
        caminho: req.path,
        metodo: req.method,
        id_requisicao: req.requestId,
        orientacao: "Verifique os logs do servidor para mais detalhes técnicos"
      }),
      req.user?.id || null
    ]
  );

  res.status(500).json({ message: "Erro interno do servidor." });
});

module.exports = { app, db };
