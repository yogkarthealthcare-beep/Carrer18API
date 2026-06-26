/**
 * Generate a 6-digit numeric OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Get OTP expiry date (default: 10 minutes from now)
 */
const getOTPExpiry = (minutes = null) => {
  const expiry = parseInt(process.env.OTP_EXPIRY_MINUTES) || minutes || 10;
  return new Date(Date.now() + expiry * 60 * 1000);
};

module.exports = { generateOTP, getOTPExpiry };
