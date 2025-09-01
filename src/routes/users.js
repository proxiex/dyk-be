const express = require('express');
const {
  getProfile,
  updateProfile,
  getStats,
  updateNotificationSettings,
  updateTopicPreferences,
  getBookmarkedFacts,
  getLikedFacts,
  getLearningHistory,
  deleteAccount,
} = require('../controllers/userController');

const { authenticate, requireEmailVerification } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const {
  validateProfileUpdate,
  validateNotificationSettings,
  validateTopicPreferences,
  validatePagination,
} = require('../middleware/validation');

const router = express.Router();

// Apply authentication to all user routes
router.use(authenticate);
router.use(apiLimiter);

/**
 * @swagger
 * components:
 *   schemas:
 *     UserProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         email:
 *           type: string
 *           format: email
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         avatar:
 *           type: string
 *         dateOfBirth:
 *           type: string
 *           format: date
 *         timezone:
 *           type: string
 *         isEmailVerified:
 *           type: boolean
 *         role:
 *           type: string
 *           enum: [USER, MODERATOR, ADMIN, SUPER_ADMIN]
 *         notificationsEnabled:
 *           type: boolean
 *         dailyNotificationTime:
 *           type: string
 *         maxNotificationsPerDay:
 *           type: integer
 *         weekendNotifications:
 *           type: boolean
 *         difficultyLevel:
 *           type: string
 *           enum: [EASY, MEDIUM, HARD, EXPERT]
 *         languagePreference:
 *           type: string
 *         totalFactsViewed:
 *           type: integer
 *         totalFactsLiked:
 *           type: integer
 *         totalFactsBookmarked:
 *           type: integer
 *         currentStreak:
 *           type: integer
 *         longestStreak:
 *           type: integer
 *         lastActiveDate:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     UserStats:
 *       type: object
 *       properties:
 *         totalFactsViewed:
 *           type: integer
 *         totalFactsLiked:
 *           type: integer
 *         totalFactsBookmarked:
 *           type: integer
 *         currentStreak:
 *           type: integer
 *         longestStreak:
 *           type: integer
 *         factsViewedThisWeek:
 *           type: integer
 *         factsViewedThisMonth:
 *           type: integer
 *         categoriesEngaged:
 *           type: integer
 *         categoryBreakdown:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               category:
 *                 $ref: '#/components/schemas/Category'
 *               count:
 *                 type: integer
 *         memberSince:
 *           type: string
 *           format: date-time
 *         streakData:
 *           type: object
 *           properties:
 *             current:
 *               type: integer
 *             longest:
 *               type: integer
 *             lastActive:
 *               type: string
 *               format: date-time
 *     Category:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         icon:
 *           type: string
 *         color:
 *           type: string
 */

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
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
 *                     user:
 *                       $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/profile', getProfile);

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               timezone:
 *                 type: string
 *               avatar:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                     user:
 *                       $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/profile', validateProfileUpdate, updateProfile);

/**
 * @swagger
 * /api/users/stats:
 *   get:
 *     summary: Get user learning statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
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
 *                     stats:
 *                       $ref: '#/components/schemas/UserStats'
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', getStats);

/**
 * @swagger
 * /api/users/notifications:
 *   put:
 *     summary: Update notification settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notificationsEnabled:
 *                 type: boolean
 *               dailyNotificationTime:
 *                 type: string
 *                 pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *               maxNotificationsPerDay:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *               weekendNotifications:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Notification settings updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/notifications', validateNotificationSettings, updateNotificationSettings);

/**
 * @swagger
 * /api/users/topics:
 *   put:
 *     summary: Update topic preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 minItems: 1
 *               difficultyLevel:
 *                 type: string
 *                 enum: [EASY, MEDIUM, HARD, EXPERT]
 *     responses:
 *       200:
 *         description: Topic preferences updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/topics', validateTopicPreferences, updateTopicPreferences);

/**
 * @swagger
 * /api/users/bookmarked:
 *   get:
 *     summary: Get user's bookmarked facts
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Bookmarked facts retrieved successfully
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
 *                     facts:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Fact'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Unauthorized
 */
router.get('/bookmarked', validatePagination, getBookmarkedFacts);

/**
 * @swagger
 * /api/users/liked:
 *   get:
 *     summary: Get user's liked facts
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Liked facts retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/liked', validatePagination, getLikedFacts);

/**
 * @swagger
 * /api/users/history:
 *   get:
 *     summary: Get user's learning history
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Learning history retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/history', validatePagination, getLearningHistory);

/**
 * @swagger
 * /api/users/account:
 *   delete:
 *     summary: Delete user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       400:
 *         description: Invalid password
 *       401:
 *         description: Unauthorized
 */
router.delete('/account', deleteAccount);

module.exports = router;
