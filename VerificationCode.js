const mongoose = require('mongoose');

const verificationCodeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    transactionRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionRequest' },

    // ── Code ──────────────────────────────────────────────
    code: { type: String, required: true },               // 6-digit hashed code
    codeHash: { type: String, required: true, select: false }, // bcrypt hash

    type: {
      type: String,
      enum: ['transaction', 'email_verify', 'password_reset', 'login_2fa', 'account_freeze'],
      required: true,
    },

    // ── Expiry & Usage ────────────────────────────────────
    expiresAt: { type: Date, required: true },            // 60-second self-destruct
    isUsed: { type: Boolean, default: false },
    usedAt: { type: Date },

    // ── Attempt tracking ──────────────────────────────────
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    isBlocked: { type: Boolean, default: false },

    // ── Delivery ──────────────────────────────────────────
    deliveredTo: { type: String },    // email/phone
    deliveryMethod: { type: String, enum: ['email', 'sms', 'app'], default: 'email' },

    // ── IP tracking ───────────────────────────────────────
    requestIp: { type: String },
  },
  { timestamps: true }
);

// ── TTL index: MongoDB auto-deletes expired docs ─────────
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationCodeSchema.index({ userId: 1, type: 1 });

module.exports = mongoose.model('VerificationCode', verificationCodeSchema);
