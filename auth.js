const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// ── Validation helpers ─────────────────────────────────────
const validateRegister = [
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('fullName').trim().notEmpty(),
];

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

// ── Public routes ──────────────────────────────────────────
router.post('/simple-login', authLimiter, authController.simpleLogin);
router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login', authLimiter, validateLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/forgot-password', authLimiter, body('email').isEmail(), authController.forgotPassword);
router.post('/reset-password/:token', body('password').isLength({ min: 8 }), authController.resetPassword);

// ── Protected routes ───────────────────────────────────────
router.use(protect);
router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.post('/set-transaction-password',
  body('transactionPassword').isLength({ min: 6 }),
  authController.setTransactionPassword
);
router.get('/sessions', authController.getSessions);
router.delete('/sessions/:sessionId', param('sessionId').isMongoId(), authController.revokeSession);

module.exports = router;
