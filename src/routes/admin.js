const express = require('express');
const {
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
} = require('../controllers/adminController');

const { authenticate, requireAdmin, requireModerator } = require('../middleware/auth');
const { adminLimiter } = require('../middleware/rateLimiter');
const {
  validateFactCreation,
  validateUUIDParam,
  validatePagination,
} = require('../middleware/validation');

const router = express.Router();

// Apply authentication and admin authorization to all admin routes
router.use(authenticate);
router.use(adminLimiter);

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminFact:
 *       allOf:
 *         - $ref: '#/components/schemas/Fact'
 *         - type: object
 *           properties:
 *             isApproved:
 *               type: boolean
 *             createdBy:
 *               type: string
 *               format: uuid
 *             approvedBy:
 *               type: string
 *               format: uuid
 *             approvedAt:
 *               type: string
 *               format: date-time
 *     Analytics:
 *       type: object
 *       properties:
 *         timeframe:
 *           type: string
 *         dateRange:
 *           type: object
 *           properties:
 *             start:
 *               type: string
 *               format: date-time
 *             end:
 *               type: string
 *               format: date-time
 *         users:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *             active:
 *               type: integer
 *             new:
 *               type: integer
 *             retention:
 *               type: integer
 *         facts:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *             viewed:
 *               type: integer
 *             liked:
 *               type: integer
 *             bookmarked:
 *               type: integer
 *         engagement:
 *           type: object
 *           properties:
 *             viewRate:
 *               type: string
 *             likeRate:
 *               type: string
 *             bookmarkRate:
 *               type: string
 *         popularFacts:
 *           type: array
 *           items:
 *             type: object
 *         categoryEngagement:
 *           type: array
 *           items:
 *             type: object
 */

/**
 * @swagger
 * /api/admin/facts:
 *   post:
 *     summary: Create new fact
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - categoryId
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 200
 *               content:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 2000
 *               shortContent:
 *                 type: string
 *                 maxLength: 280
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *               difficulty:
 *                 type: string
 *                 enum: [EASY, MEDIUM, HARD, EXPERT]
 *               source:
 *                 type: string
 *                 maxLength: 200
 *               sourceUrl:
 *                 type: string
 *                 format: uri
 *               imageUrl:
 *                 type: string
 *                 format: uri
 *               videoUrl:
 *                 type: string
 *                 format: uri
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               language:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 5
 *               isFeatured:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Fact created successfully
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
 *                       $ref: '#/components/schemas/AdminFact'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Category not found
 */
router.post('/facts', requireModerator, validateFactCreation, createFact);

/**
 * @swagger
 * /api/admin/facts:
 *   get:
 *     summary: Get all facts for admin management
 *     tags: [Admin]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [approved, pending, inactive]
 *         description: Filter by approval status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by category ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and content
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
 *                         $ref: '#/components/schemas/AdminFact'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/facts', requireModerator, validatePagination, getAllFacts);

/**
 * @swagger
 * /api/admin/facts/{id}:
 *   put:
 *     summary: Update existing fact
 *     tags: [Admin]
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 200
 *               content:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 2000
 *               shortContent:
 *                 type: string
 *                 maxLength: 280
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *               difficulty:
 *                 type: string
 *                 enum: [EASY, MEDIUM, HARD, EXPERT]
 *               source:
 *                 type: string
 *                 maxLength: 200
 *               sourceUrl:
 *                 type: string
 *                 format: uri
 *               imageUrl:
 *                 type: string
 *                 format: uri
 *               videoUrl:
 *                 type: string
 *                 format: uri
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               language:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 5
 *               isFeatured:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Fact updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Fact not found
 */
router.put('/facts/:id', requireModerator, validateUUIDParam('id'), updateFact);

/**
 * @swagger
 * /api/admin/facts/{id}:
 *   delete:
 *     summary: Delete fact (soft delete)
 *     tags: [Admin]
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
 *         description: Fact deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Fact not found
 */
router.delete('/facts/:id', requireAdmin, validateUUIDParam('id'), deleteFact);

/**
 * @swagger
 * /api/admin/facts/{id}/approve:
 *   post:
 *     summary: Approve pending fact
 *     tags: [Admin]
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
 *         description: Fact approved successfully
 *       400:
 *         description: Fact already approved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Fact not found
 */
router.post('/facts/:id/approve', requireModerator, validateUUIDParam('id'), approveFact);

/**
 * @swagger
 * /api/admin/facts/{id}/reject:
 *   post:
 *     summary: Reject pending fact
 *     tags: [Admin]
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for rejection
 *     responses:
 *       200:
 *         description: Fact rejected successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Fact not found
 */
router.post('/facts/:id/reject', requireModerator, validateUUIDParam('id'), rejectFact);

/**
 * @swagger
 * /api/admin/categories:
 *   post:
 *     summary: Create new category
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               icon:
 *                 type: string
 *               color:
 *                 type: string
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Category created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: Category name already exists
 */
router.post('/categories', requireAdmin, createCategory);

/**
 * @swagger
 * /api/admin/categories/{id}:
 *   put:
 *     summary: Update category
 *     tags: [Admin]
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               icon:
 *                 type: string
 *               color:
 *                 type: string
 *               sortOrder:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Category not found
 *       409:
 *         description: Category name already exists
 */
router.put('/categories/:id', requireAdmin, validateUUIDParam('id'), updateCategory);

/**
 * @swagger
 * /api/admin/categories/{id}:
 *   delete:
 *     summary: Delete category
 *     tags: [Admin]
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
 *     responses:
 *       200:
 *         description: Category deleted successfully
 *       400:
 *         description: Cannot delete category with existing facts
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Category not found
 */
router.delete('/categories/:id', requireAdmin, validateUUIDParam('id'), deleteCategory);

/**
 * @swagger
 * /api/admin/analytics:
 *   get:
 *     summary: Get user engagement analytics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 1y]
 *           default: 30d
 *         description: Analytics timeframe
 *     responses:
 *       200:
 *         description: Analytics retrieved successfully
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
 *                     analytics:
 *                       $ref: '#/components/schemas/Analytics'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/analytics', requireAdmin, getAnalytics);

/**
 * @swagger
 * /api/admin/metrics:
 *   get:
 *     summary: Get system health and metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System metrics retrieved successfully
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
 *                     metrics:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get('/metrics', requireAdmin, getSystemMetrics);

module.exports = router;
