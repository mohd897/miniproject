const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const SecurityLog = require('../models/SecurityLog');
const { generateDailyRiskReport } = require('../services/riskService');
const { sendSuccess, sendNotFound, sendBadRequest } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────
// GET /api/admin/dashboard — Overview stats
// ─────────────────────────────────────────────────────────
exports.getDashboard = async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);

    const [
      totalUsers, activeUsers, frozenUsers,
      totalTx, pendingTx, completedTx, failedTx, flaggedTx,
      todayVolume, totalVolume, recentTx, recentUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true, isFrozen: false }),
      User.countDocuments({ isFrozen: true }),
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: 'pending' }),
      Transaction.countDocuments({ status: 'completed' }),
      Transaction.countDocuments({ status: 'failed' }),
      Transaction.countDocuments({ isFlagged: true }),
      Transaction.aggregate([{ $match: { createdAt: { $gte: today }, status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.find().populate('sender', 'username').populate('receiver', 'username').sort({ createdAt: -1 }).limit(10),
      User.find().sort({ createdAt: -1 }).limit(10).select('username email createdAt trustScore role isActive isFrozen'),
    ]);

    return sendSuccess(res, {
      stats: {
        users: { total: totalUsers, active: activeUsers, frozen: frozenUsers },
        transactions: { total: totalTx, pending: pendingTx, completed: completedTx, failed: failedTx, flagged: flaggedTx },
        volume: { today: todayVolume[0]?.total || 0, total: totalVolume[0]?.total || 0 },
      },
      recentTransactions: recentTx,
      recentUsers,
    });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────
// GET /api/admin/users — All users
// ─────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const skip = (page - 1) * limit;
    let query = {};
    if (search) query.$or = [{ username: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }, { fullName: new RegExp(search, 'i') }];
    if (role) query.role = role;
    if (status === 'frozen') query.isFrozen = true;
    if (status === 'active') query.isFrozen = false;

    const [users, total] = await Promise.all([
      User.find(query).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
      User.countDocuments(query),
    ]);

    return sendSuccess(res, { users }, 'Users fetched', 200, { page: +page, limit: +limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────
// PATCH /api/admin/users/:id/freeze — Freeze / unfreeze
// ─────────────────────────────────────────────────────────
exports.toggleFreezeUser = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return sendNotFound(res, 'User not found');
    if (user.role === 'admin') return sendBadRequest(res, 'Cannot freeze an admin account');

    user.isFrozen = !user.isFrozen;
    user.frozenReason = user.isFrozen ? (reason || 'Admin action') : null;
    user.frozenAt = user.isFrozen ? new Date() : null;
    user.frozenBy = req.user._id;
    await user.save();

    await SecurityLog.create({
      userId: user._id,
      action: user.isFrozen ? 'account_frozen' : 'account_unfrozen',
      description: `Admin ${req.user.username}: ${reason || 'No reason given'}`,
      severity: 'high',
      metadata: { adminId: req.user._id },
    });

    return sendSuccess(res, { isFrozen: user.isFrozen }, `Account ${user.isFrozen ? 'frozen' : 'unfrozen'} successfully`);
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────
// GET /api/admin/transactions — All transactions
// ─────────────────────────────────────────────────────────
exports.getAllTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, flagged } = req.query;
    const skip = (page - 1) * limit;
    let query = {};
    if (status) query.status = status;
    if (flagged === 'true') query.isFlagged = true;

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('sender', 'username email')
        .populate('receiver', 'username email')
        .sort({ createdAt: -1 }).skip(skip).limit(+limit),
      Transaction.countDocuments(query),
    ]);

    return sendSuccess(res, { transactions }, 'Transactions fetched', 200, { page: +page, limit: +limit, total });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────
// PATCH /api/admin/transactions/:id/flag — Flag suspicious tx
// ─────────────────────────────────────────────────────────
exports.flagTransaction = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const tx = await Transaction.findByIdAndUpdate(req.params.id, { isFlagged: true, flagReason: reason }, { new: true });
    if (!tx) return sendNotFound(res, 'Transaction not found');
    return sendSuccess(res, { tx }, 'Transaction flagged');
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────
// GET /api/admin/security-logs — Security audit log
// ─────────────────────────────────────────────────────────
exports.getSecurityLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, severity } = req.query;
    const skip = (page - 1) * limit;
    let query = {};
    if (severity) query.severity = severity;

    const [logs, total] = await Promise.all([
      SecurityLog.find(query).populate('userId', 'username email').sort({ createdAt: -1 }).skip(skip).limit(+limit),
      SecurityLog.countDocuments(query),
    ]);

    return sendSuccess(res, { logs }, 'Security logs fetched', 200, { page: +page, total });
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────
// GET /api/admin/risk-report — Daily risk report
// ─────────────────────────────────────────────────────────
exports.getRiskReport = async (req, res, next) => {
  try {
    const report = await generateDailyRiskReport();
    return sendSuccess(res, { report }, 'Risk report generated');
  } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────
// GET /api/admin/analytics — Platform-wide analytics
// ─────────────────────────────────────────────────────────
exports.getPlatformAnalytics = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [dailyVolume, dailyUsers, riskDistribution, topSenders] = await Promise.all([
      Transaction.aggregate([
        { $match: { createdAt: { $gte: since }, status: 'completed' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, volume: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $bucket: { groupBy: '$riskScore', boundaries: [0, 20, 50, 80, 101], default: 'unknown', output: { count: { $sum: 1 } } } },
      ]),
      Transaction.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: since } } },
        { $group: { _id: '$sender', totalSent: { $sum: '$amount' }, txCount: { $sum: 1 } } },
        { $sort: { totalSent: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { username: '$user.username', totalSent: 1, txCount: 1 } },
      ]),
    ]);

    return sendSuccess(res, { dailyVolume, dailyUsers, riskDistribution, topSenders });
  } catch (error) { next(error); }
};
