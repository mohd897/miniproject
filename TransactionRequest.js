const mongoose = require('mongoose');

const transactionRequestSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderWallet: { type: String, required: true },
    receiverWallet: { type: String, required: true },
    amount: { type: Number, required: true },
    note: { type: String, maxlength: 200 },
    tags: [{ type: String }],

    // ── Status ────────────────────────────────────────────
    status: {
      type: String,
      enum: ['awaiting_tx_password', 'awaiting_verification', 'verified', 'expired', 'cancelled'],
      default: 'awaiting_tx_password',
    },

    // ── Verification ─────────────────────────────────────
    verificationCodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerificationCode' },
    txPasswordVerified: { type: Boolean, default: false },
    codeVerified: { type: Boolean, default: false },

    // ── Security snapshot ─────────────────────────────────
    requestIp: { type: String },
    requestDevice: { type: String },
    riskScore: { type: Number, default: 0 },
    riskFlags: [{ type: String }],
    simulationResult: { type: mongoose.Schema.Types.Mixed },

    // ── Expiry (15 minutes to complete the flow) ──────────
    expiresAt: { type: Date, default: () => new Date(Date.now() + 15 * 60 * 1000) },

    // ── Linked transaction once executed ──────────────────
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  },
  { timestamps: true }
);

transactionRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
transactionRequestSchema.index({ sender: 1, status: 1 });

module.exports = mongoose.model('TransactionRequest', transactionRequestSchema);
