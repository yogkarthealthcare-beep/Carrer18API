const db = require('../src/config/database');

async function main() {
  const [companies, candidateProfiles, education, experience, skills, certifications, tables, allTables] = await Promise.all([
    db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'companies'
       ORDER BY ordinal_position`
    ),
    db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'candidate_profiles'
       ORDER BY ordinal_position`
    ),
    db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'candidate_education'
       ORDER BY ordinal_position`
    ),
    db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'candidate_experience'
       ORDER BY ordinal_position`
    ),
    db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'candidate_skills'
       ORDER BY ordinal_position`
    ),
    db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'candidate_certifications'
       ORDER BY ordinal_position`
    ),
    db.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('jobs', 'job_postings', 'company_reviews')
       ORDER BY table_name`
    ),
    db.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    ),
  ]);

  console.log(JSON.stringify({
    companies: companies.rows.map(row => row.column_name),
    candidateProfiles: candidateProfiles.rows.map(row => row.column_name),
    candidateEducation: education.rows.map(row => row.column_name),
    candidateExperience: experience.rows.map(row => row.column_name),
    candidateSkills: skills.rows.map(row => row.column_name),
    candidateCertifications: certifications.rows.map(row => row.column_name),
    tables: tables.rows.map(row => row.table_name),
    allTables: allTables.rows.map(row => row.table_name),
  }, null, 2));
}

main()
  .catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
