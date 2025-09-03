const express = require('express');
const {
  getDailyFacts,
  getFactsByCategory,
  searchFacts,
  getFactDetails,
  toggleLike,
  toggleBookmark,
  shareFact,
  getCategories,
} = require('../controllers/factController');

const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const {
  validateUUIDParam,
  validatePagination,
  validateSearch,
} = require('../middleware/validation');

const router = express.Router();

// Apply rate limiting to all fact routes
router.use(apiLimiter);

/**
 * @swagger
 * components:
 *   schemas:
 *     Fact:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         title:
 *           type: string
 *         content:
 *           type: string
 *         shortContent:
 *           type: string
 *         source:
 *           type: string
 *         sourceUrl:
 *           type: string
 *           format: uri
 *         imageUrl:
 *           type: string
 *           format: uri
 *         videoUrl:
 *           type: string
 *           format: uri
 *         difficulty:
 *           type: string
 *           enum: [EASY, MEDIUM, HARD, EXPERT]
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         language:
 *           type: string
 *         isFeatured:
 *           type: boolean
 *         viewCount:
 *           type: integer
 *         likeCount:
 *           type: integer
 *         shareCount:
 *           type: integer
 *         bookmarkCount:
 *           type: integer
 *         publishedAt:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         category:
 *           $ref: '#/components/schemas/Category'
 *         isLiked:
 *           type: boolean
 *           description: Only present for authenticated users
 *         isBookmarked:
 *           type: boolean
 *           description: Only present for authenticated users
 *         isViewed:
 *           type: boolean
 *           description: Only present for authenticated users
 *     Pagination:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *         limit:
 *           type: integer
 *         total:
 *           type: integer
 *         totalPages:
 *           type: integer
 *         hasNext:
 *           type: boolean
 *         hasPrev:
 *           type: boolean
 */

/**
 * @swagger
 * /api/facts/daily:
 *   get:
 *     summary: Get daily facts for user
 *     tags: [Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *           default: 3
 *         description: Number of facts to return
 *     responses:
 *       200:
 *         description: Daily facts retrieved successfully
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
 *       401:
 *         description: Unauthorized (optional)
 */
router.get('/daily', optionalAuthenticate, getDailyFacts);

/**
 * @swagger
 * /api/facts/categories:
 *   get:
 *     summary: Get all categories with their facts
 *     tags: [Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *         description: Number of facts to return per category
 *     responses:
 *       200:
 *         description: Categories with facts retrieved successfully
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
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           icon:
 *                             type: string
 *                           color:
 *                             type: string
 *                           sortOrder:
 *                             type: integer
 *                           facts:
 *                             type: array
 *                             items:
 *                               $ref: '#/components/schemas/Fact'
 *                           totalFactsCount:
 *                             type: integer
 *                             description: Total number of facts in this category
 *       401:
 *         description: Unauthorized (optional)
 */
router.get('/categories', optionalAuthenticate, getCategories);

/**
 * @swagger
 * /api/facts/category/{id}:
 *   get:
 *     summary: Get facts by category
 *     tags: [Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Category ID
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
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *           enum: [EASY, MEDIUM, HARD, EXPERT]
 *         description: Filter by difficulty level
 *     responses:
 *       200:
 *         description: Facts retrieved successfully
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
 *       404:
 *         description: Category not found
 */
router.get('/category/:id', optionalAuthenticate, validateUUIDParam('id'), validatePagination, getFactsByCategory);

/**
 * @swagger
 * /api/facts/search:
 *   get:
 *     summary: Search facts
 *     tags: [Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Search query
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
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by category ID
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *           enum: [EASY, MEDIUM, HARD, EXPERT]
 *         description: Filter by difficulty level
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
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
 *                     query:
 *                       type: string
 *                     filters:
 *                       type: object
 *                 meta:
 *                   type: object
 *                   properties:
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Invalid search parameters
 */
router.get('/search', optionalAuthenticate, validateSearch, searchFacts);

/**
 * @swagger
 * /api/facts/{id}:
 *   get:
 *     summary: Get fact details
 *     tags: [Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Fact ID
 *     responses:
 *       200:
 *         description: Fact details retrieved successfully
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
 *                     fact:
 *                       $ref: '#/components/schemas/Fact'
 *       404:
 *         description: Fact not found
 */
router.get('/:id', optionalAuthenticate, validateUUIDParam('id'), getFactDetails);

/**
 * @swagger
 * /api/facts/{id}/like:
 *   post:
 *     summary: Like or unlike a fact
 *     tags: [Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Fact ID
 *     responses:
 *       200:
 *         description: Fact liked/unliked successfully
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
 *                     isLiked:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Fact not found
 */
router.post('/:id/like', authenticate, validateUUIDParam('id'), toggleLike);

/**
 * @swagger
 * /api/facts/{id}/bookmark:
 *   post:
 *     summary: Bookmark or unbookmark a fact
 *     tags: [Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Fact ID
 *     responses:
 *       200:
 *         description: Fact bookmarked/unbookmarked successfully
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
 *                     isBookmarked:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Fact not found
 */
router.post('/:id/bookmark', authenticate, validateUUIDParam('id'), toggleBookmark);

/**
 * @swagger
 * /api/facts/{id}/share:
 *   post:
 *     summary: Share a fact
 *     tags: [Facts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Fact ID
 *     responses:
 *       200:
 *         description: Fact shared successfully
 *       401:
 *         description: Unauthorized (optional)
 *       404:
 *         description: Fact not found
 */
router.post('/:id/share', optionalAuthenticate, validateUUIDParam('id'), shareFact);

module.exports = router;
