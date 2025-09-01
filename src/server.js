const app = require('./app');
const { connectDB, disconnectDB } = require('./config/database');
const { connectRedis, disconnectRedis } = require('./config/redis');
const schedulerService = require('./services/schedulerService');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

/**
 * Start server
 */
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Connect to Redis (optional, continues without it)
    await connectRedis();
    
    // Start scheduler service (only in non-serverless environments)
    if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production') {
      logger.info('Starting scheduler service');
      schedulerService.start();
    } else {
      logger.info('Scheduler service disabled in serverless environment');
    }
    
    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          // Stop scheduler service
          schedulerService.stop();
          
          await disconnectDB();
          await disconnectRedis();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    };

    // Handle termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();
