const nodemailer = require('nodemailer');

let transporter = null;

const mailFrom = () => {
  const fromName = process.env.FROM_NAME || 'Careers18';
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || process.env.BREVO_SMTP_LOGIN;
  return `"${fromName}" <${fromEmail}>`;
};

const getTransporter = () => {
  if (transporter) return transporter;

  const smtpHost = process.env.SMTP_HOST || process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || process.env.BREVO_SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER || process.env.BREVO_SMTP_LOGIN || process.env.GMAIL_USER;
  const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.BREVO_SMTP_KEY || process.env.GMAIL_APP_PASSWORD;

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP credentials are not configured');
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  return transporter;
};

const shouldLogOnly = () => process.env.NODE_ENV === 'development' && process.env.SMTP_SEND_IN_DEV !== 'true';

const sendMail = async ({ to, subject, html }) => {
  if (!to) return null;
  return getTransporter().sendMail({
    from: mailFrom(),
    to,
    subject,
    html,
  });
};

const sendOTPEmail = async ({ to, otp, type = 'verification', name = '' }) => {
  const subjects = {
    email_verification: 'Verify your Careers18 account',
    password_reset: 'Reset your Careers18 password',
    phone_verification: 'Your Careers18 OTP',
    verification: 'Your Careers18 OTP',
  };

  const subject = subjects[type] || 'Your Careers18 OTP';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;background:#f8fafc;border-radius:12px;">
      <h2 style="color:#0b1437;margin:0 0 8px;">Careers18</h2>
      <p style="color:#334155;">Hello ${name || 'there'},</p>
      <p style="color:#334155;">Your OTP for <b>${String(type).replace('_', ' ')}</b> is:</p>
      <div style="background:#ffffff;border:2px dashed #f97316;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
        <span style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#f97316;">${otp}</span>
      </div>
      <p style="color:#64748b;font-size:13px;">This OTP is valid for <b>${process.env.OTP_EXPIRY_MINUTES || 10} minutes</b>. Do not share it with anyone.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
      <p style="color:#94a3b8;font-size:11px;">If you did not request this, ignore this email. - Careers18 Team</p>
    </div>
  `;

  if (shouldLogOnly()) {
    console.log(`\n[EMAIL OTP] To: ${to} | OTP: ${otp} | Type: ${type}\n`);
    return { messageId: 'dev-mode' };
  }

  return sendMail({ to, subject, html });
};

const sendWelcomeEmail = async ({ to, name, role }) => {
  const roleLabel = role === 'employer' ? 'Employer' : 'Employee';

  if (shouldLogOnly()) {
    console.log(`[EMAIL WELCOME] To: ${to} | Role: ${roleLabel}`);
    return { messageId: 'dev-mode' };
  }

  return sendMail({
    to,
    subject: `Welcome to Careers18, ${name || roleLabel}!`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;">
        <h2>Welcome to Careers18</h2>
        <p>Hi ${name || 'there'}, your account as <b>${roleLabel}</b> is ready.</p>
        <p>Start exploring opportunities at <a href="${process.env.FRONTEND_URL}">Careers18</a>.</p>
      </div>
    `,
  });
};

const sendPaymentConfirmationEmail = async ({ to, name, amount, orderId, plan, gateway }) => {
  if (shouldLogOnly()) {
    console.log(`[EMAIL PAYMENT] To: ${to} | Order: ${orderId} | INR ${amount}`);
    return { messageId: 'dev-mode' };
  }

  return sendMail({
    to,
    subject: `Payment Confirmed - Order #${orderId}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;">
        <h2 style="color:#16a34a;">Payment Successful</h2>
        <p>Hi ${name || 'there'},</p>
        <p>Your payment for <b>${plan}</b> has been confirmed.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;color:#666;">Order ID</td><td style="padding:8px;font-weight:bold;">${orderId}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">Amount</td><td style="padding:8px;font-weight:bold;">INR ${amount}</td></tr>
          <tr><td style="padding:8px;color:#666;">Gateway</td><td style="padding:8px;">${gateway}</td></tr>
        </table>
        <p style="color:#888;font-size:12px;">Keep this email for your records.</p>
      </div>
    `,
  });
};

module.exports = { sendOTPEmail, sendWelcomeEmail, sendPaymentConfirmationEmail, sendMail };
