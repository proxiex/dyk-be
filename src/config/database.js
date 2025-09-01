const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

/**
 * Prisma client instance with logging
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  errorFormat: 'pretty',
});

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Params: ${e.params}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

// Log database errors
prisma.$on('error', (e) => {
  logger.error('Database error:', e);
});

// Log database info
prisma.$on('info', (e) => {
  logger.info('Database info:', e.message);
});

// Log database warnings
prisma.$on('warn', (e) => {
  logger.warn('Database warning:', e.message);
});

/**
 * Connect to database
 */
const connectDB = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

/**
 * Disconnect from database
 */
const disconnectDB = async () => {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Database disconnection failed:', error);
  }
};

/**
 * Health check for database
 */
const checkDBHealth = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', message: 'Database is responsive' };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return { status: 'unhealthy', message: 'Database is not responsive', error: error.message };
  }
};

module.exports = {
  prisma,
  connectDB,
  disconnectDB,
  checkDBHealth,
};
