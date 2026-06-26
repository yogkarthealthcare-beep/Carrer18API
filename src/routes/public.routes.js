const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');

// ─── GET /api/v1/public/jobs ──────────────────────────────────────────────
// Public job listings with filters
router.get('/jobs', async (req, res, next) => {
  try {
    const {
      search, location, industry_id, category_id,
      job_type, experience_min, experience_max,
      salary_min, salary_max, is_remote,
      page = 1, limit = 20,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = `WHERE j.status = 'active' AND j.expires_at > NOW()`;

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (j.title ILIKE $${params.length} OR j.description ILIKE $${params.length})`;
    }
    if (location) {
      params.push(`%${location}%`);
      where += ` AND j.location ILIKE $${params.length}`;
    }
    if (industry_id) {
      params.push(industry_id);
      where += ` AND j.industry_id = $${params.length}`;
    }
    if (category_id) {
      params.push(category_id);
      where += ` AND j.category_id = $${params.length}`;
    }
    if (job_type) {
      params.push(job_type);
      where += ` AND j.job_type = $${params.length}`;
    }
    if (is_remote === 'true') {
      where += ` AND j.is_remote = true`;
    }
    if (experience_min) {
      params.push(experience_min);
      where += ` AND j.experience_min >= $${params.length}`;
    }
    if (experience_max) {
      params.push(experience_max);
      where += ` AND j.experience_max <= $${params.length}`;
    }
    if (salary_min) {
      params.push(salary_min);
      where += ` AND j.salary_max >= $${params.length}`;
    }
    if (salary_max) {
      params.push(salary_max);
      where += ` AND j.salary_min <= $${params.length}`;
    }

    params.push(parseInt(limit));
    params.push(offset);

    const query = `
      SELECT
        j.id, j.title, j.location, j.job_type, j.is_remote,
        j.experience_min, j.experience_max, j.salary_min, j.salary_max,
        j.salary_currency, j.description, j.created_at, j.expires_at,
        c.id AS company_id, c.name AS company_name,
        c.logo_url AS company_logo, c.is_verified AS company_verified,
        i.name AS industry_name, jc.name AS category_name
      FROM jobs j
      LEFT JOIN companies c ON c.id = j.company_id
      LEFT JOIN industries i ON i.id = j.industry_id
      LEFT JOIN job_categories jc ON jc.id = j.category_id
      ${where}
      ORDER BY j.is_featured DESC, j.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countQuery = `SELECT COUNT(*) FROM jobs j ${where}`;
    const countParams = params.slice(0, -2);

    const [jobs, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams),
    ]);

    return sendSuccess(res, {
      jobs: jobs.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/public/jobs/:id ──────────────────────────────────────────
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT
         j.*, c.name AS company_name, c.logo_url, c.website, c.description AS company_description,
         c.size AS company_size, c.is_verified,
         i.name AS industry_name, jc.name AS category_name,
         COALESCE(
           json_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category))
           FILTER (WHERE s.id IS NOT NULL), '[]'
         ) AS required_skills
       FROM jobs j
       LEFT JOIN companies c ON c.id = j.company_id
       LEFT JOIN industries i ON i.id = j.industry_id
       LEFT JOIN job_categories jc ON jc.id = j.category_id
       LEFT JOIN job_skills js ON js.job_id = j.id
       LEFT JOIN skills s ON s.id = js.skill_id
       WHERE j.id = $1 AND j.status = 'active'
       GROUP BY j.id, c.id, i.id, jc.id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'Job not found', 404);
    }

    // Increment view count
    await db.query(`UPDATE jobs SET views = views + 1 WHERE id = $1`, [req.params.id]);

    return sendSuccess(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/public/companies ─────────────────────────────────────────
router.get('/companies', async (req, res, next) => {
  try {
    const { search, industry_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = `WHERE c.is_active = true`;

    if (search) {
      params.push(`%${search}%`);
      where += ` AND c.name ILIKE $${params.length}`;
    }
    if (industry_id) {
      params.push(industry_id);
      where += ` AND c.industry_id = $${params.length}`;
    }

    params.push(parseInt(limit), offset);

    const result = await db.query(
      `SELECT c.id, c.name, c.logo_url, c.website, c.size, c.is_verified,
              i.name AS industry_name,
              COUNT(DISTINCT j.id) AS active_jobs
       FROM companies c
       LEFT JOIN industries i ON i.id = c.industry_id
       LEFT JOIN jobs j ON j.company_id = c.id AND j.status = 'active'
       ${where}
       GROUP BY c.id, i.name
       ORDER BY c.is_verified DESC, active_jobs DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/public/companies/:id ────────────────────────────────────
router.get('/companies/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT c.*, i.name AS industry_name,
              COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'active') AS active_jobs
       FROM companies c
       LEFT JOIN industries i ON i.id = c.industry_id
       LEFT JOIN jobs j ON j.company_id = c.id
       WHERE c.id = $1
       GROUP BY c.id, i.name`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'Company not found', 404);
    }

    return sendSuccess(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/public/search ───────────────────────────────────────────
// Unified search across jobs and companies
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return sendError(res, 'Search query must be at least 2 characters', 400);
    }

    const pattern = `%${q}%`;

    const [jobs, companies] = await Promise.all([
      db.query(
        `SELECT id, title, location, job_type, created_at, 'job' AS type
         FROM jobs WHERE status = 'active' AND (title ILIKE $1 OR description ILIKE $1)
         LIMIT 5`,
        [pattern]
      ),
      db.query(
        `SELECT id, name, logo_url, 'company' AS type
         FROM companies WHERE is_active = true AND name ILIKE $1 LIMIT 5`,
        [pattern]
      ),
    ]);

    return sendSuccess(res, {
      jobs: jobs.rows,
      companies: companies.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/public/stats ─────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM jobs WHERE status = 'active') AS active_jobs,
         (SELECT COUNT(*) FROM companies WHERE is_active = true) AS companies,
         (SELECT COUNT(*) FROM users WHERE role = 'candidate') AS candidates,
         (SELECT COUNT(*) FROM users WHERE role = 'employer') AS employers`
    );
    return sendSuccess(res, result.rows[0], 'Platform stats');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
