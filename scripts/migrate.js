const fs = require("fs");
const path = require("path");
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
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [file]
    );
    if (rows.length) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    
    await new Promise((resolve, reject) => {
      db.withTransaction((tx, done) => {
        // No PostgreSQL, o exec do pg-pool não é o mesmo que o exec do sqlite3.
        // O db.js já mapeia exec para pool.query ou client.query.
        tx.exec(sql, (err) => {
          if (err) return done(err);
          // O db.js já mapeia run para formatQuery que converte ? em $n
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
};

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("Migrations applied successfully.");
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Migration failed:", error);
    process.exitCode = 1;
  });
