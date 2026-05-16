const { Pool: PgPool } = require("pg");
const { newDb } = require("pg-mem");

const DATABASE_URL = process.env.DATABASE_URL || "";
const NODE_ENV = process.env.NODE_ENV || "development";

const useInMemoryDb = true; // Forçado para emulação rápida

if (!DATABASE_URL && NODE_ENV !== "development" && !useInMemoryDb) {
  throw new Error("DATABASE_URL não configurado. Defina a conexão com PostgreSQL.");
}

const buildPool = () => {
  if (useInMemoryDb) {
    const memoryDb = newDb({
      autoCreateForeignKeyIndices: true,
    });
    const { Pool: MemoryPool } = memoryDb.adapters.createPg();
    return new MemoryPool();
  }
  return new PgPool({
    connectionString: DATABASE_URL || "postgres://localhost:5432/greenstore",
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS || 10000),
    connectionTimeoutMillis: Number(process.env.DB_POOL_CONN_TIMEOUT_MS || 2000),
    ssl:
      process.env.DB_SSL === "true"
        ? {
            rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
          }
        : undefined,
  });
};

const pool = buildPool();
global.dbPool = pool;

const formatQuery = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${(index += 1)}`);
};

const normalizeArgs = (params, callback) => {
  if (typeof params === "function") {
    return { params: [], callback: params };
  }
  return { params: params || [], callback };
};

const runQuery = (client, sql, params = [], callback) => {
  const statement = formatQuery(sql);
  client.query(statement, params, (err, result) => {
    if (callback) {
      callback(err, result);
    }
  });
};

const run = (sql, params, callback) => {
  const normalized = normalizeArgs(params, callback);
  return runQuery(pool, sql, normalized.params, normalized.callback);
};

const get = (sql, params, callback) => {
  const normalized = normalizeArgs(params, callback);
  return runQuery(pool, sql, normalized.params, (err, result) => {
    if (callback) {
      callback(err, result?.rows?.[0]);
    }
  });
};

const all = (sql, params, callback) => {
  const normalized = normalizeArgs(params, callback);
  runQuery(pool, sql, normalized.params, (err, result) => {
    if (callback) {
      callback(err, result?.rows || []);
    }
  });
};

const exec = (sql, callback) => {
  pool.query(sql, (err) => {
    if (callback) {
      callback(err);
    }
  });
};

const close = (callback) => {
  pool.end((err) => {
    if (callback) {
      callback(err);
    }
  });
};

const withTransaction = (work, callback) => {
  pool.connect((err, client, release) => {
    if (err) {
      callback(err);
      return;
    }
    client.query("BEGIN", (beginErr) => {
      if (beginErr) {
        release();
        callback(beginErr);
        return;
      }
      const tx = {
        run: (sql, params, cb) => {
          const normalized = normalizeArgs(params, cb);
          runQuery(client, sql, normalized.params, normalized.callback);
        },
        get: (sql, params, cb) => {
          const normalized = normalizeArgs(params, cb);
          runQuery(client, sql, normalized.params, (queryErr, result) => {
            if (cb) {
              cb(queryErr, result?.rows?.[0]);
            }
          });
        },
        all: (sql, params, cb) => {
          const normalized = normalizeArgs(params, cb);
          runQuery(client, sql, normalized.params, (queryErr, result) => {
            if (cb) {
              cb(queryErr, result?.rows || []);
            }
          });
        },
        exec: (sql, cb) => {
          client.query(sql, (queryErr) => {
            if (cb) {
              cb(queryErr);
            }
          });
        },
      };
      work(tx, (workErr) => {
        if (workErr) {
          client.query("ROLLBACK", () => {
            release();
            callback(workErr);
          });
          return;
        }
        client.query("COMMIT", (commitErr) => {
          release();
          callback(commitErr || null);
        });
      });
    });
  });
};

module.exports = {
  pool,
  run,
  get,
  all,
  exec,
  close,
  withTransaction,
};
