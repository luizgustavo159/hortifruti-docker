const fs = require("fs");
const path = require("path");
const db = require("./db");
const bcrypt = require("bcryptjs");

async function runMigrations() {
  console.log("Iniciando migrações no SQLite...");
  const MIGRATIONS_DIR = path.join(__dirname, "migrations");
  
  const sql0 = `CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`;
  
  await new Promise((resolve, reject) => {
    db.exec(sql0, (err) => err ? reject(err) : resolve());
  });

  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
  for (const file of files) {
    const { filename } = await new Promise((resolve) => {
      db.get("SELECT filename FROM schema_migrations WHERE filename = ?", [file], (err, row) => resolve(row || {}));
    });
    
    if (filename) continue;

    console.log(`Aplicando migração: ${file}`);
    let sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    
    // Conversões básicas
    sql = sql.replace(/SERIAL PRIMARY KEY/g, "INTEGER PRIMARY KEY AUTOINCREMENT");
    sql = sql.replace(/TIMESTAMPTZ/g, "DATETIME");
    sql = sql.replace(/NUMERIC\(12,2\)/g, "DECIMAL(12,2)");
    sql = sql.replace(/RETURNING id/g, "");
    sql = sql.replace(/::date/g, "");
    sql = sql.replace(/NOW\(\)/g, "CURRENT_TIMESTAMP");
    sql = sql.replace(/INTERVAL '24 hours'/g, "1");

    // Dividir por ponto e vírgula e executar um por um para ignorar erros
    const commands = sql.split(";").map(c => c.trim()).filter(c => c.length > 0);
    for (const cmd of commands) {
        await new Promise((resolve) => {
            db.exec(cmd, (err) => {
                if (err) console.warn(`Aviso em ${file} comando [${cmd.substring(0, 30)}...]:`, err.message);
                resolve();
            });
        });
    }

    await new Promise((resolve) => {
        db.run("INSERT INTO schema_migrations (filename) VALUES (?)", [file], () => resolve());
    });
  }
  console.log("Migrações concluídas.");
}

async function seedData() {
  const passwordHash = bcrypt.hashSync("admin123456", 10);
  await new Promise((resolve) => {
    db.get("SELECT id FROM users WHERE email = ?", ["admin@hortifruti.com"], (err, row) => {
        if (row) return resolve();
        db.run(
            "INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)",
            ["Administrador", "admin@hortifruti.com", passwordHash, "admin"],
            () => resolve()
        );
    });
  });
  console.log("Seed concluído.");
}

async function start() {
  try {
    await runMigrations();
    await seedData();
    console.log("Iniciando o servidor Express...");
    process.env.PORT = 3000;
    require("./server");
  } catch (err) {
    console.error("Falha fatal:", err);
  }
}

start();
