const db = require("../db");
const bcrypt = require("bcryptjs");

async function seedTestUsers() {
  console.log("Iniciando seed de usuários de teste...");
  
  // Usuários de teste para cada perfil
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
      // Verificar se o usuário já existe
      const existingUser = await new Promise((resolve) => {
        db.get("SELECT id FROM users WHERE email = ?", [user.email], (err, row) => {
          resolve(row);
        });
      });

      if (existingUser) {
        console.log(`Usuário ${user.email} já existe, pulando...`);
        continue;
      }

      // Criar o usuário
      const passwordHash = bcrypt.hashSync(user.password, 10);
      
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (name, email, password_hash, role, permissions, is_active) VALUES (?, ?, ?, ?, ?, 1)",
          [user.name, user.email, passwordHash, user.role, JSON.stringify(user.permissions)],
          (err) => {
            if (err) {
              console.error(`Erro ao criar usuário ${user.email}:`, err);
              reject(err);
            } else {
              console.log(`✓ Usuário ${user.role} criado: ${user.email} / ${user.password}`);
              resolve();
            }
          }
        );
      });
    } catch (err) {
      console.error(`Falha ao criar usuário ${user.email}:`, err);
    }
  }

  console.log("\nSeed de usuários de teste finalizado com sucesso!");
  console.log("\nCredenciais de teste:");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Admin:       admin@hortifruti.com / admin123456");
  console.log("Manager:     manager@hortifruti.com / manager123456");
  console.log("Supervisor:  supervisor@hortifruti.com / supervisor123456");
  console.log("Operator:    operator@hortifruti.com / operator123456");
  console.log("═══════════════════════════════════════════════════════════");
}

seedTestUsers()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
