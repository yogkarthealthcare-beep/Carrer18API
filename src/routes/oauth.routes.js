const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const { generateTokenPair } = require('../utils/jwt');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { sendOTPEmail } = require('../services/email.service');
const { generateOTP, getOTPExpiry } = require('../utils/otp');

/**
 * After OAuth success → issue JWT pair + redirect frontend
 * OTP is also sent after OAuth login (optional extra security layer)
 */
const handleOAuthSuccess = async (req, res) => {
  try {
    const user = req.user;
    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const { accessToken, refreshToken } = generateTokenPair(tokenPayload);

    // Store refresh token
    await db.query(
      `INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
      [uuidv4(), user.id, refreshToken]
    );

    // Send OTP via Gmail after OAuth login (extra verification layer)
    const otp = generateOTP();
    const expiresAt = getOTPExpiry();
    await db.query(
      `INSERT INTO otp_verifications (id, user_id, email, otp_code, type, expires_at, created_at)
       VALUES ($1, $2, $3, $4, 'email_verification', $5, NOW())
       ON CONFLICT DO NOTHING`,
      [uuidv4(), user.id, user.email, otp, expiresAt]
    );

    await sendOTPEmail({
      to: user.email,
      otp,
      type: 'email_verification',
    });

    // Redirect to frontend with tokens in query params
    // Frontend should immediately move tokens to memory/localStorage
    const redirectUrl = new URL(`${process.env.FRONTEND_URL}/auth/oauth-callback`);
    redirectUrl.searchParams.set('accessToken', accessToken);
    redirectUrl.searchParams.set('refreshToken', refreshToken);
    redirectUrl.searchParams.set('role', user.role);

    return res.redirect(redirectUrl.toString());
  } catch (err) {
    const failUrl = `${process.env.FRONTEND_URL}/auth/login?error=oauth_failed`;
    return res.redirect(failUrl);
  }
};

const handleOAuthFailure = (req, res) => {
  return res.redirect(`${process.env.FRONTEND_URL}/auth/login?error=oauth_cancelled`);
};

// ─── Google OAuth ──────────────────────────────────────────────────────────
// Initiate: GET /api/v1/auth/google?role=candidate  OR  ?role=employer
router.get('/google', (req, res, next) => {
  const role = req.query.role || 'candidate';
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: role,   // pass role to callback via state
    prompt: 'select_account',
  })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/v1/auth/google/fail' }),
  handleOAuthSuccess
);

router.get('/google/fail', handleOAuthFailure);

// ─── LinkedIn OAuth ────────────────────────────────────────────────────────
// Initiate: GET /api/v1/auth/linkedin?role=employer
router.get('/linkedin', (req, res, next) => {
  const role = req.query.role || 'candidate';
  passport.authenticate('linkedin', {
    state: role,
  })(req, res, next);
});

router.get(
  '/linkedin/callback',
  passport.authenticate('linkedin', { session: false, failureRedirect: '/api/v1/auth/linkedin/fail' }),
  handleOAuthSuccess
);

router.get('/linkedin/fail', handleOAuthFailure);

module.exports = router;
