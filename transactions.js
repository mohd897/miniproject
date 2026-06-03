const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const txController = require('../controllers/transactionController');
const { protect } = require('../middleware/auth');
const { transactionLimiter, otpLimiter } = require('../middleware/rateLimiter');

router.use(protect);

// ── Step 1: Initiate ──────────────────────────────────────
router.post('/initiate', transactionLimiter, [
  body('recipientAddress').notEmpty().withMessage('Recipient address required'),
  body('amount').isFloat({ min: 0.000001 }).withMessage('Invalid amount'),
  body('note').optional().isLength({ max: 200 }),
], txController.initiateTransaction);

// ── Step 2: Verify transaction password ──────────────────
router.post('/:requestId/verify-tx-password', otpLimiter, [
  param('requestId').isMongoId(),
  body('transactionPassword').notEmpty(),
], txController.verifyTransactionPassword);

// ── Step 3: Submit OTP and execute ───────────────────────
router.post('/:requestId/confirm', [
  param('requestId').isMongoId(),
  body('code').isLength({ min: 6, max: 6 }).isNumeric(),
], txController.confirmTransaction);

// ── History & Analytics ───────────────────────────────────
router.get('/', txController.getTransactions);
router.get('/analytics', txController.getAnalytics);
router.get('/:id', param('id').isMongoId(), txController.getTransaction);
router.post('/:id/retry', param('id').isMongoId(), txController.retryTransaction);

module.exports = router;
