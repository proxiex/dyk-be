const { PrismaClient } = require('@prisma/client');

// Mock Prisma client for tests
const mockPrisma = {
  user: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'USER',
      isActive: true,
      isEmailVerified: true,
    }),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  fact: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 'fact-123',
        title: 'Test Fact',
        content: 'This is a test fact',
        categoryId: 'cat-123',
        isActive: true,
        isApproved: true,
      }
    ]),
    findUnique: jest.fn().mockResolvedValue({
      id: 'fact-123',
      title: 'Test Fact',
      content: 'This is a test fact',
      categoryId: 'cat-123',
      isActive: true,
      isApproved: true,
    }),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  category: {
    findMany: jest.fn().mockResolvedValue([
      { id: 'cat-123', name: 'Science', isActive: true }
    ]),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  userFact: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  notification: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  analytics: {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  userSession: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn(),
};

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  flushall: jest.fn(),
};

// Mock Firebase Admin
const mockFirebaseAuth = {
  verifyIdToken: jest.fn(),
  createCustomToken: jest.fn(),
  getUserByEmail: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
};

const mockFirebaseMessaging = {
  send: jest.fn(),
  sendMulticast: jest.fn(),
  subscribeToTopic: jest.fn(),
  unsubscribeFromTopic: jest.fn(),
};

// Global test setup
beforeAll(async () => {
  // Setup test database connection
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/dailyfacts_test';
  
  // Mock external services
  jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn(() => mockPrisma),
  }));

  jest.mock('redis', () => ({
    createClient: jest.fn(() => mockRedis),
  }));

  jest.mock('firebase-admin', () => ({
    auth: () => mockFirebaseAuth,
    messaging: () => mockFirebaseMessaging,
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
  }));

  // Mock AWS SDK
  jest.mock('aws-sdk', () => ({
    S3: jest.fn(() => ({
      upload: jest.fn(() => ({
        promise: jest.fn().mockResolvedValue({
          Key: 'test-key',
          Location: 'https://test-bucket.s3.amazonaws.com/test-key',
          Bucket: 'test-bucket',
        }),
      })),
      deleteObject: jest.fn(() => ({
        promise: jest.fn().mockResolvedValue({}),
      })),
      headObject: jest.fn(() => ({
        promise: jest.fn().mockResolvedValue({
          ContentLength: 1024,
          ContentType: 'image/jpeg',
          LastModified: new Date(),
          Metadata: {},
        }),
      })),
    })),
    config: {
      update: jest.fn(),
    },
  }));

  // Mock bcryptjs
  jest.mock('bcryptjs', () => ({
    hash: jest.fn().mockResolvedValue('hashed-password'),
    compare: jest.fn().mockResolvedValue(true),
  }));

  // Mock jsonwebtoken
  jest.mock('jsonwebtoken', () => ({
    sign: jest.fn(() => 'mock-jwt-token'),
    verify: jest.fn((token) => {
      if (token === 'valid-token') {
        return { userId: 'user-123', email: 'test@example.com' };
      }
      throw new Error('Invalid token');
    }),
  }));

  // Mock node-cron
  jest.mock('node-cron', () => ({
    schedule: jest.fn().mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      destroy: jest.fn(),
    }),
  }));
});

// Clean up after each test
afterEach(async () => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset mock implementations
  Object.values(mockPrisma).forEach(mockMethod => {
    if (typeof mockMethod === 'object') {
      Object.values(mockMethod).forEach(method => {
        if (jest.isMockFunction(method)) {
          method.mockReset();
        }
      });
    } else if (jest.isMockFunction(mockMethod)) {
      mockMethod.mockReset();
    }
  });

  Object.values(mockRedis).forEach(method => {
    if (jest.isMockFunction(method)) {
      method.mockReset();
    }
  });
});

// Global teardown
afterAll(async () => {
  // Close any open connections
  await mockPrisma.$disconnect();
});

// Helper functions for tests
global.createMockUser = (overrides = {}) => ({
  id: 'user-id-123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'USER',
  isActive: true,
  isEmailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

global.createMockFact = (overrides = {}) => ({
  id: 'fact-id-123',
  title: 'Test Fact',
  content: 'This is a test fact content.',
  difficulty: 'MEDIUM',
  categoryId: 'category-id-123',
  isApproved: true,
  isActive: true,
  isFeatured: false,
  viewCount: 0,
  likeCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
  ...overrides,
});

global.createMockCategory = (overrides = {}) => ({
  id: 'category-id-123',
  name: 'Test Category',
  description: 'Test category description',
  slug: 'test-category',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

global.createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  ip: '127.0.0.1',
  get: jest.fn().mockReturnValue('test-user-agent'),
  ...overrides,
});

global.createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  };
  return res;
};

// Export mocks for use in tests
module.exports = {
  mockPrisma,
  mockRedis,
  mockFirebaseAuth,
  mockFirebaseMessaging,
};
