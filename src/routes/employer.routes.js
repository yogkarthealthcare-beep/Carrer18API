const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All routes require employer/recruiter auth
router.use(authenticate);
router.use(authorize('employer', 'recruiter', 'admin', 'super_admin'));

// ─── GET /api/v1/employer/dashboard ──────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const company = await db.query(
      `SELECT id FROM companies WHERE user_id = $1 LIMIT 1`, [req.user.id]
    );
    const companyId = company.rows[0]?.id;

    if (!companyId) {
      return sendSuccess(res, { setup_required: true, message: 'Please create your company profile first' });
    }

    const [jobs, apps, views] = await Promise.all([
      db.query(
        `SELECT status, COUNT(*) as count FROM jobs WHERE company_id = $1 GROUP BY status`,
        [companyId]
      ),
      db.query(
        `SELECT a.status, COUNT(*) as count FROM job_applications a
         JOIN jobs j ON j.id = a.job_id WHERE j.company_id = $1 GROUP BY a.status`,
        [companyId]
      ),
      db.query(
        `SELECT SUM(views) as total_views FROM jobs WHERE company_id = $1`, [companyId]
      ),
    ]);

    const jobStats = {};
    jobs.rows.forEach(r => { jobStats[r.status] = parseInt(r.count); });
    const appStats = {};
    apps.rows.forEach(r => { appStats[r.status] = parseInt(r.count); });

    return sendSuccess(res, {
      company_id: companyId,
      jobs: jobStats,
      applications: appStats,
      total_views: parseInt(views.rows[0]?.total_views || 0),
    });
  } catch (err) { next(err); }
});

// ─── Company Profile ──────────────────────────────────────────────────────
router.get('/company', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT c.*, c.company_name AS name, c.website_url AS website,
              c.company_size AS size, c.headquarters_location AS location,
              i.name AS industry_name
       FROM companies c
       LEFT JOIN industries i ON i.id = c.industry_id
       WHERE c.user_id = $1`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows[0] || null);
  } catch (err) { next(err); }
});

router.post('/company', async (req, res, next) => {
  try {
    const {
      name, description, website, size, founded_year,
      industry_id, location, linkedin_url, logo_url, banner_url,
      email, hr_contact_number, address, landmark, city, state, country, postal_code,
    } = req.body;

    const existing = await db.query(`SELECT id FROM companies WHERE user_id = $1`, [req.user.id]);
    if (existing.rows.length > 0) {
      return sendError(res, 'Company profile already exists. Use PUT to update.', 409);
    }

    const result = await db.query(
      `INSERT INTO companies (id, user_id, company_name, description, website_url, company_size, founded_year,
         industry_id, headquarters_location, logo_url, banner_url, email, hr_contact_number,
         address, landmark, city, state, country, postal_code, is_active, is_verified, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, true, false, NOW(), NOW())
       RETURNING *`,
      [req.user.id, name, description, website, size, founded_year, industry_id,
       location || [city, state, country].filter(Boolean).join(', '), logo_url,
       banner_url, email, hr_contact_number, address, landmark, city, state,
       country || 'India', postal_code]
    );
    return sendSuccess(res, result.rows[0], 'Company created', 201);
  } catch (err) { next(err); }
});

router.put('/company', async (req, res, next) => {
  try {
    const {
      name, description, website, size, founded_year,
      industry_id, location, linkedin_url, logo_url, banner_url,
      email, hr_contact_number, address, landmark, city, state, country, postal_code,
    } = req.body;

    await db.query(
      `UPDATE companies SET company_name=$1, description=$2, website_url=$3, company_size=$4, founded_year=$5,
       industry_id=$6, headquarters_location=$7, logo_url=$8, banner_url=$9,
       email=$10, hr_contact_number=$11, address=$12, landmark=$13, city=$14,
       state=$15, country=$16, postal_code=$17, updated_at=NOW()
       WHERE user_id=$18`,
      [name, description, website, size, founded_year, industry_id,
       location || [city, state, country].filter(Boolean).join(', '),
       logo_url, banner_url, email, hr_contact_number, address, landmark, city,
       state, country || 'India', postal_code, req.user.id]
    );
    return sendSuccess(res, null, 'Company updated');
  } catch (err) { next(err); }
});

// ─── Jobs CRUD ────────────────────────────────────────────────────────────
router.get('/jobs', async (req, res, next) => {
  try {
    const company = await db.query(`SELECT id FROM companies WHERE user_id = $1`, [req.user.id]);
    if (!company.rows[0]) return sendError(res, 'Company not found', 404);

    const result = await db.query(
      `SELECT j.*, i.name AS industry_name, jc.name AS category_name,
              COUNT(a.id) AS application_count
       FROM jobs j
       LEFT JOIN industries i ON i.id = j.industry_id
       LEFT JOIN job_categories jc ON jc.id = j.category_id
       LEFT JOIN job_applications a ON a.job_id = j.id
       WHERE j.company_id = $1
       GROUP BY j.id, i.name, jc.name
       ORDER BY j.created_at DESC`,
      [company.rows[0].id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

router.post('/jobs', async (req, res, next) => {
  try {
    const company = await db.query(`SELECT id FROM companies WHERE user_id = $1`, [req.user.id]);
    if (!company.rows[0]) return sendError(res, 'Create company profile first', 400);

    const {
      title, description, requirements, location, job_type, is_remote,
      experience_min, experience_max, salary_min, salary_max, salary_currency,
      industry_id, category_id, openings, expires_at, skill_ids,
    } = req.body;

    const result = await db.query(
      `INSERT INTO jobs (id, company_id, title, description, requirements, location, job_type,
         is_remote, experience_min, experience_max, salary_min, salary_max, salary_currency,
         industry_id, category_id, openings, status, expires_at, views, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active', $16, 0, NOW(), NOW())
       RETURNING *`,
      [company.rows[0].id, title, description, requirements, location, job_type, is_remote,
       experience_min, experience_max, salary_min, salary_max, salary_currency || 'INR',
       industry_id, category_id, openings || 1, expires_at]
    );

    const jobId = result.rows[0].id;

    // Add required skills
    if (skill_ids && skill_ids.length > 0) {
      const skillValues = skill_ids.map(sid => `(gen_random_uuid(), '${jobId}', '${sid}')`).join(',');
      await db.query(`INSERT INTO job_skills (id, job_id, skill_id) VALUES ${skillValues} ON CONFLICT DO NOTHING`);
    }

    return sendSuccess(res, result.rows[0], 'Job posted', 201);
  } catch (err) { next(err); }
});

router.put('/jobs/:id', async (req, res, next) => {
  try {
    const company = await db.query(`SELECT id FROM companies WHERE user_id = $1`, [req.user.id]);
    if (!company.rows[0]) return sendError(res, 'Company not found', 404);

    const {
      title, description, requirements, location, job_type, is_remote,
      experience_min, experience_max, salary_min, salary_max, status, expires_at,
    } = req.body;

    await db.query(
      `UPDATE jobs SET title=$1, description=$2, requirements=$3, location=$4, job_type=$5,
       is_remote=$6, experience_min=$7, experience_max=$8, salary_min=$9, salary_max=$10,
       status=$11, expires_at=$12, updated_at=NOW()
       WHERE id=$13 AND company_id=$14`,
      [title, description, requirements, location, job_type, is_remote,
       experience_min, experience_max, salary_min, salary_max, status,
       expires_at, req.params.id, company.rows[0].id]
    );
    return sendSuccess(res, null, 'Job updated');
  } catch (err) { next(err); }
});

router.delete('/jobs/:id', async (req, res, next) => {
  try {
    const company = await db.query(`SELECT id FROM companies WHERE user_id = $1`, [req.user.id]);
    await db.query(
      `UPDATE jobs SET status = 'closed', updated_at = NOW() WHERE id = $1 AND company_id = $2`,
      [req.params.id, company.rows[0]?.id]
    );
    return sendSuccess(res, null, 'Job closed');
  } catch (err) { next(err); }
});

// ─── Applications Management ──────────────────────────────────────────────
router.get('/applications', async (req, res, next) => {
  try {
    const { job_id, status, page = 1, limit = 20 } = req.query;
    const company = await db.query(`SELECT id FROM companies WHERE user_id = $1`, [req.user.id]);
    if (!company.rows[0]) return sendError(res, 'Company not found', 404);

    const params = [company.rows[0].id];
    let where = `WHERE j.company_id = $1`;

    if (job_id) { params.push(job_id); where += ` AND a.job_id = $${params.length}`; }
    if (status) { params.push(status); where += ` AND a.status = $${params.length}`; }

    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await db.query(
      `SELECT a.id, a.status, a.applied_at, a.cover_letter,
              j.title AS job_title,
              u.id AS candidate_id, u.email AS candidate_email,
              p.first_name, p.last_name, p.headline, p.avatar_url,
              p.total_experience_years, p.resume_url
       FROM job_applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN users u ON u.id = a.candidate_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
       ${where}
       ORDER BY a.applied_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

// ─── Update application status ────────────────────────────────────────────
router.patch('/applications/:id/status', async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const allowed = ['reviewing', 'shortlisted', 'interview_scheduled', 'rejected', 'hired'];
    if (!allowed.includes(status)) {
      return sendError(res, `Status must be one of: ${allowed.join(', ')}`, 400);
    }

    await db.query(
      `UPDATE job_applications SET status = $1, employer_note = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, note, req.params.id]
    );
    return sendSuccess(res, null, `Application marked as ${status}`);
  } catch (err) { next(err); }
});

// ─── Candidate search ─────────────────────────────────────────────────────
router.patch('/reviews/:id/respond', async (req, res, next) => {
  try {
    const { response } = req.body;
    const company = await db.query(`SELECT id FROM companies WHERE user_id = $1`, [req.user.id]);
    if (!company.rows[0]) return sendError(res, 'Company not found', 404);

    await db.query(
      `UPDATE company_reviews
       SET employer_response = $1, employer_responded_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND company_id = $3`,
      [response, req.params.id, company.rows[0].id]
    );
    return sendSuccess(res, null, 'Review response saved');
  } catch (err) { next(err); }
});

router.get('/candidates/search', async (req, res, next) => {
  try {
    const { skill_ids, location, experience_min, experience_max, page = 1, limit = 20 } = req.query;
    const params = [];
    let where = `WHERE u.role = 'candidate' AND u.status = 'active' AND p.is_actively_looking = true`;

    if (location) {
      params.push(`%${location}%`);
      where += ` AND p.location ILIKE $${params.length}`;
    }
    if (experience_min) {
      params.push(experience_min);
      where += ` AND p.total_experience_years >= $${params.length}`;
    }
    if (experience_max) {
      params.push(experience_max);
      where += ` AND p.total_experience_years <= $${params.length}`;
    }

    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await db.query(
      `SELECT u.id, u.email, p.first_name, p.last_name, p.headline,
              p.location, p.total_experience_years, p.avatar_url,
              p.expected_salary, p.notice_period_days,
              COALESCE(json_agg(DISTINCT s.name) FILTER (WHERE s.id IS NOT NULL), '[]') AS skills
       FROM users u
       JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN candidate_skills cs ON cs.user_id = u.id
       LEFT JOIN skills s ON s.id = cs.skill_id
       ${where}
       GROUP BY u.id, p.id
       ORDER BY p.total_experience_years DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

module.exports = router;
