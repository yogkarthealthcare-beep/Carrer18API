const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');

// GET /api/v1/master/industries
router.get('/industries', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, display_order
       FROM industries WHERE is_active = true
       ORDER BY display_order ASC`
    );
    return sendSuccess(res, result.rows, 'Industries fetched');
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/master/job-categories
router.get('/job-categories', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, display_order
       FROM job_categories WHERE is_active = true
       ORDER BY display_order ASC`
    );
    return sendSuccess(res, result.rows, 'Job categories fetched');
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/master/skills?category=Programming+Language&search=react
router.get('/skills', async (req, res, next) => {
  try {
    const { category, search } = req.query;
    let query = `SELECT id, name, category FROM skills WHERE is_active = true`;
    const params = [];

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND name ILIKE $${params.length}`;
    }

    query += ` ORDER BY name ASC`;

    const result = await db.query(query, params);
    return sendSuccess(res, result.rows, 'Skills fetched');
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/master/skills/categories — unique skill categories
router.get('/skills/categories', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT category FROM skills WHERE is_active = true ORDER BY category ASC`
    );
    return sendSuccess(res, result.rows.map((r) => r.category), 'Skill categories fetched');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
