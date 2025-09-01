const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const logger = require('./utils/logger');
const { globalErrorHandler, notFoundHandler, timeoutHandler } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const factRoutes = require('./routes/facts');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');

/**
 * Create Express application
 */
const app = express();

/**
 * Trust proxy for rate limiting and IP detection
 */
app.set('trust proxy', 1);

/**
 * Security middleware
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "https:"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

/**
 * CORS configuration
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
    
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Device-ID', 'X-App-Version'],
};

app.use(cors(corsOptions));

/**
 * Request timeout middleware
 */
app.use(timeoutHandler(30000)); // 30 seconds timeout

/**
 * Compression middleware
 */
app.use(compression());

/**
 * Body parsing middleware
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Request logging middleware
 */
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, { stream: logger.stream }));

/**
 * Request tracking middleware
 */
app.use((req, res, next) => {
  req.requestId = require('uuid').v4();
  req.startTime = Date.now();
  
  // Log request details
  logger.info({
    type: 'REQUEST_START',
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  
  // Log response when finished
  res.on('finish', () => {
    const responseTime = Date.now() - req.startTime;
    logger.logApiRequest(req, res, responseTime);
  });
  
  next();
});

/**
 * General rate limiting
 */
app.use(generalLimiter);

/**
 * Health check endpoint (before rate limiting)
 */
app.use('/health', healthRoutes);

/**
 * API Routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/facts', factRoutes);
app.use('/api/admin', adminRoutes);

/**
 * API documentation
 */
if (process.env.NODE_ENV !== 'production') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./config/swagger');
  
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Daily Facts API is running',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

/**
 * 404 handler for undefined routes
 */
app.use(notFoundHandler);

/**
 * Global error handler
 */
app.use(globalErrorHandler);

module.exports = app;
