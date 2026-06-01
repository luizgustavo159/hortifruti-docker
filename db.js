const fs = require("fs");
const path = require("path");

const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres");

if (!isPostgres) {
    const initSqlJs = require("sql.js");
    const DB_PATH = path.join(__dirname, "data", "database.sqlite");
    if (!fs.existsSync(path.join(__dirname, "data"))) fs.mkdirSync(path.join(__dirname, "data"));

    let dbInstance;
    const init = async () => {
        const SQL = await initSqlJs();
        if (fs.existsSync(DB_PATH)) dbInstance = new SQL.Database(fs.readFileSync(DB_PATH));
        else dbInstance = new SQL.Database();
        console.log("Ambiente: SQLite (Emulação)");
    };
    const ready = init();
    const save = () => fs.writeFileSync(DB_PATH, Buffer.from(dbInstance.export()));
    const pToS = (sql) => sql.replace(/\$\d+/g, "?").replace(/RETURNING\s+(id|\*)/gi, "");

    const pool = {
        query: (sql, params, callback) => {
            ready.then(() => {
                const s = pToS(sql);
                const isInsert = s.trim().toUpperCase().startsWith("INSERT");
                try {
                    if (s.trim().toUpperCase().startsWith("SELECT")) {
                        const stmt = dbInstance.prepare(s);
                        if (params && params.length > 0) stmt.bind(params);
                        const rows = [];
                        while (stmt.step()) rows.push(stmt.getAsObject());
                        stmt.free();
                        if (callback) callback(null, { rows });
                    } else {
                        dbInstance.run(s, params);
                        save();
                        if (isInsert && sql.toUpperCase().includes("RETURNING")) {
                            const res = dbInstance.exec("SELECT last_insert_rowid() as id");
                            const lastId = res[0].values[0][0];
                            if (callback) callback(null, { rows: [{ id: lastId }] });
                        } else {
                            if (callback) callback(null, { rows: [] });
                        }
                    }
                } catch (err) {
                    if (callback) callback(err, { rows: [] });
                }
            });
        }
    };

    module.exports = {
        pool,
        run: (sql, params, cb) => pool.query(sql, params, cb),
        get: (sql, params, cb) => pool.query(sql, params, (err, res) => { if(cb) cb(err, res?.rows?.[0]); }),
        all: (sql, params, cb) => pool.query(sql, params, (err, res) => { if(cb) cb(err, res?.rows || []); }),
        exec: (sql, cb) => ready.then(() => { try { dbInstance.run(sql); save(); if(cb) cb(null); } catch(e) { if(cb) cb(e); } }),
        withTransaction: (work, callback) => {
            ready.then(() => {
                try {
                    dbInstance.run("BEGIN TRANSACTION");
                    const tx = {
                        run: (s, p, cb) => pool.query(s, p, cb),
                        get: (s, p, cb) => pool.query(s, p, (err, res) => { if(cb) cb(err, res?.rows?.[0]); }),
                        all: (s, p, cb) => pool.query(s, p, (err, res) => { if(cb) cb(err, res?.rows || []); }),
                        exec: (s, cb) => { try { dbInstance.run(s); if(cb) cb(null); } catch(e) { if(cb) cb(e); } }
                    };
                    work(tx, (err) => {
                        if (err) {
                            try { dbInstance.run("ROLLBACK"); } catch (e) {}
                            if (callback) callback(err);
                        } else {
                            try {
                                dbInstance.run("COMMIT");
                                save();
                                if (callback) callback(null);
                            } catch (e) {
                                if (callback) callback(e);
                            }
                        }
                    });
                } catch (e) {
                    if (callback) callback(e);
                }
            });
        }
    };
} else {
    const { Pool: PgPool } = require("pg");
    console.log("Ambiente: PostgreSQL (Produção)");
    const pool = new PgPool({ 
        connectionString: process.env.DATABASE_URL, 
        max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });
    const formatQuery = (sql) => { let index = 0; return sql.replace(/\?/g, () => `$${(index += 1)}`); };
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
}
