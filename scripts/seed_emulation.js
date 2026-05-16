const fs = require("fs");
const path = require("path");
const db = require("../db");
const bcrypt = require("bcryptjs");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

const run = async () => {
  console.log("Iniciando banco de dados em memória...");

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    console.log(`Aplicando migração: ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    await new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          console.error(`Erro na migração ${file}:`, err);
          reject(err);
        } else resolve();
      });
    });
  }

  console.log("Criando usuário administrador padrão...");
  const adminPass = "admin123";
  const hash = bcrypt.hashSync(adminPass, 10);
  
  await new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5)",
      ["Administrador", "admin@hortifruti.com", hash, "admin", 1],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  console.log("Inserindo dados de teste...");
  // Categorias
  await new Promise(r => db.run("INSERT INTO categories (name) VALUES ('Frutas'), ('Legumes'), ('Verduras')", [], r));
  
  // Produtos
  await new Promise(r => db.run(
    "INSERT INTO products (name, sku, unit_type, current_stock, min_stock, price, category_id) VALUES " +
    "('Maçã Fuji', 'MAC001', 'kg', 50, 10, 8.50, 1), " +
    "('Banana Prata', 'BAN002', 'un', 100, 20, 0.50, 1), " +
    "('Tomate Italiano', 'TOM003', 'kg', 5, 15, 6.90, 2)", 
    [], r
  ));

  console.log("Banco de dados pronto para emulação!");
  console.log("Usuário: admin@hortifruti.com");
  console.log("Senha: admin123");
};

run().catch(err => {
  console.error("Erro no seed:", err);
  process.exit(1);
});
