const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env'), override: true });

const { Pool } = require('pg');

const dbSslEnabled = ['true', '1', 'yes', 'require'].includes(
  String(process.env.DB_SSL || '').toLowerCase()
);

const isPlaceholder = (value) => !value || /^\[.*\]$/.test(value) || /^your[_-]/i.test(value);

if (isPlaceholder(process.env.DATABASE_URL) && isPlaceholder(process.env.DB_PASSWORD)) {
  throw new Error('DATABASE_URL or DB_PASSWORD must be set to your real database credentials in .env');
}

const hasDiscreteDbConfig = process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
    }
  : hasDiscreteDbConfig
  ? {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    }
  : {};

const pool = new Pool({
  ...poolConfig,
  ...(dbSslEnabled ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB error:', err);
});

module.exports = pool;
