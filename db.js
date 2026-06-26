const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const sql = postgres(connectionString, {
  ssl: 'require',
});

module.exports = sql;
module.exports.default = sql;
