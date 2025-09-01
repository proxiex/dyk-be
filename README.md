# Daily Facts API

A comprehensive Node.js backend API for a daily facts notification mobile application. This API provides user management, authentication, fact content delivery, push notifications, analytics, and administrative controls.

## 🚀 Features

- **User Management**: Registration, authentication, profile management, and preferences
- **JWT Authentication**: Secure authentication with access and refresh tokens
- **Daily Facts**: Curated fact content with personalized delivery
- **Push Notifications**: Firebase-powered notifications with scheduling
- **Admin Panel**: Content management and user administration
- **Analytics**: User engagement tracking and system metrics
- **Caching**: Redis-powered caching for optimal performance
- **Rate Limiting**: Built-in protection against abuse
- **API Documentation**: Comprehensive Swagger/OpenAPI documentation

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis
- **Authentication**: JWT (JSON Web Tokens)
- **Notifications**: Firebase Admin SDK
- **File Storage**: AWS S3 (planned)
- **Documentation**: Swagger/OpenAPI 3.0
- **Testing**: Jest (planned)
- **Logging**: Winston

## 📋 Prerequisites

Before running this application, make sure you have:

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- Redis server
- Firebase project with Admin SDK credentials
- AWS account (for S3 integration, optional)

## ⚙️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd dyk-be
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your configuration values.

4. **Database setup**
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Run database migrations
   npx prisma migrate dev
   
   # Optional: Seed database with sample data
   npm run seed
   ```

5. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure the following:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_REFRESH_SECRET` | Refresh token secret | Required |
| `REDIS_HOST` | Redis server host | `localhost` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Required |
| `AWS_S3_BUCKET` | S3 bucket name | Optional |

### Firebase Setup

1. Create a Firebase project
2. Generate Admin SDK private key
3. Add Firebase configuration to `.env`

### Database Migration

```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Deploy to production
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

## 📚 API Documentation

Interactive API documentation is available at:
- **Development**: http://localhost:3000/api-docs
- **Swagger JSON**: http://localhost:3000/api-docs.json

### Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer your_jwt_token_here
```

### Rate Limiting

The API implements rate limiting:
- General API: 100 requests per 15 minutes
- Authentication: 5 requests per 15 minutes
- Password reset: 3 requests per 15 minutes

## 🛣 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout
- `POST /api/auth/forgot-password` - Forgot password
- `POST /api/auth/reset-password` - Reset password

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/stats` - Get learning statistics
- `PUT /api/users/notifications` - Update notification settings

### Facts
- `GET /api/facts/daily` - Get daily facts
- `GET /api/facts/categories` - Get fact categories
- `GET /api/facts/search` - Search facts
- `GET /api/facts/:id` - Get fact details
- `POST /api/facts/:id/like` - Like/unlike fact
- `POST /api/facts/:id/bookmark` - Bookmark fact

### Admin
- `POST /api/admin/facts` - Create fact
- `PUT /api/admin/facts/:id` - Update fact
- `DELETE /api/admin/facts/:id` - Delete fact
- `GET /api/admin/analytics` - Get analytics

### Health
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system health

## 🔄 Background Jobs

The application runs several scheduled jobs:

- **Daily Facts Distribution**: Sends personalized facts to users (hourly)
- **Notification Retries**: Retries failed notifications (every 15 minutes)
- **Session Cleanup**: Removes expired sessions (hourly)
- **Analytics Generation**: Creates daily analytics snapshots (daily at 3 AM)
- **User Streak Updates**: Updates learning streaks (daily at 1 AM)

## 📊 Monitoring & Health Checks

### Health Endpoints
- `/health` - Basic health status
- `/health/detailed` - Database and Redis status
- `/health/metrics` - Application metrics

### Logging

Logs are stored in the `logs/` directory:
- `combined.log` - All log levels
- `error.log` - Error logs only
- `requests.log` - HTTP request logs

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 🚀 Deployment

### Docker (Recommended)

```bash
# Build image
docker build -t daily-facts-api .

# Run container
docker run -p 3000:3000 --env-file .env daily-facts-api
```

### Manual Deployment

1. Set `NODE_ENV=production`
2. Install production dependencies: `npm ci --only=production`
3. Run database migrations: `npx prisma migrate deploy`
4. Start application: `npm start`

### Environment-Specific Considerations

**Production**:
- Use strong JWT secrets
- Enable HTTPS
- Configure proper CORS origins
- Set up database backups
- Configure log rotation
- Monitor resource usage

**Staging**:
- Use production-like data
- Enable detailed logging
- Test notification delivery

## 🔒 Security

- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Rate limiting on all endpoints
- Input validation and sanitization
- CORS protection
- Helmet.js security headers
- SQL injection prevention via Prisma

## 📈 Performance

- Redis caching for frequently accessed data
- Database indexing for optimal queries
- Response compression
- Pagination for large datasets
- Background job processing
- Connection pooling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Contact: support@dailyfacts.com

## 📋 Changelog

### v1.0.0
- Initial release
- User authentication and management
- Daily facts delivery system
- Push notifications
- Admin panel
- API documentation

---

Made with ❤️ for daily learning and curiosity
