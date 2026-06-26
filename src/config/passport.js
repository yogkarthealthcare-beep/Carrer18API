const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

/**
 * Find or create user from OAuth profile
 */
const findOrCreateOAuthUser = async ({ provider, providerId, email, name, avatar, role }) => {
  // 1. Check if oauth_accounts record exists
  const existing = await db.query(
    `SELECT u.id, u.email, u.role, u.status
     FROM oauth_accounts oa
     JOIN users u ON u.id = oa.user_id
     WHERE oa.provider = $1 AND oa.provider_id = $2`,
    [provider, providerId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // 2. Check if user with same email exists
  const byEmail = await db.query(
    `SELECT id, email, role, status FROM users WHERE email = $1`,
    [email]
  );

  let userId;

  if (byEmail.rows.length > 0) {
    userId = byEmail.rows[0].id;
    // Link this OAuth provider to existing account
    await db.query(
      `INSERT INTO oauth_accounts (id, user_id, provider, provider_id, avatar, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (provider, provider_id) DO NOTHING`,
      [uuidv4(), userId, provider, providerId, avatar]
    );
    // Mark email verified since OAuth provider confirmed it
    await db.query(
      `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
    return byEmail.rows[0];
  }

  // 3. Create new user
  userId = uuidv4();
  const [firstName, ...rest] = (name || '').split(' ');
  const lastName = rest.join(' ');

  await db.query(
    `INSERT INTO users (id, email, password_hash, role, status, email_verified, created_at, updated_at)
     VALUES ($1, $2, '', $3, 'active', true, NOW(), NOW())`,
    [userId, email, role || 'candidate']
  );

  await db.query(
    `INSERT INTO oauth_accounts (id, user_id, provider, provider_id, avatar, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [uuidv4(), userId, provider, providerId, avatar]
  );

  // Create basic profile stub
  await db.query(
    `INSERT INTO user_profiles (id, user_id, first_name, last_name, avatar_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [uuidv4(), userId, firstName || '', lastName || '', avatar || '']
  );

  return { id: userId, email, role: role || 'candidate', status: 'active' };
};

// ─── Google Strategy ──────────────────────────────────────────────────────
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('No email from Google'), null);

        const role = req.query.state || 'candidate'; // pass role via state param

        const user = await findOrCreateOAuthUser({
          provider: 'google',
          providerId: profile.id,
          email,
          name: profile.displayName,
          avatar: profile.photos?.[0]?.value,
          role,
        });

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// ─── LinkedIn Strategy ────────────────────────────────────────────────────
passport.use(
  new LinkedInStrategy(
    {
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL: process.env.LINKEDIN_CALLBACK_URL,
      scope: ['r_emailaddress', 'r_liteprofile'],
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('No email from LinkedIn'), null);

        const role = req.query.state || 'candidate';

        const user = await findOrCreateOAuthUser({
          provider: 'linkedin',
          providerId: profile.id,
          email,
          name: profile.displayName,
          avatar: profile.photos?.[0]?.value,
          role,
        });

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
