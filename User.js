const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email address'],
    },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    avatar: { type: String, default: null },
    country: { type: String, default: 'Unknown' },

    // ── Authentication ────────────────────────────────────
    password: { type: String, required: true, minlength: 8, select: false },
    transactionPassword: { type: String, select: false }, // separate tx password (hashed)
    transactionPasswordSet: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    // ── Email Verification ────────────────────────────────
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },

    // ── Password Reset ────────────────────────────────────
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // ── Account Status ────────────────────────────────────
    isActive: { type: Boolean, default: true },
    isFrozen: { type: Boolean, default: false },
    frozenReason: { type: String, default: null },
    frozenAt: { type: Date, default: null },
    frozenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Security & Risk ───────────────────────────────────
    trustScore: { type: Number, default: 100, min: 0, max: 100 }, // 0-100
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },

    // ── Preferences ───────────────────────────────────────
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
    theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
    lastLogin: { type: Date },
    lastLoginIp: { type: String },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtual: isLocked ─────────────────────────────────────
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ── Pre-save: hash password ───────────────────────────────
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// ── Pre-save: hash transaction password ──────────────────
userSchema.pre('save', async function () {
  if (!this.isModified('transactionPassword') || !this.transactionPassword) return;
  this.transactionPassword = await bcrypt.hash(this.transactionPassword, 12);
});

// ── Methods ───────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.compareTransactionPassword = async function (candidatePassword) {
  if (!this.transactionPassword) return false;
  return bcrypt.compare(candidatePassword, this.transactionPassword);
};

userSchema.methods.incrementLoginAttempts = async function () {
  // unlock if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { failedLoginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { failedLoginAttempts: 1 } };
  if (this.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2-hour lock
  }
  return this.updateOne(updates);
};

// ── Indexes ───────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ trustScore: 1 });

module.exports = mongoose.model('User', userSchema);
