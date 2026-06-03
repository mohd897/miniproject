/**
 * AI-powered Risk & Fraud Detection Service
 * Uses rule-based heuristics + scoring (simulates ML model output)
 * Each rule contributes to a 0-100 risk score
 */

const Transaction = require('../models/Transaction');
const SecurityLog = require('../models/SecurityLog');
const logger = require('../utils/logger');

// ── Risk Score Weights ────────────────────────────────────
const RISK_WEIGHTS = {
  HIGH_AMOUNT: 20,           // amount > 10 SOL
  VERY_HIGH_AMOUNT: 35,      // amount > 50 SOL
  NEW_RECIPIENT: 15,         // never sent to this address before
  UNUSUAL_TIME: 10,          // transaction outside normal hours (2am-5am)
  MULTIPLE_FAILED: 20,       // > 3 failed txs in past hour
  RAPID_SUCCESSION: 25,      // > 3 txs in 5 minutes
  ACCOUNT_AGE: 10,           // account < 7 days old
  IP_CHANGE: 15,             // IP different from usual
  LOW_TRUST_SCORE: 20,       // sender trust score < 50
  LARGE_PERCENTAGE: 25,      // sending > 80% of balance
  GEOGRAPHIC_ANOMALY: 15,    // unusual country
  KNOWN_FRAUD_PATTERN: 40,   // matches known fraud patterns
};

const TAGS = {
  HIGH_AMOUNT: 'high_amount',
  NEW_RECIPIENT: 'new_recipient',
  UNUSUAL_TIME: 'unusual_time',
  RAPID_FIRE: 'rapid_fire',
  SUSPICIOUS_PATTERN: 'suspicious_pattern',
  LOW_TRUST: 'low_trust',
  LARGE_PERCENTAGE: 'large_balance_drain',
};

/**
 * Analyze a pending transaction and return a risk assessment
 * @param {Object} txData - { sender, senderWallet, receiverWallet, amount, senderBalance, senderUser, ip }
 * @returns {Object} { riskScore, riskFlags, recommendation, shouldFreeze }
 */
const analyzeTransaction = async (txData) => {
  const { sender, senderWallet, receiverWallet, amount, senderBalance, senderUser, ip } = txData;

  let score = 0;
  const flags = [];
  const now = new Date();
  const hour = now.getHours();

  try {
    // ── Rule 1: High amount ──────────────────────────────
    if (amount > 50) {
      score += RISK_WEIGHTS.VERY_HIGH_AMOUNT;
      flags.push(TAGS.HIGH_AMOUNT);
    } else if (amount > 10) {
      score += RISK_WEIGHTS.HIGH_AMOUNT;
      flags.push(TAGS.HIGH_AMOUNT);
    }

    // ── Rule 2: Large percentage of balance ───────────────
    if (senderBalance > 0 && amount / senderBalance > 0.8) {
      score += RISK_WEIGHTS.LARGE_PERCENTAGE;
      flags.push(TAGS.LARGE_PERCENTAGE);
    }

    // ── Rule 3: New recipient ─────────────────────────────
    const previousTxToRecipient = await Transaction.countDocuments({
      sender,
      receiverWallet,
      status: 'completed',
    });
    if (previousTxToRecipient === 0) {
      score += RISK_WEIGHTS.NEW_RECIPIENT;
      flags.push(TAGS.NEW_RECIPIENT);
    }

    // ── Rule 4: Unusual time (2am - 5am) ──────────────────
    if (hour >= 2 && hour <= 5) {
      score += RISK_WEIGHTS.UNUSUAL_TIME;
      flags.push(TAGS.UNUSUAL_TIME);
    }

    // ── Rule 5: Multiple failed transactions recently ─────
    const fiveMinAgo = new Date(now - 5 * 60 * 1000);
    const recentTxCount = await Transaction.countDocuments({
      sender,
      createdAt: { $gte: fiveMinAgo },
    });
    if (recentTxCount >= 3) {
      score += RISK_WEIGHTS.RAPID_SUCCESSION;
      flags.push(TAGS.RAPID_FIRE);
    }

    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const failedCount = await Transaction.countDocuments({
      sender,
      status: 'failed',
      createdAt: { $gte: oneHourAgo },
    });
    if (failedCount >= 3) {
      score += RISK_WEIGHTS.MULTIPLE_FAILED;
      flags.push(TAGS.SUSPICIOUS_PATTERN);
    }

    // ── Rule 6: Low trust score ───────────────────────────
    if (senderUser.trustScore < 50) {
      score += RISK_WEIGHTS.LOW_TRUST_SCORE;
      flags.push(TAGS.LOW_TRUST);
    }

    // ── Rule 7: Account age ───────────────────────────────
    const accountAgeDays = (now - new Date(senderUser.createdAt)) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 7) {
      score += RISK_WEIGHTS.ACCOUNT_AGE;
    }

    // ── Cap score at 100 ─────────────────────────────────
    score = Math.min(score, 100);

    // ── Determine recommendation ──────────────────────────
    let recommendation = 'allow';
    let shouldFreeze = false;

    if (score >= 80) {
      recommendation = 'block';
      shouldFreeze = true;
    } else if (score >= 50) {
      recommendation = 'review';
    } else if (score >= 30) {
      recommendation = 'warn';
    }

    // ── Generate trust score impact ───────────────────────
    const trustScoreDelta = score >= 50 ? -Math.floor(score / 10) : 0;

    logger.info(`Risk analysis for ${sender}: score=${score}, flags=${flags.join(',')}`);

    return {
      riskScore: score,
      riskFlags: flags,
      recommendation,
      shouldFreeze,
      trustScoreDelta,
      analysisTimestamp: now,
    };
  } catch (error) {
    logger.error(`Risk analysis error: ${error.message}`);
    // Return safe default on error
    return { riskScore: 0, riskFlags: [], recommendation: 'allow', shouldFreeze: false, trustScoreDelta: 0 };
  }
};

/**
 * Generate auto tags for a transaction (smart tagging)
 */
const generateSmartTags = (amount, note = '') => {
  const tags = [];
  const lowerNote = note.toLowerCase();

  if (amount >= 10) tags.push('large');
  if (amount < 0.01) tags.push('micro');
  if (lowerNote.includes('invest')) tags.push('investment');
  if (lowerNote.includes('pay') || lowerNote.includes('salary')) tags.push('payment');
  if (lowerNote.includes('gift') || lowerNote.includes('gift')) tags.push('gift');
  if (lowerNote.includes('business')) tags.push('business');
  if (lowerNote.includes('personal') || lowerNote.includes('friend')) tags.push('personal');

  return tags;
};

/**
 * Generate daily risk report summary (called by cron)
 */
const generateDailyRiskReport = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalTx, flaggedTx, failedTx, highRiskTx] = await Promise.all([
    Transaction.countDocuments({ createdAt: { $gte: today } }),
    Transaction.countDocuments({ createdAt: { $gte: today }, isFlagged: true }),
    Transaction.countDocuments({ createdAt: { $gte: today }, status: 'failed' }),
    Transaction.countDocuments({ createdAt: { $gte: today }, riskScore: { $gte: 70 } }),
  ]);

  const totalVolumeResult = await Transaction.aggregate([
    { $match: { createdAt: { $gte: today }, status: 'completed' } },
    { $group: { _id: null, totalSOL: { $sum: '$amount' } } },
  ]);

  return {
    date: today,
    totalTransactions: totalTx,
    flaggedTransactions: flaggedTx,
    failedTransactions: failedTx,
    highRiskTransactions: highRiskTx,
    totalVolume: totalVolumeResult[0]?.totalSOL || 0,
    flagRate: totalTx ? ((flaggedTx / totalTx) * 100).toFixed(2) : 0,
    generatedAt: new Date(),
  };
};

module.exports = { analyzeTransaction, generateSmartTags, generateDailyRiskReport };
