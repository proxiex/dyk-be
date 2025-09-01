const cron = require('node-cron');
const moment = require('moment-timezone');
const { prisma } = require('../config/database');
const { sendDailyFactNotification, retryFailedNotifications, cleanupOldNotifications } = require('./notificationService');
const { cleanupExpiredSessions } = require('../utils/jwt');
const logger = require('../utils/logger');

/**
 * Scheduler service for managing cron jobs
 */
class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Scheduler already running');
      return;
    }

    logger.info('Starting scheduler service');
    this.isRunning = true;

    // Daily fact distribution job - runs every hour
    this.scheduleJob('daily-facts-distribution', '0 * * * *', this.distributeDailyFacts.bind(this));

    // Retry failed notifications - runs every 15 minutes
    this.scheduleJob('retry-failed-notifications', '*/15 * * * *', this.retryFailedNotifications.bind(this));

    // Cleanup expired sessions - runs every hour
    this.scheduleJob('cleanup-expired-sessions', '0 * * * *', this.cleanupExpiredSessions.bind(this));

    // Cleanup old notifications - runs daily at 2 AM
    this.scheduleJob('cleanup-old-notifications', '0 2 * * *', this.cleanupOldNotifications.bind(this));

    // Update user streaks - runs daily at 1 AM
    this.scheduleJob('update-user-streaks', '0 1 * * *', this.updateUserStreaks.bind(this));

    // Generate analytics snapshots - runs daily at 3 AM
    this.scheduleJob('generate-analytics', '0 3 * * *', this.generateDailyAnalytics.bind(this));

    logger.info('All scheduled jobs started successfully');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduler not running');
      return;
    }

    logger.info('Stopping scheduler service');
    
    for (const [name, task] of this.jobs) {
      task.destroy();
      logger.info(`Stopped job: ${name}`);
    }

    this.jobs.clear();
    this.isRunning = false;
    logger.info('All scheduled jobs stopped');
  }

  /**
   * Schedule a new job
   */
  scheduleJob(name, cronExpression, handler) {
    try {
      if (this.jobs.has(name)) {
        logger.warn(`Job ${name} already exists, skipping`);
        return;
      }

      const task = cron.schedule(cronExpression, async () => {
        const startTime = Date.now();
        logger.info(`Starting scheduled job: ${name}`);

        try {
          await handler();
          const duration = Date.now() - startTime;
          logger.info(`Completed scheduled job: ${name} in ${duration}ms`);
        } catch (error) {
          logger.error(`Error in scheduled job ${name}:`, error);
        }
      }, {
        scheduled: false,
        timezone: 'UTC',
      });

      task.start();
      this.jobs.set(name, task);
      logger.info(`Scheduled job: ${name} with cron: ${cronExpression}`);
    } catch (error) {
      logger.error(`Failed to schedule job ${name}:`, error);
    }
  }

  /**
   * Distribute daily facts to users based on their preferences and timezone
   */
  async distributeDailyFacts() {
    try {
      const currentHour = new Date().getUTCHours();
      
      // Get users who should receive notifications at this hour
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          notificationsEnabled: true,
        },
        select: {
          id: true,
          timezone: true,
          dailyNotificationTime: true,
          maxNotificationsPerDay: true,
          weekendNotifications: true,
          difficultyLevel: true,
        },
      });

      const usersToNotify = users.filter(user => {
        // Convert user's notification time to UTC
        const userTime = moment.tz(user.dailyNotificationTime, 'HH:mm', user.timezone);
        const userHourUTC = userTime.utc().hour();
        
        // Check if current UTC hour matches user's notification time
        if (userHourUTC !== currentHour) {
          return false;
        }

        // Check weekend notifications
        const isWeekend = moment().day() === 0 || moment().day() === 6; // Sunday = 0, Saturday = 6
        if (isWeekend && !user.weekendNotifications) {
          return false;
        }

        return true;
      });

      logger.info(`Processing daily facts for ${usersToNotify.length} users`);

      // Process users in batches to avoid overwhelming the system
      const batchSize = 50;
      for (let i = 0; i < usersToNotify.length; i += batchSize) {
        const batch = usersToNotify.slice(i, i + batchSize);
        await Promise.all(batch.map(user => this.sendDailyFactToUser(user)));
        
        // Add small delay between batches
        if (i + batchSize < usersToNotify.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info('Daily facts distribution completed');
    } catch (error) {
      logger.error('Error in daily facts distribution:', error);
      throw error;
    }
  }

  /**
   * Send daily fact to individual user
   */
  async sendDailyFactToUser(user) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if user already received notifications today
      const todayNotifications = await prisma.notification.count({
        where: {
          userId: user.id,
          createdAt: {
            gte: new Date(today),
            lt: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000),
          },
          status: { in: ['SENT', 'DELIVERED'] },
        },
      });

      if (todayNotifications >= user.maxNotificationsPerDay) {
        logger.debug(`User ${user.id} already received max notifications for today`);
        return;
      }

      // Get personalized fact for user
      const fact = await this.getPersonalizedFact(user);
      
      if (!fact) {
        logger.debug(`No suitable fact found for user ${user.id}`);
        return;
      }

      // Send notification
      await sendDailyFactNotification(user.id, fact);
      
      logger.debug(`Daily fact sent to user ${user.id}`, { factId: fact.id });
    } catch (error) {
      logger.error(`Error sending daily fact to user ${user.id}:`, error);
    }
  }

  /**
   * Get personalized fact for user based on preferences and history
   */
  async getPersonalizedFact(user) {
    try {
      // Get user's category preferences
      const userCategories = await prisma.userCategory.findMany({
        where: {
          userId: user.id,
          isEnabled: true,
        },
        select: { categoryId: true },
      });

      // Get facts user has already seen
      const seenFactIds = await prisma.userFact.findMany({
        where: { userId: user.id, isViewed: true },
        select: { factId: true },
      });

      // Build query conditions
      const whereClause = {
        isApproved: true,
        isActive: true,
        publishedAt: { lte: new Date() },
        difficulty: user.difficultyLevel || 'MEDIUM',
      };

      // Filter by user's categories if any
      if (userCategories.length > 0) {
        whereClause.categoryId = {
          in: userCategories.map(uc => uc.categoryId),
        };
      }

      // Exclude already seen facts
      if (seenFactIds.length > 0) {
        whereClause.id = {
          notIn: seenFactIds.map(uf => uf.factId),
        };
      }

      // Get a random fact matching criteria
      const facts = await prisma.fact.findMany({
        where: whereClause,
        take: 10, // Get 10 candidates
        orderBy: [
          { isFeatured: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      if (facts.length === 0) {
        // If no unseen facts, reset and get any fact from user's categories
        delete whereClause.id;
        const fallbackFacts = await prisma.fact.findMany({
          where: whereClause,
          take: 5,
          orderBy: { createdAt: 'desc' },
        });
        
        return fallbackFacts[Math.floor(Math.random() * fallbackFacts.length)] || null;
      }

      // Return random fact from candidates
      return facts[Math.floor(Math.random() * facts.length)];
    } catch (error) {
      logger.error(`Error getting personalized fact for user ${user.id}:`, error);
      return null;
    }
  }

  /**
   * Retry failed notifications
   */
  async retryFailedNotifications() {
    try {
      const result = await retryFailedNotifications();
      logger.info('Retry failed notifications completed', result);
    } catch (error) {
      logger.error('Error in retry failed notifications job:', error);
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const cleanedCount = await cleanupExpiredSessions();
      logger.info('Expired sessions cleanup completed', { cleanedCount });
    } catch (error) {
      logger.error('Error in cleanup expired sessions job:', error);
    }
  }

  /**
   * Cleanup old notifications
   */
  async cleanupOldNotifications() {
    try {
      const result = await cleanupOldNotifications(30); // Keep 30 days
      logger.info('Old notifications cleanup completed', result);
    } catch (error) {
      logger.error('Error in cleanup old notifications job:', error);
    }
  }

  /**
   * Update user learning streaks
   */
  async updateUserStreaks() {
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, currentStreak: true, longestStreak: true, lastActiveDate: true },
      });

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      for (const user of users) {
        const lastActive = user.lastActiveDate;
        
        if (!lastActive) {
          continue;
        }

        // Check if user was active yesterday
        const wasActiveYesterday = lastActive.toDateString() === yesterday.toDateString();
        const wasActiveToday = lastActive.toDateString() === today.toDateString();

        let newStreak = user.currentStreak;

        if (wasActiveToday) {
          // User was active today, maintain or increase streak
          if (wasActiveYesterday) {
            // Continue streak
            newStreak = user.currentStreak;
          } else if (user.currentStreak === 0) {
            // Start new streak
            newStreak = 1;
          }
        } else if (!wasActiveYesterday && user.currentStreak > 0) {
          // User missed yesterday, reset streak
          newStreak = 0;
        }

        // Update user streak if changed
        if (newStreak !== user.currentStreak) {
          const longestStreak = Math.max(user.longestStreak, newStreak);
          
          await prisma.user.update({
            where: { id: user.id },
            data: {
              currentStreak: newStreak,
              longestStreak,
            },
          });
        }
      }

      logger.info('User streaks update completed', { processedUsers: users.length });
    } catch (error) {
      logger.error('Error in update user streaks job:', error);
    }
  }

  /**
   * Generate daily analytics snapshots
   */
  async generateDailyAnalytics() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfDay = new Date(yesterday);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(yesterday);
      endOfDay.setHours(23, 59, 59, 999);

      const [
        newUsers,
        activeUsers,
        factsViewed,
        factsLiked,
        factsShared,
        notificationsSent,
      ] = await Promise.all([
        prisma.user.count({
          where: {
            createdAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        }),
        prisma.user.count({
          where: {
            lastActiveDate: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        }),
        prisma.userFact.count({
          where: {
            viewedAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
            isViewed: true,
          },
        }),
        prisma.userFact.count({
          where: {
            updatedAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
            isLiked: true,
          },
        }),
        prisma.userFact.count({
          where: {
            updatedAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
            isShared: true,
          },
        }),
        prisma.notification.count({
          where: {
            sentAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
            status: 'SENT',
          },
        }),
      ]);

      // Store analytics snapshot
      await prisma.analytics.create({
        data: {
          eventType: 'DAILY_SNAPSHOT',
          eventData: {
            date: yesterday.toISOString().split('T')[0],
            metrics: {
              newUsers,
              activeUsers,
              factsViewed,
              factsLiked,
              factsShared,
              notificationsSent,
            },
          },
          timestamp: new Date(),
        },
      });

      logger.info('Daily analytics snapshot generated', {
        date: yesterday.toISOString().split('T')[0],
        metrics: { newUsers, activeUsers, factsViewed, factsLiked, factsShared, notificationsSent },
      });
    } catch (error) {
      logger.error('Error in generate daily analytics job:', error);
    }
  }

  /**
   * Get job status
   */
  getJobStatus() {
    const jobs = [];
    for (const [name, task] of this.jobs) {
      jobs.push({
        name,
        running: task.running,
        lastExecution: task.lastExecution,
        nextExecution: task.nextExecution,
      });
    }
    
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.size,
      jobs,
    };
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;
