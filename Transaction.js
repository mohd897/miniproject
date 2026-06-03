const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    // ── Parties ───────────────────────────────────────────
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    senderWallet: { type: String, required: true },    // public key
    receiverWallet: { type: String, required: true },  // public key

    // ── Amount ────────────────────────────────────────────
    amount: { type: Number, required: true, min: 0.000001 }, // in SOL
    amountLamports: { type: Number },                         // raw lamports
    amountUSD: { type: Number, default: 0 },                  // USD at tx time
    networkFee: { type: Number, default: 0 },                 // SOL fee
    networkFeeUSD: { type: Number, default: 0 },

    // ── Blockchain ────────────────────────────────────────
    txHash: { type: String, unique: true, sparse: true },     // Solana signature
    blockHeight: { type: Number },
    confirmations: { type: Number, default: 0 },
    slot: { type: Number },

    // ── Status ────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'verifying', 'processing', 'completed', 'failed', 'cancelled', 'frozen'],
      default: 'pending',
      index: true,
    },
    statusHistory: [
      {
        status: String,
        timestamp: { type: Date, default: Date.now },
        note: String,
      },
    ],

    // ── Security Metadata ─────────────────────────────────
    senderIp: { type: String },
    senderDevice: { type: String },
    senderUserAgent: { type: String },
    verificationCodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerificationCode' },

    // ── AI / Risk ─────────────────────────────────────────
    riskScore: { type: Number, default: 0, min: 0, max: 100 }, // 0-100
    riskFlags: [{ type: String }],   // e.g. ['high_amount', 'new_recipient', 'unusual_time']
    isFlagged: { type: Boolean, default: false },
    flagReason: { type: String },
    trustScoreBefore: { type: Number },
    trustScoreAfter: { type: Number },

    // ── Smart Tags ────────────────────────────────────────
    tags: [{ type: String }],        // e.g. ['investment', 'personal', 'business']
    note: { type: String, maxlength: 200 },

    // ── Simulation ────────────────────────────────────────
    simulationPassed: { type: Boolean, default: false },
    simulationResult: { type: mongoose.Schema.Types.Mixed },

    // ── Retry ─────────────────────────────────────────────
    retryCount: { type: Number, default: 0 },
    lastRetryAt: { type: Date },
    maxRetries: { type: Number, default: 3 },

    // ── Completion ────────────────────────────────────────
    completedAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// ── Virtual: canRetry ─────────────────────────────────────
transactionSchema.virtual('canRetry').get(function () {
  return this.status === 'failed' && this.retryCount < this.maxRetries;
});

// ── Compound indexes for analytics ───────────────────────
transactionSchema.index({ sender: 1, createdAt: -1 });
transactionSchema.index({ receiver: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ isFlagged: 1 });
transactionSchema.index({ riskScore: -1 });
transactionSchema.index({ txHash: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
