const { prisma } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Personalization service for intelligent fact distribution
 */
class PersonalizationService {
  constructor() {
    this.CACHE_TTL = 3600; // 1 hour
    this.USER_PROFILE_CACHE_TTL = 1800; // 30 minutes
    this.FACT_SCORES_CACHE_TTL = 7200; // 2 hours
  }

  /**
   * Get personalized facts for a user
   */
  async getPersonalizedFacts(userId, options = {}) {
    try {
      const {
        limit = 10,
        excludeViewed = true,
        difficultyOverride = null,
        categoryFilters = [],
        includeRecommendations = true,
      } = options;

      // Get user profile and preferences
      const userProfile = await this.getUserProfile(userId);
      if (!userProfile) {
        return this.getFallbackFacts(limit);
      }

      // Get personalization scores
      const factScores = await this.calculatePersonalizationScores(userId, userProfile);

      // Apply filters and sorting
      let candidates = await this.getFactCandidates(userId, {
        excludeViewed,
        difficultyOverride: difficultyOverride || userProfile.difficultyLevel,
        categoryFilters: categoryFilters.length > 0 ? categoryFilters : userProfile.preferredCategories,
        limit: limit * 3, // Get more candidates for better selection
      });

      // Score and rank candidates
      candidates = await this.scoreAndRankFacts(candidates, factScores, userProfile);

      // Add diversity to prevent monotony
      const diversifiedFacts = this.addDiversityToSelection(candidates, limit);

      // Include recommendations if requested
      if (includeRecommendations && diversifiedFacts.length < limit) {
        const recommendations = await this.getRecommendedFacts(userId, userProfile, limit - diversifiedFacts.length);
        diversifiedFacts.push(...recommendations);
      }

      return diversifiedFacts.slice(0, limit);
    } catch (error) {
      logger.error('Error in personalized facts retrieval:', error);
      return this.getFallbackFacts(options.limit || 10);
    }
  }

  /**
   * Get comprehensive user profile for personalization
   */
  async getUserProfile(userId) {
    try {
      const cacheKey = `user_profile:${userId}`;
      let profile = await cacheGet(cacheKey);
      
      if (profile) {
        return JSON.parse(profile);
      }

      // Get user data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          difficultyLevel: true,
          timezone: true,
          currentStreak: true,
          longestStreak: true,
          createdAt: true,
          lastActiveDate: true,
        },
      });

      if (!user) return null;

      // Get category preferences
      const categoryPreferences = await prisma.userCategory.findMany({
        where: { userId, isEnabled: true },
        include: { category: true },
      });

      // Get interaction history
      const interactionStats = await this.getUserInteractionStats(userId);

      // Get learning patterns
      const learningPatterns = await this.getUserLearningPatterns(userId);

      profile = {
        ...user,
        preferredCategories: categoryPreferences.map(cp => cp.categoryId),
        categoryPreferences: categoryPreferences.reduce((acc, cp) => {
          acc[cp.categoryId] = {
            name: cp.category.name,
            engagement: cp.engagementScore || 0,
          };
          return acc;
        }, {}),
        interactionStats,
        learningPatterns,
        personalityScore: this.calculatePersonalityScore(user, interactionStats, learningPatterns),
      };

      // Cache the profile
      await cacheSet(cacheKey, JSON.stringify(profile), this.USER_PROFILE_CACHE_TTL);
      
      return profile;
    } catch (error) {
      logger.error(`Error getting user profile for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get user interaction statistics
   */
  async getUserInteractionStats(userId) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [totalViewed, totalLiked, totalBookmarked, totalShared, recentActivity] = await Promise.all([
        prisma.userFact.count({
          where: { userId, isViewed: true },
        }),
        prisma.userFact.count({
          where: { userId, isLiked: true },
        }),
        prisma.userFact.count({
          where: { userId, isBookmarked: true },
        }),
        prisma.userFact.count({
          where: { userId, isShared: true },
        }),
        prisma.userFact.count({
          where: {
            userId,
            viewedAt: { gte: thirtyDaysAgo },
            isViewed: true,
          },
        }),
      ]);

      // Get category engagement
      const categoryEngagement = await prisma.userFact.groupBy({
        by: ['fact'],
        where: {
          userId,
          isViewed: true,
          viewedAt: { gte: thirtyDaysAgo },
        },
        _count: { _all: true },
      });

      // Calculate engagement rates
      const likeRate = totalViewed > 0 ? totalLiked / totalViewed : 0;
      const bookmarkRate = totalViewed > 0 ? totalBookmarked / totalViewed : 0;
      const shareRate = totalViewed > 0 ? totalShared / totalViewed : 0;

      return {
        totalViewed,
        totalLiked,
        totalBookmarked,
        totalShared,
        recentActivity,
        likeRate,
        bookmarkRate,
        shareRate,
        engagementScore: (likeRate * 0.4 + bookmarkRate * 0.4 + shareRate * 0.2),
      };
    } catch (error) {
      logger.error(`Error getting interaction stats for ${userId}:`, error);
      return {
        totalViewed: 0,
        totalLiked: 0,
        totalBookmarked: 0,
        totalShared: 0,
        recentActivity: 0,
        likeRate: 0,
        bookmarkRate: 0,
        shareRate: 0,
        engagementScore: 0,
      };
    }
  }

  /**
   * Analyze user learning patterns
   */
  async getUserLearningPatterns(userId) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Get recent viewing patterns
      const recentViews = await prisma.userFact.findMany({
        where: {
          userId,
          isViewed: true,
          viewedAt: { gte: sevenDaysAgo },
        },
        include: {
          fact: {
            select: {
              difficulty: true,
              categoryId: true,
              tags: true,
            },
          },
        },
        orderBy: { viewedAt: 'desc' },
      });

      // Analyze patterns
      const difficultyProgression = this.analyzeDifficultyProgression(recentViews);
      const topicDiversity = this.analyzeTopicDiversity(recentViews);
      const engagementTrends = this.analyzeEngagementTrends(recentViews);
      const preferredTags = this.analyzeTagPreferences(recentViews);

      return {
        difficultyProgression,
        topicDiversity,
        engagementTrends,
        preferredTags,
        learningVelocity: recentViews.length / 7, // facts per day
        consistencyScore: this.calculateConsistencyScore(recentViews),
      };
    } catch (error) {
      logger.error(`Error analyzing learning patterns for ${userId}:`, error);
      return {
        difficultyProgression: 'stable',
        topicDiversity: 0.5,
        engagementTrends: 'stable',
        preferredTags: [],
        learningVelocity: 0,
        consistencyScore: 0,
      };
    }
  }

  /**
   * Calculate personalization scores for facts
   */
  async calculatePersonalizationScores(userId, userProfile) {
    try {
      const cacheKey = `fact_scores:${userId}`;
      let scores = await cacheGet(cacheKey);
      
      if (scores) {
        return JSON.parse(scores);
      }

      // Get all available facts
      const facts = await prisma.fact.findMany({
        where: {
          isApproved: true,
          isActive: true,
          publishedAt: { lte: new Date() },
        },
        select: {
          id: true,
          categoryId: true,
          difficulty: true,
          tags: true,
          createdAt: true,
          viewCount: true,
          likeCount: true,
          shareCount: true,
        },
      });

      scores = {};
      
      for (const fact of facts) {
        scores[fact.id] = this.calculateFactScore(fact, userProfile);
      }

      // Cache the scores
      await cacheSet(cacheKey, JSON.stringify(scores), this.FACT_SCORES_CACHE_TTL);
      
      return scores;
    } catch (error) {
      logger.error(`Error calculating personalization scores for ${userId}:`, error);
      return {};
    }
  }

  /**
   * Calculate individual fact score for a user
   */
  calculateFactScore(fact, userProfile) {
    let score = 0;

    // Category preference score (40% weight)
    if (userProfile.preferredCategories.includes(fact.categoryId)) {
      const categoryEngagement = userProfile.categoryPreferences[fact.categoryId]?.engagement || 0;
      score += 0.4 * (0.5 + categoryEngagement * 0.5);
    } else {
      score += 0.4 * 0.1; // Small penalty for non-preferred categories
    }

    // Difficulty matching score (25% weight)
    const difficultyMatch = this.calculateDifficultyMatch(fact.difficulty, userProfile);
    score += 0.25 * difficultyMatch;

    // Tag preference score (15% weight)
    const tagScore = this.calculateTagScore(fact.tags, userProfile.learningPatterns.preferredTags);
    score += 0.15 * tagScore;

    // Popularity and quality score (10% weight)
    const popularityScore = this.calculatePopularityScore(fact);
    score += 0.1 * popularityScore;

    // Freshness score (5% weight)
    const freshnessScore = this.calculateFreshnessScore(fact.createdAt);
    score += 0.05 * freshnessScore;

    // Personality matching (5% weight)
    const personalityScore = this.calculatePersonalityMatch(fact, userProfile.personalityScore);
    score += 0.05 * personalityScore;

    return Math.min(1, Math.max(0, score)); // Normalize to 0-1
  }

  /**
   * Get fact candidates based on filters
   */
  async getFactCandidates(userId, options) {
    const {
      excludeViewed = true,
      difficultyOverride = null,
      categoryFilters = [],
      limit = 30,
    } = options;

    const whereClause = {
      isApproved: true,
      isActive: true,
      publishedAt: { lte: new Date() },
    };

    // Exclude viewed facts if requested
    if (excludeViewed) {
      const viewedFactIds = await prisma.userFact.findMany({
        where: { userId, isViewed: true },
        select: { factId: true },
      });

      if (viewedFactIds.length > 0) {
        whereClause.id = {
          notIn: viewedFactIds.map(uf => uf.factId),
        };
      }
    }

    // Apply difficulty filter
    if (difficultyOverride) {
      whereClause.difficulty = difficultyOverride;
    }

    // Apply category filters
    if (categoryFilters.length > 0) {
      whereClause.categoryId = { in: categoryFilters };
    }

    return await prisma.fact.findMany({
      where: whereClause,
      take: limit,
      orderBy: [
        { isFeatured: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Score and rank fact candidates
   */
  async scoreAndRankFacts(facts, factScores, userProfile) {
    return facts
      .map(fact => ({
        ...fact,
        personalizedScore: factScores[fact.id] || 0,
      }))
      .sort((a, b) => b.personalizedScore - a.personalizedScore);
  }

  /**
   * Add diversity to fact selection to prevent monotony
   */
  addDiversityToSelection(facts, limit) {
    if (facts.length <= limit) return facts;

    const selected = [];
    const categoryCount = {};
    const difficultyCount = {};

    for (const fact of facts) {
      if (selected.length >= limit) break;

      const categoryKey = fact.categoryId;
      const difficultyKey = fact.difficulty;

      // Limit facts per category (max 3 in top 10)
      if ((categoryCount[categoryKey] || 0) >= Math.max(1, Math.floor(limit / 3))) {
        continue;
      }

      // Limit facts per difficulty (max 4 in top 10)
      if ((difficultyCount[difficultyKey] || 0) >= Math.max(2, Math.floor(limit / 2.5))) {
        continue;
      }

      selected.push(fact);
      categoryCount[categoryKey] = (categoryCount[categoryKey] || 0) + 1;
      difficultyCount[difficultyKey] = (difficultyCount[difficultyKey] || 0) + 1;
    }

    // Fill remaining spots if needed
    while (selected.length < limit && selected.length < facts.length) {
      for (const fact of facts) {
        if (selected.length >= limit) break;
        if (!selected.find(f => f.id === fact.id)) {
          selected.push(fact);
        }
      }
    }

    return selected;
  }

  /**
   * Get recommended facts based on similar users
   */
  async getRecommendedFacts(userId, userProfile, limit) {
    try {
      // Find similar users based on preferences and behavior
      const similarUsers = await this.findSimilarUsers(userId, userProfile);
      
      if (similarUsers.length === 0) {
        return this.getFallbackFacts(limit);
      }

      // Get facts liked by similar users
      const recommendedFacts = await prisma.userFact.findMany({
        where: {
          userId: { in: similarUsers.map(u => u.id) },
          isLiked: true,
          fact: {
            isApproved: true,
            isActive: true,
          },
        },
        include: { fact: true },
        distinct: ['factId'],
        take: limit,
        orderBy: { updatedAt: 'desc' },
      });

      return recommendedFacts.map(uf => uf.fact);
    } catch (error) {
      logger.error(`Error getting recommendations for ${userId}:`, error);
      return this.getFallbackFacts(limit);
    }
  }

  /**
   * Find users with similar preferences and behavior
   */
  async findSimilarUsers(userId, userProfile) {
    try {
      // Get users with similar category preferences
      const usersWithSimilarCategories = await prisma.userCategory.findMany({
        where: {
          categoryId: { in: userProfile.preferredCategories },
          userId: { not: userId },
          isEnabled: true,
        },
        select: { userId: true },
        distinct: ['userId'],
      });

      const candidateUserIds = usersWithSimilarCategories.map(u => u.userId);
      
      if (candidateUserIds.length === 0) return [];

      // Get interaction stats for candidate users
      const candidateUsers = await prisma.user.findMany({
        where: {
          id: { in: candidateUserIds },
          isActive: true,
          difficultyLevel: userProfile.difficultyLevel, // Same difficulty level
        },
        select: {
          id: true,
          currentStreak: true,
          longestStreak: true,
        },
        take: 10,
      });

      // Score similarity and return top matches
      return candidateUsers
        .map(user => ({
          ...user,
          similarityScore: this.calculateUserSimilarity(userProfile, user),
        }))
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 5);
    } catch (error) {
      logger.error(`Error finding similar users for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Calculate similarity between users
   */
  calculateUserSimilarity(userProfile, otherUser) {
    let similarity = 0;

    // Streak similarity
    const streakDiff = Math.abs(userProfile.currentStreak - otherUser.currentStreak);
    similarity += Math.max(0, 1 - streakDiff / 30) * 0.3;

    // Longest streak similarity
    const longestStreakDiff = Math.abs(userProfile.longestStreak - otherUser.longestStreak);
    similarity += Math.max(0, 1 - longestStreakDiff / 100) * 0.3;

    // Engagement similarity
    similarity += userProfile.interactionStats.engagementScore * 0.4;

    return similarity;
  }

  /**
   * Get fallback facts when personalization fails
   */
  async getFallbackFacts(limit) {
    try {
      return await prisma.fact.findMany({
        where: {
          isApproved: true,
          isActive: true,
          publishedAt: { lte: new Date() },
        },
        take: limit,
        orderBy: [
          { isFeatured: 'desc' },
          { likeCount: 'desc' },
          { viewCount: 'desc' },
        ],
      });
    } catch (error) {
      logger.error('Error getting fallback facts:', error);
      return [];
    }
  }

  // Helper methods for score calculations

  calculateDifficultyMatch(factDifficulty, userProfile) {
    const userDifficulty = userProfile.difficultyLevel;
    const difficultyOrder = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    
    const factLevel = difficultyOrder.indexOf(factDifficulty);
    const userLevel = difficultyOrder.indexOf(userDifficulty);
    
    if (factLevel === userLevel) return 1.0;
    if (Math.abs(factLevel - userLevel) === 1) return 0.7;
    if (Math.abs(factLevel - userLevel) === 2) return 0.4;
    return 0.1;
  }

  calculateTagScore(factTags, preferredTags) {
    if (!factTags || factTags.length === 0 || !preferredTags || preferredTags.length === 0) {
      return 0.5; // Neutral score
    }

    const matches = factTags.filter(tag => preferredTags.includes(tag));
    return matches.length / Math.max(factTags.length, preferredTags.length);
  }

  calculatePopularityScore(fact) {
    const totalInteractions = (fact.viewCount || 0) + (fact.likeCount || 0) * 2 + (fact.shareCount || 0) * 3;
    return Math.min(1, totalInteractions / 100); // Normalize to 0-1
  }

  calculateFreshnessScore(createdAt) {
    const daysSinceCreation = (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000);
    return Math.max(0, 1 - daysSinceCreation / 365); // Decrease over a year
  }

  calculatePersonalityMatch(fact, personalityScore) {
    // Simple personality matching based on content characteristics
    // This could be expanded with NLP analysis of fact content
    return personalityScore * 0.5 + 0.5; // Blend with neutral score
  }

  calculatePersonalityScore(user, interactionStats, learningPatterns) {
    let score = 0.5; // Start neutral

    // Engagement-based personality traits
    if (interactionStats.engagementScore > 0.7) score += 0.2; // High engagement
    if (interactionStats.shareRate > 0.1) score += 0.1; // Social sharing
    if (learningPatterns.consistencyScore > 0.8) score += 0.1; // Consistent learner
    if (learningPatterns.topicDiversity > 0.6) score += 0.1; // Curious/diverse interests

    return Math.min(1, Math.max(0, score));
  }

  // Analysis helper methods

  analyzeDifficultyProgression(recentViews) {
    if (recentViews.length < 3) return 'stable';

    const difficulties = recentViews.map(v => v.fact.difficulty);
    const difficultyOrder = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    
    let increasing = 0, decreasing = 0;
    
    for (let i = 1; i < difficulties.length; i++) {
      const current = difficultyOrder.indexOf(difficulties[i]);
      const previous = difficultyOrder.indexOf(difficulties[i - 1]);
      
      if (current > previous) increasing++;
      else if (current < previous) decreasing++;
    }

    if (increasing > decreasing * 1.5) return 'increasing';
    if (decreasing > increasing * 1.5) return 'decreasing';
    return 'stable';
  }

  analyzeTopicDiversity(recentViews) {
    if (recentViews.length === 0) return 0;

    const uniqueCategories = new Set(recentViews.map(v => v.fact.categoryId));
    return uniqueCategories.size / Math.min(recentViews.length, 8); // Max diversity score
  }

  analyzeEngagementTrends(recentViews) {
    // Simplified engagement trend analysis
    const recent = recentViews.slice(0, Math.floor(recentViews.length / 2));
    const older = recentViews.slice(Math.floor(recentViews.length / 2));

    const recentEngagement = recent.filter(v => v.isLiked || v.isBookmarked).length / Math.max(recent.length, 1);
    const olderEngagement = older.filter(v => v.isLiked || v.isBookmarked).length / Math.max(older.length, 1);

    if (recentEngagement > olderEngagement * 1.2) return 'increasing';
    if (olderEngagement > recentEngagement * 1.2) return 'decreasing';
    return 'stable';
  }

  analyzeTagPreferences(recentViews) {
    const tagCounts = {};
    
    recentViews.forEach(view => {
      if (view.fact.tags) {
        view.fact.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);
  }

  calculateConsistencyScore(recentViews) {
    if (recentViews.length < 3) return 0;

    // Calculate how evenly distributed the views are over time
    const viewDates = recentViews.map(v => new Date(v.viewedAt).getTime()).sort();
    const timeSpan = viewDates[viewDates.length - 1] - viewDates[0];
    
    if (timeSpan === 0) return 1; // All on same day
    
    const expectedInterval = timeSpan / (viewDates.length - 1);
    let totalDeviation = 0;
    
    for (let i = 1; i < viewDates.length; i++) {
      const actualInterval = viewDates[i] - viewDates[i - 1];
      totalDeviation += Math.abs(actualInterval - expectedInterval);
    }
    
    const avgDeviation = totalDeviation / (viewDates.length - 1);
    return Math.max(0, 1 - avgDeviation / expectedInterval);
  }
}

module.exports = new PersonalizationService();
