const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('./config/passport');

const authRoutes     = require('./routes/auth.routes');
const oauthRoutes    = require('./routes/oauth.routes');
const masterRoutes   = require('./routes/master.routes');
const publicRoutes   = require('./routes/public.routes');
const employeeRoutes = require('./routes/employee.routes');
const employerRoutes = require('./routes/employer.routes');
const paymentRoutes  = require('./routes/payment.routes');
const { errorHandler, notFound } = require('./middleware/error.middleware');

const app = express();

// Security & Parsing
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true })); // needed for CCAvenue POST callback
app.use(passport.initialize());

if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Careers18 API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    gateways: ['razorpay', 'paytm', 'ccavenue', 'freecash', 'payu'],
  });
});

// Routes
app.use('/api/v1/auth',     authRoutes);
app.use('/api/v1/auth',     oauthRoutes);
app.use('/api/v1/master',   masterRoutes);
app.use('/api/v1/public',   publicRoutes);
app.use('/api/v1/employee', employeeRoutes);
app.use('/api/v1/employer', employerRoutes);
app.use('/api/v1/payments', paymentRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
