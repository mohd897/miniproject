const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshToken: { type: String, required: true, select: false },
    refreshTokenHash: { type: String, required: true },

    // ── Device Info ───────────────────────────────────────
    deviceId: { type: String },
    deviceName: { type: String },
    deviceType: { type: String, enum: ['mobile', 'tablet', 'desktop', 'unknown'], default: 'unknown' },
    browser: { type: String },
    os: { type: String },
    userAgent: { type: String },

    // ── Location ──────────────────────────────────────────
    ipAddress: { type: String },
    country: { type: String },
    city: { type: String },

    // ── Status ────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    lastActivity: { type: Date, default: Date.now },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },

    // ── Security ──────────────────────────────────────────
    isTrusted: { type: Boolean, default: false },
    revokedAt: { type: Date },
    revokeReason: { type: String },
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('Session', sessionSchema);
