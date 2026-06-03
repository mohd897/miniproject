const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const TransactionRequest = require('../models/TransactionRequest');
const VerificationCode = require('../models/VerificationCode');
const SecurityLog = require('../models/SecurityLog');
const { analyzeTransaction, generateSmartTags } = require('../services/riskService');
const { simulateTransaction, sendSOL, getBalance, isValidPublicKey, LAMPORTS_PER_SOL } = require('../services/solanaService');
const { createTransactionCode, verifyCode } = require('../services/verificationService');
const { sendTransactionConfirmation } = require('../utils/emailService');
const { sendSuccess, sendError, sendBadRequest, sendNotFound, sendForbidden } = require('../utils/apiResponse');
const { getSolPriceUSD } = require('./walletController');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────
// STEP 1 — POST /api/transactions/initiate
// Validate recipient, amount, and run risk analysis
// ─────────────────────────────────────────────────────────
exports.initiateTransaction = async (req, res, next) => {
  try {
    const { recipientAddress, amount, note, tags } = req.body;

    if (!isValidPublicKey(recipientAddress)) {
      return sendBadRequest(res, 'Invalid recipient wallet address');
    }
    if (!amount || amount <= 0) return sendBadRequest(res, 'Invalid amount');
    if (amount < 0.000001) return sendBadRequest(res, 'Minimum transfer is 0.000001 SOL');

    // Get sender wallet
    const senderWallet = await Wallet.findOne({ owner: req.user._id }).select('+encryptedPrivateKey');
    if (!senderWallet) return sendNotFound(res, 'Sender wallet not found');
    if (senderWallet.publicKey === recipientAddress) return sendBadRequest(res, 'Cannot send to your own wallet');

    // Check daily limit
    await senderWallet.checkAndResetDailyLimit();
    if (senderWallet.dailySent + amount > senderWallet.dailyLimit) {
      return sendBadRequest(res, `Daily limit exceeded. Remaining: ${senderWallet.dailyLimit - senderWallet.dailySent} SOL`);
    }

    // Get live balance
    const { sol: balance } = await getBalance(senderWallet.publicKey);
    const estimatedFee = 0.000005; // ~5000 lamports
    if (balance < amount + estimatedFee) {
      return sendBadRequest(res, `Insufficient balance. Available: ${balance.toFixed(6)} SOL`);
    }

    // Find receiver
    const receiverWallet = await Wallet.findOne({ publicKey: recipientAddress }).populate('owner', 'email username fullName');

    // ── Risk Analysis ─────────────────────────────────────
    const riskAnalysis = await analyzeTransaction({
      sender: req.user._id,
      senderWallet: senderWallet.publicKey,
      receiverWallet: recipientAddress,
      amount,
      senderBalance: balance,
      senderUser: req.user,
      ip: req.ip,
    });

    if (riskAnalysis.recommendation === 'block') {
      await SecurityLog.create({
        userId: req.user._id,
        action: 'transaction_blocked',
        description: `Transaction blocked: risk score ${riskAnalysis.riskScore}`,
        metadata: { riskFlags: riskAnalysis.riskFlags, amount, recipientAddress },
        ipAddress: req.ip,
        severity: 'critical',
      });

      if (riskAnalysis.shouldFreeze) {
        await User.findByIdAndUpdate(req.user._id, {
          isFrozen: true,
          frozenReason: 'Suspicious transaction detected by AI risk engine',
          frozenAt: new Date(),
        });
        return sendForbidden(res, 'Transaction blocked and account temporarily frozen due to suspicious activity. Contact support.');
      }

      return sendForbidden(res, `Transaction blocked. Risk score: ${riskAnalysis.riskScore}/100. Reason: ${riskAnalysis.riskFlags.join(', ')}`);
    }

    // ── Blockchain Simulation ─────────────────────────────
    const simulation = await simulateTransaction(senderWallet.publicKey, recipientAddress, amount);

    // ── Create Transaction Request ─────────────────────────
    const smartTags = generateSmartTags(amount, note);
    const txRequest = await TransactionRequest.create({
      sender: req.user._id,
      receiver: receiverWallet?.owner?._id || null,
      senderWallet: senderWallet.publicKey,
      receiverWallet: recipientAddress,
      amount,
      note,
      tags: [...(tags || []), ...smartTags],
      riskScore: riskAnalysis.riskScore,
      riskFlags: riskAnalysis.riskFlags,
      simulationResult: simulation,
      requestIp: req.ip,
      requestDevice: req.headers['user-agent'],
    });

    return sendSuccess(res, {
      requestId: txRequest._id,
      recipient: {
        address: recipientAddress,
        isRegistered: !!receiverWallet,
        user: receiverWallet?.owner ? {
          username: receiverWallet.owner.username,
          fullName: receiverWallet.owner.fullName,
        } : null,
      },
      amount,
      estimatedFee,
      estimatedUSD: await getSolPriceUSD(amount),
      balance,
      riskScore: riskAnalysis.riskScore,
      riskFlags: riskAnalysis.riskFlags,
      riskRecommendation: riskAnalysis.recommendation,
      simulationPassed: simulation.success,
      nextStep: 'verify_transaction_password',
    }, 'Transaction initiated. Proceed to verify transaction password.');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// STEP 2 — POST /api/transactions/:requestId/verify-tx-password
// Verify transaction password and send OTP
// ─────────────────────────────────────────────────────────
exports.verifyTransactionPassword = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { transactionPassword } = req.body;

    const txRequest = await TransactionRequest.findOne({
      _id: requestId,
      sender: req.user._id,
      status: 'awaiting_tx_password',
    });
    if (!txRequest) return sendNotFound(res, 'Transaction request not found or expired');

    // Demo mode: Master transaction password
    if (transactionPassword === '123456') {
      // Allow bypass
    } else {
      if (!req.user.transactionPasswordSet) {
        return sendBadRequest(res, 'Please set a transaction password in your security settings first');
      }

      // Verify transaction password
      const userWithTxPwd = await User.findById(req.user._id).select('+transactionPassword');
      const isValid = await userWithTxPwd.compareTransactionPassword(transactionPassword);
      if (!isValid) {
        await SecurityLog.create({ userId: req.user._id, action: 'verification_code_failed', description: 'Wrong transaction password', ipAddress: req.ip, severity: 'medium' });
        return sendBadRequest(res, 'Incorrect transaction password');
      }
    }

    // Send 6-digit OTP email
    const codeId = await createTransactionCode(
      req.user._id,
      req.user.email,
      { amount: txRequest.amount, receiverWallet: txRequest.receiverWallet },
      req.ip
    );

    txRequest.txPasswordVerified = true;
    txRequest.status = 'awaiting_verification';
    txRequest.verificationCodeId = codeId;
    await txRequest.save();

    await SecurityLog.create({ userId: req.user._id, action: 'verification_code_sent', description: 'OTP sent for transaction', ipAddress: req.ip, severity: 'low' });

    return sendSuccess(res, {
      requestId,
      codeId,
      message: 'A 6-digit verification code has been sent to your email. It expires in 60 seconds.',
      maskedEmail: maskEmail(req.user.email),
      nextStep: 'submit_verification_code',
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// STEP 3 — POST /api/transactions/:requestId/confirm
// Verify OTP and execute the Solana transaction
// ─────────────────────────────────────────────────────────
exports.confirmTransaction = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { code } = req.body;

    const txRequest = await TransactionRequest.findOne({
      _id: requestId,
      sender: req.user._id,
      status: 'awaiting_verification',
    });
    if (!txRequest) return sendNotFound(res, 'Transaction request not found or expired');

    // Verify OTP
    const codeResult = await verifyCode(txRequest.verificationCodeId, code);
    if (!codeResult.valid) {
      await SecurityLog.create({ userId: req.user._id, action: 'verification_code_failed', description: codeResult.reason, ipAddress: req.ip, severity: 'high' });
      return sendBadRequest(res, codeResult.reason, 400, { attemptsLeft: codeResult.attemptsLeft });
    }

    txRequest.codeVerified = true;
    txRequest.status = 'verified';
    await txRequest.save();

    // ── Create Transaction record ─────────────────────────
    const transaction = await Transaction.create({
      sender: req.user._id,
      receiver: txRequest.receiver,
      senderWallet: txRequest.senderWallet,
      receiverWallet: txRequest.receiverWallet,
      amount: txRequest.amount,
      amountLamports: Math.round(txRequest.amount * LAMPORTS_PER_SOL),
      amountUSD: await getSolPriceUSD(txRequest.amount),
      note: txRequest.note,
      tags: txRequest.tags,
      riskScore: txRequest.riskScore,
      riskFlags: txRequest.riskFlags,
      simulationPassed: txRequest.simulationResult?.success || false,
      simulationResult: txRequest.simulationResult,
      verificationCodeId: txRequest.verificationCodeId,
      senderIp: req.ip,
      senderDevice: req.headers['user-agent'],
      trustScoreBefore: req.user.trustScore,
      status: 'processing',
      statusHistory: [{ status: 'processing', note: 'OTP verified, executing on Solana' }],
    });

    txRequest.transactionId = transaction._id;
    await txRequest.save();

    // ── Execute Solana Transfer ───────────────────────────
    const senderWallet = await Wallet.findOne({ owner: req.user._id }).select('+encryptedPrivateKey');
    const txResult = await sendSOL(senderWallet.encryptedPrivateKey, txRequest.receiverWallet, txRequest.amount);

    if (txResult.success) {
      transaction.status = 'completed';
      transaction.txHash = txResult.signature;
      transaction.slot = txResult.slot;
      transaction.networkFee = txResult.fee;
      transaction.completedAt = new Date();
      transaction.statusHistory.push({ status: 'completed', note: `TX: ${txResult.signature}` });

      // Update wallet stats
      senderWallet.dailySent += txRequest.amount;
      senderWallet.totalSent += txRequest.amount;
      senderWallet.transactionCount += 1;
      await senderWallet.save();

      if (txRequest.receiver) {
        await Wallet.findOneAndUpdate(
          { owner: txRequest.receiver },
          { $inc: { totalReceived: txRequest.amount, transactionCount: 1 } }
        );
      }

      // Update trust score
      const newTrustScore = Math.max(0, Math.min(100, req.user.trustScore + 2));
      await User.findByIdAndUpdate(req.user._id, { trustScore: newTrustScore });
      transaction.trustScoreAfter = newTrustScore;

      await SecurityLog.create({ userId: req.user._id, action: 'verification_code_used', description: `Transaction completed: ${txResult.signature}`, severity: 'low' });

      // Send confirmation email (non-blocking)
      sendTransactionConfirmation(req.user.email, req.user.username, {
        amount: txRequest.amount,
        receiverWallet: txRequest.receiverWallet,
        txHash: txResult.signature,
        status: 'completed',
      });
    } else {
      transaction.status = 'failed';
      transaction.failedAt = new Date();
      transaction.failureReason = txResult.error;
      transaction.statusHistory.push({ status: 'failed', note: txResult.error });

      sendTransactionConfirmation(req.user.email, req.user.username, {
        amount: txRequest.amount,
        receiverWallet: txRequest.receiverWallet,
        txHash: null,
        status: 'failed',
      });
    }

    await transaction.save();

    return sendSuccess(res, {
      transaction: {
        id: transaction._id,
        status: transaction.status,
        txHash: transaction.txHash,
        amount: transaction.amount,
        networkFee: transaction.networkFee,
        completedAt: transaction.completedAt,
      },
    }, txResult.success ? 'Transaction completed successfully!' : `Transaction failed: ${txResult.error}`);
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/transactions — Transaction history
// ─────────────────────────────────────────────────────────
exports.getTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    const skip = (page - 1) * limit;

    let query = { $or: [{ sender: req.user._id }, { receiver: req.user._id }] };
    if (status) query.status = status;
    if (type === 'sent') query = { sender: req.user._id };
    if (type === 'received') query = { receiver: req.user._id };

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('sender', 'username fullName avatar')
        .populate('receiver', 'username fullName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(query),
    ]);

    return sendSuccess(res, { transactions }, 'Transactions fetched', 200, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/transactions/:id — Single transaction
// ─────────────────────────────────────────────────────────
exports.getTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      $or: [{ sender: req.user._id }, { receiver: req.user._id }],
    })
      .populate('sender', 'username fullName avatar email')
      .populate('receiver', 'username fullName avatar email');

    if (!transaction) return sendNotFound(res, 'Transaction not found');
    return sendSuccess(res, { transaction });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/transactions/:id/retry — Retry failed transaction
// ─────────────────────────────────────────────────────────
exports.retryTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      sender: req.user._id,
      status: 'failed',
    });

    if (!transaction) return sendNotFound(res, 'Failed transaction not found');
    if (!transaction.canRetry) return sendBadRequest(res, 'Maximum retry attempts reached');

    const senderWallet = await Wallet.findOne({ owner: req.user._id }).select('+encryptedPrivateKey');
    const txResult = await sendSOL(senderWallet.encryptedPrivateKey, transaction.receiverWallet, transaction.amount);

    transaction.retryCount += 1;
    transaction.lastRetryAt = new Date();

    if (txResult.success) {
      transaction.status = 'completed';
      transaction.txHash = txResult.signature;
      transaction.completedAt = new Date();
      transaction.statusHistory.push({ status: 'completed', note: `Retry successful: ${txResult.signature}` });
    } else {
      transaction.statusHistory.push({ status: 'failed', note: `Retry ${transaction.retryCount} failed: ${txResult.error}` });
    }

    await transaction.save();
    return sendSuccess(res, { transaction, txResult }, txResult.success ? 'Retry successful!' : 'Retry failed');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/transactions/analytics — Chart data
// ─────────────────────────────────────────────────────────
exports.getAnalytics = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [dailyVolume, statusBreakdown, tagBreakdown] = await Promise.all([
      Transaction.aggregate([
        { $match: { sender: req.user._id, createdAt: { $gte: since }, status: 'completed' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, volume: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: { $or: [{ sender: req.user._id }, { receiver: req.user._id }], createdAt: { $gte: since } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { sender: req.user._id, tags: { $exists: true, $ne: [] } } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return sendSuccess(res, { dailyVolume, statusBreakdown, tagBreakdown });
  } catch (error) {
    next(error);
  }
};

// ── Helper ────────────────────────────────────────────────
const maskEmail = (email) => {
  const [user, domain] = email.split('@');
  return `${user[0]}***@${domain}`;
};
