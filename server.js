require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const connectDB = require('./src/config/db');
const logger = require('./src/utils/logger');
const { initSocket } = require('./src/socket/socketHandler');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');

// ── Routes ────────────────────────────────────────────────
const authRoutes = require('./src/routes/auth');
const walletRoutes = require('./src/routes/wallet');
const transactionRoutes = require('./src/routes/transactions');
const adminRoutes = require('./src/routes/admin');

// ── Ensure log directory exists ───────────────────────────
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

// ── App setup ─────────────────────────────────────────────// Initialize Express App
const app = express();
// Trigger restart
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
});
initSocket(io);

// ── Make io available in controllers via req.io ───────────
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// ── Security Middleware ───────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Request Parsing ───────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP Logging ──────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ── Global Rate Limiter ───────────────────────────────────
app.use('/api', apiLimiter);

// ── Health Check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);

// ── 404 & Error Handlers ──────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Scheduled Jobs (CRON) ─────────────────────────────────
// Daily risk report at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    const { generateDailyRiskReport } = require('./src/services/riskService');
    const report = await generateDailyRiskReport();
    logger.info(`Daily risk report: ${JSON.stringify(report)}`);
    // Notify all admins via socket
    io.to('admin').emit('admin:risk_report', report);
  } catch (err) {
    logger.error(`Cron risk report error: ${err.message}`);
  }
});

// Balance cache refresh every 5 minutes (optional)
cron.schedule('*/5 * * * *', () => {
  logger.debug('Balance cache refresh tick');
});

// ── Start Server ──────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    logger.info(`🚀 CryptoVault backend running on http://localhost:${PORT}`);
    logger.info(`🌐 Network: ${process.env.SOLANA_NETWORK || 'devnet'}`);
    logger.info(`📡 Socket.io enabled`);
    logger.info(`⏱  CRON jobs scheduled`);
  });
};

startServer().catch((err) => {
  logger.error(`Server startup failed: ${err.message}`);
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Closing server...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

module.exports = { app, io };
