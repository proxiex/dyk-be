const { prisma } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Analytics service for tracking user engagement and system metrics
 */
class AnalyticsService {
  constructor() {
    this.CACHE_TTL = 1800; // 30 minutes
    this.BATCH_SIZE = 100;
    this.eventQueue = [];
  }

  /**
   * Track user event
   */
  async trackEvent(eventType, eventData, userId = null, metadata = {}) {
    try {
      const event = {
        eventType,
        eventData: typeof eventData === 'object' ? eventData : { data: eventData },
        userId,
        metadata: {
          ...metadata,
          timestamp: new Date(),
          userAgent: metadata.userAgent || null,
          ipAddress: metadata.ipAddress || null,
        },
        timestamp: new Date(),
      };

      // Add to queue for batch processing
      this.eventQueue.push(event);

      // Process queue if it reaches batch size
      if (this.eventQueue.length >= this.BATCH_SIZE) {
        await this.flushEventQueue();
      }

      logger.debug('Event tracked', { eventType, userId });
    } catch (error) {
      logger.error('Error tracking event:', error);
    }
  }

  /**
   * Flush event queue to database
   */
  async flushEventQueue() {
    if (this.eventQueue.length === 0) return;

    try {
      const events = [...this.eventQueue];
      this.eventQueue = [];

      await prisma.analytics.createMany({
        data: events,
        skipDuplicates: true,
      });

      logger.debug(`Flushed ${events.length} events to database`);
    } catch (error) {
      logger.error('Error flushing event queue:', error);
      // Re-add events to queue for retry
      this.eventQueue.unshift(...this.eventQueue);
    }
  }

  /**
   * Track user registration
   */
  async trackUserRegistration(userId, registrationData) {
    await this.trackEvent('USER_REGISTRATION', {
      source: registrationData.source || 'direct',
      method: registrationData.method || 'email',
      referrer: registrationData.referrer,
    }, userId, {
      userAgent: registrationData.userAgent,
      ipAddress: registrationData.ipAddress,
    });
  }

  /**
   * Track user login
   */
  async trackUserLogin(userId, loginData) {
    await this.trackEvent('USER_LOGIN', {
      method: loginData.method || 'email',
      deviceType: loginData.deviceType,
      success: loginData.success !== false,
    }, userId, {
      userAgent: loginData.userAgent,
      ipAddress: loginData.ipAddress,
    });
  }

  /**
   * Track fact view
   */
  async trackFactView(userId, factId, viewData = {}) {
    const fact = await prisma.fact.findUnique({
      where: { id: factId },
      select: { categoryId: true, difficulty: true, tags: true },
    });

    await this.trackEvent('FACT_VIEWED', {
      factId,
      categoryId: fact?.categoryId,
      difficulty: fact?.difficulty,
      tags: fact?.tags,
      duration: viewData.duration,
      source: viewData.source || 'unknown',
    }, userId);

    // Update fact view count
    await prisma.fact.update({
      where: { id: factId },
      data: { viewCount: { increment: 1 } },
    });
  }

  /**
   * Track fact interaction (like, bookmark, share)
   */
  async trackFactInteraction(userId, factId, interactionType, interactionData = {}) {
    const fact = await prisma.fact.findUnique({
      where: { id: factId },
      select: { categoryId: true, difficulty: true },
    });

    await this.trackEvent(`FACT_${interactionType.toUpperCase()}`, {
      factId,
      categoryId: fact?.categoryId,
      difficulty: fact?.difficulty,
      ...interactionData,
    }, userId);

    // Update fact interaction counts
    const incrementField = `${interactionType.toLowerCase()}Count`;
    await prisma.fact.update({
      where: { id: factId },
      data: { [incrementField]: { increment: 1 } },
    });
  }

  /**
   * Track notification events
   */
  async trackNotification(userId, notificationId, eventType, eventData = {}) {
    await this.trackEvent(`NOTIFICATION_${eventType.toUpperCase()}`, {
      notificationId,
      factId: eventData.factId,
      deliveryTime: eventData.deliveryTime,
      ...eventData,
    }, userId);
  }

  /**
   * Track search query
   */
  async trackSearch(userId, query, results) {
    await this.trackEvent('SEARCH_PERFORMED', {
      query,
      resultCount: results.length,
      categories: [...new Set(results.map(r => r.categoryId))],
      hasResults: results.length > 0,
    }, userId);
  }

  /**
   * Track user session activity
   */
  async trackSessionActivity(userId, sessionData) {
    await this.trackEvent('SESSION_ACTIVITY', {
      duration: sessionData.duration,
      factsViewed: sessionData.factsViewed,
      interactions: sessionData.interactions,
      categories: sessionData.categories,
    }, userId);
  }

  /**
   * Get user engagement metrics
   */
  async getUserEngagementMetrics(userId, timeframe = '30d') {
    try {
      const cacheKey = `user_engagement:${userId}:${timeframe}`;
      let metrics = await cacheGet(cacheKey);

      if (metrics) {
        return JSON.parse(metrics);
      }

      const startDate = this.getStartDateForTimeframe(timeframe);

      const [
        totalViews,
        totalLikes,
        totalBookmarks,
        totalShares,
        uniqueCategories,
        averageSessionDuration,
        streakData,
      ] = await Promise.all([
        // Total fact views
        prisma.analytics.count({
          where: {
            userId,
            eventType: 'FACT_VIEWED',
            timestamp: { gte: startDate },
          },
        }),
        // Total likes
        prisma.analytics.count({
          where: {
            userId,
            eventType: 'FACT_LIKED',
            timestamp: { gte: startDate },
          },
        }),
        // Total bookmarks
        prisma.analytics.count({
          where: {
            userId,
            eventType: 'FACT_BOOKMARKED',
            timestamp: { gte: startDate },
          },
        }),
        // Total shares
        prisma.analytics.count({
          where: {
            userId,
            eventType: 'FACT_SHARED',
            timestamp: { gte: startDate },
          },
        }),
        // Unique categories viewed
        prisma.analytics.findMany({
          where: {
            userId,
            eventType: 'FACT_VIEWED',
            timestamp: { gte: startDate },
          },
          select: {
            eventData: true,
          },
          distinct: ['eventData'],
        }),
        // Average session duration
        prisma.analytics.aggregate({
          where: {
            userId,
            eventType: 'SESSION_ACTIVITY',
            timestamp: { gte: startDate },
          },
          _avg: {
            eventData: true,
          },
        }),
        // Current user streak
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            currentStreak: true,
            longestStreak: true,
            lastActiveDate: true,
          },
        }),
      ]);

      // Process unique categories
      const categoryIds = new Set();
      uniqueCategories.forEach(item => {
        if (item.eventData && item.eventData.categoryId) {
          categoryIds.add(item.eventData.categoryId);
        }
      });

      metrics = {
        totalViews,
        totalLikes,
        totalBookmarks,
        totalShares,
        uniqueCategories: categoryIds.size,
        averageSessionDuration: averageSessionDuration._avg?.eventData?.duration || 0,
        engagementRate: totalViews > 0 ? (totalLikes + totalBookmarks + totalShares) / totalViews : 0,
        currentStreak: streakData?.currentStreak || 0,
        longestStreak: streakData?.longestStreak || 0,
        lastActive: streakData?.lastActiveDate,
        timeframe,
      };

      // Cache for 30 minutes
      await cacheSet(cacheKey, JSON.stringify(metrics), this.CACHE_TTL);
      return metrics;
    } catch (error) {
      logger.error(`Error getting engagement metrics for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get system-wide analytics
   */
  async getSystemAnalytics(timeframe = '30d') {
    try {
      const cacheKey = `system_analytics:${timeframe}`;
      let analytics = await cacheGet(cacheKey);

      if (analytics) {
        return JSON.parse(analytics);
      }

      const startDate = this.getStartDateForTimeframe(timeframe);

      const [
        totalUsers,
        activeUsers,
        newUsers,
        totalFacts,
        totalViews,
        totalInteractions,
        topCategories,
        userRetention,
      ] = await Promise.all([
        // Total users
        prisma.user.count(),
        // Active users in timeframe
        prisma.user.count({
          where: {
            lastActiveDate: { gte: startDate },
          },
        }),
        // New users in timeframe
        prisma.user.count({
          where: {
            createdAt: { gte: startDate },
          },
        }),
        // Total facts
        prisma.fact.count({
          where: { isApproved: true },
        }),
        // Total views in timeframe
        prisma.analytics.count({
          where: {
            eventType: 'FACT_VIEWED',
            timestamp: { gte: startDate },
          },
        }),
        // Total interactions in timeframe
        prisma.analytics.count({
          where: {
            eventType: { in: ['FACT_LIKED', 'FACT_BOOKMARKED', 'FACT_SHARED'] },
            timestamp: { gte: startDate },
          },
        }),
        // Top categories by views
        this.getTopCategories(startDate),
        // User retention metrics
        this.getUserRetentionMetrics(startDate),
      ]);

      analytics = {
        totalUsers,
        activeUsers,
        newUsers,
        totalFacts,
        totalViews,
        totalInteractions,
        engagementRate: totalViews > 0 ? totalInteractions / totalViews : 0,
        topCategories,
        userRetention,
        timeframe,
        generatedAt: new Date(),
      };

      // Cache for 1 hour
      await cacheSet(cacheKey, JSON.stringify(analytics), 3600);
      return analytics;
    } catch (error) {
      logger.error('Error getting system analytics:', error);
      return null;
    }
  }

  /**
   * Get top categories by engagement
   */
  async getTopCategories(startDate, limit = 10) {
    try {
      const categoryViews = await prisma.analytics.groupBy({
        by: ['eventData'],
        where: {
          eventType: 'FACT_VIEWED',
          timestamp: { gte: startDate },
        },
        _count: {
          _all: true,
        },
        orderBy: {
          _count: {
            _all: 'desc',
          },
        },
        take: limit,
      });

      // Get category details
      const categoryIds = categoryViews
        .map(cv => cv.eventData?.categoryId)
        .filter(Boolean);

      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
        },
      });

      const categoryMap = categories.reduce((acc, cat) => {
        acc[cat.id] = cat;
        return acc;
      }, {});

      return categoryViews.map(cv => ({
        category: categoryMap[cv.eventData?.categoryId] || null,
        views: cv._count._all,
      })).filter(item => item.category);
    } catch (error) {
      logger.error('Error getting top categories:', error);
      return [];
    }
  }

  /**
   * Get user retention metrics
   */
  async getUserRetentionMetrics(startDate) {
    try {
      const totalUsers = await prisma.user.count({
        where: { createdAt: { gte: startDate } },
      });

      if (totalUsers === 0) return { retention1d: 0, retention7d: 0, retention30d: 0 };

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [retention1d, retention7d, retention30d] = await Promise.all([
        prisma.user.count({
          where: {
            createdAt: { gte: startDate },
            lastActiveDate: { gte: oneDayAgo },
          },
        }),
        prisma.user.count({
          where: {
            createdAt: { gte: startDate },
            lastActiveDate: { gte: sevenDaysAgo },
          },
        }),
        prisma.user.count({
          where: {
            createdAt: { gte: startDate },
            lastActiveDate: { gte: thirtyDaysAgo },
          },
        }),
      ]);

      return {
        retention1d: retention1d / totalUsers,
        retention7d: retention7d / totalUsers,
        retention30d: retention30d / totalUsers,
      };
    } catch (error) {
      logger.error('Error calculating user retention:', error);
      return { retention1d: 0, retention7d: 0, retention30d: 0 };
    }
  }

  /**
   * Get popular content analytics
   */
  async getPopularContent(timeframe = '7d', limit = 10) {
    try {
      const startDate = this.getStartDateForTimeframe(timeframe);

      // Get most viewed facts
      const popularFacts = await prisma.analytics.groupBy({
        by: ['eventData'],
        where: {
          eventType: 'FACT_VIEWED',
          timestamp: { gte: startDate },
        },
        _count: { _all: true },
        orderBy: { _count: { _all: 'desc' } },
        take: limit,
      });

      // Get fact details
      const factIds = popularFacts
        .map(pf => pf.eventData?.factId)
        .filter(Boolean);

      const facts = await prisma.fact.findMany({
        where: { id: { in: factIds } },
        include: {
          category: {
            select: { name: true, icon: true },
          },
        },
      });

      const factMap = facts.reduce((acc, fact) => {
        acc[fact.id] = fact;
        return acc;
      }, {});

      return popularFacts.map(pf => ({
        fact: factMap[pf.eventData?.factId] || null,
        views: pf._count._all,
      })).filter(item => item.fact);
    } catch (error) {
      logger.error('Error getting popular content:', error);
      return [];
    }
  }

  /**
   * Track A/B test event
   */
  async trackABTest(userId, testName, variant, eventType, eventData = {}) {
    await this.trackEvent('AB_TEST', {
      testName,
      variant,
      eventType,
      ...eventData,
    }, userId);
  }

  /**
   * Get A/B test results
   */
  async getABTestResults(testName, startDate = null) {
    try {
      const whereClause = {
        eventType: 'AB_TEST',
        eventData: {
          path: ['testName'],
          equals: testName,
        },
      };

      if (startDate) {
        whereClause.timestamp = { gte: startDate };
      }

      const results = await prisma.analytics.groupBy({
        by: ['eventData'],
        where: whereClause,
        _count: { _all: true },
      });

      return results.reduce((acc, result) => {
        const variant = result.eventData?.variant;
        if (variant) {
          acc[variant] = (acc[variant] || 0) + result._count._all;
        }
        return acc;
      }, {});
    } catch (error) {
      logger.error(`Error getting A/B test results for ${testName}:`, error);
      return {};
    }
  }

  /**
   * Helper method to get start date based on timeframe
   */
  getStartDateForTimeframe(timeframe) {
    const now = new Date();
    const match = timeframe.match(/^(\d+)([dwhm])$/);
    
    if (!match) {
      // Default to 30 days
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [, amount, unit] = match;
    const multipliers = {
      m: 60 * 1000,              // minutes
      h: 60 * 60 * 1000,         // hours
      d: 24 * 60 * 60 * 1000,    // days
      w: 7 * 24 * 60 * 60 * 1000, // weeks
    };

    const milliseconds = parseInt(amount) * multipliers[unit];
    return new Date(now.getTime() - milliseconds);
  }

  /**
   * Generate daily analytics snapshot
   */
  async generateDailySnapshot() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfDay = new Date(yesterday);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(yesterday);
      endOfDay.setHours(23, 59, 59, 999);

      const metrics = await this.getSystemAnalytics('1d');

      await this.trackEvent('DAILY_SNAPSHOT', {
        date: yesterday.toISOString().split('T')[0],
        metrics,
      });

      logger.info('Daily analytics snapshot generated', { date: yesterday.toISOString().split('T')[0] });
    } catch (error) {
      logger.error('Error generating daily snapshot:', error);
    }
  }

  /**
   * Clean up old analytics data
   */
  async cleanupOldData(retentionDays = 90) {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const deleted = await prisma.analytics.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
          eventType: { not: 'DAILY_SNAPSHOT' }, // Keep daily snapshots longer
        },
      });

      logger.info(`Cleaned up ${deleted.count} old analytics records`);
      return deleted.count;
    } catch (error) {
      logger.error('Error cleaning up old analytics data:', error);
      return 0;
    }
  }
}

module.exports = new AnalyticsService();
