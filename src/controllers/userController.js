const { prisma } = require('../config/database');
const { cache, cacheKeys } = require('../config/redis');
const { successResponse, errorResponse, notFoundResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Get user profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Try to get from cache first
  let user = await cache.get(cacheKeys.userProfile(userId));

  if (!user) {
    // Get from database
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        dateOfBirth: true,
        timezone: true,
        isEmailVerified: true,
        role: true,
        notificationsEnabled: true,
        dailyNotificationTime: true,
        maxNotificationsPerDay: true,
        weekendNotifications: true,
        difficultyLevel: true,
        languagePreference: true,
        totalFactsViewed: true,
        totalFactsLiked: true,
        totalFactsBookmarked: true,
        currentStreak: true,
        longestStreak: true,
        lastActiveDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return notFoundResponse(res, 'User');
    }

    // Cache the user data
    await cache.set(cacheKeys.userProfile(userId), user, 3600); // 1 hour
  }

  successResponse(res, 'Profile retrieved successfully', { user });
});

/**
 * Update user profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { firstName, lastName, dateOfBirth, timezone, avatar } = req.body;

  const updateData = {};
  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
  if (timezone !== undefined) updateData.timezone = timezone;
  if (avatar !== undefined) updateData.avatar = avatar;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
      dateOfBirth: true,
      timezone: true,
      isEmailVerified: true,
      role: true,
      updatedAt: true,
    },
  });

  // Update cache
  await cache.del(cacheKeys.userProfile(userId));
  await cache.set(cacheKeys.userProfile(userId), user, 3600);

  // Log profile update
  logger.logUserAction('PROFILE_UPDATED', userId, { updateData });

  successResponse(res, 'Profile updated successfully', { user });
});

/**
 * Get user statistics
 */
const getStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Try to get from cache first
  let stats = await cache.get(cacheKeys.userStats(userId));

  if (!stats) {
    // Get user stats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        totalFactsViewed: true,
        totalFactsLiked: true,
        totalFactsBookmarked: true,
        currentStreak: true,
        longestStreak: true,
        lastActiveDate: true,
        createdAt: true,
      },
    });

    if (!user) {
      return notFoundResponse(res, 'User');
    }

    // Get additional stats from UserFact table
    const [
      factsViewedThisWeek,
      factsViewedThisMonth,
      bookmarkedFacts,
      likedFacts,
      categoriesEngaged,
    ] = await Promise.all([
      prisma.userFact.count({
        where: {
          userId,
          isViewed: true,
          viewedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
      prisma.userFact.count({
        where: {
          userId,
          isViewed: true,
          viewedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      prisma.userFact.count({
        where: { userId, isBookmarked: true },
      }),
      prisma.userFact.count({
        where: { userId, isLiked: true },
      }),
      prisma.userFact.groupBy({
        by: ['factId'],
        where: {
          userId,
          isViewed: true,
        },
        _count: {
          factId: true,
        },
      }),
    ]);

    // Get category breakdown
    const categoryStats = await prisma.userFact.findMany({
      where: {
        userId,
        isViewed: true,
      },
      include: {
        fact: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                color: true,
              },
            },
          },
        },
      },
    });

    const categoryBreakdown = categoryStats.reduce((acc, userFact) => {
      const category = userFact.fact.category;
      if (!acc[category.id]) {
        acc[category.id] = {
          category: category,
          count: 0,
        };
      }
      acc[category.id].count++;
      return acc;
    }, {});

    stats = {
      ...user,
      factsViewedThisWeek,
      factsViewedThisMonth,
      bookmarkedFactsCount: bookmarkedFacts,
      likedFactsCount: likedFacts,
      categoriesEngaged: Object.keys(categoryBreakdown).length,
      categoryBreakdown: Object.values(categoryBreakdown),
      memberSince: user.createdAt,
      streakData: {
        current: user.currentStreak,
        longest: user.longestStreak,
        lastActive: user.lastActiveDate,
      },
    };

    // Cache the stats
    await cache.set(cacheKeys.userStats(userId), stats, 1800); // 30 minutes
  }

  successResponse(res, 'User statistics retrieved successfully', { stats });
});

/**
 * Update notification settings
 */
const updateNotificationSettings = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    notificationsEnabled,
    dailyNotificationTime,
    maxNotificationsPerDay,
    weekendNotifications,
  } = req.body;

  const updateData = {};
  if (notificationsEnabled !== undefined) updateData.notificationsEnabled = notificationsEnabled;
  if (dailyNotificationTime !== undefined) updateData.dailyNotificationTime = dailyNotificationTime;
  if (maxNotificationsPerDay !== undefined) updateData.maxNotificationsPerDay = maxNotificationsPerDay;
  if (weekendNotifications !== undefined) updateData.weekendNotifications = weekendNotifications;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      notificationsEnabled: true,
      dailyNotificationTime: true,
      maxNotificationsPerDay: true,
      weekendNotifications: true,
      updatedAt: true,
    },
  });

  // Update cache
  await cache.del(cacheKeys.userProfile(userId));

  // Log settings update
  logger.logUserAction('NOTIFICATION_SETTINGS_UPDATED', userId, { updateData });

  successResponse(res, 'Notification settings updated successfully', { settings: user });
});

/**
 * Update topic preferences
 */
const updateTopicPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { categories, difficultyLevel } = req.body;

  // Start transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update difficulty level if provided
    if (difficultyLevel) {
      await tx.user.update({
        where: { id: userId },
        data: { difficultyLevel },
      });
    }

    if (categories && Array.isArray(categories)) {
      // Delete existing user categories
      await tx.userCategory.deleteMany({
        where: { userId },
      });

      // Create new user categories
      if (categories.length > 0) {
        await tx.userCategory.createMany({
          data: categories.map(categoryId => ({
            userId,
            categoryId,
            isEnabled: true,
          })),
        });
      }
    }

    // Get updated user preferences
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        difficultyLevel: true,
        languagePreference: true,
      },
    });

    const userCategories = await tx.userCategory.findMany({
      where: { userId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            description: true,
            icon: true,
            color: true,
          },
        },
      },
    });

    return {
      user,
      categories: userCategories.map(uc => uc.category),
    };
  });

  // Clear caches
  await cache.del(cacheKeys.userProfile(userId));
  await cache.del(cacheKeys.userPreferences(userId));

  // Log preferences update
  logger.logUserAction('TOPIC_PREFERENCES_UPDATED', userId, {
    categories: categories || [],
    difficultyLevel,
  });

  successResponse(res, 'Topic preferences updated successfully', result);
});

/**
 * Get user's bookmarked facts
 */
const getBookmarkedFacts = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [bookmarkedFacts, total] = await Promise.all([
    prisma.userFact.findMany({
      where: {
        userId,
        isBookmarked: true,
      },
      include: {
        fact: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      skip,
      take: limit,
    }),
    prisma.userFact.count({
      where: {
        userId,
        isBookmarked: true,
      },
    }),
  ]);

  const facts = bookmarkedFacts.map(uf => ({
    ...uf.fact,
    bookmarkedAt: uf.updatedAt,
    isLiked: uf.isLiked,
    isViewed: uf.isViewed,
  }));

  paginatedResponse(res, 'Bookmarked facts retrieved successfully', { facts }, {
    page,
    limit,
    total,
  });
});

/**
 * Get user's liked facts
 */
const getLikedFacts = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [likedFacts, total] = await Promise.all([
    prisma.userFact.findMany({
      where: {
        userId,
        isLiked: true,
      },
      include: {
        fact: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      skip,
      take: limit,
    }),
    prisma.userFact.count({
      where: {
        userId,
        isLiked: true,
      },
    }),
  ]);

  const facts = likedFacts.map(uf => ({
    ...uf.fact,
    likedAt: uf.updatedAt,
    isBookmarked: uf.isBookmarked,
    isViewed: uf.isViewed,
  }));

  paginatedResponse(res, 'Liked facts retrieved successfully', { facts }, {
    page,
    limit,
    total,
  });
});

/**
 * Get user's learning history
 */
const getLearningHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [history, total] = await Promise.all([
    prisma.userFact.findMany({
      where: {
        userId,
        isViewed: true,
      },
      include: {
        fact: {
          select: {
            id: true,
            title: true,
            shortContent: true,
            difficulty: true,
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: {
        viewedAt: 'desc',
      },
      skip,
      take: limit,
    }),
    prisma.userFact.count({
      where: {
        userId,
        isViewed: true,
      },
    }),
  ]);

  const learningHistory = history.map(uf => ({
    factId: uf.fact.id,
    title: uf.fact.title,
    shortContent: uf.fact.shortContent,
    difficulty: uf.fact.difficulty,
    category: uf.fact.category,
    viewedAt: uf.viewedAt,
    timeSpent: uf.timeSpent,
    isLiked: uf.isLiked,
    isBookmarked: uf.isBookmarked,
    isShared: uf.isShared,
  }));

  paginatedResponse(res, 'Learning history retrieved successfully', { history: learningHistory }, {
    page,
    limit,
    total,
  });
});

/**
 * Delete user account
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { password } = req.body;

  // Verify password before deletion
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true, email: true },
  });

  const bcrypt = require('bcryptjs');
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return errorResponse(res, 'Invalid password', null, 400);
  }

  // Soft delete - mark account as inactive instead of hard delete
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      email: `deleted_${Date.now()}_${user.email}`, // Anonymize email
    },
  });

  // Invalidate all sessions
  const { invalidateAllUserSessions } = require('../utils/jwt');
  await invalidateAllUserSessions(userId);

  // Clear all caches
  await cache.del(cacheKeys.userProfile(userId));
  await cache.del(cacheKeys.userStats(userId));
  await cache.del(cacheKeys.userPreferences(userId));

  // Log account deletion
  logger.logUserAction('ACCOUNT_DELETED', userId, {
    email: user.email,
    timestamp: new Date(),
  });

  successResponse(res, 'Account deleted successfully');
});

module.exports = {
  getProfile,
  updateProfile,
  getStats,
  updateNotificationSettings,
  updateTopicPreferences,
  getBookmarkedFacts,
  getLikedFacts,
  getLearningHistory,
  deleteAccount,
};
