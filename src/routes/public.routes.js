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
    let where = `WHERE j.status = 'active'`;

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
      where += ` AND j.employment_type = $${params.length}`;
    }
    if (is_remote === 'true') {
      where += ` AND j.is_remote = true`;
    }
    if (experience_min) {
      params.push(experience_min);
      where += ` AND j.experience_required >= $${params.length}`;
    }
    if (experience_max) {
      params.push(experience_max);
      where += ` AND j.experience_required <= $${params.length}`;
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
        j.id, j.title, j.location, j.employment_type AS job_type, j.is_remote,
        COALESCE(j.experience_required, 0) AS experience_min, j.experience_required AS experience_max,
        j.salary_min, j.salary_max, j.salary_currency, j.description, j.created_at,
        j.closed_at AS expires_at, j.number_of_positions AS openings, j.view_count AS views,
        c.id AS company_id, c.company_name AS company_name,
        c.logo_url AS company_logo, c.is_verified AS company_verified,
        c.address AS company_address, c.city AS company_city, c.state AS company_state,
        c.country AS company_country, c.postal_code AS company_postal_code,
        i.name AS industry_name, jc.name AS category_name
      FROM job_postings j
      LEFT JOIN companies c ON c.id = j.company_id
      LEFT JOIN industries i ON i.id = j.industry_id
      LEFT JOIN job_categories jc ON jc.id = j.category_id
      ${where}
      ORDER BY j.is_featured DESC, j.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const countQuery = `SELECT COUNT(*) FROM job_postings j ${where}`;
    const countParams = params.slice(0, -2);

    const [jobs, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams),
    ]);

    return sendSuccess(res, {
      jobs: jobs.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
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
         j.id, j.title, j.description, j.qualification_required AS requirements,
         j.location, j.employment_type AS job_type, j.is_remote,
         COALESCE(j.experience_required, 0) AS experience_min,
         j.experience_required AS experience_max,
         j.salary_min, j.salary_max, j.salary_currency,
         j.number_of_positions AS openings, j.status, j.is_featured,
         j.view_count AS views, j.created_at, j.updated_at,
         c.company_name, c.logo_url, c.website_url AS website, c.description AS company_description,
         c.company_size, c.is_verified,
         c.address AS company_address, c.city AS company_city, c.state AS company_state,
         c.country AS company_country, c.postal_code AS company_postal_code,
         i.name AS industry_name, jc.name AS category_name,
         '[]'::json AS required_skills
       FROM job_postings j
       LEFT JOIN companies c ON c.id = j.company_id
       LEFT JOIN industries i ON i.id = j.industry_id
       LEFT JOIN job_categories jc ON jc.id = j.category_id
       WHERE j.id = $1 AND j.status = 'active'
       GROUP BY j.id, c.id, i.id, jc.id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'Job not found', 404);
    }

    // Increment view count
    await db.query(`UPDATE job_postings SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1`, [req.params.id]);

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
    let where = `WHERE 1 = 1`;

    if (search) {
      params.push(`%${search}%`);
      where += ` AND c.company_name ILIKE $${params.length}`;
    }
    if (industry_id) {
      params.push(industry_id);
      where += ` AND c.industry_id = $${params.length}`;
    }

    params.push(parseInt(limit), offset);

    const result = await db.query(
      `SELECT c.id, c.company_name AS name, c.logo_url, c.website_url AS website,
              c.company_size AS size, c.headquarters_location AS location,
              c.address, c.landmark, c.city, c.state, c.country, c.postal_code,
              c.is_verified,
              i.name AS industry_name,
              COUNT(DISTINCT j.id) AS active_jobs,
              COALESCE(rs.average_rating, 0) AS average_rating,
              COALESCE(rs.total_reviews, 0) AS total_reviews
       FROM companies c
       LEFT JOIN industries i ON i.id = c.industry_id
       LEFT JOIN job_postings j ON j.company_id = c.id AND j.status = 'active'
       LEFT JOIN company_rating_summary rs ON rs.company_id = c.id
       ${where}
       GROUP BY c.id, i.name, rs.average_rating, rs.total_reviews, rs.review_quality
       ORDER BY COALESCE(rs.average_rating, 0) DESC, COALESCE(rs.total_reviews, 0) DESC, active_jobs DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await db.query(`SELECT COUNT(*) FROM companies c ${where}`, params.slice(0, -2));

    return sendSuccess(res, {
      companies: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
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

router.get('/companies/top-rated', async (req, res, next) => {
  try {
    const { limit = 8 } = req.query;
    const result = await db.query(
      `SELECT c.id, c.company_name AS name, c.logo_url, c.company_size AS size,
              c.headquarters_location AS location, c.city, c.state,
              i.name AS industry_name,
              COUNT(DISTINCT j.id) AS active_jobs,
              COALESCE(rs.average_rating, 0) AS average_rating,
              COALESCE(rs.total_reviews, 0) AS total_reviews
       FROM companies c
       LEFT JOIN industries i ON i.id = c.industry_id
       LEFT JOIN job_postings j ON j.company_id = c.id AND j.status = 'active'
       LEFT JOIN company_rating_summary rs ON rs.company_id = c.id
       GROUP BY c.id, i.name, rs.average_rating, rs.total_reviews, rs.review_quality
       ORDER BY COALESCE(rs.average_rating, 0) DESC,
                COALESCE(rs.total_reviews, 0) DESC,
                COUNT(DISTINCT j.id) DESC,
                c.company_name ASC
       LIMIT $1`,
      [parseInt(limit)]
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
              c.company_name AS name, c.website_url AS website,
              c.company_size AS size, c.headquarters_location AS location,
              COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'active') AS active_jobs,
              COALESCE(rs.average_rating, 0) AS average_rating,
              COALESCE(rs.total_reviews, 0) AS total_reviews
       FROM companies c
       LEFT JOIN industries i ON i.id = c.industry_id
       LEFT JOIN job_postings j ON j.company_id = c.id
       LEFT JOIN company_rating_summary rs ON rs.company_id = c.id
       WHERE c.id = $1
       GROUP BY c.id, i.name, rs.average_rating, rs.total_reviews`,
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

router.get('/companies/:id/reviews', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.id, r.overall_rating, r.work_culture, r.salary_benefits,
              r.career_growth, r.management, r.work_life_balance,
              r.interview_experience, r.review_text, r.employer_response,
              r.created_at,
              COALESCE(NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), ''), 'Career18 user') AS reviewer_name
       FROM company_reviews r
       LEFT JOIN user_profiles p ON p.user_id = r.user_id
       WHERE r.company_id = $1 AND r.status = 'approved'
       ORDER BY r.created_at DESC`,
      [req.params.id]
    );
    return sendSuccess(res, result.rows);
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
         FROM (
           SELECT id, title, location, employment_type AS job_type, created_at, status, description
           FROM job_postings
         ) jobs WHERE status = 'active' AND (title ILIKE $1 OR description ILIKE $1)
         LIMIT 5`,
        [pattern]
      ),
      db.query(
        `SELECT id, company_name AS name, logo_url, 'company' AS type
         FROM companies WHERE company_name ILIKE $1 LIMIT 5`,
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
         (SELECT COUNT(*) FROM job_postings WHERE status = 'active') AS active_jobs,
         (SELECT COUNT(*) FROM companies) AS companies,
         (SELECT COUNT(*) FROM users WHERE role = 'candidate') AS candidates,
         (SELECT COUNT(*) FROM users WHERE role = 'employer') AS employers`
    );
    return sendSuccess(res, result.rows[0], 'Platform stats');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
