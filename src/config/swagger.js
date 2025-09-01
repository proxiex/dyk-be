const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Daily Facts API',
      version: '1.0.0',
      description: 'A comprehensive REST API for a daily facts notification mobile application',
      contact: {
        name: 'API Support',
        email: 'support@dailyfacts.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.dailyfacts.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  message: {
                    type: 'string',
                    example: 'Unauthorized access',
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  message: {
                    type: 'string',
                    example: 'Access forbidden',
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  message: {
                    type: 'string',
                    example: 'Resource not found',
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  message: {
                    type: 'string',
                    example: 'Validation failed',
                  },
                  meta: {
                    type: 'object',
                    properties: {
                      errors: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            field: {
                              type: 'string',
                            },
                            message: {
                              type: 'string',
                            },
                            value: {
                              type: 'string',
                            },
                          },
                        },
                      },
                    },
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
        RateLimitError: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  message: {
                    type: 'string',
                    example: 'Rate limit exceeded',
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: {
                    type: 'boolean',
                    example: false,
                  },
                  message: {
                    type: 'string',
                    example: 'Internal server error',
                  },
                  timestamp: {
                    type: 'string',
                    format: 'date-time',
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization endpoints',
      },
      {
        name: 'Users',
        description: 'User profile and management endpoints',
      },
      {
        name: 'Facts',
        description: 'Daily facts and content management endpoints',
      },
      {
        name: 'Admin',
        description: 'Administrative endpoints for content and user management',
      },
      {
        name: 'Health',
        description: 'System health and monitoring endpoints',
      },
    ],
    paths: {
      '/': {
        get: {
          summary: 'API root endpoint',
          description: 'Returns basic API information and status',
          tags: ['Health'],
          responses: {
            '200': {
              description: 'API information',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: {
                        type: 'boolean',
                        example: true,
                      },
                      message: {
                        type: 'string',
                        example: 'Daily Facts API is running',
                      },
                      version: {
                        type: 'string',
                        example: '1.0.0',
                      },
                      environment: {
                        type: 'string',
                        example: 'development',
                      },
                      timestamp: {
                        type: 'string',
                        format: 'date-time',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [
    './src/routes/*.js', // Path to the API files
    './src/controllers/*.js', // Path to controller files for additional documentation
  ],
};

const swaggerSpec = swaggerJsdoc(options);

// Add custom schema definitions that are used across multiple endpoints
swaggerSpec.components = swaggerSpec.components || {};
swaggerSpec.components.schemas = {
  ...swaggerSpec.components.schemas,
  
  // API Response wrapper
  ApiResponse: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Indicates if the request was successful',
      },
      message: {
        type: 'string',
        description: 'Human-readable message describing the result',
      },
      data: {
        type: 'object',
        description: 'Response data payload',
        nullable: true,
      },
      meta: {
        type: 'object',
        description: 'Additional metadata (pagination, etc.)',
        nullable: true,
      },
      timestamp: {
        type: 'string',
        format: 'date-time',
        description: 'Response timestamp',
      },
    },
    required: ['success', 'message', 'timestamp'],
  },

  // Pagination metadata
  Pagination: {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        description: 'Current page number',
        example: 1,
      },
      limit: {
        type: 'integer',
        description: 'Number of items per page',
        example: 10,
      },
      total: {
        type: 'integer',
        description: 'Total number of items',
        example: 100,
      },
      totalPages: {
        type: 'integer',
        description: 'Total number of pages',
        example: 10,
      },
      hasNext: {
        type: 'boolean',
        description: 'Whether there are more pages',
        example: true,
      },
      hasPrev: {
        type: 'boolean',
        description: 'Whether there are previous pages',
        example: false,
      },
    },
  },

  // User role enum
  UserRole: {
    type: 'string',
    enum: ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'],
    description: 'User role in the system',
  },

  // Difficulty level enum
  DifficultyLevel: {
    type: 'string',
    enum: ['EASY', 'MEDIUM', 'HARD', 'EXPERT'],
    description: 'Fact difficulty level',
  },

  // Notification status enum
  NotificationStatus: {
    type: 'string',
    enum: ['PENDING', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'CANCELLED'],
    description: 'Notification delivery status',
  },

  // Error response
  ErrorResponse: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        example: false,
      },
      message: {
        type: 'string',
        description: 'Error message',
      },
      error: {
        type: 'object',
        description: 'Detailed error information (development only)',
        nullable: true,
      },
      timestamp: {
        type: 'string',
        format: 'date-time',
      },
    },
    required: ['success', 'message', 'timestamp'],
  },
};

module.exports = swaggerSpec;
