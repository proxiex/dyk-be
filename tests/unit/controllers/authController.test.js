const request = require('supertest');
const { mockPrisma } = require('../../setup');
const { register, login } = require('../../../src/controllers/authController');

describe('Auth Controller', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = createMockRequest();
    mockRes = createMockResponse();
    mockNext = jest.fn();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      mockReq.body = userData;

      // Mock user doesn't exist
      mockPrisma.user.findUnique.mockResolvedValue(null);
      
      // Mock successful user creation
      const mockUser = createMockUser({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
      });
      mockPrisma.user.create.mockResolvedValue(mockUser);

      // Mock session creation
      mockPrisma.userSession.create.mockResolvedValue({
        id: 'session-id',
        userId: mockUser.id,
        token: 'refresh-token',
      });

      await register(mockReq, mockRes, mockNext);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: userData.email },
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
        }),
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'User registered successfully',
        data: expect.objectContaining({
          user: expect.objectContaining({
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
          }),
          tokens: expect.objectContaining({
            accessToken: expect.any(String),
            refreshToken: expect.any(String),
          }),
        }),
        timestamp: expect.any(String),
      });
    });

    it('should return error if user already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      mockReq.body = userData;

      // Mock user already exists
      mockPrisma.user.findUnique.mockResolvedValue(createMockUser({
        email: userData.email,
      }));

      await register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'User already exists with this email',
        timestamp: expect.any(String),
      });
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockReq.body = loginData;

      const mockUser = createMockUser({
        email: loginData.email,
        password: 'hashed-password',
      });

      // Mock user exists
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      // Mock session creation
      mockPrisma.userSession.create.mockResolvedValue({
        id: 'session-id',
        userId: mockUser.id,
        token: 'refresh-token',
      });

      await login(mockReq, mockRes, mockNext);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        data: expect.objectContaining({
          user: expect.objectContaining({
            email: loginData.email,
          }),
          tokens: expect.objectContaining({
            accessToken: expect.any(String),
            refreshToken: expect.any(String),
          }),
        }),
        timestamp: expect.any(String),
      });
    });

    it('should return error for invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      mockReq.body = loginData;

      // Mock user doesn't exist
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await login(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials',
        timestamp: expect.any(String),
      });
    });
  });
});
