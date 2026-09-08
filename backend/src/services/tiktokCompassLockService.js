const { AsyncLocalStorage } = require('node:async_hooks');
const { Pool } = require('pg');

const contexts = new AsyncLocalStorage();
const pools = new WeakMap();

const withCompassLock = async (db, key, namespace, operation) => {
  const inherited = contexts.getStore();
  let pool = pools.get(db);
  if (!pool) {
    // Keep lock connections separate from Sequelize's pool: a request may need
    // a normal model query/token refresh while it holds its advisory lock.
    pool = new Pool({
      ...db.config, user: db.config.username,
      ssl: db.options?.dialectOptions?.ssl,
      max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    pool.on('error', (error) => console.error('[Compass] Lock connection failed', error.message));
    pools.set(db, pool);
  }
  const reuse = inherited?.db === db;
  const client = reuse ? inherited.client : await pool.connect();
  let locked = false;
  let broken = false;
  try {
    const result = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, $2)) AS locked', [key, namespace]);
    locked = result.rows[0]?.locked;
    if (!locked) return { busy: true };
    const lockedDb = {
      async query(sql, { replacements = {} } = {}) {
        const values = [];
        // Only internal Compass SQL uses this adapter; values remain pg binds.
        const bound = sql.replace(/(?<!:):([a-zA-Z_][a-zA-Z_0-9]*)/g, (_match, name) => {
          if (!Object.hasOwn(replacements, name)) throw new Error(`Missing SQL parameter: ${name}`);
          values.push(replacements[name]);
          return `$${values.length}`;
        });
        const response = await client.query(bound, values);
        return [response.rows, response];
      },
    };
    return await contexts.run({ db, client }, () => operation(lockedDb));
  } finally {
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1, $2))', [key, namespace]); }
      catch { broken = true; }
    }
    if (!reuse) client.release(broken);
  }
};

const closeCompassLockPool = async (db) => {
  const pool = pools.get(db);
  pools.delete(db);
  if (pool) await pool.end();
};

module.exports = { withCompassLock, closeCompassLockPool };
