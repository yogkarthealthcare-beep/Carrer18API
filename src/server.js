const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const app  = require('./app');
const db   = require('./config/database');

const PORT = process.env.PORT || 3000;

const formatStartupError = (err) => {
  if (err instanceof AggregateError && err.errors?.length) {
    return [
      err.stack || err.message,
      ...err.errors.map((innerErr) => innerErr.stack || innerErr.message || String(innerErr)),
    ].join('\n');
  }

  return err.stack || err.message || String(err);
};

const startServer = async () => {
  try {
    await db.query('SELECT 1');
    console.log('✅ Database connected');

    app.listen(PORT, () => {
      console.log(`\n🚀 Careers18 API  →  http://localhost:${PORT}`);
      console.log(`📋 Environment   : ${process.env.NODE_ENV || 'development'}`);
      console.log(`\n━━━ AUTH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  POST   /api/v1/auth/register`);
      console.log(`  POST   /api/v1/auth/verify-email`);
      console.log(`  POST   /api/v1/auth/login`);
      console.log(`  POST   /api/v1/auth/refresh-token`);
      console.log(`  POST   /api/v1/auth/logout           [JWT]`);
      console.log(`  POST   /api/v1/auth/forgot-password`);
      console.log(`  POST   /api/v1/auth/reset-password`);
      console.log(`  GET    /api/v1/auth/me               [JWT]`);
      console.log(`\n━━━ OAUTH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  GET    /api/v1/auth/google?role=candidate`);
      console.log(`  GET    /api/v1/auth/google/callback`);
      console.log(`  GET    /api/v1/auth/linkedin?role=employer`);
      console.log(`  GET    /api/v1/auth/linkedin/callback`);
      console.log(`\n━━━ PUBLIC (No Auth) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  GET    /api/v1/public/jobs`);
      console.log(`  GET    /api/v1/public/jobs/:id`);
      console.log(`  GET    /api/v1/public/companies`);
      console.log(`  GET    /api/v1/public/companies/:id`);
      console.log(`  GET    /api/v1/public/search?q=`);
      console.log(`  GET    /api/v1/public/stats`);
      console.log(`\n━━━ MASTER DATA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  GET    /api/v1/master/industries`);
      console.log(`  GET    /api/v1/master/job-categories`);
      console.log(`  GET    /api/v1/master/skills`);
      console.log(`  GET    /api/v1/master/skills/categories`);
      console.log(`\n━━━ EMPLOYEE PANEL [JWT + role=candidate] ━━━━━━━━━━━━`);
      console.log(`  GET    /api/v1/employee/dashboard`);
      console.log(`  GET    /api/v1/employee/profile`);
      console.log(`  PUT    /api/v1/employee/profile`);
      console.log(`  GET/POST/DELETE /api/v1/employee/skills`);
      console.log(`  GET/POST/PUT/DELETE /api/v1/employee/experience`);
      console.log(`  GET/POST /api/v1/employee/education`);
      console.log(`  GET    /api/v1/employee/applications`);
      console.log(`  POST   /api/v1/employee/apply/:jobId`);
      console.log(`  GET/POST/DELETE /api/v1/employee/saved-jobs`);
      console.log(`\n━━━ EMPLOYER PANEL [JWT + role=employer] ━━━━━━━━━━━━━`);
      console.log(`  GET    /api/v1/employer/dashboard`);
      console.log(`  GET/POST/PUT /api/v1/employer/company`);
      console.log(`  GET/POST/PUT/DELETE /api/v1/employer/jobs`);
      console.log(`  GET    /api/v1/employer/applications`);
      console.log(`  PATCH  /api/v1/employer/applications/:id/status`);
      console.log(`  GET    /api/v1/employer/candidates/search`);
      console.log(`\n━━━ PAYMENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  GET    /api/v1/payments/plans`);
      console.log(`  POST   /api/v1/payments/initiate      [JWT]`);
      console.log(`  POST   /api/v1/payments/callback      ← ALL gateways`);
      console.log(`  GET    /api/v1/payments/verify/:id    [JWT]`);
      console.log(`  GET    /api/v1/payments/history       [JWT]`);
      console.log(`  GET    /api/v1/payments/wallet        [JWT]`);
      console.log(`  GET    /api/v1/payments/subscription  [JWT]`);
      console.log(`\n  Callback URL (same for all):`);
      console.log(`  POST   ${process.env.PAYMENT_CALLBACK_URL}?gateway=<razorpay|paytm|ccavenue|freecash|payu>`);
    });
  } catch (err) {
    console.error(formatStartupError(err));
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();
