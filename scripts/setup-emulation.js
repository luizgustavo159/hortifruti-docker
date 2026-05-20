const db = require("../db");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

async function runMigrations() {
  console.log("Executando migrações no banco de dados...");
  const migrationsDir = path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("Diretório de migrações não encontrado.");
    return;
  }
  
  const files = fs.readdirSync(migrationsDir).sort();
  for (const file of files) {
    if (file.endsWith(".sql")) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      const commands = sql.split(';').map(c => c.trim()).filter(c => c.length > 0);
      
      for (const cmd of commands) {
        try {
          await new Promise((resolve, reject) => {
            db.run(cmd, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        } catch (err) {
          if (!err.message.includes("already exists") && !err.message.includes("já existe")) {
            console.error(`Erro no comando em ${file}:`, err.message);
          }
        }
      }
    }
  }
  console.log("✓ Migrações concluídas.");
}

async function seedTestUsers() {
  console.log("\nPopulando banco de dados com usuários de teste...");
  
  const testUsers = [
    {
      name: "Administrador",
      email: "admin@hortifruti.com",
      password: "admin123456",
      role: "admin",
      permissions: ["admin", "logs", "relatorios", "descontos", "estoque", "caixa"]
    },
    {
      name: "Gerente",
      email: "manager@hortifruti.com",
      password: "manager123456",
      role: "manager",
      permissions: ["relatorios", "descontos", "estoque", "caixa"]
    },
    {
      name: "Supervisor",
      email: "supervisor@hortifruti.com",
      password: "supervisor123456",
      role: "supervisor",
      permissions: ["relatorios", "descontos", "estoque", "caixa", "logs"]
    },
    {
      name: "Operador",
      email: "operator@hortifruti.com",
      password: "operator123456",
      role: "operator",
      permissions: ["caixa", "estoque"]
    }
  ];

  for (const user of testUsers) {
    try {
      const existingUser = await new Promise((resolve) => {
        db.get("SELECT id FROM users WHERE email = ?", [user.email], (err, row) => {
          resolve(row);
        });
      });

      if (existingUser) {
        console.log(`  ⊘ Usuário ${user.email} já existe`);
        continue;
      }

      const passwordHash = bcrypt.hashSync(user.password, 10);
      
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (name, email, password_hash, role, permissions, is_active) VALUES (?, ?, ?, ?, ?, 1)",
          [user.name, user.email, passwordHash, user.role, JSON.stringify(user.permissions)],
          (err) => {
            if (err) {
              reject(err);
            } else {
              console.log(`  ✓ ${user.role.toUpperCase()}: ${user.email}`);
              resolve();
            }
          }
        );
      });
    } catch (err) {
      console.error(`  ✗ Erro ao criar ${user.email}:`, err.message);
    }
  }

  console.log("\n✓ Usuários de teste criados com sucesso!");
}

async function seedProducts() {
  console.log("\nPopulando banco de dados com produtos de teste...");
  
  const products = [
    { name: 'Maçã Fuji', sku: 'SKU001', unit_type: 'kg', price: 5.99, current_stock: 100 },
    { name: 'Banana Nanica', sku: 'SKU002', unit_type: 'kg', price: 3.50, current_stock: 150 },
    { name: 'Tomate Italiano', sku: 'SKU003', unit_type: 'kg', price: 7.20, current_stock: 80 },
    { name: 'Alface Crespa', sku: 'SKU004', unit_type: 'un', price: 2.50, current_stock: 50 }
  ];

  for (const product of products) {
    try {
      const existingProduct = await new Promise((resolve) => {
        db.get("SELECT id FROM products WHERE sku = ?", [product.sku], (err, row) => {
          resolve(row);
        });
      });

      if (existingProduct) {
        console.log(`  ⊘ Produto ${product.sku} já existe`);
        continue;
      }

      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO products (name, sku, unit_type, price, current_stock) VALUES (?, ?, ?, ?, ?)",
          [product.name, product.sku, product.unit_type, product.price, product.current_stock],
          (err) => {
            if (err) {
              reject(err);
            } else {
              console.log(`  ✓ ${product.name}`);
              resolve();
            }
          }
        );
      });
    } catch (err) {
      console.error(`  ✗ Erro ao criar ${product.name}:`, err.message);
    }
  }

  console.log("\n✓ Produtos de teste criados com sucesso!");
}

async function setup() {
  try {
    await runMigrations();
    await seedTestUsers();
    await seedProducts();
    
    console.log("\n" + "═".repeat(60));
    console.log("✓ SETUP DE EMULAÇÃO CONCLUÍDO COM SUCESSO!");
    console.log("═".repeat(60));
    console.log("\nCredenciais de teste:");
    console.log("  Admin:       admin@hortifruti.com / admin123456");
    console.log("  Manager:     manager@hortifruti.com / manager123456");
    console.log("  Supervisor:  supervisor@hortifruti.com / supervisor123456");
    console.log("  Operator:    operator@hortifruti.com / operator123456");
    console.log("═".repeat(60));
    
    process.exit(0);
  } catch (err) {
    console.error("\n✗ Falha no setup:", err);
    process.exit(1);
  }
}

setup();
