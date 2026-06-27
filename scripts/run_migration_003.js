const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '003_profile_resume_reviews.sql'), 'utf8');
  await db.query(sql);
  console.log('Migration 003 applied successfully');
}

main()
  .catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
