const { prisma } = require('../config/database');
const { cache, cacheKeys } = require('../config/redis');
const { successResponse, errorResponse, notFoundResponse, paginatedResponse } = require('../utils/response');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const personalizationService = require('../services/personalizationService');
const analyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

/**
 * Get daily facts for user
 */
const getDailyFacts = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const limit = parseInt(req.query.limit) || 3;

  // Try to get from cache first
  const cacheKey = userId ? cacheKeys.dailyFacts(userId, date) : `daily_facts:anonymous:${date}`;
  let facts = await cache.get(cacheKey);

  if (!facts) {
    // If user is authenticated, get personalized facts
    if (userId) {
      facts = await personalizationService.getPersonalizedFacts(userId, {
        limit,
        excludeViewed: true,
        includeRecommendations: true,
      });
    } else {
      // Anonymous user - get popular facts
      facts = await prisma.fact.findMany({
        where: {
          isApproved: true,
          isActive: true,
          publishedAt: {
            lte: new Date(),
          },
        },
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
        orderBy: [
          { isFeatured: 'desc' },
          { viewCount: 'desc' },
          { createdAt: 'desc' },
        ],
        take: limit,
      });
    }

    // Format response for user interaction data
    if (userId && facts.length > 0) {
      const factIds = facts.map(f => f.id);
      const userFacts = await prisma.userFact.findMany({
        where: {
          userId,
          factId: { in: factIds },
        },
        select: {
          factId: true,
          isLiked: true,
          isBookmarked: true,
          isViewed: true,
        },
      });

      const userFactMap = userFacts.reduce((acc, uf) => {
        acc[uf.factId] = uf;
        return acc;
      }, {});

      facts = facts.map(fact => {
        const userFact = userFactMap[fact.id] || {};
        return {
          ...fact,
          isLiked: userFact.isLiked || false,
          isBookmarked: userFact.isBookmarked || false,
          isViewed: userFact.isViewed || false,
        };
      });
    }

    // Cache the results
    await cache.set(cacheKey, facts, 3600); // 1 hour
  }

  // Track analytics if user is authenticated
  if (userId) {
    analyticsService.trackEvent('DAILY_FACTS_REQUESTED', {
      factsCount: facts.length,
      isPersonalized: true,
    }, userId, {
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
    });
  }

  successResponse(res, 'Daily facts retrieved successfully', { facts });
});

/**
 * Get facts by category
 */
const getFactsByCategory = asyncHandler(async (req, res) => {
  const { id: categoryId } = req.params;
  const userId = req.user?.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const difficulty = req.query.difficulty;
  const skip = (page - 1) * limit;

  // Check if category exists
  const category = await prisma.category.findUnique({
    where: { id: categoryId, isActive: true },
  });

  if (!category) {
    return notFoundResponse(res, 'Category');
  }

  // Try to get from cache first
  const cacheKey = cacheKeys.factsByCategory(categoryId, page, limit);
  let cachedData = await cache.get(cacheKey);

  if (!cachedData) {
    let whereClause = {
      categoryId,
      isApproved: true,
      isActive: true,
      publishedAt: {
        lte: new Date(),
      },
    };

    if (difficulty) {
      whereClause.difficulty = difficulty.toUpperCase();
    }

    const [facts, total] = await Promise.all([
      prisma.fact.findMany({
        where: whereClause,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
          ...(userId && {
            userFacts: {
              where: { userId },
              select: {
                isLiked: true,
                isBookmarked: true,
                isViewed: true,
              },
            },
          }),
        },
        orderBy: [
          { isFeatured: 'desc' },
          { publishedAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.fact.count({
        where: whereClause,
      }),
    ]);

    cachedData = { facts, total };
    await cache.set(cacheKey, cachedData, 1800); // 30 minutes
  }

  // Format response with user interaction data
  const formattedFacts = cachedData.facts.map(fact => {
    const userFact = fact.userFacts?.[0] || {};
    const { userFacts, ...factData } = fact;
    
    return {
      ...factData,
      ...(userId && {
        isLiked: userFact.isLiked || false,
        isBookmarked: userFact.isBookmarked || false,
        isViewed: userFact.isViewed || false,
      }),
    };
  });

  paginatedResponse(res, 'Facts retrieved successfully', { facts: formattedFacts }, {
    page,
    limit,
    total: cachedData.total,
  });
});

/**
 * Search facts
 */
const searchFacts = asyncHandler(async (req, res) => {
  const { q: query } = req.query;
  const userId = req.user?.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const category = req.query.category;
  const difficulty = req.query.difficulty;
  const skip = (page - 1) * limit;

  const filters = { category, difficulty };
  const cacheKey = cacheKeys.searchResults(query, filters);

  // Try to get from cache first
  let cachedData = await cache.get(cacheKey);

  if (!cachedData) {
    let whereClause = {
      isApproved: true,
      isActive: true,
      publishedAt: {
        lte: new Date(),
      },
      OR: [
        {
          title: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          content: {
            contains: query,
            mode: 'insensitive',
          },
        },
        {
          tags: {
            has: query.toLowerCase(),
          },
        },
      ],
    };

    if (category) {
      whereClause.categoryId = category;
    }

    if (difficulty) {
      whereClause.difficulty = difficulty.toUpperCase();
    }

    const [facts, total] = await Promise.all([
      prisma.fact.findMany({
        where: whereClause,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
          ...(userId && {
            userFacts: {
              where: { userId },
              select: {
                isLiked: true,
                isBookmarked: true,
                isViewed: true,
              },
            },
          }),
        },
        orderBy: [
          { isFeatured: 'desc' },
          { viewCount: 'desc' },
          { publishedAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.fact.count({
        where: whereClause,
      }),
    ]);

    cachedData = { facts, total };
    await cache.set(cacheKey, cachedData, 600); // 10 minutes for search results
  }

  // Format response
  const formattedFacts = cachedData.facts.map(fact => {
    const userFact = fact.userFacts?.[0] || {};
    const { userFacts, ...factData } = fact;
    
    return {
      ...factData,
      ...(userId && {
        isLiked: userFact.isLiked || false,
        isBookmarked: userFact.isBookmarked || false,
        isViewed: userFact.isViewed || false,
      }),
    };
  });

  // Log search analytics
  if (userId) {
    logger.info('Search performed', { userId, query, resultCount: cachedData.total });
  }

  paginatedResponse(res, 'Search results retrieved successfully', { 
    facts: formattedFacts,
    query,
    filters,
  }, {
    page,
    limit,
    total: cachedData.total,
  });
});

/**
 * Get single fact details
 */
const getFactDetails = asyncHandler(async (req, res) => {
  const { id: factId } = req.params;
  const userId = req.user?.id;

  // Try to get from cache first
  let fact = await cache.get(cacheKeys.factDetails(factId));

  if (!fact) {
    fact = await prisma.fact.findUnique({
      where: {
        id: factId,
        isApproved: true,
        isActive: true,
      },
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

    if (!fact) {
      return notFoundResponse(res, 'Fact');
    }

    await cache.set(cacheKeys.factDetails(factId), fact, 3600); // 1 hour
  }

  // Get user interaction data if authenticated
  let userInteraction = null;
  if (userId) {
    userInteraction = await prisma.userFact.findUnique({
      where: {
        userId_factId: {
          userId,
          factId,
        },
      },
      select: {
        isLiked: true,
        isBookmarked: true,
        isViewed: true,
        viewedAt: true,
      },
    });

    // Mark as viewed if not already
    if (!userInteraction?.isViewed) {
      await prisma.userFact.upsert({
        where: {
          userId_factId: {
            userId,
            factId,
          },
        },
        update: {
          isViewed: true,
          viewedAt: new Date(),
        },
        create: {
          userId,
          factId,
          isViewed: true,
          viewedAt: new Date(),
        },
      });

      // Update fact view count
      await prisma.fact.update({
        where: { id: factId },
        data: {
          viewCount: {
            increment: 1,
          },
        },
      });

      // Update user stats
      await prisma.user.update({
        where: { id: userId },
        data: {
          totalFactsViewed: {
            increment: 1,
          },
          lastActiveDate: new Date(),
        },
      });

      // Clear cache
      await cache.del(cacheKeys.factDetails(factId));
      await cache.del(cacheKeys.userStats(userId));
    }
  }

  const response = {
    ...fact,
    ...(userInteraction && {
      isLiked: userInteraction.isLiked,
      isBookmarked: userInteraction.isBookmarked,
      isViewed: userInteraction.isViewed,
      viewedAt: userInteraction.viewedAt,
    }),
  };

  successResponse(res, 'Fact details retrieved successfully', { fact: response });
});

/**
 * Like/unlike a fact
 */
const toggleLike = asyncHandler(async (req, res) => {
  const { id: factId } = req.params;
  const userId = req.user.id;

  // Check if fact exists
  const fact = await prisma.fact.findUnique({
    where: { id: factId, isApproved: true, isActive: true },
  });

  if (!fact) {
    return notFoundResponse(res, 'Fact');
  }

  // Get current user interaction
  const userFact = await prisma.userFact.findUnique({
    where: {
      userId_factId: {
        userId,
        factId,
      },
    },
  });

  const isCurrentlyLiked = userFact?.isLiked || false;
  const newLikedState = !isCurrentlyLiked;

  // Update or create user fact record
  await prisma.userFact.upsert({
    where: {
      userId_factId: {
        userId,
        factId,
      },
    },
    update: {
      isLiked: newLikedState,
    },
    create: {
      userId,
      factId,
      isLiked: newLikedState,
    },
  });

  // Update fact like count
  await prisma.fact.update({
    where: { id: factId },
    data: {
      likeCount: {
        increment: newLikedState ? 1 : -1,
      },
    },
  });

  // Update user stats
  await prisma.user.update({
    where: { id: userId },
    data: {
      totalFactsLiked: {
        increment: newLikedState ? 1 : -1,
      },
    },
  });

  // Clear relevant caches
  await cache.del(cacheKeys.factDetails(factId));
  await cache.del(cacheKeys.userStats(userId));

  // Log action
  logger.logUserAction(newLikedState ? 'FACT_LIKED' : 'FACT_UNLIKED', userId, { factId });

  successResponse(res, `Fact ${newLikedState ? 'liked' : 'unliked'} successfully`, {
    isLiked: newLikedState,
  });
});

/**
 * Bookmark/unbookmark a fact
 */
const toggleBookmark = asyncHandler(async (req, res) => {
  const { id: factId } = req.params;
  const userId = req.user.id;

  // Check if fact exists
  const fact = await prisma.fact.findUnique({
    where: { id: factId, isApproved: true, isActive: true },
  });

  if (!fact) {
    return notFoundResponse(res, 'Fact');
  }

  // Get current user interaction
  const userFact = await prisma.userFact.findUnique({
    where: {
      userId_factId: {
        userId,
        factId,
      },
    },
  });

  const isCurrentlyBookmarked = userFact?.isBookmarked || false;
  const newBookmarkedState = !isCurrentlyBookmarked;

  // Update or create user fact record
  await prisma.userFact.upsert({
    where: {
      userId_factId: {
        userId,
        factId,
      },
    },
    update: {
      isBookmarked: newBookmarkedState,
    },
    create: {
      userId,
      factId,
      isBookmarked: newBookmarkedState,
    },
  });

  // Update fact bookmark count
  await prisma.fact.update({
    where: { id: factId },
    data: {
      bookmarkCount: {
        increment: newBookmarkedState ? 1 : -1,
      },
    },
  });

  // Update user stats
  await prisma.user.update({
    where: { id: userId },
    data: {
      totalFactsBookmarked: {
        increment: newBookmarkedState ? 1 : -1,
      },
    },
  });

  // Clear relevant caches
  await cache.del(cacheKeys.factDetails(factId));
  await cache.del(cacheKeys.userStats(userId));

  // Log action
  logger.logUserAction(newBookmarkedState ? 'FACT_BOOKMARKED' : 'FACT_UNBOOKMARKED', userId, { factId });

  successResponse(res, `Fact ${newBookmarkedState ? 'bookmarked' : 'unbookmarked'} successfully`, {
    isBookmarked: newBookmarkedState,
  });
});

/**
 * Share a fact
 */
const shareFact = asyncHandler(async (req, res) => {
  const { id: factId } = req.params;
  const userId = req.user?.id;

  // Check if fact exists
  const fact = await prisma.fact.findUnique({
    where: { id: factId, isApproved: true, isActive: true },
  });

  if (!fact) {
    return notFoundResponse(res, 'Fact');
  }

  // Update share count
  await prisma.fact.update({
    where: { id: factId },
    data: {
      shareCount: {
        increment: 1,
      },
    },
  });

  // Update user fact record if user is authenticated
  if (userId) {
    await prisma.userFact.upsert({
      where: {
        userId_factId: {
          userId,
          factId,
        },
      },
      update: {
        isShared: true,
      },
      create: {
        userId,
        factId,
        isShared: true,
      },
    });

    // Log action
    logger.logUserAction('FACT_SHARED', userId, { factId });
  }

  // Clear cache
  await cache.del(cacheKeys.factDetails(factId));

  successResponse(res, 'Fact shared successfully');
});

/**
 * Get all categories
 */
const getCategories = asyncHandler(async (req, res) => {
  // Try to get from cache first
  let categories = await cache.get(cacheKeys.categories());

  if (!categories) {
    categories = await prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        color: true,
        sortOrder: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    // Cache for 24 hours
    await cache.set(cacheKeys.categories(), categories, 24 * 60 * 60);
  }

  successResponse(res, 'Categories retrieved successfully', { categories });
});

module.exports = {
  getDailyFacts,
  getFactsByCategory,
  searchFacts,
  getFactDetails,
  toggleLike,
  toggleBookmark,
  shareFact,
  getCategories,
};
