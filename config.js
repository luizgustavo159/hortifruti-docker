require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 3000;
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const ADMIN_BOOTSTRAP_TOKEN = process.env.ADMIN_BOOTSTRAP_TOKEN || "";
const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);
const ALERT_SLOW_THRESHOLD_MS = Number(process.env.ALERT_SLOW_THRESHOLD_MS || 2000);
const METRICS_ENABLED = process.env.METRICS_ENABLED === "true";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "1h";
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";
const PASSWORD_RESET_URL = process.env.PASSWORD_RESET_URL || "";
const RESET_EMAIL_FROM = process.env.RESET_EMAIL_FROM || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const RESET_SMS_WEBHOOK_URL = process.env.RESET_SMS_WEBHOOK_URL || "";
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || "";

let JWT_SECRET = process.env.JWT_SECRET || "";
let JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "";

if (!JWT_SECRET) {
  if (NODE_ENV === "development") {
    JWT_SECRET = "dev-access-secret-at-least-32-chars-long";
  } else {
    throw new Error("JWT_SECRET inválido. Configure um segredo forte para produção.");
  }
}

if (!JWT_REFRESH_SECRET) {
  if (NODE_ENV === "development") {
    JWT_REFRESH_SECRET = "dev-refresh-secret-at-least-32-chars-long";
  } else {
    throw new Error("JWT_REFRESH_SECRET inválido. Configure um segredo forte para produção.");
  }
}

if (NODE_ENV !== "development") {
  if (JWT_SECRET.length < 32) throw new Error("JWT_SECRET deve ter ao menos 32 caracteres.");
  if (JWT_REFRESH_SECRET.length < 32) throw new Error("JWT_REFRESH_SECRET deve ter ao menos 32 caracteres.");
}

if (NODE_ENV !== "development" && process.env.CORS_ORIGIN === "*") {
  throw new Error("CORS_ORIGIN não pode ser '*' fora de desenvolvimento.");
}

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (NODE_ENV !== "development" && !allowedOrigins.length) {
  throw new Error("CORS_ORIGIN deve ser configurado fora de desenvolvimento.");
}

const corsOrigin = NODE_ENV === "development" && !allowedOrigins.length ? "*" : allowedOrigins;

module.exports = {
  NODE_ENV,
  PORT,
  LOG_LEVEL,
  ADMIN_BOOTSTRAP_TOKEN,
  PASSWORD_RESET_TTL_MINUTES,
  ALERT_SLOW_THRESHOLD_MS,
  METRICS_ENABLED,
  PASSWORD_RESET_URL,
  RESET_EMAIL_FROM,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  RESET_SMS_WEBHOOK_URL,
  ALERT_WEBHOOK_URL,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRY,
  JWT_REFRESH_EXPIRY,
  corsOrigin,
};
