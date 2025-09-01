const redis = require('redis');
const logger = require('../utils/logger');

/**
 * Redis client configuration
 */
const createRedisConfig = () => {
  // If REDIS_URL is provided, use it (common for managed Redis services)
  if (process.env.REDIS_URL) {
    return {
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis max reconnection attempts reached');
            return false;
          }
          return Math.min(retries * 50, 500);
        },
      },
    };
  }

  // Otherwise, use individual connection parameters
  return {
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis max reconnection attempts reached');
          return false;
        }
        return Math.min(retries * 50, 500);
      },
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DB) || 0,
  };
};

/**
 * Create Redis client
 */
const client = redis.createClient(createRedisConfig());

/**
 * Redis event handlers
 */
client.on('connect', () => {
  logger.info('Redis client connected');
});

client.on('ready', () => {
  logger.info('Redis client ready');
});

client.on('error', (err) => {
  logger.error('Redis client error:', err);
});

client.on('end', () => {
  logger.info('Redis client disconnected');
});

/**
 * Redis reconnection strategy
 */
client.on('reconnecting', (attempt) => {
  logger.info(`Redis reconnecting... attempt ${attempt}`);
});

/**
 * Connect to Redis
 */
const connectRedis = async () => {
  try {
    if (!client.isOpen) {
      await client.connect();
      logger.info('Redis connected successfully');
    }
  } catch (error) {
    logger.error('Redis connection failed:', error);
    logger.warn('Continuing without Redis cache - performance may be affected');
    // Don't exit process for Redis failures, continue without caching
  }
};

/**
 * Disconnect from Redis
 */
const disconnectRedis = async () => {
  try {
    await client.quit();
    logger.info('Redis disconnected successfully');
  } catch (error) {
    logger.error('Redis disconnection failed:', error);
  }
};

/**
 * Redis cache utility functions
 */
const cache = {
  /**
   * Get value from cache
   */
  get: async (key) => {
    try {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  },

  /**
   * Set value in cache with expiration
   */
  set: async (key, value, expireInSeconds = 3600) => {
    try {
      await client.setEx(key, expireInSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Redis set error:', error);
      return false;
    }
  },

  /**
   * Delete key from cache
   */
  del: async (key) => {
    try {
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis del error:', error);
      return false;
    }
  },

  /**
   * Check if key exists
   */
  exists: async (key) => {
    try {
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis exists error:', error);
      return false;
    }
  },

  /**
   * Set expiration for key
   */
  expire: async (key, seconds) => {
    try {
      await client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Redis expire error:', error);
      return false;
    }
  },

  /**
   * Increment value
   */
  incr: async (key) => {
    try {
      return await client.incr(key);
    } catch (error) {
      logger.error('Redis incr error:', error);
      return null;
    }
  },

  /**
   * Hash operations
   */
  hget: async (key, field) => {
    try {
      const value = await client.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis hget error:', error);
      return null;
    }
  },

  hset: async (key, field, value, expireInSeconds = 3600) => {
    try {
      await client.hSet(key, field, JSON.stringify(value));
      await client.expire(key, expireInSeconds);
      return true;
    } catch (error) {
      logger.error('Redis hset error:', error);
      return false;
    }
  },

  /**
   * List operations
   */
  lpush: async (key, value) => {
    try {
      return await client.lPush(key, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis lpush error:', error);
      return null;
    }
  },

  rpop: async (key) => {
    try {
      const value = await client.rPop(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis rpop error:', error);
      return null;
    }
  },
};

/**
 * Cache key generators
 */
const cacheKeys = {
  userSession: (userId, sessionId) => `session:${userId}:${sessionId}`,
  userProfile: (userId) => `user:${userId}`,
  dailyFacts: (userId, date) => `daily_facts:${userId}:${date}`,
  factsByCategory: (categoryId, page, limit) => `facts:category:${categoryId}:${page}:${limit}`,
  userStats: (userId) => `stats:${userId}`,
  popularFacts: (date) => `popular_facts:${date}`,
  categories: () => 'categories:all',
  factDetails: (factId) => `fact:${factId}`,
  userPreferences: (userId) => `preferences:${userId}`,
  searchResults: (query, filters) => `search:${Buffer.from(JSON.stringify({ query, filters })).toString('base64')}`,
};

/**
 * Health check for Redis
 */
const checkRedisHealth = async () => {
  try {
    await client.ping();
    return { status: 'healthy', message: 'Redis is responsive' };
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return { status: 'unhealthy', message: 'Redis is not responsive', error: error.message };
  }
};

module.exports = {
  client,
  connectRedis,
  disconnectRedis,
  cache,
  cacheKeys,
  checkRedisHealth,
};
