const express = require('express');
const { checkDBHealth } = require('../config/database');
const { checkRedisHealth } = require('../config/redis');
const { successResponse, errorResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { prisma } = require('../config/database');

const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *                     version:
 *                       type: string
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };

  successResponse(res, 'Service is healthy', healthData);
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Detailed health check including dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *                     version:
 *                       type: string
 *                     dependencies:
 *                       type: object
 *                       properties:
 *                         database:
 *                           type: object
 *                         redis:
 *                           type: object
 *                     system:
 *                       type: object
 *                       properties:
 *                         memory:
 *                           type: object
 *                         cpu:
 *                           type: object
 *       503:
 *         description: Service is unhealthy
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  const startTime = Date.now();

  // Check all dependencies
  const [databaseHealth, redisHealth] = await Promise.allSettled([
    checkDBHealth(),
    checkRedisHealth(),
  ]);

  // Get system metrics
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  // Determine overall health status
  const isHealthy = 
    databaseHealth.status === 'fulfilled' && 
    databaseHealth.value.status === 'healthy';

  const healthData = {
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    responseTime: Date.now() - startTime,
    dependencies: {
      database: databaseHealth.status === 'fulfilled' 
        ? databaseHealth.value 
        : { status: 'unhealthy', error: databaseHealth.reason?.message },
      redis: redisHealth.status === 'fulfilled' 
        ? redisHealth.value 
        : { status: 'unhealthy', error: redisHealth.reason?.message },
    },
    system: {
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      nodejs: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };

  const statusCode = isHealthy ? 200 : 503;
  const message = isHealthy ? 'All systems operational' : 'Some systems are experiencing issues';

  res.status(statusCode);
  successResponse(res, message, healthData, null, statusCode);
}));

/**
 * @swagger
 * /health/database:
 *   get:
 *     summary: Database connectivity check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database is healthy
 *       503:
 *         description: Database is unhealthy
 */
router.get('/database', asyncHandler(async (req, res) => {
  const dbHealth = await checkDBHealth();
  const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
  
  res.status(statusCode);
  successResponse(res, dbHealth.message, { database: dbHealth }, null, statusCode);
}));

/**
 * @swagger
 * /health/redis:
 *   get:
 *     summary: Redis connectivity check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Redis is healthy
 *       503:
 *         description: Redis is unhealthy
 */
router.get('/redis', asyncHandler(async (req, res) => {
  const redisHealth = await checkRedisHealth();
  const statusCode = redisHealth.status === 'healthy' ? 200 : 503;
  
  res.status(statusCode);
  successResponse(res, redisHealth.message, { redis: redisHealth }, null, statusCode);
}));

/**
 * @swagger
 * /health/metrics:
 *   get:
 *     summary: Application metrics
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application metrics
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  const [
    userCount,
    factCount,
    activeSessionCount,
    recentViewCount,
  ] = await Promise.allSettled([
    prisma.user.count({ where: { isActive: true } }),
    prisma.fact.count({ where: { isApproved: true, isActive: true } }),
    prisma.userSession.count({ 
      where: { 
        isActive: true, 
        expiresAt: { gt: new Date() } 
      } 
    }),
    prisma.userFact.count({ 
      where: { 
        isViewed: true,
        viewedAt: { 
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      } 
    }),
  ]);

  const metrics = {
    timestamp: new Date().toISOString(),
    application: {
      users: {
        total: userCount.status === 'fulfilled' ? userCount.value : 0,
      },
      facts: {
        total: factCount.status === 'fulfilled' ? factCount.value : 0,
      },
      sessions: {
        active: activeSessionCount.status === 'fulfilled' ? activeSessionCount.value : 0,
      },
      engagement: {
        viewsLast24h: recentViewCount.status === 'fulfilled' ? recentViewCount.value : 0,
      },
    },
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      versions: {
        node: process.version,
        npm: process.env.npm_config_user_agent,
      },
    },
  };

  successResponse(res, 'Application metrics retrieved successfully', metrics);
}));

/**
 * @swagger
 * /health/readiness:
 *   get:
 *     summary: Readiness probe for container orchestration
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is ready to serve traffic
 *       503:
 *         description: Application is not ready
 */
router.get('/readiness', asyncHandler(async (req, res) => {
  try {
    // Check critical dependencies
    const dbHealth = await checkDBHealth();
    
    if (dbHealth.status !== 'healthy') {
      logger.warn('Readiness check failed - database not healthy', dbHealth);
      return res.status(503).json({
        success: false,
        message: 'Application not ready - database unavailable',
        timestamp: new Date().toISOString(),
      });
    }

    // Application is ready
    res.status(200).json({
      success: true,
      message: 'Application is ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check error:', error);
    res.status(503).json({
      success: false,
      message: 'Application not ready - internal error',
      timestamp: new Date().toISOString(),
    });
  }
}));

/**
 * @swagger
 * /health/liveness:
 *   get:
 *     summary: Liveness probe for container orchestration
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is alive
 *       503:
 *         description: Application should be restarted
 */
router.get('/liveness', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    success: true,
    message: 'Application is alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
