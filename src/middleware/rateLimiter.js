const rateLimit = require('express-rate-limit');
const { rateLimitResponse } = require('../utils/response');

/**
 * General rate limiter
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    rateLimitResponse(res, 'Too many requests, please try again in 15 minutes');
  },
});

/**
 * Authentication endpoints rate limiter
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    rateLimitResponse(res, 'Too many authentication attempts, please try again in 15 minutes');
  },
});

/**
 * Password reset rate limiter
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 password reset requests per hour
  message: 'Too many password reset attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    rateLimitResponse(res, 'Too many password reset attempts, please try again in 1 hour');
  },
});

/**
 * API endpoints rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: 'API rate limit exceeded, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    rateLimitResponse(res, 'API rate limit exceeded, please try again in 15 minutes');
  },
});

/**
 * Admin endpoints rate limiter
 */
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: 'Admin API rate limit exceeded, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    rateLimitResponse(res, 'Admin API rate limit exceeded, please try again in 15 minutes');
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  apiLimiter,
  adminLimiter,
};
