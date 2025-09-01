-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('USER', 'ADMIN', 'MODERATOR', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "public"."DifficultyLevel" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'EXPERT');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('USER_REGISTERED', 'USER_LOGIN', 'USER_LOGOUT', 'FACT_VIEWED', 'FACT_LIKED', 'FACT_UNLIKED', 'FACT_BOOKMARKED', 'FACT_UNBOOKMARKED', 'FACT_SHARED', 'NOTIFICATION_SENT', 'NOTIFICATION_OPENED', 'SEARCH_PERFORMED', 'CATEGORY_SELECTED', 'SETTINGS_UPDATED', 'PASSWORD_RESET', 'EMAIL_VERIFIED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatar" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyNotificationTime" TEXT NOT NULL DEFAULT '09:00',
    "maxNotificationsPerDay" INTEGER NOT NULL DEFAULT 3,
    "weekendNotifications" BOOLEAN NOT NULL DEFAULT true,
    "difficultyLevel" "public"."DifficultyLevel" NOT NULL DEFAULT 'MEDIUM',
    "languagePreference" TEXT NOT NULL DEFAULT 'en',
    "totalFactsViewed" INTEGER NOT NULL DEFAULT 0,
    "totalFactsLiked" INTEGER NOT NULL DEFAULT 0,
    "totalFactsBookmarked" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceType" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_categories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."facts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "shortContent" TEXT,
    "source" TEXT,
    "sourceUrl" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "categoryId" TEXT NOT NULL,
    "difficulty" "public"."DifficultyLevel" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[],
    "language" TEXT NOT NULL DEFAULT 'en',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "bookmarkCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_facts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "isViewed" BOOLEAN NOT NULL DEFAULT false,
    "isLiked" BOOLEAN NOT NULL DEFAULT false,
    "isBookmarked" BOOLEAN NOT NULL DEFAULT false,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "deliveryStatus" "public"."NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "timeSpent" INTEGER,
    "engagementScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "factId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "fcmToken" TEXT,
    "fcmMessageId" TEXT,
    "fcmResponse" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analytics" (
    "id" TEXT NOT NULL,
    "eventType" "public"."EventType" NOT NULL,
    "eventData" JSONB NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "factId" TEXT,
    "categoryId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingTime" INTEGER,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refreshToken_key" ON "public"."user_sessions"("refreshToken");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "public"."categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_categories_userId_categoryId_key" ON "public"."user_categories"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "facts_categoryId_idx" ON "public"."facts"("categoryId");

-- CreateIndex
CREATE INDEX "facts_isApproved_isActive_idx" ON "public"."facts"("isApproved", "isActive");

-- CreateIndex
CREATE INDEX "facts_publishedAt_idx" ON "public"."facts"("publishedAt");

-- CreateIndex
CREATE INDEX "facts_difficulty_idx" ON "public"."facts"("difficulty");

-- CreateIndex
CREATE INDEX "user_facts_userId_deliveryStatus_idx" ON "public"."user_facts"("userId", "deliveryStatus");

-- CreateIndex
CREATE INDEX "user_facts_factId_idx" ON "public"."user_facts"("factId");

-- CreateIndex
CREATE UNIQUE INDEX "user_facts_userId_factId_key" ON "public"."user_facts"("userId", "factId");

-- CreateIndex
CREATE INDEX "notifications_userId_status_idx" ON "public"."notifications"("userId", "status");

-- CreateIndex
CREATE INDEX "notifications_scheduledFor_idx" ON "public"."notifications"("scheduledFor");

-- CreateIndex
CREATE INDEX "notifications_status_nextRetryAt_idx" ON "public"."notifications"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "analytics_eventType_timestamp_idx" ON "public"."analytics"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "analytics_userId_timestamp_idx" ON "public"."analytics"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "analytics_factId_idx" ON "public"."analytics"("factId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_timestamp_idx" ON "public"."audit_logs"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "public"."audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "public"."audit_logs"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "public"."system_config"("key");

-- AddForeignKey
ALTER TABLE "public"."user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_categories" ADD CONSTRAINT "user_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_categories" ADD CONSTRAINT "user_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."facts" ADD CONSTRAINT "facts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_facts" ADD CONSTRAINT "user_facts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_facts" ADD CONSTRAINT "user_facts_factId_fkey" FOREIGN KEY ("factId") REFERENCES "public"."facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
