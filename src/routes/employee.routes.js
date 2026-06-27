const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All routes require candidate auth
router.use(authenticate);
router.use(authorize('candidate'));

// ─── GET /api/v1/employee/profile ────────────────────────────────────────
router.get('/profile', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.role, u.email_verified,
              p.first_name, p.last_name, p.avatar_url, p.headline, p.summary,
              p.location, p.date_of_birth, p.gender, p.phone,
              p.address, p.city, p.state, p.country,
              p.linkedin_url, p.github_url, p.portfolio_url,
              p.resume_url, p.profile_completion,
              p.total_experience_years, p.current_salary, p.expected_salary,
              p.notice_period_days, p.is_actively_looking,
              p.preferred_job_role, p.preferred_industry, p.preferred_location,
              p.preferred_job_type, p.preferred_work_mode,
              p.professional_summary, p.achievements, p.resume_template,
              p.created_at, p.updated_at
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) return sendError(res, 'Profile not found', 404);
    return sendSuccess(res, result.rows[0]);
  } catch (err) { next(err); }
});

// ─── PUT /api/v1/employee/profile ────────────────────────────────────────
router.put('/profile', async (req, res, next) => {
  try {
    const {
      first_name, last_name, headline, summary, location,
      phone, date_of_birth, gender, avatar_url, address, city, state, country,
      linkedin_url, github_url, portfolio_url,
      current_salary, expected_salary, notice_period_days,
      is_actively_looking, total_experience_years,
      preferred_job_role, preferred_industry, preferred_location,
      preferred_job_type, preferred_work_mode, professional_summary,
      achievements, resume_template,
    } = req.body;

    await db.query(
      `INSERT INTO user_profiles (id, user_id, first_name, last_name, headline, summary,
         location, phone, date_of_birth, gender, avatar_url, address, city, state, country,
         linkedin_url, github_url, portfolio_url,
         current_salary, expected_salary, notice_period_days, is_actively_looking,
         total_experience_years, preferred_job_role, preferred_industry, preferred_location,
         preferred_job_type, preferred_work_mode, professional_summary, achievements,
         resume_template, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
         $24, $25, $26, $27, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
         headline = EXCLUDED.headline, summary = EXCLUDED.summary,
         location = EXCLUDED.location, phone = EXCLUDED.phone,
         date_of_birth = EXCLUDED.date_of_birth, gender = EXCLUDED.gender,
         avatar_url = EXCLUDED.avatar_url, address = EXCLUDED.address,
         city = EXCLUDED.city, state = EXCLUDED.state, country = EXCLUDED.country,
         linkedin_url = EXCLUDED.linkedin_url, github_url = EXCLUDED.github_url,
         portfolio_url = EXCLUDED.portfolio_url, current_salary = EXCLUDED.current_salary,
         expected_salary = EXCLUDED.expected_salary, notice_period_days = EXCLUDED.notice_period_days,
         is_actively_looking = EXCLUDED.is_actively_looking,
         total_experience_years = EXCLUDED.total_experience_years,
         preferred_job_role = EXCLUDED.preferred_job_role,
         preferred_industry = EXCLUDED.preferred_industry,
         preferred_location = EXCLUDED.preferred_location,
         preferred_job_type = EXCLUDED.preferred_job_type,
         preferred_work_mode = EXCLUDED.preferred_work_mode,
         professional_summary = EXCLUDED.professional_summary,
         achievements = EXCLUDED.achievements,
         resume_template = EXCLUDED.resume_template,
         updated_at = NOW()`,
      [req.user.id, first_name, last_name, headline, summary, location, phone,
       date_of_birth || null, gender, avatar_url, address, city, state, country,
       linkedin_url, github_url, portfolio_url, current_salary, expected_salary,
       notice_period_days, is_actively_looking, total_experience_years,
       preferred_job_role, preferred_industry, preferred_location,
       preferred_job_type, preferred_work_mode, professional_summary,
       achievements, resume_template || 'modern']
    );

    return sendSuccess(res, null, 'Profile updated');
  } catch (err) { next(err); }
});

// ─── GET /api/v1/employee/skills ─────────────────────────────────────────
router.get('/skills', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT cs.id, s.name, s.category, cs.proficiency_level, cs.years_of_experience
       FROM candidate_skills cs
       JOIN skills s ON s.id = cs.skill_id
       WHERE cs.user_id = $1 ORDER BY s.category, s.name`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

// ─── POST /api/v1/employee/skills ────────────────────────────────────────
router.post('/skills', async (req, res, next) => {
  try {
    const { skill_id, proficiency_level = 'intermediate', years_of_experience = 0 } = req.body;
    await db.query(
      `INSERT INTO candidate_skills (id, user_id, skill_id, proficiency_level, years_of_experience, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, skill_id) DO UPDATE SET
         proficiency_level = EXCLUDED.proficiency_level,
         years_of_experience = EXCLUDED.years_of_experience`,
      [req.user.id, skill_id, proficiency_level, years_of_experience]
    );
    return sendSuccess(res, null, 'Skill added', 201);
  } catch (err) { next(err); }
});

// ─── DELETE /api/v1/employee/skills/:skillId ─────────────────────────────
router.delete('/skills/:skillId', async (req, res, next) => {
  try {
    await db.query(
      `DELETE FROM candidate_skills WHERE user_id = $1 AND skill_id = $2`,
      [req.user.id, req.params.skillId]
    );
    return sendSuccess(res, null, 'Skill removed');
  } catch (err) { next(err); }
});

// ─── GET /api/v1/employee/experience ─────────────────────────────────────
router.get('/experience', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM candidate_experience WHERE user_id = $1 ORDER BY start_date DESC`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

// ─── POST /api/v1/employee/experience ────────────────────────────────────
router.post('/experience', async (req, res, next) => {
  try {
    const {
      company_name, job_title, employment_type, location, start_date, end_date,
      is_current, description, responsibilities, skills_used,
    } = req.body;
    const result = await db.query(
      `INSERT INTO candidate_experience (id, user_id, company_name, job_title, employment_type,
         location, start_date, end_date, is_current, description, responsibilities, skills_used,
         created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()) RETURNING *`,
      [req.user.id, company_name, job_title, employment_type, location, start_date || null,
       end_date || null, is_current, description, responsibilities, skills_used]
    );
    return sendSuccess(res, result.rows[0], 'Experience added', 201);
  } catch (err) { next(err); }
});

// ─── PUT /api/v1/employee/experience/:id ─────────────────────────────────
router.put('/experience/:id', async (req, res, next) => {
  try {
    const {
      company_name, job_title, employment_type, location, start_date, end_date,
      is_current, description, responsibilities, skills_used,
    } = req.body;
    await db.query(
      `UPDATE candidate_experience SET company_name=$1, job_title=$2, employment_type=$3,
       location=$4, start_date=$5, end_date=$6, is_current=$7, description=$8,
       responsibilities=$9, skills_used=$10, updated_at=NOW()
       WHERE id=$11 AND user_id=$12`,
      [company_name, job_title, employment_type, location, start_date || null, end_date || null,
       is_current, description, responsibilities, skills_used, req.params.id, req.user.id]
    );
    return sendSuccess(res, null, 'Experience updated');
  } catch (err) { next(err); }
});

// ─── DELETE /api/v1/employee/experience/:id ──────────────────────────────
router.delete('/experience/:id', async (req, res, next) => {
  try {
    await db.query(
      `DELETE FROM candidate_experience WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    return sendSuccess(res, null, 'Experience removed');
  } catch (err) { next(err); }
});

// ─── GET /api/v1/employee/education ──────────────────────────────────────
router.get('/education', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM candidate_education WHERE user_id = $1 ORDER BY start_year DESC`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

// ─── POST /api/v1/employee/education ─────────────────────────────────────
router.post('/education', async (req, res, next) => {
  try {
    const {
      institution, degree, field_of_study, start_year, end_year, is_current, grade,
      highest_qualification, university_college, passing_year, percentage_cgpa,
    } = req.body;
    const result = await db.query(
      `INSERT INTO candidate_education (id, user_id, institution, degree, field_of_study,
         start_year, end_year, is_current, grade, highest_qualification,
         university_college, passing_year, percentage_cgpa, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) RETURNING *`,
      [req.user.id, institution || university_college, degree || highest_qualification,
       field_of_study, start_year, end_year || passing_year, is_current, grade || percentage_cgpa,
       highest_qualification, university_college || institution, passing_year || end_year,
       percentage_cgpa || grade]
    );
    return sendSuccess(res, result.rows[0], 'Education added', 201);
  } catch (err) { next(err); }
});

router.put('/education/:id', async (req, res, next) => {
  try {
    const {
      institution, degree, field_of_study, start_year, end_year, is_current, grade,
      highest_qualification, university_college, passing_year, percentage_cgpa,
    } = req.body;
    await db.query(
      `UPDATE candidate_education SET institution=$1, degree=$2, field_of_study=$3,
       start_year=$4, end_year=$5, is_current=$6, grade=$7,
       highest_qualification=$8, university_college=$9, passing_year=$10,
       percentage_cgpa=$11 WHERE id=$12 AND user_id=$13`,
      [institution || university_college, degree || highest_qualification, field_of_study,
       start_year, end_year || passing_year, is_current, grade || percentage_cgpa,
       highest_qualification, university_college || institution, passing_year || end_year,
       percentage_cgpa || grade, req.params.id, req.user.id]
    );
    return sendSuccess(res, null, 'Education updated');
  } catch (err) { next(err); }
});

router.delete('/education/:id', async (req, res, next) => {
  try {
    await db.query(`DELETE FROM candidate_education WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
    return sendSuccess(res, null, 'Education removed');
  } catch (err) { next(err); }
});

// ─── GET /api/v1/employee/applications ───────────────────────────────────
router.get('/applications', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT a.id, a.status, a.applied_at, a.updated_at,
              j.id AS job_id, j.title, j.location, j.job_type,
              c.name AS company_name, c.logo_url
       FROM job_applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN companies c ON c.id = j.company_id
       WHERE a.candidate_id = $1
       ORDER BY a.applied_at DESC`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

// ─── POST /api/v1/employee/apply/:jobId ──────────────────────────────────
router.post('/apply/:jobId', async (req, res, next) => {
  try {
    const { cover_letter } = req.body;

    // Check if already applied
    const existing = await db.query(
      `SELECT id FROM job_applications WHERE candidate_id = $1 AND job_id = $2`,
      [req.user.id, req.params.jobId]
    );
    if (existing.rows.length > 0) {
      return sendError(res, 'Already applied to this job', 409);
    }

    const result = await db.query(
      `INSERT INTO job_applications (id, candidate_id, job_id, status, cover_letter, applied_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'applied', $3, NOW(), NOW()) RETURNING *`,
      [req.user.id, req.params.jobId, cover_letter]
    );
    return sendSuccess(res, result.rows[0], 'Application submitted', 201);
  } catch (err) { next(err); }
});

// ─── GET /api/v1/employee/saved-jobs ─────────────────────────────────────
router.get('/saved-jobs', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT j.id, j.title, j.location, j.job_type, j.salary_min, j.salary_max,
              c.name AS company_name, c.logo_url, sj.saved_at
       FROM saved_jobs sj
       JOIN jobs j ON j.id = sj.job_id
       JOIN companies c ON c.id = j.company_id
       WHERE sj.user_id = $1 ORDER BY sj.saved_at DESC`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

// ─── POST /api/v1/employee/saved-jobs/:jobId ─────────────────────────────
router.post('/saved-jobs/:jobId', async (req, res, next) => {
  try {
    await db.query(
      `INSERT INTO saved_jobs (id, user_id, job_id, saved_at)
       VALUES (gen_random_uuid(), $1, $2, NOW())
       ON CONFLICT (user_id, job_id) DO NOTHING`,
      [req.user.id, req.params.jobId]
    );
    return sendSuccess(res, null, 'Job saved');
  } catch (err) { next(err); }
});

// ─── DELETE /api/v1/employee/saved-jobs/:jobId ───────────────────────────
router.delete('/saved-jobs/:jobId', async (req, res, next) => {
  try {
    await db.query(
      `DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2`,
      [req.user.id, req.params.jobId]
    );
    return sendSuccess(res, null, 'Job removed from saved');
  } catch (err) { next(err); }
});

// ─── GET /api/v1/employee/dashboard ──────────────────────────────────────
const candidateCollectionRoutes = ({ path, table, fields, orderBy, createdMessage, updatedMessage, deletedMessage }) => {
  router.get(`/${path}`, async (req, res, next) => {
    try {
      const result = await db.query(`SELECT * FROM ${table} WHERE user_id = $1 ORDER BY ${orderBy}`, [req.user.id]);
      return sendSuccess(res, result.rows);
    } catch (err) { next(err); }
  });

  router.post(`/${path}`, async (req, res, next) => {
    try {
      const values = fields.map(field => req.body[field] || null);
      const placeholders = fields.map((_, index) => `$${index + 2}`).join(', ');
      const result = await db.query(
        `INSERT INTO ${table} (id, user_id, ${fields.join(', ')}, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, ${placeholders}, NOW(), NOW()) RETURNING *`,
        [req.user.id, ...values]
      );
      return sendSuccess(res, result.rows[0], createdMessage, 201);
    } catch (err) { next(err); }
  });

  router.put(`/${path}/:id`, async (req, res, next) => {
    try {
      const values = fields.map(field => req.body[field] || null);
      const assignments = fields.map((field, index) => `${field}=$${index + 1}`).join(', ');
      await db.query(
        `UPDATE ${table} SET ${assignments}, updated_at=NOW()
         WHERE id=$${fields.length + 1} AND user_id=$${fields.length + 2}`,
        [...values, req.params.id, req.user.id]
      );
      return sendSuccess(res, null, updatedMessage);
    } catch (err) { next(err); }
  });

  router.delete(`/${path}/:id`, async (req, res, next) => {
    try {
      await db.query(`DELETE FROM ${table} WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
      return sendSuccess(res, null, deletedMessage);
    } catch (err) { next(err); }
  });
};

candidateCollectionRoutes({
  path: 'certifications',
  table: 'candidate_certifications',
  fields: ['name', 'issuing_organization', 'issue_date', 'expiry_date', 'credential_url'],
  orderBy: 'issue_date DESC NULLS LAST, created_at DESC',
  createdMessage: 'Certification added',
  updatedMessage: 'Certification updated',
  deletedMessage: 'Certification removed',
});

candidateCollectionRoutes({
  path: 'languages',
  table: 'candidate_languages',
  fields: ['language', 'proficiency_level'],
  orderBy: 'language ASC',
  createdMessage: 'Language added',
  updatedMessage: 'Language updated',
  deletedMessage: 'Language removed',
});

candidateCollectionRoutes({
  path: 'projects',
  table: 'candidate_projects',
  fields: ['project_name', 'description', 'technologies_used', 'project_url'],
  orderBy: 'created_at DESC',
  createdMessage: 'Project added',
  updatedMessage: 'Project updated',
  deletedMessage: 'Project removed',
});

router.get('/resume', async (req, res, next) => {
  try {
    const [profile, education, experience, skills, certifications, languages, projects] = await Promise.all([
      db.query(`SELECT u.email, p.* FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`, [req.user.id]),
      db.query(`SELECT * FROM candidate_education WHERE user_id = $1 ORDER BY COALESCE(passing_year, end_year, start_year) DESC NULLS LAST`, [req.user.id]),
      db.query(`SELECT * FROM candidate_experience WHERE user_id = $1 ORDER BY start_date DESC`, [req.user.id]),
      db.query(
        `SELECT s.name, s.category, cs.proficiency_level, cs.years_of_experience
         FROM candidate_skills cs JOIN skills s ON s.id = cs.skill_id
         WHERE cs.user_id = $1 ORDER BY s.name`,
        [req.user.id]
      ),
      db.query(`SELECT * FROM candidate_certifications WHERE user_id = $1 ORDER BY issue_date DESC NULLS LAST`, [req.user.id]),
      db.query(`SELECT * FROM candidate_languages WHERE user_id = $1 ORDER BY language`, [req.user.id]),
      db.query(`SELECT * FROM candidate_projects WHERE user_id = $1 ORDER BY created_at DESC`, [req.user.id]),
    ]);

    return sendSuccess(res, {
      profile: profile.rows[0] || {},
      education: education.rows,
      experience: experience.rows,
      skills: skills.rows,
      certifications: certifications.rows,
      languages: languages.rows,
      projects: projects.rows,
      templates: ['modern', 'professional', 'executive', 'minimal', 'creative'],
    });
  } catch (err) { next(err); }
});

router.post('/companies/:companyId/reviews', async (req, res, next) => {
  try {
    const {
      overall_rating, work_culture, salary_benefits, career_growth,
      management, work_life_balance, interview_experience, review_text,
    } = req.body;

    if (!overall_rating || !review_text) {
      return sendError(res, 'Overall rating and review text are required', 400);
    }

    const result = await db.query(
      `INSERT INTO company_reviews (id, company_id, user_id, overall_rating, work_culture,
         salary_benefits, career_growth, management, work_life_balance,
         interview_experience, review_text, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW(), NOW())
       ON CONFLICT (company_id, user_id) DO UPDATE SET
         overall_rating=EXCLUDED.overall_rating, work_culture=EXCLUDED.work_culture,
         salary_benefits=EXCLUDED.salary_benefits, career_growth=EXCLUDED.career_growth,
         management=EXCLUDED.management, work_life_balance=EXCLUDED.work_life_balance,
         interview_experience=EXCLUDED.interview_experience, review_text=EXCLUDED.review_text,
         status='pending', updated_at=NOW()
       RETURNING *`,
      [req.params.companyId, req.user.id, overall_rating, work_culture, salary_benefits,
       career_growth, management, work_life_balance, interview_experience, review_text]
    );
    return sendSuccess(res, result.rows[0], 'Review submitted for moderation', 201);
  } catch (err) { next(err); }
});

router.get('/dashboard', async (req, res, next) => {
  try {
    const [profile, apps, saved] = await Promise.all([
      db.query(`SELECT profile_completion, is_actively_looking FROM user_profiles WHERE user_id = $1`, [req.user.id]),
      db.query(
        `SELECT status, COUNT(*) as count FROM job_applications WHERE candidate_id = $1 GROUP BY status`,
        [req.user.id]
      ),
      db.query(`SELECT COUNT(*) as count FROM saved_jobs WHERE user_id = $1`, [req.user.id]),
    ]);

    const appStats = {};
    apps.rows.forEach(r => { appStats[r.status] = parseInt(r.count); });

    return sendSuccess(res, {
      profile_completion: profile.rows[0]?.profile_completion || 0,
      is_actively_looking: profile.rows[0]?.is_actively_looking || false,
      applications: appStats,
      saved_jobs: parseInt(saved.rows[0]?.count || 0),
    });
  } catch (err) { next(err); }
});

module.exports = router;
