const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("../db");
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.pool.query(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
};

const run = async () => {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [file]
    );
    if (rows.length) {
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    
    await new Promise((resolve, reject) => {
      db.withTransaction((tx, done) => {
        tx.exec(sql, (err) => {
          if (err) return done(err);
          tx.run("INSERT INTO schema_migrations (filename) VALUES (?)", [file], (insertErr) => {
            done(insertErr);
          });
        });
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // --- Criação Automática do Administrador Padrão (Fábrica) ---
  try {
    const { rows } = await query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (rows.length === 0) {
      console.log("Nenhum administrador encontrado. Criando usuário mestre de fábrica...");
      
      const defaultName = "Administrador Sistema";
      const defaultEmail = "admin@greenstore.com";
      const defaultPass = "admin123456"; // Senha padrão de fábrica
      const passwordHash = bcrypt.hashSync(defaultPass, 10);
      const permissions = JSON.stringify(["admin", "logs", "relatorios", "descontos", "estoque", "caixa"]);

      await query(
        "INSERT INTO users (name, email, password_hash, role, permissions) VALUES ($1, $2, $3, $4, $5)",
        [defaultName, defaultEmail, passwordHash, "admin", permissions]
      );
      
      console.log("--------------------------------------------------");
      console.log("USUÁRIO MESTRE CRIADO COM SUCESSO!");
      console.log(`Email: ${defaultEmail}`);
      console.log(`Senha: ${defaultPass}`);
      console.log("IMPORTANTE: Altere esta senha no primeiro acesso.");
      console.log("--------------------------------------------------");
    } else {
      console.log("Administrador já existe. Pulando criação de fábrica.");
    }
  } catch (adminErr) {
    console.error("Erro ao verificar/criar administrador de fábrica:", adminErr);
  }
};

run()
  .then(() => {
    console.log("Migrations applied successfully.");
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  });
