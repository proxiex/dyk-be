const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const { cache, cacheKeys } = require('../config/redis');
const { generateTokenPair, refreshAccessToken, invalidateRefreshToken, invalidateAllUserSessions } = require('../utils/jwt');
const { successResponse, errorResponse, conflictResponse, notFoundResponse } = require('../utils/response');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Register new user
 */
const register = asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, dateOfBirth, timezone } = req.body;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    return conflictResponse(res, 'User with this email already exists');
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      timezone: timezone || 'UTC',
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isEmailVerified: true,
      createdAt: true,
    },
  });

  // Create default user categories (all categories enabled by default)
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  if (categories.length > 0) {
    await prisma.userCategory.createMany({
      data: categories.map(category => ({
        userId: user.id,
        categoryId: category.id,
        isEnabled: true,
      })),
    });
  }

  // Generate tokens
  const tokens = await generateTokenPair(user.id, 'USER', req.deviceInfo);

  // Log user registration
  logger.logUserAction('USER_REGISTERED', user.id, {
    email: user.email,
    deviceInfo: req.deviceInfo,
  });

  // TODO: Send welcome email and email verification
  
  successResponse(res, 'User registered successfully', {
    user,
    tokens,
  }, null, 201);
});

/**
 * User login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      password: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      isEmailVerified: true,
      lastActiveDate: true,
    },
  });

  if (!user) {
    return errorResponse(res, 'Invalid email or password', null, 401);
  }

  if (!user.isActive) {
    return errorResponse(res, 'Account is inactive. Please contact support.', null, 403);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return errorResponse(res, 'Invalid email or password', null, 401);
  }

  // Update last active date
  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveDate: new Date() },
  });

  // Generate tokens
  const tokens = await generateTokenPair(user.id, user.role, req.deviceInfo);

  // Remove password from response
  delete user.password;

  // Cache user data
  await cache.set(cacheKeys.userProfile(user.id), user, 3600); // 1 hour

  // Log user login
  logger.logUserAction('USER_LOGIN', user.id, {
    email: user.email,
    deviceInfo: req.deviceInfo,
  });

  successResponse(res, 'Login successful', {
    user,
    tokens,
  });
});

/**
 * Refresh access token
 */
const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  const tokens = await refreshAccessToken(refreshToken);

  successResponse(res, 'Token refreshed successfully', { tokens });
});

/**
 * User logout
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await invalidateRefreshToken(refreshToken);
  }

  // Clear user cache
  if (req.user) {
    await cache.del(cacheKeys.userProfile(req.user.id));
    
    // Log user logout
    logger.logUserAction('USER_LOGOUT', req.user.id, {
      deviceInfo: req.deviceInfo,
    });
  }

  successResponse(res, 'Logout successful');
});

/**
 * Logout from all devices
 */
const logoutAll = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  await invalidateAllUserSessions(userId);

  // Clear user cache
  await cache.del(cacheKeys.userProfile(userId));

  // Log user logout from all devices
  logger.logUserAction('USER_LOGOUT_ALL', userId, {
    deviceInfo: req.deviceInfo,
  });

  successResponse(res, 'Logged out from all devices successfully');
});

/**
 * Request password reset
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, firstName: true, isActive: true },
  });

  // Always return success to prevent email enumeration
  if (!user || !user.isActive) {
    return successResponse(res, 'If the email exists in our system, you will receive a password reset link');
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Store reset token in cache (more secure than database)
  await cache.set(
    `password_reset:${resetToken}`,
    { userId: user.id, email: user.email },
    15 * 60 // 15 minutes
  );

  // TODO: Send password reset email
  logger.logUserAction('PASSWORD_RESET_REQUESTED', user.id, {
    email: user.email,
    ipAddress: req.ip,
  });

  successResponse(res, 'If the email exists in our system, you will receive a password reset link');
});

/**
 * Reset password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  // Get reset token data from cache
  const resetData = await cache.get(`password_reset:${token}`);
  if (!resetData) {
    return errorResponse(res, 'Invalid or expired reset token', null, 400);
  }

  // Hash new password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Update user password
  await prisma.user.update({
    where: { id: resetData.userId },
    data: { password: hashedPassword },
  });

  // Invalidate all user sessions
  await invalidateAllUserSessions(resetData.userId);

  // Remove reset token from cache
  await cache.del(`password_reset:${token}`);

  // Clear user cache
  await cache.del(cacheKeys.userProfile(resetData.userId));

  // Log password reset
  logger.logUserAction('PASSWORD_RESET_COMPLETED', resetData.userId, {
    email: resetData.email,
    ipAddress: req.ip,
  });

  successResponse(res, 'Password reset successfully');
});

/**
 * Verify email
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  // Get verification token data from cache
  const verificationData = await cache.get(`email_verification:${token}`);
  if (!verificationData) {
    return errorResponse(res, 'Invalid or expired verification token', null, 400);
  }

  // Update user email verification status
  await prisma.user.update({
    where: { id: verificationData.userId },
    data: { isEmailVerified: true },
  });

  // Remove verification token from cache
  await cache.del(`email_verification:${token}`);

  // Clear user cache
  await cache.del(cacheKeys.userProfile(verificationData.userId));

  // Log email verification
  logger.logUserAction('EMAIL_VERIFIED', verificationData.userId, {
    email: verificationData.email,
  });

  successResponse(res, 'Email verified successfully');
});

/**
 * Resend email verification
 */
const resendEmailVerification = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, isEmailVerified: true },
  });

  if (user.isEmailVerified) {
    return errorResponse(res, 'Email is already verified', null, 400);
  }

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Store verification token in cache
  await cache.set(
    `email_verification:${verificationToken}`,
    { userId: user.id, email: user.email },
    24 * 60 * 60 // 24 hours
  );

  // TODO: Send verification email

  // Log email verification resend
  logger.logUserAction('EMAIL_VERIFICATION_RESENT', userId, {
    email: user.email,
  });

  successResponse(res, 'Verification email sent successfully');
});

/**
 * Change password (authenticated user)
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  // Get user with password
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    return errorResponse(res, 'Current password is incorrect', null, 400);
  }

  // Hash new password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  // Invalidate all other sessions (keep current session)
  await prisma.userSession.deleteMany({
    where: {
      userId,
      refreshToken: { not: req.body.currentRefreshToken || '' },
    },
  });

  // Log password change
  logger.logUserAction('PASSWORD_CHANGED', userId, {
    ipAddress: req.ip,
  });

  successResponse(res, 'Password changed successfully');
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendEmailVerification,
  changePassword,
};
