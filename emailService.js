const nodemailer = require('nodemailer');
const logger = require('./logger');

// ── Transporter ───────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: false, // TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Base HTML template ────────────────────────────────────
const baseTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>CryptoVault</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; background: #0d0d0d; color: #e0e0e0; }
    .container { max-width: 560px; margin: 40px auto; background: #1a1a2e; border-radius: 16px; overflow: hidden; border: 1px solid #2d2d4e; }
    .header { background: linear-gradient(135deg, #7c3aed, #2563eb); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #fff; font-size: 24px; letter-spacing: 2px; }
    .header p { margin: 4px 0 0; color: rgba(255,255,255,0.7); font-size: 13px; }
    .body { padding: 32px 40px; }
    .otp-box { background: #0d0d0d; border: 2px solid #7c3aed; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp { font-size: 42px; font-weight: 700; letter-spacing: 12px; color: #7c3aed; font-family: monospace; }
    .footer { background: #111; padding: 20px 40px; text-align: center; font-size: 12px; color: #666; }
    .btn { display: inline-block; background: linear-gradient(135deg, #7c3aed, #2563eb); color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .warning { background: rgba(239,68,68,0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 12px 16px; color: #fca5a5; font-size: 13px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 CryptoVault</h1>
      <p>Secure Crypto Transactions</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© 2024 CryptoVault. All rights reserved.</p>
      <p>If you did not initiate this, please secure your account immediately.</p>
    </div>
  </div>
</body>
</html>`;

// ── Email senders ─────────────────────────────────────────

const sendVerificationEmail = async (to, token, username) => {
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  const content = `
    <h2 style="color:#e0e0e0;">Welcome, ${username}! 👋</h2>
    <p>Thanks for signing up with CryptoVault. Please verify your email address to activate your account.</p>
    <div style="text-align:center;">
      <a href="${verifyUrl}" class="btn">Verify Email Address</a>
    </div>
    <p style="font-size:13px;color:#888;">This link expires in <strong>24 hours</strong>. If you didn't sign up, ignore this email.</p>
  `;
  await sendMail(to, '✅ Verify Your CryptoVault Email', content);
};

const sendTransactionOTP = async (to, code, txDetails) => {
  const content = `
    <h2 style="color:#e0e0e0;">Transaction Verification Code</h2>
    <p>You're about to send <strong style="color:#7c3aed;">${txDetails.amount} SOL</strong> to:</p>
    <p style="font-family:monospace;background:#0d0d0d;padding:10px;border-radius:8px;word-break:break-all;">${txDetails.receiverWallet}</p>
    <p>Your 6-digit verification code is:</p>
    <div class="otp-box"><span class="otp">${code}</span></div>
    <div class="warning">⚠️ This code expires in <strong>60 seconds</strong> and is single-use only. Never share this code with anyone.</div>
  `;
  await sendMail(to, '🔑 CryptoVault Transaction OTP', content);
};

const sendPasswordResetEmail = async (to, token, username) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  const content = `
    <h2 style="color:#e0e0e0;">Reset Your Password</h2>
    <p>Hi ${username}, we received a request to reset your password.</p>
    <div style="text-align:center;">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </div>
    <p style="font-size:13px;color:#888;">This link expires in <strong>10 minutes</strong>. If you didn't request this, please secure your account.</p>
  `;
  await sendMail(to, '🔓 CryptoVault Password Reset', content);
};

const sendSecurityAlert = async (to, username, action, details) => {
  const content = `
    <h2 style="color:#ef4444;">🚨 Security Alert</h2>
    <p>Hi ${username}, we detected the following activity on your account:</p>
    <p><strong>Action:</strong> ${action}</p>
    <p><strong>Details:</strong> ${details}</p>
    <div class="warning">If this wasn't you, please immediately change your password and contact support.</div>
  `;
  await sendMail(to, '🚨 CryptoVault Security Alert', content);
};

const sendTransactionConfirmation = async (to, username, txDetails) => {
  const content = `
    <h2 style="color:#e0e0e0;">Transaction ${txDetails.status === 'completed' ? '✅ Confirmed' : '❌ Failed'}</h2>
    <p>Hi ${username}, your transaction has been ${txDetails.status}.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;color:#888;">Amount</td><td style="padding:8px;color:#7c3aed;font-weight:700;">${txDetails.amount} SOL</td></tr>
      <tr><td style="padding:8px;color:#888;">To</td><td style="padding:8px;font-family:monospace;font-size:12px;">${txDetails.receiverWallet}</td></tr>
      <tr><td style="padding:8px;color:#888;">TX Hash</td><td style="padding:8px;font-family:monospace;font-size:12px;">${txDetails.txHash || 'Pending'}</td></tr>
      <tr><td style="padding:8px;color:#888;">Status</td><td style="padding:8px;color:${txDetails.status === 'completed' ? '#22c55e' : '#ef4444'};font-weight:700;">${txDetails.status.toUpperCase()}</td></tr>
    </table>
  `;
  await sendMail(to, `CryptoVault Transaction ${txDetails.status === 'completed' ? 'Confirmed' : 'Failed'}`, content);
};

// ── Core send function ────────────────────────────────────
const sendMail = async (to, subject, htmlContent) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html: baseTemplate(htmlContent),
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    logger.error(`Email send failed to ${to}: ${error.message}`);
    // Don't throw — email failure shouldn't crash the request
  }
};

module.exports = {
  sendVerificationEmail,
  sendTransactionOTP,
  sendPasswordResetEmail,
  sendSecurityAlert,
  sendTransactionConfirmation,
  sendMail,
};
