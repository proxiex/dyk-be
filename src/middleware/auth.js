const { verifyAccessToken, extractTokenFromHeader } = require('../utils/jwt');
const { prisma } = require('../config/database');
const { unauthorizedResponse, forbiddenResponse } = require('../utils/response');
const { ApiError } = require('./errorHandler');
const logger = require('../utils/logger');

/**
 * Authentication middleware
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return unauthorizedResponse(res, 'Access token is required');
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
      },
    });

    if (!user) {
      return unauthorizedResponse(res, 'User not found');
    }

    if (!user.isActive) {
      return unauthorizedResponse(res, 'Account is inactive');
    }

    // Attach user to request
    req.user = user;
    req.token = token;

    logger.debug('User authenticated successfully', { userId: user.id });
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return unauthorizedResponse(res, 'Invalid access token');
    }
    if (error.name === 'TokenExpiredError') {
      return unauthorizedResponse(res, 'Access token expired');
    }
    
    logger.error('Authentication error:', error);
    return unauthorizedResponse(res, 'Authentication failed');
  }
};

/**
 * Optional authentication middleware (for endpoints that work with or without auth)
 */
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      const decoded = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          isEmailVerified: true,
        },
      });

      if (user && user.isActive) {
        req.user = user;
        req.token = token;
      }
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on token errors
    logger.debug('Optional authentication failed:', error.message);
    next();
  }
};

/**
 * Role-based authorization middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return unauthorizedResponse(res, 'Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed', { 
        userId: req.user.id, 
        userRole: req.user.role, 
        requiredRoles: roles 
      });
      return forbiddenResponse(res, 'Insufficient permissions');
    }

    next();
  };
};

/**
 * Admin authorization middleware
 */
const requireAdmin = authorize('ADMIN', 'SUPER_ADMIN');

/**
 * Moderator or higher authorization middleware
 */
const requireModerator = authorize('MODERATOR', 'ADMIN', 'SUPER_ADMIN');

/**
 * Email verification middleware
 */
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return unauthorizedResponse(res, 'Authentication required');
  }

  if (!req.user.isEmailVerified) {
    return forbiddenResponse(res, 'Email verification required');
  }

  next();
};

/**
 * Check if user owns resource middleware
 */
const requireOwnership = (resourceIdParam = 'id', userIdField = 'userId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return unauthorizedResponse(res, 'Authentication required');
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        throw new ApiError('Resource ID is required', 400);
      }

      // For admin users, skip ownership check
      if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
        return next();
      }

      // Check ownership logic would depend on the specific resource
      // This is a generic implementation
      req.resourceId = resourceId;
      req.isOwner = true; // This should be determined by actual ownership logic

      next();
    } catch (error) {
      logger.error('Ownership check error:', error);
      return forbiddenResponse(res, 'Access denied');
    }
  };
};

/**
 * Rate limiting by user ID
 */
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    if (userRequests.has(userId)) {
      const requests = userRequests.get(userId).filter(time => time > windowStart);
      userRequests.set(userId, requests);
    } else {
      userRequests.set(userId, []);
    }

    const userRequestCount = userRequests.get(userId).length;

    if (userRequestCount >= maxRequests) {
      logger.warn('User rate limit exceeded', { userId, requestCount: userRequestCount });
      return forbiddenResponse(res, 'User rate limit exceeded');
    }

    // Add current request
    userRequests.get(userId).push(now);
    next();
  };
};

/**
 * Device tracking middleware
 */
const trackDevice = (req, res, next) => {
  req.deviceInfo = {
    deviceId: req.headers['x-device-id'],
    deviceType: req.headers['x-device-type'],
    appVersion: req.headers['x-app-version'],
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  };

  next();
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
  requireAdmin,
  requireModerator,
  requireEmailVerification,
  requireOwnership,
  userRateLimit,
  trackDevice,
};
