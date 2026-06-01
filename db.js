const { Pool: PgPool } = require("pg");

console.log("Ambiente: PostgreSQL (Produção)");

const pool = new PgPool({ 
    connectionString: process.env.DATABASE_URL, 
    max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Tradução de placeholders ? para $1, $2, etc (usado nas rotas existentes)
const formatQuery = (sql) => { 
    let index = 0; 
    return sql.replace(/\?/g, () => `$${(index += 1)}`); 
};

const runQuery = (client, sql, params = [], callback) => {
    client.query(formatQuery(sql), params, (err, result) => { if (callback) callback(err, result); });
};

module.exports = {
    pool,
    run: (sql, params, cb) => runQuery(pool, sql, params, cb),
    get: (sql, params, cb) => runQuery(pool, sql, params, (err, res) => { if(cb) cb(err, res?.rows?.[0]); }),
    all: (sql, params, cb) => runQuery(pool, sql, params, (err, res) => { if(cb) cb(err, res?.rows || []); }),
    exec: (sql, cb) => pool.query(sql, cb),
    withTransaction: (work, callback) => {
        pool.connect((err, client, release) => {
            if (err) return callback(err);
            client.query("BEGIN", (beginErr) => {
                if (beginErr) { release(); return callback(beginErr); }
                const tx = {
                    run: (s, p, cb) => runQuery(client, s, p, cb),
                    get: (s, p, cb) => runQuery(client, s, p, (e, r) => { if(cb) cb(e, r?.rows?.[0]); }),
                    all: (s, p, cb) => runQuery(client, s, p, (e, r) => { if(cb) cb(e, r?.rows || []); }),
                    exec: (s, cb) => client.query(s, cb),
                };
                work(tx, (workErr) => {
                    if (workErr) client.query("ROLLBACK", () => { release(); callback(workErr); });
                    else client.query("COMMIT", (commitErr) => { release(); callback(commitErr || null); });
                });
            });
        });
    }
};
