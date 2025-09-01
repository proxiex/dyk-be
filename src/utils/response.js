const logger = require('./logger');

/**
 * Standard API response structure
 */
class ApiResponse {
  constructor(success, message, data = null, meta = null) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.meta = meta;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Success response helper
 */
const successResponse = (res, message, data = null, meta = null, statusCode = 200) => {
  const response = new ApiResponse(true, message, data, meta);
  
  logger.info({
    type: 'SUCCESS_RESPONSE',
    statusCode,
    message,
    dataKeys: data ? Object.keys(data) : null,
  });
  
  return res.status(statusCode).json(response);
};

/**
 * Error response helper
 */
const errorResponse = (res, message, error = null, statusCode = 500) => {
  const response = new ApiResponse(false, message);
  
  // Add error details in development
  if (process.env.NODE_ENV === 'development' && error) {
    response.error = {
      message: error.message,
      stack: error.stack,
    };
  }
  
  logger.error({
    type: 'ERROR_RESPONSE',
    statusCode,
    message,
    error: error ? error.message : null,
    stack: error ? error.stack : null,
  });
  
  return res.status(statusCode).json(response);
};

/**
 * Validation error response
 */
const validationErrorResponse = (res, errors) => {
  const response = new ApiResponse(false, 'Validation failed', null, { errors });
  
  logger.warn({
    type: 'VALIDATION_ERROR',
    errors,
  });
  
  return res.status(400).json(response);
};

/**
 * Pagination helper
 */
const paginatedResponse = (res, message, data, pagination) => {
  const meta = {
    pagination: {
      page: parseInt(pagination.page),
      limit: parseInt(pagination.limit),
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
      hasNext: pagination.page * pagination.limit < pagination.total,
      hasPrev: pagination.page > 1,
    },
  };
  
  return successResponse(res, message, data, meta);
};

/**
 * Not found response
 */
const notFoundResponse = (res, resource = 'Resource') => {
  return errorResponse(res, `${resource} not found`, null, 404);
};

/**
 * Unauthorized response
 */
const unauthorizedResponse = (res, message = 'Unauthorized access') => {
  return errorResponse(res, message, null, 401);
};

/**
 * Forbidden response
 */
const forbiddenResponse = (res, message = 'Access forbidden') => {
  return errorResponse(res, message, null, 403);
};

/**
 * Conflict response
 */
const conflictResponse = (res, message = 'Resource already exists') => {
  return errorResponse(res, message, null, 409);
};

/**
 * Rate limit exceeded response
 */
const rateLimitResponse = (res, message = 'Rate limit exceeded') => {
  return errorResponse(res, message, null, 429);
};

/**
 * Server error response
 */
const serverErrorResponse = (res, error = null) => {
  return errorResponse(res, 'Internal server error', error, 500);
};

module.exports = {
  ApiResponse,
  successResponse,
  errorResponse,
  validationErrorResponse,
  paginatedResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  conflictResponse,
  rateLimitResponse,
  serverErrorResponse,
};
