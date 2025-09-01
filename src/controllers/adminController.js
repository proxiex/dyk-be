const { prisma } = require('../config/database');
const { cache, cacheKeys } = require('../config/redis');
const { successResponse, errorResponse, notFoundResponse, paginatedResponse, conflictResponse } = require('../utils/response');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Create new fact
 */
const createFact = asyncHandler(async (req, res) => {
  const {
    title,
    content,
    shortContent,
    categoryId,
    difficulty,
    source,
    sourceUrl,
    imageUrl,
    videoUrl,
    tags,
    language,
    isFeatured,
  } = req.body;

  const adminId = req.user.id;

  // Check if category exists
  const category = await prisma.category.findUnique({
    where: { id: categoryId, isActive: true },
  });

  if (!category) {
    return notFoundResponse(res, 'Category');
  }

  // Create the fact
  const fact = await prisma.fact.create({
    data: {
      title,
      content,
      shortContent,
      categoryId,
      difficulty: difficulty || 'MEDIUM',
      source,
      sourceUrl,
      imageUrl,
      videoUrl,
      tags: tags || [],
      language: language || 'en',
      isFeatured: isFeatured || false,
      isApproved: true, // Admin-created facts are auto-approved
      createdBy: adminId,
      approvedBy: adminId,
      approvedAt: new Date(),
      publishedAt: new Date(),
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
  });

  // Clear relevant caches
  await cache.del(cacheKeys.categories());
  await cache.del(cacheKeys.factsByCategory(categoryId, 1, 10));

  // Log admin action
  logger.logUserAction('FACT_CREATED', adminId, {
    factId: fact.id,
    title: fact.title,
    categoryId,
  });

  successResponse(res, 'Fact created successfully', { fact }, null, 201);
});

/**
 * Update existing fact
 */
const updateFact = asyncHandler(async (req, res) => {
  const { id: factId } = req.params;
  const {
    title,
    content,
    shortContent,
    categoryId,
    difficulty,
    source,
    sourceUrl,
    imageUrl,
    videoUrl,
    tags,
    language,
    isFeatured,
    isActive,
  } = req.body;

  const adminId = req.user.id;

  // Check if fact exists
  const existingFact = await prisma.fact.findUnique({
    where: { id: factId },
  });

  if (!existingFact) {
    return notFoundResponse(res, 'Fact');
  }

  // If categoryId is being updated, check if new category exists
  if (categoryId && categoryId !== existingFact.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId, isActive: true },
    });

    if (!category) {
      return notFoundResponse(res, 'Category');
    }
  }

  // Prepare update data
  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;
  if (shortContent !== undefined) updateData.shortContent = shortContent;
  if (categoryId !== undefined) updateData.categoryId = categoryId;
  if (difficulty !== undefined) updateData.difficulty = difficulty;
  if (source !== undefined) updateData.source = source;
  if (sourceUrl !== undefined) updateData.sourceUrl = sourceUrl;
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
  if (videoUrl !== undefined) updateData.videoUrl = videoUrl;
  if (tags !== undefined) updateData.tags = tags;
  if (language !== undefined) updateData.language = language;
  if (isFeatured !== undefined) updateData.isFeatured = isFeatured;
  if (isActive !== undefined) updateData.isActive = isActive;

  // Update the fact
  const fact = await prisma.fact.update({
    where: { id: factId },
    data: updateData,
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
  });

  // Clear relevant caches
  await cache.del(cacheKeys.factDetails(factId));
  await cache.del(cacheKeys.factsByCategory(fact.categoryId, 1, 10));
  if (categoryId && categoryId !== existingFact.categoryId) {
    await cache.del(cacheKeys.factsByCategory(existingFact.categoryId, 1, 10));
  }

  // Log admin action
  logger.logUserAction('FACT_UPDATED', adminId, {
    factId,
    changes: updateData,
  });

  successResponse(res, 'Fact updated successfully', { fact });
});

/**
 * Delete fact
 */
const deleteFact = asyncHandler(async (req, res) => {
  const { id: factId } = req.params;
  const adminId = req.user.id;

  // Check if fact exists
  const fact = await prisma.fact.findUnique({
    where: { id: factId },
    select: { id: true, title: true, categoryId: true },
  });

  if (!fact) {
    return notFoundResponse(res, 'Fact');
  }

  // Soft delete - mark as inactive instead of hard delete
  await prisma.fact.update({
    where: { id: factId },
    data: { isActive: false },
  });

  // Clear relevant caches
  await cache.del(cacheKeys.factDetails(factId));
  await cache.del(cacheKeys.factsByCategory(fact.categoryId, 1, 10));

  // Log admin action
  logger.logUserAction('FACT_DELETED', adminId, {
    factId,
    title: fact.title,
  });

  successResponse(res, 'Fact deleted successfully');
});

/**
 * Get all facts for admin management
 */
const getAllFacts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const status = req.query.status; // 'approved', 'pending', 'inactive'
  const categoryId = req.query.category;
  const search = req.query.search;
  const skip = (page - 1) * limit;

  // Build where clause
  let whereClause = {};

  if (status === 'approved') {
    whereClause.isApproved = true;
    whereClause.isActive = true;
  } else if (status === 'pending') {
    whereClause.isApproved = false;
    whereClause.isActive = true;
  } else if (status === 'inactive') {
    whereClause.isActive = false;
  }

  if (categoryId) {
    whereClause.categoryId = categoryId;
  }

  if (search) {
    whereClause.OR = [
      {
        title: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        content: {
          contains: search,
          mode: 'insensitive',
        },
      },
    ];
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
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    }),
    prisma.fact.count({
      where: whereClause,
    }),
  ]);

  paginatedResponse(res, 'Facts retrieved successfully', { facts }, {
    page,
    limit,
    total,
  });
});

/**
 * Approve fact
 */
const approveFact = asyncHandler(async (req, res) => {
  const { id: factId } = req.params;
  const adminId = req.user.id;

  // Check if fact exists and is pending approval
  const fact = await prisma.fact.findUnique({
    where: { id: factId },
  });

  if (!fact) {
    return notFoundResponse(res, 'Fact');
  }

  if (fact.isApproved) {
    return errorResponse(res, 'Fact is already approved', null, 400);
  }

  // Approve the fact
  const updatedFact = await prisma.fact.update({
    where: { id: factId },
    data: {
      isApproved: true,
      approvedBy: adminId,
      approvedAt: new Date(),
      publishedAt: new Date(),
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
  });

  // Clear relevant caches
  await cache.del(cacheKeys.factDetails(factId));
  await cache.del(cacheKeys.factsByCategory(fact.categoryId, 1, 10));

  // Log admin action
  logger.logUserAction('FACT_APPROVED', adminId, {
    factId,
    title: fact.title,
  });

  successResponse(res, 'Fact approved successfully', { fact: updatedFact });
});

/**
 * Reject fact
 */
const rejectFact = asyncHandler(async (req, res) => {
  const { id: factId } = req.params;
  const { reason } = req.body;
  const adminId = req.user.id;

  // Check if fact exists
  const fact = await prisma.fact.findUnique({
    where: { id: factId },
  });

  if (!fact) {
    return notFoundResponse(res, 'Fact');
  }

  // Mark as inactive (rejected)
  await prisma.fact.update({
    where: { id: factId },
    data: { isActive: false },
  });

  // Log admin action
  logger.logUserAction('FACT_REJECTED', adminId, {
    factId,
    title: fact.title,
    reason,
  });

  successResponse(res, 'Fact rejected successfully');
});

/**
 * Create new category
 */
const createCategory = asyncHandler(async (req, res) => {
  const { name, description, icon, color, sortOrder } = req.body;
  const adminId = req.user.id;

  // Check if category name already exists
  const existingCategory = await prisma.category.findUnique({
    where: { name },
  });

  if (existingCategory) {
    return conflictResponse(res, 'Category with this name already exists');
  }

  // Create the category
  const category = await prisma.category.create({
    data: {
      name,
      description,
      icon,
      color,
      sortOrder: sortOrder || 0,
    },
  });

  // Clear categories cache
  await cache.del(cacheKeys.categories());

  // Log admin action
  logger.logUserAction('CATEGORY_CREATED', adminId, {
    categoryId: category.id,
    name: category.name,
  });

  successResponse(res, 'Category created successfully', { category }, null, 201);
});

/**
 * Update category
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { id: categoryId } = req.params;
  const { name, description, icon, color, sortOrder, isActive } = req.body;
  const adminId = req.user.id;

  // Check if category exists
  const existingCategory = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!existingCategory) {
    return notFoundResponse(res, 'Category');
  }

  // Check if new name conflicts with existing category
  if (name && name !== existingCategory.name) {
    const nameConflict = await prisma.category.findUnique({
      where: { name },
    });

    if (nameConflict) {
      return conflictResponse(res, 'Category with this name already exists');
    }
  }

  // Prepare update data
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (icon !== undefined) updateData.icon = icon;
  if (color !== undefined) updateData.color = color;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
  if (isActive !== undefined) updateData.isActive = isActive;

  // Update the category
  const category = await prisma.category.update({
    where: { id: categoryId },
    data: updateData,
  });

  // Clear categories cache
  await cache.del(cacheKeys.categories());

  // Log admin action
  logger.logUserAction('CATEGORY_UPDATED', adminId, {
    categoryId,
    changes: updateData,
  });

  successResponse(res, 'Category updated successfully', { category });
});

/**
 * Delete category
 */
const deleteCategory = asyncHandler(async (req, res) => {
  const { id: categoryId } = req.params;
  const adminId = req.user.id;

  // Check if category exists
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    return notFoundResponse(res, 'Category');
  }

  // Check if category has facts
  const factCount = await prisma.fact.count({
    where: { categoryId },
  });

  if (factCount > 0) {
    return errorResponse(res, 'Cannot delete category with existing facts', null, 400);
  }

  // Delete the category
  await prisma.category.delete({
    where: { id: categoryId },
  });

  // Clear categories cache
  await cache.del(cacheKeys.categories());

  // Log admin action
  logger.logUserAction('CATEGORY_DELETED', adminId, {
    categoryId,
    name: category.name,
  });

  successResponse(res, 'Category deleted successfully');
});

/**
 * Get user engagement analytics
 */
const getAnalytics = asyncHandler(async (req, res) => {
  const timeframe = req.query.timeframe || '30d'; // 7d, 30d, 90d, 1y
  
  let startDate;
  const endDate = new Date();
  
  switch (timeframe) {
    case '7d':
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const [
    totalUsers,
    activeUsers,
    newUsers,
    totalFacts,
    factsViewed,
    factsLiked,
    factsBookmarked,
    popularFacts,
    categoryEngagement,
    userRetention,
  ] = await Promise.all([
    // Total users
    prisma.user.count({
      where: { isActive: true },
    }),
    
    // Active users in timeframe
    prisma.user.count({
      where: {
        isActive: true,
        lastActiveDate: {
          gte: startDate,
        },
      },
    }),
    
    // New users in timeframe
    prisma.user.count({
      where: {
        isActive: true,
        createdAt: {
          gte: startDate,
        },
      },
    }),
    
    // Total approved facts
    prisma.fact.count({
      where: {
        isApproved: true,
        isActive: true,
      },
    }),
    
    // Facts viewed in timeframe
    prisma.userFact.count({
      where: {
        isViewed: true,
        viewedAt: {
          gte: startDate,
        },
      },
    }),
    
    // Facts liked in timeframe
    prisma.userFact.count({
      where: {
        isLiked: true,
        updatedAt: {
          gte: startDate,
        },
      },
    }),
    
    // Facts bookmarked in timeframe
    prisma.userFact.count({
      where: {
        isBookmarked: true,
        updatedAt: {
          gte: startDate,
        },
      },
    }),
    
    // Most popular facts
    prisma.fact.findMany({
      where: {
        isApproved: true,
        isActive: true,
      },
      select: {
        id: true,
        title: true,
        viewCount: true,
        likeCount: true,
        shareCount: true,
        bookmarkCount: true,
      },
      orderBy: {
        viewCount: 'desc',
      },
      take: 10,
    }),
    
    // Category engagement
    prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            facts: {
              where: {
                isApproved: true,
                isActive: true,
              },
            },
          },
        },
      },
    }),
    
    // User retention (simplified)
    prisma.user.count({
      where: {
        isActive: true,
        createdAt: {
          lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
        lastActiveDate: {
          gte: startDate,
        },
      },
    }),
  ]);

  const analytics = {
    timeframe,
    dateRange: {
      start: startDate,
      end: endDate,
    },
    users: {
      total: totalUsers,
      active: activeUsers,
      new: newUsers,
      retention: userRetention,
    },
    facts: {
      total: totalFacts,
      viewed: factsViewed,
      liked: factsLiked,
      bookmarked: factsBookmarked,
    },
    engagement: {
      viewRate: totalUsers > 0 ? (factsViewed / totalUsers).toFixed(2) : 0,
      likeRate: factsViewed > 0 ? (factsLiked / factsViewed).toFixed(2) : 0,
      bookmarkRate: factsViewed > 0 ? (factsBookmarked / factsViewed).toFixed(2) : 0,
    },
    popularFacts,
    categoryEngagement: categoryEngagement.map(cat => ({
      category: cat.name,
      factCount: cat._count.facts,
    })),
  };

  successResponse(res, 'Analytics retrieved successfully', { analytics });
});

/**
 * Get system health and metrics
 */
const getSystemMetrics = asyncHandler(async (req, res) => {
  const [
    pendingFacts,
    inactiveFacts,
    userSessionCount,
    recentErrors,
  ] = await Promise.all([
    prisma.fact.count({
      where: {
        isApproved: false,
        isActive: true,
      },
    }),
    
    prisma.fact.count({
      where: {
        isActive: false,
      },
    }),
    
    prisma.userSession.count({
      where: {
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
    }),
    
    // This would typically come from your logging system
    Promise.resolve([]),
  ]);

  const metrics = {
    facts: {
      pendingApproval: pendingFacts,
      inactive: inactiveFacts,
    },
    users: {
      activeSessions: userSessionCount,
    },
    system: {
      recentErrors: recentErrors.length,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  };

  successResponse(res, 'System metrics retrieved successfully', { metrics });
});

module.exports = {
  createFact,
  updateFact,
  deleteFact,
  getAllFacts,
  approveFact,
  rejectFact,
  createCategory,
  updateCategory,
  deleteCategory,
  getAnalytics,
  getSystemMetrics,
};
