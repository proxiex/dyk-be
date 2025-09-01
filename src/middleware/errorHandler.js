const logger = require('../utils/logger');
const { errorResponse, serverErrorResponse, validationErrorResponse, rateLimitResponse } = require('../utils/response');

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async error handler wrapper
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global error handler middleware
 */
const globalErrorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.logError(err, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid ID format';
    error = new ApiError(message, 400);
  }

  // Prisma errors
  if (err.code === 'P2002') {
    const message = 'Duplicate field value entered';
    error = new ApiError(message, 400);
  }

  if (err.code === 'P2025') {
    const message = 'Record not found';
    error = new ApiError(message, 404);
  }

  if (err.code === 'P2003') {
    const message = 'Foreign key constraint violation';
    error = new ApiError(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ApiError(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ApiError(message, 401);
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    return validationErrorResponse(res, message);
  }

  // Rate limiting errors
  if (err.status === 429) {
    return rateLimitResponse(res, 'Too many requests, please try again later');
  }

  // Handle operational vs programming errors
  if (error.isOperational) {
    return errorResponse(res, error.message, null, error.statusCode);
  }

  // Programming errors - don't leak error details
  return serverErrorResponse(res, process.env.NODE_ENV === 'development' ? error : null);
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

/**
 * Request timeout handler
 */
const timeoutHandler = (timeout = 30000) => {
  return (req, res, next) => {
    res.setTimeout(timeout, () => {
      const error = new ApiError('Request timeout', 408);
      next(error);
    });
    next();
  };
};

module.exports = {
  ApiError,
  asyncHandler,
  globalErrorHandler,
  notFoundHandler,
  timeoutHandler,
};
