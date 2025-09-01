const {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  paginatedResponse,
} = require('../../../src/utils/response');

describe('Response Utils', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = createMockResponse();
  });

  describe('successResponse', () => {
    it('should return success response with data', () => {
      const data = { id: 1, name: 'Test' };
      const message = 'Success';

      successResponse(mockRes, message, data);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message,
        data,
        timestamp: expect.any(String),
      });
    });

    it('should return success response without data', () => {
      const message = 'Success';

      successResponse(mockRes, message);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message,
        timestamp: expect.any(String),
      });
    });

    it('should use custom status code', () => {
      const message = 'Created';
      const data = { id: 1 };

      successResponse(mockRes, message, data, 201);

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });

  describe('errorResponse', () => {
    it('should return error response', () => {
      const message = 'Error occurred';

      errorResponse(mockRes, message);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message,
        timestamp: expect.any(String),
      });
    });

    it('should use custom status code', () => {
      const message = 'Bad request';

      errorResponse(mockRes, message, 400);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should include error details in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const message = 'Error occurred';
      const error = new Error('Detailed error');

      errorResponse(mockRes, message, 500, error);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message,
        error: {
          message: error.message,
          stack: error.stack,
        },
        timestamp: expect.any(String),
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('validationErrorResponse', () => {
    it('should return validation error response', () => {
      const errors = [
        { field: 'email', message: 'Invalid email', value: undefined },
        { field: 'password', message: 'Required', value: undefined },
      ];

      validationErrorResponse(mockRes, errors);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed',
        meta: { errors },
        timestamp: expect.any(String),
      });
    });
  });

  describe('notFoundResponse', () => {
    it('should return not found response with default message', () => {
      notFoundResponse(mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Resource not found',
        timestamp: expect.any(String),
      });
    });

    it('should return not found response with custom resource', () => {
      notFoundResponse(mockRes, 'User');

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found',
        timestamp: expect.any(String),
      });
    });
  });

  describe('paginatedResponse', () => {
    it('should return paginated response', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const page = 1;
      const limit = 10;
      const total = 25;

      paginatedResponse(mockRes, 'Success', data, page, limit, total);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Success',
        data,
        meta: {
          pagination: {
            page: 1,
            limit: 10,
            total: 25,
            totalPages: 3,
            hasNext: true,
            hasPrev: false,
          },
        },
        timestamp: expect.any(String),
      });
    });

    it('should calculate pagination correctly for last page', () => {
      const data = [{ id: 1 }];
      const page = 3;
      const limit = 10;
      const total = 25;

      paginatedResponse(mockRes, 'Success', data, page, limit, total);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.meta.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: false,
        hasPrev: true,
      });
    });
  });
});
