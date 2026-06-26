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
              p.linkedin_url, p.github_url, p.portfolio_url,
              p.resume_url, p.profile_completion,
              p.total_experience_years, p.current_salary, p.expected_salary,
              p.notice_period_days, p.is_actively_looking,
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
      phone, linkedin_url, github_url, portfolio_url,
      current_salary, expected_salary, notice_period_days,
      is_actively_looking, total_experience_years,
    } = req.body;

    await db.query(
      `INSERT INTO user_profiles (id, user_id, first_name, last_name, headline, summary,
         location, phone, linkedin_url, github_url, portfolio_url,
         current_salary, expected_salary, notice_period_days, is_actively_looking,
         total_experience_years, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
         headline = EXCLUDED.headline, summary = EXCLUDED.summary,
         location = EXCLUDED.location, phone = EXCLUDED.phone,
         linkedin_url = EXCLUDED.linkedin_url, github_url = EXCLUDED.github_url,
         portfolio_url = EXCLUDED.portfolio_url, current_salary = EXCLUDED.current_salary,
         expected_salary = EXCLUDED.expected_salary, notice_period_days = EXCLUDED.notice_period_days,
         is_actively_looking = EXCLUDED.is_actively_looking,
         total_experience_years = EXCLUDED.total_experience_years,
         updated_at = NOW()`,
      [req.user.id, first_name, last_name, headline, summary, location, phone,
       linkedin_url, github_url, portfolio_url, current_salary, expected_salary,
       notice_period_days, is_actively_looking, total_experience_years]
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
    const { company_name, job_title, location, start_date, end_date, is_current, description } = req.body;
    const result = await db.query(
      `INSERT INTO candidate_experience (id, user_id, company_name, job_title, location, start_date, end_date, is_current, description, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING *`,
      [req.user.id, company_name, job_title, location, start_date, end_date, is_current, description]
    );
    return sendSuccess(res, result.rows[0], 'Experience added', 201);
  } catch (err) { next(err); }
});

// ─── PUT /api/v1/employee/experience/:id ─────────────────────────────────
router.put('/experience/:id', async (req, res, next) => {
  try {
    const { company_name, job_title, location, start_date, end_date, is_current, description } = req.body;
    await db.query(
      `UPDATE candidate_experience SET company_name=$1, job_title=$2, location=$3, start_date=$4,
       end_date=$5, is_current=$6, description=$7, updated_at=NOW()
       WHERE id=$8 AND user_id=$9`,
      [company_name, job_title, location, start_date, end_date, is_current, description, req.params.id, req.user.id]
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
    const { institution, degree, field_of_study, start_year, end_year, is_current, grade } = req.body;
    const result = await db.query(
      `INSERT INTO candidate_education (id, user_id, institution, degree, field_of_study, start_year, end_year, is_current, grade, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
      [req.user.id, institution, degree, field_of_study, start_year, end_year, is_current, grade]
    );
    return sendSuccess(res, result.rows[0], 'Education added', 201);
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
