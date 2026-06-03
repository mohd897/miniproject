const rateLimit = require('express-rate-limit');
const { sendTooManyRequests } = require('../utils/apiResponse');

// ── General API rate limiter ──────────────────────────────
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => sendTooManyRequests(res, 'Too many requests, please try again later.'),
});

// ── Strict limiter for auth endpoints ─────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  skipSuccessfulRequests: true, // don't count successful logins
  handler: (req, res) => sendTooManyRequests(res, 'Too many failed attempts. Please wait 15 minutes.'),
});

// ── Transaction limiter ───────────────────────────────────
const transactionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  max: 5,
  handler: (req, res) => sendTooManyRequests(res, 'Transaction rate limit exceeded. Please wait before sending again.'),
});

// ── OTP limiter (very strict) ─────────────────────────────
const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 3,
  handler: (req, res) => sendTooManyRequests(res, 'OTP request limit exceeded. Try again in 1 minute.'),
});

module.exports = { apiLimiter, authLimiter, transactionLimiter, otpLimiter };
