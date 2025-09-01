const admin = require('firebase-admin');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Initialize Firebase Admin SDK
 */
const initializeFirebase = () => {
  if (!admin.apps.length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (!serviceAccountKey) {
      logger.warn('Firebase service account key not provided. Push notifications will be disabled.');
      return null;
    }

    try {
      const serviceAccount = JSON.parse(serviceAccountKey);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });

      logger.info('Firebase Admin SDK initialized successfully');
      return admin;
    } catch (error) {
      logger.error('Failed to initialize Firebase Admin SDK:', error);
      return null;
    }
  }
  
  return admin;
};

/**
 * Send push notification to a single device
 */
const sendNotification = async (fcmToken, notification, data = {}) => {
  const firebaseAdmin = initializeFirebase();
  
  if (!firebaseAdmin) {
    logger.warn('Firebase not initialized, skipping notification');
    return { success: false, error: 'Firebase not initialized' };
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl || undefined,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#4285F4',
          channelId: 'daily_facts',
          priority: 'high',
          defaultSound: true,
        },
        data: {
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            badge: 1,
            sound: 'default',
            category: 'DAILY_FACT',
          },
        },
        fcm_options: {
          image: notification.imageUrl,
        },
      },
    };

    const response = await firebaseAdmin.messaging().send(message);
    
    logger.info('Push notification sent successfully', {
      messageId: response,
      token: fcmToken.substring(0, 10) + '...',
    });

    return {
      success: true,
      messageId: response,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Failed to send push notification:', error);
    
    // Handle specific FCM errors
    if (error.code === 'messaging/registration-token-not-registered') {
      return { success: false, error: 'Token not registered', shouldDelete: true };
    } else if (error.code === 'messaging/invalid-registration-token') {
      return { success: false, error: 'Invalid token', shouldDelete: true };
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to multiple devices
 */
const sendMulticastNotification = async (fcmTokens, notification, data = {}) => {
  const firebaseAdmin = initializeFirebase();
  
  if (!firebaseAdmin || !fcmTokens.length) {
    logger.warn('Firebase not initialized or no tokens provided');
    return { success: false, error: 'Firebase not initialized or no tokens' };
  }

  try {
    const message = {
      tokens: fcmTokens,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl || undefined,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#4285F4',
          channelId: 'daily_facts',
          priority: 'high',
          defaultSound: true,
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            badge: 1,
            sound: 'default',
          },
        },
      },
    };

    const response = await firebaseAdmin.messaging().sendMulticast(message);
    
    logger.info('Multicast notification sent', {
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: fcmTokens.length,
    });

    // Handle failed tokens
    const failedTokens = [];
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          if (
            error.code === 'messaging/registration-token-not-registered' ||
            error.code === 'messaging/invalid-registration-token'
          ) {
            failedTokens.push(fcmTokens[idx]);
          }
        }
      });
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Failed to send multicast notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send daily fact notification to user
 */
const sendDailyFactNotification = async (userId, fact) => {
  try {
    // Get user's FCM tokens from active sessions
    const userSessions = await prisma.userSession.findMany({
      where: {
        userId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      select: {
        deviceId: true,
        // Note: FCM tokens would typically be stored in sessions or separate device table
      },
    });

    // For this example, we'll assume FCM tokens are stored elsewhere or passed in
    // In a real implementation, you'd have a separate device tokens table
    const fcmTokens = []; // This should be populated from actual device tokens

    if (fcmTokens.length === 0) {
      logger.info('No FCM tokens found for user', { userId });
      return { success: false, error: 'No FCM tokens' };
    }

    const notification = {
      title: 'Daily Fact Ready! 🧠',
      body: fact.shortContent || fact.title,
      imageUrl: fact.imageUrl,
    };

    const data = {
      type: 'daily_fact',
      factId: fact.id,
      categoryId: fact.categoryId,
    };

    // Create notification record
    const notificationRecord = await prisma.notification.create({
      data: {
        userId,
        factId: fact.id,
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
        status: 'PENDING',
        scheduledFor: new Date(),
      },
    });

    let result;
    if (fcmTokens.length === 1) {
      result = await sendNotification(fcmTokens[0], notification, data);
    } else {
      result = await sendMulticastNotification(fcmTokens, notification, data);
    }

    // Update notification record
    await prisma.notification.update({
      where: { id: notificationRecord.id },
      data: {
        status: result.success ? 'SENT' : 'FAILED',
        sentAt: result.success ? new Date() : null,
        fcmMessageId: result.messageId || null,
        fcmResponse: JSON.stringify(result),
        errorMessage: result.error || null,
      },
    });

    // Clean up invalid tokens if any
    if (result.failedTokens?.length > 0) {
      // Here you would remove invalid tokens from your device tokens table
      logger.info('Cleaning up invalid FCM tokens', {
        count: result.failedTokens.length,
      });
    }

    return result;
  } catch (error) {
    logger.error('Error sending daily fact notification:', error);
    throw error;
  }
};

/**
 * Send notification to topic (for broadcast messages)
 */
const sendTopicNotification = async (topic, notification, data = {}) => {
  const firebaseAdmin = initializeFirebase();
  
  if (!firebaseAdmin) {
    logger.warn('Firebase not initialized, skipping topic notification');
    return { success: false, error: 'Firebase not initialized' };
  }

  try {
    const message = {
      topic,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl || undefined,
      },
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: '#4285F4',
          channelId: 'announcements',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            sound: 'default',
          },
        },
      },
    };

    const response = await firebaseAdmin.messaging().send(message);
    
    logger.info('Topic notification sent successfully', {
      topic,
      messageId: response,
    });

    return {
      success: true,
      messageId: response,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('Failed to send topic notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Subscribe device to topic
 */
const subscribeToTopic = async (fcmToken, topic) => {
  const firebaseAdmin = initializeFirebase();
  
  if (!firebaseAdmin) {
    return { success: false, error: 'Firebase not initialized' };
  }

  try {
    await firebaseAdmin.messaging().subscribeToTopic([fcmToken], topic);
    logger.info('Device subscribed to topic', { topic });
    return { success: true };
  } catch (error) {
    logger.error('Failed to subscribe to topic:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Unsubscribe device from topic
 */
const unsubscribeFromTopic = async (fcmToken, topic) => {
  const firebaseAdmin = initializeFirebase();
  
  if (!firebaseAdmin) {
    return { success: false, error: 'Firebase not initialized' };
  }

  try {
    await firebaseAdmin.messaging().unsubscribeFromTopic([fcmToken], topic);
    logger.info('Device unsubscribed from topic', { topic });
    return { success: true };
  } catch (error) {
    logger.error('Failed to unsubscribe from topic:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Retry failed notifications
 */
const retryFailedNotifications = async () => {
  try {
    const failedNotifications = await prisma.notification.findMany({
      where: {
        status: 'FAILED',
        retryCount: { lt: 3 },
        nextRetryAt: { lte: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            notificationsEnabled: true,
          },
        },
      },
      take: 50, // Limit batch size
    });

    logger.info('Retrying failed notifications', {
      count: failedNotifications.length,
    });

    for (const notification of failedNotifications) {
      if (!notification.user.notificationsEnabled) {
        // Mark as cancelled if user disabled notifications
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'CANCELLED' },
        });
        continue;
      }

      try {
        // Retry the notification (simplified - you'd need FCM tokens)
        // const result = await sendNotification(fcmToken, {
        //   title: notification.title,
        //   body: notification.body,
        //   imageUrl: notification.imageUrl,
        // });

        // Update retry count and next retry time
        const nextRetryAt = new Date();
        nextRetryAt.setMinutes(nextRetryAt.getMinutes() + Math.pow(2, notification.retryCount + 1) * 5); // Exponential backoff

        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            retryCount: { increment: 1 },
            nextRetryAt,
            // status: result.success ? 'SENT' : 'FAILED',
            // sentAt: result.success ? new Date() : null,
          },
        });
      } catch (error) {
        logger.error('Error retrying notification:', error);
      }
    }

    return { processed: failedNotifications.length };
  } catch (error) {
    logger.error('Error in retry failed notifications:', error);
    throw error;
  }
};

/**
 * Clean up old notifications
 */
const cleanupOldNotifications = async (daysToKeep = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CANCELLED'] },
      },
    });

    logger.info('Cleaned up old notifications', { deleted: result.count });
    return { deleted: result.count };
  } catch (error) {
    logger.error('Error cleaning up notifications:', error);
    throw error;
  }
};

module.exports = {
  initializeFirebase,
  sendNotification,
  sendMulticastNotification,
  sendDailyFactNotification,
  sendTopicNotification,
  subscribeToTopic,
  unsubscribeFromTopic,
  retryFailedNotifications,
  cleanupOldNotifications,
};
