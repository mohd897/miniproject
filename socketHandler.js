const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');

// Track connected users: userId -> Set of socket IDs
const connectedUsers = new Map();

const initSocket = (io) => {
  // ── Authentication middleware ─────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));

      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.id).select('username email role isActive isFrozen');
      if (!user || !user.isActive) return next(new Error('Unauthorized'));

      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`Socket connected: ${socket.user.username} (${socket.id})`);

    // Track connections
    if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
    connectedUsers.get(userId).add(socket.id);

    // Join personal room
    socket.join(`user:${userId}`);

    // Join admin room if admin
    if (socket.user.role === 'admin') socket.join('admin');

    // Emit online status to user's contacts (optional)
    socket.broadcast.emit('user:online', { userId, username: socket.user.username });

    // ── Events ──────────────────────────────────────────
    socket.on('subscribe:transaction', (txId) => {
      socket.join(`tx:${txId}`);
    });

    socket.on('unsubscribe:transaction', (txId) => {
      socket.leave(`tx:${txId}`);
    });

    socket.on('disconnect', () => {
      const sockets = connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) connectedUsers.delete(userId);
      }
      logger.info(`Socket disconnected: ${socket.user.username}`);
    });
  });

  return io;
};

// ── Emit helpers (called from controllers) ────────────────

/**
 * Notify a specific user
 */
const emitToUser = (io, userId, event, data) => {
  io.to(`user:${userId.toString()}`).emit(event, data);
};

/**
 * Notify all admins
 */
const emitToAdmins = (io, event, data) => {
  io.to('admin').emit(event, data);
};

/**
 * Broadcast transaction status update
 */
const emitTransactionUpdate = (io, txId, status, data) => {
  io.to(`tx:${txId}`).emit('transaction:update', { txId, status, ...data });
};

/**
 * Get count of online users
 */
const getOnlineUserCount = () => connectedUsers.size;

module.exports = { initSocket, emitToUser, emitToAdmins, emitTransactionUpdate, getOnlineUserCount };
