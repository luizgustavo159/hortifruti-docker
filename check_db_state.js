const db = require("./db");
const bcrypt = require("bcryptjs");

async function check() {
    console.log("Verificando usuários no banco...");
    db.all("SELECT id, name, email, role, is_active, password_hash FROM users", [], (err, rows) => {
        if (err) {
            console.error("Erro ao listar usuários:", err);
            return;
        }
        console.log("Usuários encontrados:", rows.length);
        rows.forEach(u => {
            const isMatch = bcrypt.compareSync("admin123456", u.password_hash);
            console.log(`- ${u.name} (${u.email}) [Role: ${u.role}] [Ativo: ${u.is_active}] [Senha 'admin123456' bate: ${isMatch}]`);
        });
        process.exit(0);
    });
}

check();
