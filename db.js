const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    // Attempt to connect to local MongoDB first
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 2000, // Reduced to fail fast
      socketTimeoutMS: 45000,
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    setupEventListeners();
  } catch (error) {
    logger.warn(`Failed to connect to primary MongoDB: ${error.message}`);
    logger.info(`Starting in-memory MongoDB fallback...`);
    
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      
      const mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      
      const conn = await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
      });
      logger.info(`In-Memory MongoDB Connected: ${mongoUri}`);
      setupEventListeners();
    } catch (memError) {
      logger.error(`In-Memory DB failed: ${memError.message}`);
      process.exit(1);
    }
  }
};

const setupEventListeners = () => {
  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${err}`);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting reconnect...');
  });
};

module.exports = connectDB;
