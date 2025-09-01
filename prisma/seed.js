const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🧹 Cleaning existing data...');
    await prisma.analytics.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.userFact.deleteMany();
    await prisma.userCategory.deleteMany();
    await prisma.userSession.deleteMany();
    await prisma.fact.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    await prisma.systemConfig.deleteMany();
  }

  // Create system configuration
  console.log('⚙️ Creating system configuration...');
  await prisma.systemConfig.createMany({
    data: [
      {
        key: 'app_version',
        value: '1.0.0',
        description: 'Current application version',
      },
      {
        key: 'maintenance_mode',
        value: 'false',
        description: 'Enable/disable maintenance mode',
      },
      {
        key: 'max_daily_notifications',
        value: '5',
        description: 'Maximum notifications per user per day',
      },
      {
        key: 'fact_approval_required',
        value: 'true',
        description: 'Require admin approval for new facts',
      },
    ],
  });

  // Create categories
  console.log('📚 Creating categories...');
  const categories = await prisma.category.createMany({
    data: [
      {
        name: 'Science',
        description: 'Scientific discoveries, phenomena, and research',
        isActive: true,
        sortOrder: 1,
      },
      {
        name: 'History',
        description: 'Historical events, figures, and civilizations',
        isActive: true,
        sortOrder: 2,
      },
      {
        name: 'Technology',
        description: 'Technology innovations, computing, and digital world',
        isActive: true,
        sortOrder: 3,
      },
      {
        name: 'Nature',
        description: 'Wildlife, plants, ecosystems, and natural phenomena',
        isActive: true,
        sortOrder: 4,
      },
      {
        name: 'Space',
        description: 'Astronomy, space exploration, and celestial bodies',
        isActive: true,
        sortOrder: 5,
      },
      {
        name: 'Health',
        description: 'Human body, medicine, and wellness',
        isActive: true,
        sortOrder: 6,
      },
      {
        name: 'Culture',
        description: 'Arts, traditions, languages, and societies',
        isActive: true,
        sortOrder: 7,
      },
      {
        name: 'Geography',
        description: 'Countries, cities, landmarks, and earth features',
        isActive: true,
        sortOrder: 8,
      },
    ],
  });

  // Get created categories
  const createdCategories = await prisma.category.findMany();
  const categoryMap = createdCategories.reduce((acc, cat) => {
    acc[cat.name.toLowerCase()] = cat.id;
    return acc;
  }, {});

  // Create sample facts
  console.log('💡 Creating sample facts...');
  const facts = [
    {
      title: 'Octopuses Have Three Hearts',
      content: 'Octopuses have three hearts: two pump blood to the gills, while the third pumps blood to the rest of the body. The main heart stops beating when they swim, which is why they prefer crawling.',
      categoryId: categoryMap.science,
      difficulty: 'MEDIUM',
      isApproved: true,
      isActive: true,
      isFeatured: true,
      publishedAt: new Date(),
      tags: ['marine biology', 'anatomy', 'ocean'],
    },
    {
      title: 'Honey Never Spoils',
      content: 'Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible. Honey\'s low moisture content and acidic pH create an environment where bacteria cannot survive.',
      categoryId: categoryMap.science,
      difficulty: 'EASY',
      isApproved: true,
      isActive: true,
      isFeatured: false,
      publishedAt: new Date(),
      tags: ['food science', 'preservation', 'archaeology'],
    },
    {
      title: 'The Great Wall Myth',
      content: 'Contrary to popular belief, the Great Wall of China is not visible from space with the naked eye. This myth has been debunked by astronauts. The wall is only about 30 feet wide, making it impossible to see from such distances.',
      categoryId: categoryMap.history,
      difficulty: 'MEDIUM',
      isApproved: true,
      isActive: true,
      isFeatured: true,
      publishedAt: new Date(),
      tags: ['architecture', 'china', 'myths'],
    },
    {
      title: 'First Computer Bug',
      content: 'The first computer "bug" was an actual bug. In 1947, Grace Hopper found a moth trapped in a relay of Harvard\'s Mark II computer. She taped the moth in her logbook and wrote "First actual case of bug being found."',
      categoryId: categoryMap.technology,
      difficulty: 'MEDIUM',
      isApproved: true,
      isActive: true,
      isFeatured: false,
      publishedAt: new Date(),
      tags: ['computing', 'programming', 'history'],
    },
    {
      title: 'Sharks Older Than Trees',
      content: 'Sharks have been around for about 400 million years, while trees have only existed for about 350 million years. This means sharks are older than trees, Saturn\'s rings, and even flowers.',
      categoryId: categoryMap.nature,
      difficulty: 'HARD',
      isApproved: true,
      isActive: true,
      isFeatured: true,
      publishedAt: new Date(),
      tags: ['evolution', 'marine life', 'paleontology'],
    },
    {
      title: 'A Day on Venus',
      content: 'A day on Venus (243 Earth days) is longer than a year on Venus (225 Earth days). Venus rotates so slowly that it completes an orbit around the Sun before completing one rotation on its axis.',
      categoryId: categoryMap.space,
      difficulty: 'HARD',
      isApproved: true,
      isActive: true,
      isFeatured: false,
      publishedAt: new Date(),
      tags: ['planets', 'astronomy', 'solar system'],
    },
    {
      title: 'Your Body Makes Diamonds',
      content: 'The human body contains carbon, and under extreme pressure and temperature, carbon becomes diamond. While your body doesn\'t naturally create diamonds, it theoretically contains enough carbon to make about 8.5 carats of diamonds.',
      categoryId: categoryMap.health,
      difficulty: 'MEDIUM',
      isApproved: true,
      isActive: true,
      isFeatured: false,
      publishedAt: new Date(),
      tags: ['human body', 'chemistry', 'carbon'],
    },
    {
      title: 'Oxford University Predates Aztecs',
      content: 'Oxford University (founded around 1096) is older than the Aztec Empire (founded in 1428). Teaching at Oxford began in 1096, making it one of the oldest universities in the English-speaking world.',
      categoryId: categoryMap.history,
      difficulty: 'MEDIUM',
      isApproved: true,
      isActive: true,
      isFeatured: true,
      publishedAt: new Date(),
      tags: ['education', 'universities', 'timeline'],
    },
    {
      title: 'Cleopatra and the Pyramids',
      content: 'Cleopatra lived closer in time to the Moon landing (1969) than to the construction of the Great Pyramid of Giza. The pyramid was built around 2580-2560 BC, while Cleopatra lived from 69-30 BC.',
      categoryId: categoryMap.history,
      difficulty: 'HARD',
      isApproved: true,
      isActive: true,
      isFeatured: false,
      publishedAt: new Date(),
      tags: ['ancient egypt', 'timeline', 'pyramids'],
    },
    {
      title: 'Bananas Are Berries',
      content: 'Botanically speaking, bananas are berries, but strawberries are not. A berry is defined as a fruit with seeds inside the flesh that develops from a single flower with one ovary.',
      categoryId: categoryMap.nature,
      difficulty: 'EASY',
      isApproved: true,
      isActive: true,
      isFeatured: false,
      publishedAt: new Date(),
      tags: ['botany', 'fruits', 'classification'],
    },
  ];

  await prisma.fact.createMany({ data: facts });

  // Create admin user
  console.log('👤 Creating admin user...');
  const hashedPassword = await bcrypt.hash('admin123!@#', 12);
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@dailyfacts.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isEmailVerified: true,
      isActive: true,
      timezone: 'UTC',
      dailyNotificationTime: '09:00',
      difficultyLevel: 'MEDIUM',
      notificationsEnabled: true,
      weekendNotifications: true,
      maxNotificationsPerDay: 5,
    },
  });

  // Create sample users
  console.log('👥 Creating sample users...');
  const users = [];
  const sampleUsers = [
    {
      email: 'user1@example.com',
      firstName: 'John',
      lastName: 'Doe',
      timezone: 'America/New_York',
      difficultyLevel: 'EASY',
    },
    {
      email: 'user2@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      timezone: 'Europe/London',
      difficultyLevel: 'MEDIUM',
    },
    {
      email: 'user3@example.com',
      firstName: 'Alice',
      lastName: 'Johnson',
      timezone: 'Asia/Tokyo',
      difficultyLevel: 'HARD',
    },
  ];

  const userPassword = await bcrypt.hash('password123', 12);
  for (const userData of sampleUsers) {
    const user = await prisma.user.create({
      data: {
        ...userData,
        password: userPassword,
        role: 'USER',
        isEmailVerified: true,
        isActive: true,
        dailyNotificationTime: '08:00',
        notificationsEnabled: true,
        weekendNotifications: true,
        maxNotificationsPerDay: 3,
        currentStreak: Math.floor(Math.random() * 10),
        longestStreak: Math.floor(Math.random() * 30),
        lastActiveDate: new Date(),
      },
    });
    users.push(user);
  }

  // Set user category preferences
  console.log('🎯 Setting user preferences...');
  for (const user of users) {
    // Each user gets 3-5 random category preferences
    const shuffledCategories = createdCategories.sort(() => 0.5 - Math.random());
    const selectedCategories = shuffledCategories.slice(0, Math.floor(Math.random() * 3) + 3);
    
    await prisma.userCategory.createMany({
      data: selectedCategories.map(category => ({
        userId: user.id,
        categoryId: category.id,
        isEnabled: true,
      })),
    });
  }

  // Create user fact interactions
  console.log('💭 Creating user interactions...');
  const createdFacts = await prisma.fact.findMany();
  
  for (const user of users) {
    // Each user interacts with 5-8 random facts
    const shuffledFacts = createdFacts.sort(() => 0.5 - Math.random());
    const selectedFacts = shuffledFacts.slice(0, Math.floor(Math.random() * 4) + 5);
    
    for (const fact of selectedFacts) {
      await prisma.userFact.create({
        data: {
          userId: user.id,
          factId: fact.id,
          isViewed: true,
          viewedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random time in last 7 days
          isLiked: Math.random() > 0.7, // 30% chance of liking
          isBookmarked: Math.random() > 0.85, // 15% chance of bookmarking
          isShared: Math.random() > 0.9, // 10% chance of sharing
        },
      });
    }
  }

  // Create sample notifications
  console.log('🔔 Creating sample notifications...');
  const notifications = [];
  for (const user of users) {
    const userFacts = await prisma.userFact.findMany({
      where: { userId: user.id },
      take: 3,
    });
    
    for (const userFact of userFacts) {
      const fact = await prisma.fact.findUnique({
        where: { id: userFact.factId },
      });
      
      const notificationTime = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
      notifications.push({
        userId: user.id,
        title: 'Daily Fact',
        body: fact.title,
        status: Math.random() > 0.2 ? 'DELIVERED' : 'SENT',
        scheduledFor: notificationTime,
        sentAt: notificationTime,
      });
    }
  }
  
  await prisma.notification.createMany({ data: notifications });

  // Create sample analytics events
  console.log('📊 Creating sample analytics...');
  const analyticsEvents = [
    {
      eventType: 'USER_REGISTERED',
      eventData: {
        source: 'mobile_app',
        campaign: 'organic',
      },
      userId: users[0].id,
      timestamp: new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000),
    },
    {
      eventType: 'FACT_VIEWED',
      eventData: {
        factId: createdFacts[0].id,
        categoryId: createdFacts[0].categoryId,
        duration: 15000,
      },
      userId: users[0].id,
      timestamp: new Date(Date.now() - Math.random() * 4 * 24 * 60 * 60 * 1000),
    },
    {
      eventType: 'FACT_LIKED',
      eventData: {
        factId: createdFacts[1].id,
        categoryId: createdFacts[1].categoryId,
      },
      userId: users[1].id,
      timestamp: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000),
    },
    {
      eventType: 'NOTIFICATION_OPENED',
      eventData: {
        notificationId: null,
        factId: createdFacts[0].id,
      },
      userId: users[0].id,
      timestamp: new Date(Date.now() - Math.random() * 2 * 24 * 60 * 60 * 1000),
    },
    {
      eventType: 'SEARCH_PERFORMED',
      eventData: {
        query: 'space facts',
        resultsCount: 5,
      },
      userId: users[1].id,
      timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
    },
  ];

  await prisma.analytics.createMany({ data: analyticsEvents });

  // Create audit logs
  console.log('📝 Creating audit logs...');
  await prisma.auditLog.createMany({
    data: [
      {
        action: 'FACT_CREATED',
        resource: 'fact',
        resourceId: createdFacts[0].id,
        userId: adminUser.id,
        changes: { title: createdFacts[0].title, category: 'science' },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 Admin Panel',
      },
      {
        action: 'USER_CREATED',
        resource: 'user',
        resourceId: users[0].id,
        changes: { email: users[0].email, role: 'USER' },
        ipAddress: '192.168.1.1',
        userAgent: 'DailyFacts Mobile App v1.0',
      },
    ],
  });

  console.log('✅ Database seeding completed successfully!');
  console.log(`
📊 Summary:
- ${createdCategories.length} categories created
- ${createdFacts.length} facts created
- ${users.length + 1} users created (including admin)
- ${notifications.length} notifications created
- ${analyticsEvents.length} analytics events created
- 2 audit log entries created

🔑 Admin Credentials:
Email: admin@dailyfacts.com
Password: admin123!@#

👤 Sample User Credentials:
Email: user1@example.com | user2@example.com | user3@example.com
Password: password123
  `);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
