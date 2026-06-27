const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { generateTokenPair, verifyRefreshToken } = require('../utils/jwt');
const { generateOTP, getOTPExpiry } = require('../utils/otp');
const { sendOTPEmail, sendWelcomeEmail } = require('./email.service');

const SALT_ROUNDS = 12;

const generatedPhone = () => `C18${Date.now().toString().slice(-12)}${Math.floor(Math.random() * 1000)}`;
const tokenDigest = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Register a new user
 */
const register = async ({ email, password, role = 'candidate' }) => {
  // Check if email already exists
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const id = uuidv4();

  const result = await db.query(
    `INSERT INTO users (id, email, phone, password_hash, role, status, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', false, NOW(), NOW())
     RETURNING id, email, role, status, email_verified, created_at`,
    [id, email, generatedPhone(), passwordHash, role]
  );

  const user = result.rows[0];

  // Generate email OTP for verification
  const otp = generateOTP();
  const expiresAt = getOTPExpiry();

  await db.query(
    `INSERT INTO otp_verifications (id, user_id, otp_code, purpose, expires_at, created_at)
     VALUES ($1, $2, $3, 'email_verification', $4, NOW())`,
    [uuidv4(), user.id, otp, expiresAt]
  );

  await sendOTPEmail({ to: email, otp, type: 'email_verification' });
  sendWelcomeEmail({ to: email, role }).catch((err) => {
    console.error('[EMAIL WELCOME FAILED]', err.message);
  });

  return {
    user: { id: user.id, email: user.email, role: user.role },
    message: 'Registration successful. Check your email for OTP verification.',
  };
};

/**
 * Verify email with OTP
 */
const verifyEmail = async ({ email, otp }) => {
  const result = await db.query(
    `SELECT v.id, v.user_id, v.otp_code, v.expires_at, v.is_used
     FROM otp_verifications v
     JOIN users u ON u.id = v.user_id
     WHERE u.email = $1 AND v.purpose = 'email_verification' AND v.is_used = false
     ORDER BY v.created_at DESC LIMIT 1`,
    [email]
  );

  if (result.rows.length === 0) {
    const err = new Error('OTP not found or already used');
    err.statusCode = 400;
    throw err;
  }

  const record = result.rows[0];

  if (new Date() > new Date(record.expires_at)) {
    const err = new Error('OTP expired. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }

  if (record.otp_code !== otp) {
    const err = new Error('Invalid OTP');
    err.statusCode = 400;
    throw err;
  }

  // Mark OTP as used and verify email
  await db.query(`UPDATE otp_verifications SET is_used = true WHERE id = $1`, [record.id]);
  await db.query(
    `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`,
    [record.user_id]
  );

  return { message: 'Email verified successfully' };
};

/**
 * Login with email + password
 */
const login = async ({ email, password }) => {
  const result = await db.query(
    `SELECT id, email, password_hash, role, status, email_verified
     FROM users WHERE email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    const err = new Error('Account suspended. Contact support.');
    err.statusCode = 403;
    throw err;
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const tokenPayload = { id: user.id, email: user.email, role: user.role };
  const { accessToken, refreshToken } = generateTokenPair(tokenPayload);

  // Store refresh token in DB
  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
    [uuidv4(), user.id, tokenDigest(refreshToken)]
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
    },
  };
};

/**
 * Refresh token rotation — invalidate old, issue new pair
 */
const refreshTokens = async (token) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  // Check if token exists in DB (not revoked)
  const existing = await db.query(
    `SELECT id, user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()`,
    [tokenDigest(token)]
  );

  if (existing.rows.length === 0) {
    const err = new Error('Refresh token revoked or expired');
    err.statusCode = 401;
    throw err;
  }

  // Get fresh user data
  const userResult = await db.query(
    `SELECT id, email, role, status FROM users WHERE id = $1`,
    [decoded.id]
  );

  if (userResult.rows.length === 0 || userResult.rows[0].status !== 'active') {
    const err = new Error('User not found or suspended');
    err.statusCode = 401;
    throw err;
  }

  const user = userResult.rows[0];

  // Delete old refresh token (rotation)
  await db.query(`UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`, [tokenDigest(token)]);

  // Issue new token pair
  const tokenPayload = { id: user.id, email: user.email, role: user.role };
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(tokenPayload);

  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
    [uuidv4(), user.id, tokenDigest(newRefreshToken)]
  );

  return { accessToken, refreshToken: newRefreshToken };
};

/**
 * Logout — delete refresh token from DB
 */
const logout = async (token) => {
  await db.query(`UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`, [tokenDigest(token)]);
  return { message: 'Logged out successfully' };
};

/**
 * Forgot password — send OTP
 */
const forgotPassword = async ({ email }) => {
  const result = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);

  // Always return success (don't reveal if email exists)
  if (result.rows.length === 0) {
    return { message: 'If this email exists, an OTP has been sent.' };
  }

  const user = result.rows[0];
  const otp = generateOTP();
  const expiresAt = getOTPExpiry();

  // Invalidate existing OTPs
  await db.query(
    `UPDATE otp_verifications SET is_used = true
     WHERE user_id = $1 AND purpose = 'password_reset' AND is_used = false`,
    [user.id]
  );

  await db.query(
    `INSERT INTO otp_verifications (id, user_id, otp_code, purpose, expires_at, created_at)
     VALUES ($1, $2, $3, 'password_reset', $4, NOW())`,
    [uuidv4(), user.id, otp, expiresAt]
  );

  await sendOTPEmail({ to: email, otp, type: 'password_reset' });

  return { message: 'If this email exists, an OTP has been sent.' };
};

/**
 * Reset password with OTP
 */
const resetPassword = async ({ email, otp, newPassword }) => {
  const result = await db.query(
    `SELECT v.id, v.user_id, v.otp_code, v.expires_at
     FROM otp_verifications v
     JOIN users u ON u.id = v.user_id
     WHERE u.email = $1 AND v.purpose = 'password_reset' AND v.is_used = false
     ORDER BY v.created_at DESC LIMIT 1`,
    [email]
  );

  if (result.rows.length === 0) {
    const err = new Error('OTP not found or already used');
    err.statusCode = 400;
    throw err;
  }

  const record = result.rows[0];

  if (new Date() > new Date(record.expires_at)) {
    const err = new Error('OTP expired. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }

  if (record.otp_code !== otp) {
    const err = new Error('Invalid OTP');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await db.query(`UPDATE otp_verifications SET is_used = true WHERE id = $1`, [record.id]);
  await db.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, record.user_id]
  );

  // Revoke all refresh tokens for this user (security)
  await db.query(`UPDATE refresh_tokens SET revoked = true WHERE user_id = $1`, [record.user_id]);

  return { message: 'Password reset successful. Please login.' };
};

/**
 * Get current user profile
 */
const getMe = async (userId) => {
  const result = await db.query(
    `SELECT id, email, role, status, email_verified, phone, preferred_language, created_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
};

module.exports = {
  register,
  verifyEmail,
  login,
  refreshTokens,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
};
