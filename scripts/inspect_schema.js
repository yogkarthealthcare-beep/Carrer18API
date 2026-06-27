const db = require('../src/config/database');

const tables = [
  'users',
  'refresh_tokens',
  'otp_verifications',
  'industries',
  'job_categories',
  'skills',
  'companies',
  'job_postings',
  'active_job_postings',
  'jobs',
  'job_skills',
  'job_applications',
  'saved_jobs'
];

async function run() {
  const tableResult = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
     ORDER BY table_name`
  );

  console.log('Tables:', tableResult.rows.map(row => row.table_name).join(', '));

  const columnResult = await db.query(
    `SELECT table_name, column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1)
     ORDER BY table_name, ordinal_position`,
    [tables]
  );

  for (const table of tables) {
    const columns = columnResult.rows.filter(row => row.table_name === table);
    console.log(`\n${table}:`);
    if (!columns.length) {
      console.log('  missing');
      continue;
    }
    for (const column of columns) {
      console.log(`  ${column.column_name} ${column.udt_name || column.data_type}`);
    }
  }
}

run()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
