const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'password',
  database: process.env.PG_DB || 'chatdb',
});

// Create tables on first boot
pool.query(`
  CREATE TABLE IF NOT EXISTS rooms (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    room       VARCHAR(100) NOT NULL,
    username   VARCHAR(100) NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
`).then(() => {
  console.log('PostgreSQL connected. Tables ready.');
}).catch((err) => {
  console.error('PostgreSQL error:', err.message);
});

module.exports = pool;
