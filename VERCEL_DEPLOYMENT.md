# Vercel Deployment Guide

## 🚀 Quick Deploy Steps

### 1. Install Vercel CLI (if not already installed)
```bash
npm i -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy to Vercel
```bash
vercel --prod
```

## 📋 Environment Variables

You need to set these environment variables in your Vercel dashboard:

### Database
```
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require
```

### JWT Secrets
```
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
```

### Redis (Required for caching)
```
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
```

### Firebase (For push notifications)
```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----\n"
```

### AWS S3 (For media storage)
```
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
```

### Email Configuration
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourdomain.com
```

### Application Settings
```
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

## 🔧 Setting Environment Variables

### Via Vercel Dashboard:
1. Go to your project dashboard
2. Click "Settings" tab
3. Click "Environment Variables"
4. Add each variable one by one

### Via Vercel CLI:
```bash
vercel env add DATABASE_URL production
vercel env add JWT_SECRET production
# ... repeat for all variables
```

## ⚠️ Important Notes

### Database Considerations:
- Use a PostgreSQL database with connection pooling
- Recommended: **Neon**, **PlanetScale**, or **Supabase**
- Ensure SSL is enabled (`sslmode=require` in DATABASE_URL)

### Redis Considerations:
- Use a managed Redis service like **Upstash** or **Redis Cloud**
- Vercel functions are stateless, so Redis is essential for caching

### Serverless Limitations:
- Functions have a 30-second timeout (configured in vercel.json)
- Scheduled jobs (cron) won't work in serverless - use Vercel Cron Jobs or external services
- File system is read-only except for `/tmp`

### Alternative for Scheduled Jobs:
Since Vercel doesn't support long-running processes, consider:
1. **Vercel Cron Jobs** (Beta) - add to vercel.json:
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/daily-facts",
         "schedule": "0 * * * *"
       }
     ]
   }
   ```
2. **GitHub Actions** for scheduled tasks
3. **External cron service** like cron-job.org

## 🧪 Test Deployment Locally

```bash
# Install Vercel CLI
npm install -g vercel

# Test locally
vercel dev

# Deploy to preview
vercel

# Deploy to production  
vercel --prod
```

## 📊 Post-Deployment Checklist

- [ ] Test authentication endpoints
- [ ] Test facts API endpoints
- [ ] Verify database connectivity
- [ ] Test Redis caching
- [ ] Check Swagger documentation at `/api-docs`
- [ ] Test health check endpoint at `/api/health`
- [ ] Monitor function logs in Vercel dashboard

## 🔗 Useful Links

- [Vercel Node.js Runtime](https://vercel.com/docs/functions/serverless-functions/runtimes/node-js)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [Prisma with Vercel](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)
