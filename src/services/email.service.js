const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
};

/**
 * Send OTP email
 */
const sendOTPEmail = async ({ to, otp, type = 'verification', name = '' }) => {
  const subjects = {
    email_verification: 'Verify your Careers18 account',
    password_reset: 'Reset your Careers18 password',
    phone_verification: 'Your Careers18 OTP',
  };

  const subject = subjects[type] || 'Your Careers18 OTP';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:32px;background:#f9f9f9;border-radius:8px;">
      <h2 style="color:#1a1a2e;margin-bottom:8px;">Careers18</h2>
      <p style="color:#444;">Hello ${name || 'there'},</p>
      <p style="color:#444;">Your OTP for <b>${type.replace('_', ' ')}</b> is:</p>
      <div style="background:#fff;border:2px dashed #4f46e5;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
        <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#4f46e5;">${otp}</span>
      </div>
      <p style="color:#888;font-size:13px;">This OTP is valid for <b>${process.env.OTP_EXPIRY_MINUTES || 10} minutes</b>. Do not share it with anyone.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
      <p style="color:#bbb;font-size:11px;">If you did not request this, ignore this email. — Careers18 Team</p>
    </div>
  `;

  if (process.env.NODE_ENV === 'development') {
    console.log(`\n[EMAIL OTP] To: ${to} | OTP: ${otp} | Type: ${type}\n`);
    return { messageId: 'dev-mode' };
  }

  const info = await getTransporter().sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to,
    subject,
    html,
  });

  return info;
};

/**
 * Send welcome email after registration
 */
const sendWelcomeEmail = async ({ to, name, role }) => {
  const roleLabel = role === 'employer' ? 'Employer' : 'Job Seeker';

  if (process.env.NODE_ENV === 'development') {
    console.log(`[EMAIL WELCOME] To: ${to} | Role: ${roleLabel}`);
    return;
  }

  await getTransporter().sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to,
    subject: `Welcome to Careers18, ${name || roleLabel}!`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:32px;">
        <h2>Welcome to Careers18! 🎉</h2>
        <p>Hi ${name || 'there'}, your account as <b>${roleLabel}</b> is ready.</p>
        <p>Start exploring opportunities at <a href="${process.env.FRONTEND_URL}">careers18.com</a></p>
      </div>
    `,
  });
};

/**
 * Send payment confirmation email
 */
const sendPaymentConfirmationEmail = async ({ to, name, amount, orderId, plan, gateway }) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[EMAIL PAYMENT] To: ${to} | Order: ${orderId} | ₹${amount}`);
    return;
  }

  await getTransporter().sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to,
    subject: `Payment Confirmed — Order #${orderId}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:32px;">
        <h2 style="color:#16a34a;">Payment Successful ✅</h2>
        <p>Hi ${name || 'there'},</p>
        <p>Your payment for <b>${plan}</b> plan has been confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;color:#666;">Order ID</td><td style="padding:8px;font-weight:bold;">${orderId}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">Amount</td><td style="padding:8px;font-weight:bold;">₹${amount}</td></tr>
          <tr><td style="padding:8px;color:#666;">Gateway</td><td style="padding:8px;">${gateway}</td></tr>
        </table>
        <p style="color:#888;font-size:12px;">Keep this email for your records.</p>
      </div>
    `,
  });
};

module.exports = { sendOTPEmail, sendWelcomeEmail, sendPaymentConfirmationEmail };
