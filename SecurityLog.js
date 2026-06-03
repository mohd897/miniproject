const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    action: {
      type: String,
      enum: [
        'login_success', 'login_failed', 'logout',
        'password_change', 'tx_password_set', 'tx_password_change',
        'email_verified', 'password_reset_requested', 'password_reset_done',
        'account_frozen', 'account_unfrozen',
        'transaction_flagged', 'transaction_blocked',
        'verification_code_sent', 'verification_code_used', 'verification_code_failed',
        'session_revoked', 'suspicious_activity',
        '2fa_enabled', '2fa_disabled',
        'admin_action',
      ],
      required: true,
    },

    // ── Context ───────────────────────────────────────────
    description: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },  // extra JSON context
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
    },

    // ── Request Info ──────────────────────────────────────
    ipAddress: { type: String },
    userAgent: { type: String },
    country: { type: String },
    deviceId: { type: String },

    // ── Resolved ──────────────────────────────────────────
    isResolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolutionNote: { type: String },
  },
  { timestamps: true }
);

securityLogSchema.index({ userId: 1, createdAt: -1 });
securityLogSchema.index({ action: 1, createdAt: -1 });
securityLogSchema.index({ severity: 1, isResolved: 1 });

module.exports = mongoose.model('SecurityLog', securityLogSchema);
