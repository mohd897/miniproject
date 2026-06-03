const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { getBalance, requestAirdrop, isValidPublicKey } = require('../services/solanaService');
const { sendSuccess, sendError, sendNotFound, sendBadRequest } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const axios = require('axios');

// ─────────────────────────────────────────────────────────
// GET /api/wallet — Get authenticated user's wallet
// ─────────────────────────────────────────────────────────
exports.getWallet = async (req, res, next) => {
  try {
    const wallet = await Wallet.findOne({ owner: req.user._id }).select('-encryptedPrivateKey');
    if (!wallet) return sendNotFound(res, 'Wallet not found');

    // Sync live balance from Solana
    const { sol, lamports } = await getBalance(wallet.publicKey);

    // Check daily limit reset
    await wallet.checkAndResetDailyLimit();

    // Update balance cache
    wallet.balance = sol;
    wallet.balanceUSD = await getSolPriceUSD(sol);
    wallet.lastBalanceSync = new Date();
    await wallet.save();

    return sendSuccess(res, {
      wallet: {
        ...wallet.toJSON(),
        encryptedPrivateKey: undefined,
      },
    }, 'Wallet fetched');
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/wallet/add-funds
// ─────────────────────────────────────────────────────────
exports.addFunds = async (req, res, next) => {
  try {
    const { amount = 100 } = req.body;
    
    const wallet = await Wallet.findOne({ owner: req.user._id });
    if (!wallet) return sendNotFound(res, 'Wallet not found');

    wallet.balance += Number(amount);
    wallet.balanceUSD = await getSolPriceUSD(wallet.balance);
    await wallet.save();

    return sendSuccess(res, { 
      balance: wallet.balance,
      balanceUSD: wallet.balanceUSD
    }, `Successfully added ${amount} SOL to your wallet!`);
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/wallet/balance — Quick balance check
// ─────────────────────────────────────────────────────────
exports.getBalance = async (req, res, next) => {
  try {
    const wallet = await Wallet.findOne({ owner: req.user._id }).select('publicKey');
    if (!wallet) return sendNotFound(res, 'Wallet not found');

    const { sol, lamports } = await getBalance(wallet.publicKey);
    const usd = await getSolPriceUSD(sol);

    return sendSuccess(res, { sol, lamports, usd, publicKey: wallet.publicKey });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/wallet/lookup/:address — Lookup any wallet
// ─────────────────────────────────────────────────────────
exports.lookupWallet = async (req, res, next) => {
  try {
    const { address } = req.params;
    if (!isValidPublicKey(address)) return sendBadRequest(res, 'Invalid Solana wallet address');

    const { sol } = await getBalance(address);
    const user = await Wallet.findOne({ publicKey: address }).populate('owner', 'username fullName avatar');

    return sendSuccess(res, {
      address,
      balance: sol,
      isRegistered: !!user,
      owner: user?.owner || null,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/wallet/stats — Portfolio stats
// ─────────────────────────────────────────────────────────
exports.getWalletStats = async (req, res, next) => {
  try {
    const wallet = await Wallet.findOne({ owner: req.user._id }).select('-encryptedPrivateKey');
    if (!wallet) return sendNotFound(res, 'Wallet not found');

    const [totalSent, totalReceived, txCount] = await Promise.all([
      Transaction.aggregate([
        { $match: { sender: req.user._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { receiver: req.user._id, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.countDocuments({ $or: [{ sender: req.user._id }, { receiver: req.user._id }] }),
    ]);

    return sendSuccess(res, {
      totalSent: totalSent[0]?.total || 0,
      totalReceived: totalReceived[0]?.total || 0,
      transactionCount: txCount,
      balance: wallet.balance,
      balanceUSD: wallet.balanceUSD,
      dailyLimit: wallet.dailyLimit,
      dailySent: wallet.dailySent,
      dailyRemaining: wallet.dailyLimit - wallet.dailySent,
    });
  } catch (error) {
    next(error);
  }
};

// ── Helper: Get SOL/USD price ─────────────────────────────
const getSolPriceUSD = async (solAmount) => {
  return 93.71 * solAmount;
};

exports.getSolPriceUSD = getSolPriceUSD;
