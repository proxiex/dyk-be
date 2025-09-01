const request = require('supertest');
const app = require('../../src/app');
const { mockPrisma } = require('../setup');

describe('Facts API Integration Tests', () => {
  describe('GET /api/facts/daily', () => {
    it('should return daily facts for anonymous user', async () => {
      const mockFacts = [
        createMockFact({ id: '1', title: 'Fact 1' }),
        createMockFact({ id: '2', title: 'Fact 2' }),
      ];

      mockPrisma.fact.findMany.mockResolvedValue(mockFacts);

      const response = await request(app)
        .get('/api/facts/daily')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Daily facts retrieved successfully',
        data: {
          facts: expect.arrayContaining([
            expect.objectContaining({ title: 'Fact 1' }),
            expect.objectContaining({ title: 'Fact 2' }),
          ]),
        },
      });
    });

    it('should return personalized facts for authenticated user', async () => {
      const mockUser = createMockUser();
      const mockFacts = [
        createMockFact({ id: '1', title: 'Personalized Fact 1' }),
      ];

      // Mock authentication middleware
      jest.doMock('../../src/middleware/auth', () => ({
        authenticate: (req, res, next) => {
          req.user = mockUser;
          next();
        },
      }));

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.userCategory.findMany.mockResolvedValue([]);
      mockPrisma.fact.findMany.mockResolvedValue(mockFacts);

      const response = await request(app)
        .get('/api/facts/daily')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.facts).toHaveLength(1);
    });

    it('should handle rate limiting', async () => {
      // Make multiple requests to trigger rate limiting
      const promises = Array(10).fill().map(() =>
        request(app).get('/api/facts/daily')
      );

      const responses = await Promise.all(promises);
      
      // Some requests should succeed, but if rate limit is hit, should get 429
      const statusCodes = responses.map(r => r.status);
      expect(statusCodes).toContain(200);
    });
  });

  describe('GET /api/facts/categories', () => {
    it('should return all active categories', async () => {
      const mockCategories = [
        createMockCategory({ id: '1', name: 'Science' }),
        createMockCategory({ id: '2', name: 'History' }),
      ];

      mockPrisma.category.findMany.mockResolvedValue(mockCategories);

      const response = await request(app)
        .get('/api/facts/categories')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          categories: expect.arrayContaining([
            expect.objectContaining({ name: 'Science' }),
            expect.objectContaining({ name: 'History' }),
          ]),
        },
      });
    });
  });

  describe('GET /api/facts/:id', () => {
    it('should return fact details', async () => {
      const mockFact = createMockFact({
        id: 'fact-123',
        title: 'Test Fact',
        content: 'Test content',
      });

      mockPrisma.fact.findUnique.mockResolvedValue(mockFact);

      const response = await request(app)
        .get('/api/facts/fact-123')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          fact: expect.objectContaining({
            id: 'fact-123',
            title: 'Test Fact',
            content: 'Test content',
          }),
        },
      });
    });

    it('should return 404 for non-existent fact', async () => {
      mockPrisma.fact.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/facts/non-existent')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Fact not found',
      });
    });
  });

  describe('POST /api/facts/:id/like', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/facts/fact-123/like')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('Unauthorized'),
      });
    });

    it('should toggle like status for authenticated user', async () => {
      const mockUser = createMockUser();
      const mockFact = createMockFact({ id: 'fact-123' });

      // Mock authentication
      jest.doMock('../../src/middleware/auth', () => ({
        authenticate: (req, res, next) => {
          req.user = mockUser;
          next();
        },
      }));

      mockPrisma.fact.findUnique.mockResolvedValue(mockFact);
      mockPrisma.userFact.findUnique.mockResolvedValue(null);
      mockPrisma.userFact.upsert.mockResolvedValue({
        isLiked: true,
      });

      const response = await request(app)
        .post('/api/facts/fact-123/like')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('liked'),
      });
    });
  });
});
