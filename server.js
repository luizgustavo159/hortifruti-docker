const { app, db } = require("./src/app");
const config = require("./config");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const { PORT, NODE_ENV } = config;

async function runMigrations(targetDb) {
  console.log("Executando migrações no banco de dados...");
  const migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("Diretório de migrações não encontrado.");
    return;
  }
  
  const files = fs.readdirSync(migrationsDir).sort();
  for (const file of files) {
    if (file.endsWith(".sql")) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      // Separar por ponto e vírgula, cuidando para não quebrar strings complexas
      const commands = sql.split(';').map(c => c.trim()).filter(c => c.length > 0);
      
      for (const cmd of commands) {
        try {
          await new Promise((resolve, reject) => {
            targetDb.query(cmd, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
    } catch (err) {
      // Ignorar erros de "já existe" para tabelas/índices
      if (!err.message.includes("already exists") && !err.message.includes("já existe")) {
        console.error(`Erro no comando em ${file}:`, err.message);
        db.run("INSERT INTO audit_logs (action, details) VALUES (?, ?)", [
          "erro_migracao",
          JSON.stringify({ 
            mensagem: "Falha ao atualizar a estrutura do banco de dados",
            arquivo_falha: file, 
            erro_detalhado: err.message,
            orientacao: "Verifique se o arquivo SQL está correto e se o banco de dados está acessível"
          })
        ]);
      }
    }
      }
    }
  }
  console.log("Migrações concluídas.");
}

async function seedInMemoryDb() {
  console.log("Populando banco de dados com dados iniciais...");
  const passwordHash = bcrypt.hashSync("admin123456", 10);
  const targetDb = global.dbPool || db;

  try {
    // Verificar se já existe admin
    const adminExists = await new Promise((resolve) => {
      targetDb.query("SELECT id FROM users WHERE email = $1", ["admin@admin.com"], (err, res) => {
        resolve(res && res.rows && res.rows.length > 0);
      });
    });

    if (!adminExists) {
      await new Promise((resolve, reject) => {
        const sql = "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)";
        targetDb.query(sql, ["Administrador", "admin@admin.com", passwordHash, "admin"], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Seed de produtos se estiver vazio
    const productCount = await new Promise((resolve) => {
      targetDb.query("SELECT count(*) FROM products", (err, res) => {
        resolve(res ? parseInt(res.rows[0].count) : 0);
      });
    });

    // Seed de usuários de teste
    const testUsers = [
      { name: 'Gerente', email: 'manager@hortifruti.com', password: 'manager123456', role: 'manager' },
      { name: 'Supervisor', email: 'supervisor@hortifruti.com', password: 'supervisor123456', role: 'supervisor' },
      { name: 'Operador', email: 'operator@hortifruti.com', password: 'operator123456', role: 'operator' }
    ];

    for (const user of testUsers) {
      const userExists = await new Promise((resolve) => {
        targetDb.query("SELECT id FROM users WHERE email = $1", [user.email], (err, res) => {
          resolve(res && res.rows && res.rows.length > 0);
        });
      });

      if (!userExists) {
        const userPasswordHash = bcrypt.hashSync(user.password, 10);
        await new Promise((resolve, reject) => {
          const sql = "INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, 1)";
          targetDb.query(sql, [user.name, user.email, userPasswordHash, user.role], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }

    if (productCount === 0) {
      const products = [
        ['Maçã Fuji', 'SKU001', 'kg', 5.99, 100],
        ['Banana Nanica', 'SKU002', 'kg', 3.50, 150],
        ['Tomate Italiano', 'SKU003', 'kg', 7.20, 80],
        ['Alface Crespa', 'SKU004', 'un', 2.50, 50]
      ];
      for (const p of products) {
        await new Promise((resolve, reject) => {
          const sql = "INSERT INTO products (name, sku, unit_type, price, current_stock) VALUES ($1, $2, $3, $4, $5)";
          targetDb.query(sql, p, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }
    console.log("Banco de dados populado com sucesso.");
  } catch (err) {
    console.error("Erro no seed:", err.message);
    db.run("INSERT INTO audit_logs (action, details) VALUES (?, ?)", [
      "erro_seed",
      JSON.stringify({ 
        mensagem: "Falha ao inserir dados iniciais no sistema",
        erro_detalhado: err.message,
        orientacao: "Isso pode ocorrer se os dados já existirem ou se houver erro de conexão"
      })
    ]);
  }
}

if (require.main === module) {
  const targetDb = global.dbPool || db;
  runMigrations(targetDb)
    .then(() => seedInMemoryDb())
    .then(() => {
      app.listen(PORT, () => {
        console.log(`GreenStore API rodando na porta ${PORT}`);
      });
    })
    .catch(err => {
      console.error("Erro fatal na inicialização:", err);
      db.run("INSERT INTO audit_logs (action, details) VALUES (?, ?)", [
        "erro_fatal_inicializacao",
        JSON.stringify({ 
          mensagem: "O sistema não pôde ser iniciado devido a um erro crítico",
          erro_tecnico: err.message, 
          pilha_erro: err.stack,
          orientacao: "Verifique as configurações de ambiente (.env) e a conexão com o banco de dados"
        })
      ], () => {
        process.exit(1);
      });
    });
}

module.exports = { app, db };
