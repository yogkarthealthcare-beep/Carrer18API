const { sendError } = require('../utils/response');

/**
 * Global error handler — catches all unhandled errors
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Validation errors
  if (err.type === 'validation') {
    return sendError(res, err.message, 422, err.errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return sendError(res, 'Invalid or expired token', 401);
  }

  // Database errors
  if (err.code === '23505') {
    // unique violation
    return sendError(res, 'Record already exists', 409);
  }
  if (err.code === '23503') {
    // foreign key violation
    return sendError(res, 'Referenced record not found', 404);
  }

  // Default server error
  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;

  return sendError(res, message, statusCode);
};

/**
 * 404 handler — route not found
 */
const notFound = (req, res) => {
  return sendError(res, `Route ${req.method} ${req.path} not found`, 404);
};

module.exports = { errorHandler, notFound };
