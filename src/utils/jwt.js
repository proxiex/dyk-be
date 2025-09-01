const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const logger = require('./logger');

/**
 * JWT configuration
 */
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate access token
 */
const generateAccessToken = (userId, role = 'USER') => {
  try {
    const payload = {
      userId,
      role,
      type: 'access',
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'dyk-api',
      audience: 'dyk-app',
    });
  } catch (error) {
    logger.error('Error generating access token:', error);
    throw new Error('Token generation failed');
  }
};

/**
 * Generate refresh token
 */
const generateRefreshToken = () => {
  try {
    const payload = {
      tokenId: crypto.randomUUID(),
      type: 'refresh',
    };

    return jwt.sign(payload, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'dyk-api',
      audience: 'dyk-app',
    });
  } catch (error) {
    logger.error('Error generating refresh token:', error);
    throw new Error('Refresh token generation failed');
  }
};

/**
 * Verify access token
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'dyk-api',
      audience: 'dyk-app',
    });
  } catch (error) {
    logger.warn('Access token verification failed:', error.message);
    throw error;
  }
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'dyk-api',
      audience: 'dyk-app',
    });
  } catch (error) {
    logger.warn('Refresh token verification failed:', error.message);
    throw error;
  }
};

/**
 * Extract token from request header
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Generate token pair (access + refresh)
 */
const generateTokenPair = async (userId, role, deviceInfo = {}) => {
  try {
    const accessToken = generateAccessToken(userId, role);
    const refreshToken = generateRefreshToken();

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.userSession.create({
      data: {
        userId,
        refreshToken,
        deviceId: deviceInfo.deviceId,
        deviceType: deviceInfo.deviceType,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        expiresAt,
      },
    });

    logger.info('Token pair generated successfully', { userId });

    return {
      accessToken,
      refreshToken,
      expiresIn: JWT_EXPIRES_IN,
      refreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
    };
  } catch (error) {
    logger.error('Error generating token pair:', error);
    throw new Error('Token pair generation failed');
  }
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async (refreshToken) => {
  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Find session in database
    const session = await prisma.userSession.findUnique({
      where: {
        refreshToken,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!session) {
      throw new Error('Invalid refresh token');
    }

    if (!session.user.isActive) {
      throw new Error('User account is inactive');
    }

    if (new Date() > session.expiresAt) {
      // Clean up expired session
      await prisma.userSession.delete({
        where: { id: session.id },
      });
      throw new Error('Refresh token expired');
    }

    // Generate new access token
    const accessToken = generateAccessToken(session.userId, session.user.role);

    logger.info('Access token refreshed successfully', { userId: session.userId });

    return {
      accessToken,
      expiresIn: JWT_EXPIRES_IN,
    };
  } catch (error) {
    logger.error('Error refreshing access token:', error);
    throw error;
  }
};

/**
 * Invalidate refresh token (logout)
 */
const invalidateRefreshToken = async (refreshToken) => {
  try {
    const session = await prisma.userSession.findUnique({
      where: { refreshToken },
    });

    if (session) {
      await prisma.userSession.delete({
        where: { id: session.id },
      });
      logger.info('Refresh token invalidated', { userId: session.userId });
    }

    return true;
  } catch (error) {
    logger.error('Error invalidating refresh token:', error);
    throw new Error('Token invalidation failed');
  }
};

/**
 * Invalidate all user sessions (logout from all devices)
 */
const invalidateAllUserSessions = async (userId) => {
  try {
    await prisma.userSession.deleteMany({
      where: { userId },
    });

    logger.info('All user sessions invalidated', { userId });
    return true;
  } catch (error) {
    logger.error('Error invalidating all user sessions:', error);
    throw new Error('Session cleanup failed');
  }
};

/**
 * Clean up expired sessions
 */
const cleanupExpiredSessions = async () => {
  try {
    const result = await prisma.userSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    logger.info(`Cleaned up ${result.count} expired sessions`);
    return result.count;
  } catch (error) {
    logger.error('Error cleaning up expired sessions:', error);
    throw new Error('Session cleanup failed');
  }
};

/**
 * Get user active sessions
 */
const getUserActiveSessions = async (userId) => {
  try {
    const sessions = await prisma.userSession.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        deviceId: true,
        deviceType: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return sessions;
  } catch (error) {
    logger.error('Error getting user active sessions:', error);
    throw new Error('Failed to get user sessions');
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractTokenFromHeader,
  generateTokenPair,
  refreshAccessToken,
  invalidateRefreshToken,
  invalidateAllUserSessions,
  cleanupExpiredSessions,
  getUserActiveSessions,
};
