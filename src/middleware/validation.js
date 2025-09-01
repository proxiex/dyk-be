const { body, param, query, validationResult } = require('express-validator');
const { validationErrorResponse } = require('../utils/response');

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value,
    }));
    return validationErrorResponse(res, errorMessages);
  }
  next();
};

/**
 * User registration validation
 */
const validateUserRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Date of birth must be a valid date'),
  body('timezone')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Timezone is required'),
  handleValidationErrors,
];

/**
 * User login validation
 */
const validateUserLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('deviceId')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Device ID must be provided'),
  handleValidationErrors,
];

/**
 * Token refresh validation
 */
const validateTokenRefresh = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required'),
  handleValidationErrors,
];

/**
 * Password reset request validation
 */
const validatePasswordResetRequest = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  handleValidationErrors,
];

/**
 * Password reset validation
 */
const validatePasswordReset = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  handleValidationErrors,
];

/**
 * Profile update validation
 */
const validateProfileUpdate = [
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Date of birth must be a valid date'),
  body('timezone')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Timezone is required'),
  handleValidationErrors,
];

/**
 * Notification settings validation
 */
const validateNotificationSettings = [
  body('notificationsEnabled')
    .optional()
    .isBoolean()
    .withMessage('Notifications enabled must be a boolean'),
  body('dailyNotificationTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Daily notification time must be in HH:MM format'),
  body('maxNotificationsPerDay')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max notifications per day must be between 1 and 10'),
  body('weekendNotifications')
    .optional()
    .isBoolean()
    .withMessage('Weekend notifications must be a boolean'),
  handleValidationErrors,
];

/**
 * Topic preferences validation
 */
const validateTopicPreferences = [
  body('categories')
    .isArray({ min: 1 })
    .withMessage('At least one category must be selected'),
  body('categories.*')
    .isUUID()
    .withMessage('Each category must be a valid UUID'),
  body('difficultyLevel')
    .optional()
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Difficulty level must be EASY, MEDIUM, HARD, or EXPERT'),
  handleValidationErrors,
];

/**
 * Fact creation validation
 */
const validateFactCreation = [
  body('title')
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('content')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Content must be between 10 and 2000 characters'),
  body('shortContent')
    .optional()
    .isLength({ max: 280 })
    .withMessage('Short content must be less than 280 characters'),
  body('categoryId')
    .isUUID()
    .withMessage('Category ID must be a valid UUID'),
  body('difficulty')
    .isIn(['EASY', 'MEDIUM', 'HARD', 'EXPERT'])
    .withMessage('Difficulty must be EASY, MEDIUM, HARD, or EXPERT'),
  body('source')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Source must be less than 200 characters'),
  body('sourceUrl')
    .optional()
    .isURL()
    .withMessage('Source URL must be a valid URL'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('language')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Language must be a valid language code'),
  handleValidationErrors,
];

/**
 * UUID parameter validation
 */
const validateUUIDParam = (paramName = 'id') => [
  param(paramName)
    .isUUID()
    .withMessage(`${paramName} must be a valid UUID`),
  handleValidationErrors,
];

/**
 * Pagination validation
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors,
];

/**
 * Search validation
 */
const validateSearch = [
  query('q')
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  ...validatePagination,
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateTokenRefresh,
  validatePasswordResetRequest,
  validatePasswordReset,
  validateProfileUpdate,
  validateNotificationSettings,
  validateTopicPreferences,
  validateFactCreation,
  validateUUIDParam,
  validatePagination,
  validateSearch,
  handleValidationErrors,
};
