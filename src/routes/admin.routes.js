const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendSuccess } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

const mask = (value) => {
  if (!value) return null;
  if (value.length <= 8) return 'configured';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

router.get('/settings', async (req, res) => {
  return sendSuccess(res, {
    email: {
      provider: 'Brevo SMTP',
      host: process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
      port: process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || '587',
      login: mask(process.env.SMTP_USER || process.env.BREVO_SMTP_LOGIN),
      from_email: process.env.FROM_EMAIL || process.env.SMTP_FROM_EMAIL || null,
      configured: Boolean((process.env.SMTP_USER || process.env.BREVO_SMTP_LOGIN) && (process.env.SMTP_PASSWORD || process.env.BREVO_SMTP_KEY)),
    },
    payments: {
      callback_url: process.env.PAYMENT_CALLBACK_URL,
      success_redirect: process.env.PAYMENT_SUCCESS_REDIRECT,
      failure_redirect: process.env.PAYMENT_FAILURE_REDIRECT,
      razorpay_configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      payu_configured: Boolean(process.env.PAYU_KEY && process.env.PAYU_SALT),
    },
  });
});

router.get('/reviews', async (req, res, next) => {
  try {
    const { status = 'pending' } = req.query;
    const result = await db.query(
      `SELECT r.*, c.company_name AS company_name, u.email AS reviewer_email
       FROM company_reviews r
       JOIN companies c ON c.id = r.company_id
       JOIN users u ON u.id = r.user_id
       WHERE ($1 = 'all' OR r.status = $1)
       ORDER BY r.created_at DESC`,
      [status]
    );
    return sendSuccess(res, result.rows);
  } catch (err) { next(err); }
});

router.patch('/reviews/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    await db.query(
      `UPDATE company_reviews SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, req.params.id]
    );
    return sendSuccess(res, null, 'Review status updated');
  } catch (err) { next(err); }
});

router.delete('/reviews/:id', async (req, res, next) => {
  try {
    await db.query(`DELETE FROM company_reviews WHERE id = $1`, [req.params.id]);
    return sendSuccess(res, null, 'Review removed');
  } catch (err) { next(err); }
});

module.exports = router;
