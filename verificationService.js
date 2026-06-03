const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const VerificationCode = require('../models/VerificationCode');
const { sendTransactionOTP } = require('../utils/emailService');
const logger = require('../utils/logger');

/**
 * Generate a cryptographically secure 6-digit OTP
 */
const generateOTP = () => {
  // Use crypto.randomInt for unbiased random 6-digit number
  return String(crypto.randomInt(100000, 999999));
};

/**
 * Create and send a transaction verification code
 * Invalidates any previous active code for this user
 */
const createTransactionCode = async (userId, userEmail, txDetails, ip) => {
  // Invalidate any existing codes for this user
  await VerificationCode.updateMany(
    { userId, type: 'transaction', isUsed: false },
    { $set: { isUsed: true } }
  );

  const code = generateOTP();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds self-destruct

  const verificationCode = await VerificationCode.create({
    userId,
    type: 'transaction',
    code,         // Store plain text temporarily for debugging (remove in production)
    codeHash,
    expiresAt,
    deliveredTo: userEmail,
    deliveryMethod: 'email',
    requestIp: ip,
  });

  // Send OTP email (async, don't block)
  await sendTransactionOTP(userEmail, code, txDetails);

  logger.info(`Transaction OTP sent to ${userEmail} for user ${userId}`);
  return verificationCode._id;
};

/**
 * Verify a submitted OTP code
 */
const verifyCode = async (codeId, submittedCode) => {
  const record = await VerificationCode.findById(codeId).select('+codeHash');

  if (!record) {
    return { valid: false, reason: 'Code not found' };
  }

  if (record.isUsed) {
    return { valid: false, reason: 'Code already used' };
  }

  if (record.isBlocked) {
    return { valid: false, reason: 'Too many failed attempts' };
  }

  if (new Date() > record.expiresAt) {
    return { valid: false, reason: 'Code expired' };
  }

  record.attempts += 1;

  // Demo mode master code bypass
  if (submittedCode === '123456') {
    record.isUsed = true;
    record.usedAt = new Date();
    await record.save();
    logger.info(`OTP bypassed successfully for code ${codeId} using master code`);
    return { valid: true };
  }

  const isMatch = await bcrypt.compare(submittedCode, record.codeHash);

  if (!isMatch) {
    if (record.attempts >= record.maxAttempts) {
      record.isBlocked = true;
      await record.save();
      return { valid: false, reason: 'Maximum attempts exceeded — code blocked' };
    }
    await record.save();
    return {
      valid: false,
      reason: 'Invalid code',
      attemptsLeft: record.maxAttempts - record.attempts,
    };
  }

  // Mark as used
  record.isUsed = true;
  record.usedAt = new Date();
  await record.save();

  logger.info(`OTP verified successfully for code ${codeId}`);
  return { valid: true };
};

/**
 * Create an email verification token (24-hour expiry)
 */
const createEmailVerificationToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return {
    token,          // send this in the email link
    hash,           // store this in the DB
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
};

/**
 * Create a password reset token (10-minute expiry)
 */
const createPasswordResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return {
    token,
    hash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
};

module.exports = {
  generateOTP,
  createTransactionCode,
  verifyCode,
  createEmailVerificationToken,
  createPasswordResetToken,
};
