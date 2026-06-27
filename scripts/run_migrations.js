const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

const defaultMigrationFiles = [
  '001_init.sql',
  '002_full_schema.sql',
  '003_add_payu_gateway.sql'
];

const migrationFiles = process.argv.slice(2);
const filesToRun = migrationFiles.length ? migrationFiles : defaultMigrationFiles;

async function run() {
  for (const file of filesToRun) {
    const filePath = path.resolve(__dirname, '..', 'migrations', file);
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Running ${file}...`);
    await db.query(sql);
  }

  const result = await db.query(`
    SELECT
      to_regclass('public.users') AS users,
      to_regclass('public.companies') AS companies,
      to_regclass('public.jobs') AS jobs,
      to_regclass('public.job_applications') AS job_applications
  `);

  console.log('Schema check:', JSON.stringify(result.rows[0], null, 2));
}

run()
  .catch(error => {
    console.error('Migration failed:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position
    });
    process.exitCode = 1;
  })
  .finally(() => db.end());
