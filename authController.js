const crypto = require('crypto');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Session = require('../models/Session');
const SecurityLog = require('../models/SecurityLog');
const { generateTokenPair, verifyRefreshToken } = require('../utils/jwt');
const { sendVerificationEmail, sendPasswordResetEmail, sendSecurityAlert } = require('../utils/emailService');
const { createEmailVerificationToken, createPasswordResetToken } = require('../services/verificationService');
const { generateWallet } = require('../services/solanaService');
const { sendSuccess, sendCreated, sendError, sendBadRequest, sendUnauthorized, sendNotFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const qrcode = require('qrcode');

// ─────────────────────────────────────────────────────────
// POST /api/auth/simple-login
// ─────────────────────────────────────────────────────────
exports.simpleLogin = async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username) return sendBadRequest(res, 'Username is required');

    // Remove spaces and special characters for database rules
    const safeUsername = username.trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
    if (safeUsername.length < 3) return sendBadRequest(res, 'Username must contain at least 3 valid letters/numbers');

    let user = await User.findOne({ username: safeUsername });
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    if (!user) {
      // Auto-register with dummy details if they don't exist
      user = await User.create({
        username: safeUsername,
        email: `${safeUsername}@demo.com`,
        password: crypto.randomBytes(16).toString('hex'), // Random password they'll never use
        fullName: username, // Keep the original for display name
        isEmailVerified: true // Auto verify
      });

      // Generate Solana wallet
      const { publicKey, encryptedPrivateKey } = generateWallet();
      const qrCodeUrl = await qrcode.toDataURL(publicKey);

      await Wallet.create({
        owner: user._id,
        publicKey,
        encryptedPrivateKey,
        qrCodeUrl,
        network: process.env.SOLANA_NETWORK || 'devnet',
      });
      
      await SecurityLog.create({ userId: user._id, action: 'login_success', description: 'Account auto-registered via simple login', ipAddress: ip });
    } else {
      user.lastLogin = new Date();
      user.lastLoginIp = ip;
      await user.save({ validateBeforeSave: false });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user._id, user.role);

    // Create session record
    const session = await Session.create({
      userId: user._id,
      refreshToken,
      refreshTokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      ipAddress: ip,
      userAgent,
      deviceType: /mobile/i.test(userAgent) ? 'mobile' : 'desktop',
      browser: userAgent.split(' ').slice(-1)[0],
    });

    return sendSuccess(res, {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        transactionPasswordSet: user.transactionPasswordSet,
        trustScore: user.trustScore,
      },
      sessionId: session._id,
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { username, email, password, fullName, phone, country } = req.body;

    // Check for existing user
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return sendError(res, existing.email === email ? 'Email already registered' : 'Username taken', 409);
    }

    // Create user
    const user = await User.create({ username, email, password, fullName, phone, country });

    // Generate Solana wallet
    const { publicKey, encryptedPrivateKey } = generateWallet();

    // Generate QR code for wallet address
    const qrCodeUrl = await qrcode.toDataURL(publicKey);

    // Create wallet record
    await Wallet.create({
      owner: user._id,
      publicKey,
      encryptedPrivateKey,
      qrCodeUrl,
      network: process.env.SOLANA_NETWORK || 'devnet',
    });

    // Email verification
    const { token, hash, expiresAt } = createEmailVerificationToken();
    user.emailVerificationToken = hash;
    user.emailVerificationExpires = expiresAt;
    await user.save({ validateBeforeSave: false });

    // Send verification email (non-blocking)
    sendVerificationEmail(user.email, token, user.username);

    // Log registration
    await SecurityLog.create({
      userId: user._id,
      action: 'login_success',
      description: 'Account registered',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      severity: 'low',
    });

    return sendCreated(res, {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        isEmailVerified: false,
        role: user.role,
        walletAddress: publicKey,
      },
    }, 'Registration successful! Please verify your email.');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Find user with password
    const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockUntil');
    if (!user) {
      return sendUnauthorized(res, 'Invalid email or password');
    }

    // Check lock
    if (user.isLocked) {
      await SecurityLog.create({ userId: user._id, action: 'login_failed', description: 'Account locked', ipAddress: ip, severity: 'high' });
      return sendUnauthorized(res, 'Account locked due to too many failed attempts. Try again in 2 hours.');
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      await SecurityLog.create({ userId: user._id, action: 'login_failed', description: 'Wrong password', ipAddress: ip, severity: 'medium' });
      return sendUnauthorized(res, 'Invalid email or password');
    }

    // Reset failed attempts
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      user.lockUntil = undefined;
    }

    user.lastLogin = new Date();
    user.lastLoginIp = ip;
    await user.save({ validateBeforeSave: false });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user._id, user.role);

    // Create session record
    const session = await Session.create({
      userId: user._id,
      refreshToken,
      refreshTokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      ipAddress: ip,
      userAgent,
      deviceType: /mobile/i.test(userAgent) ? 'mobile' : 'desktop',
      browser: userAgent.split(' ').slice(-1)[0],
    });

    // Log success
    await SecurityLog.create({
      userId: user._id,
      action: 'login_success',
      description: 'Login successful',
      ipAddress: ip,
      userAgent,
      severity: 'low',
    });

    return sendSuccess(res, {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        transactionPasswordSet: user.transactionPasswordSet,
        trustScore: user.trustScore,
        avatar: user.avatar,
        theme: user.theme,
      },
      sessionId: session._id,
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await Session.findOneAndUpdate(
        { refreshTokenHash: tokenHash },
        { isActive: false, revokedAt: new Date(), revokeReason: 'logout' }
      );
    }

    await SecurityLog.create({
      userId: req.user._id,
      action: 'logout',
      description: 'User logged out',
      ipAddress: req.ip,
      severity: 'low',
    });

    return sendSuccess(res, {}, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/auth/refresh-token
// ─────────────────────────────────────────────────────────
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return sendUnauthorized(res, 'Refresh token required');

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return sendUnauthorized(res, 'Invalid or expired refresh token');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await Session.findOne({ refreshTokenHash: tokenHash, isActive: true });
    if (!session) return sendUnauthorized(res, 'Session not found or revoked');

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive || user.isFrozen) {
      return sendUnauthorized(res, 'Account not accessible');
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokenPair(user._id, user.role);

    // Rotate refresh token
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    session.refreshToken = newRefreshToken;
    session.refreshTokenHash = newHash;
    session.lastActivity = new Date();
    await session.save();

    return sendSuccess(res, { accessToken: newAccessToken, refreshToken: newRefreshToken }, 'Token refreshed');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/auth/verify-email/:token
// ─────────────────────────────────────────────────────────
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hash,
      emailVerificationExpires: { $gt: Date.now() },
    }).select('+emailVerificationToken +emailVerificationExpires');

    if (!user) return sendBadRequest(res, 'Invalid or expired verification link');

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    await SecurityLog.create({ userId: user._id, action: 'email_verified', severity: 'low' });
    return sendSuccess(res, { email: user.email }, 'Email verified successfully');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always return success to prevent email enumeration
    if (!user) return sendSuccess(res, {}, 'If that email exists, a reset link has been sent.');

    const { token, hash, expiresAt } = createPasswordResetToken();
    user.passwordResetToken = hash;
    user.passwordResetExpires = expiresAt;
    await user.save({ validateBeforeSave: false });

    sendPasswordResetEmail(user.email, token, user.username);
    return sendSuccess(res, {}, 'Password reset link sent to your email');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/auth/reset-password/:token
// ─────────────────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hash,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) return sendBadRequest(res, 'Invalid or expired reset token');

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Revoke all sessions
    await Session.updateMany({ userId: user._id }, { isActive: false, revokeReason: 'password_reset' });
    await SecurityLog.create({ userId: user._id, action: 'password_reset_done', ipAddress: req.ip, severity: 'medium' });
    sendSecurityAlert(user.email, user.username, 'Password Reset', `Your password was reset from IP: ${req.ip}`);

    return sendSuccess(res, {}, 'Password reset successful. Please log in again.');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/auth/set-transaction-password
// ─────────────────────────────────────────────────────────
exports.setTransactionPassword = async (req, res, next) => {
  try {
    const { transactionPassword } = req.body;
    const user = await User.findById(req.user._id);

    user.transactionPassword = transactionPassword;
    user.transactionPasswordSet = true;
    await user.save();

    await SecurityLog.create({ userId: user._id, action: 'tx_password_set', ipAddress: req.ip, severity: 'low' });
    return sendSuccess(res, {}, 'Transaction password set successfully');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const wallet = await Wallet.findOne({ owner: req.user._id }).select('-encryptedPrivateKey');
    return sendSuccess(res, { user, wallet }, 'Profile fetched');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/auth/sessions
// ─────────────────────────────────────────────────────────
exports.getSessions = async (req, res, next) => {
  try {
    const sessions = await Session.find({ userId: req.user._id, isActive: true }).sort({ lastActivity: -1 });
    return sendSuccess(res, { sessions }, 'Active sessions fetched');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// DELETE /api/auth/sessions/:sessionId
// ─────────────────────────────────────────────────────────
exports.revokeSession = async (req, res, next) => {
  try {
    const session = await Session.findOneAndUpdate(
      { _id: req.params.sessionId, userId: req.user._id },
      { isActive: false, revokedAt: new Date(), revokeReason: 'manual_revoke' }
    );
    if (!session) return sendNotFound(res, 'Session not found');
    await SecurityLog.create({ userId: req.user._id, action: 'session_revoked', severity: 'medium' });
    return sendSuccess(res, {}, 'Session revoked');
  } catch (error) {
    next(error);
  }
};
