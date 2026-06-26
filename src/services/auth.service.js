const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { generateTokenPair, verifyRefreshToken } = require('../utils/jwt');
const { generateOTP, getOTPExpiry } = require('../utils/otp');

const SALT_ROUNDS = 12;

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
    `INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', false, NOW(), NOW())
     RETURNING id, email, role, status, email_verified, created_at`,
    [id, email, passwordHash, role]
  );

  const user = result.rows[0];

  // Generate email OTP for verification
  const otp = generateOTP();
  const expiresAt = getOTPExpiry();

  await db.query(
    `INSERT INTO otp_verifications (id, user_id, email, otp_code, type, expires_at, created_at)
     VALUES ($1, $2, $3, $4, 'email_verification', $5, NOW())`,
    [uuidv4(), user.id, email, otp, expiresAt]
  );

  // TODO: Send OTP via email (AWS SES / Nodemailer)
  console.log(`[OTP] Email verification OTP for ${email}: ${otp}`);

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
    `SELECT id, user_id, otp_code, expires_at, used
     FROM otp_verifications
     WHERE email = $1 AND type = 'email_verification' AND used = false
     ORDER BY created_at DESC LIMIT 1`,
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
  await db.query(`UPDATE otp_verifications SET used = true WHERE id = $1`, [record.id]);
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
    `INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
    [uuidv4(), user.id, refreshToken]
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
    `SELECT id, user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()`,
    [token]
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
  await db.query(`DELETE FROM refresh_tokens WHERE token = $1`, [token]);

  // Issue new token pair
  const tokenPayload = { id: user.id, email: user.email, role: user.role };
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(tokenPayload);

  await db.query(
    `INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
    [uuidv4(), user.id, newRefreshToken]
  );

  return { accessToken, refreshToken: newRefreshToken };
};

/**
 * Logout — delete refresh token from DB
 */
const logout = async (token) => {
  await db.query(`DELETE FROM refresh_tokens WHERE token = $1`, [token]);
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
    `UPDATE otp_verifications SET used = true
     WHERE user_id = $1 AND type = 'password_reset' AND used = false`,
    [user.id]
  );

  await db.query(
    `INSERT INTO otp_verifications (id, user_id, email, otp_code, type, expires_at, created_at)
     VALUES ($1, $2, $3, $4, 'password_reset', $5, NOW())`,
    [uuidv4(), user.id, email, otp, expiresAt]
  );

  // TODO: Send OTP via email
  console.log(`[OTP] Password reset OTP for ${email}: ${otp}`);

  return { message: 'If this email exists, an OTP has been sent.' };
};

/**
 * Reset password with OTP
 */
const resetPassword = async ({ email, otp, newPassword }) => {
  const result = await db.query(
    `SELECT v.id, v.user_id, v.otp_code, v.expires_at
     FROM otp_verifications v
     WHERE v.email = $1 AND v.type = 'password_reset' AND v.used = false
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

  await db.query(`UPDATE otp_verifications SET used = true WHERE id = $1`, [record.id]);
  await db.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, record.user_id]
  );

  // Revoke all refresh tokens for this user (security)
  await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [record.user_id]);

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
