const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const {
  CREATOR_AVATAR_STORAGE_ROOT,
  CREATOR_AVATAR_PUBLIC_PREFIX,
} = require('./services/creatorAvatarStorageService');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const PORT = process.env.PORT || 8000;

// Import routes
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const contentTeamRoutes = require('./routes/contentTeamRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const videoRoutes = require('./routes/videoRoutes');
const reportRoutes = require('./routes/reportRoutes');
const channelRoutes = require('./routes/channelRoutes');
const productRoutes = require('./routes/productRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const importRoutes = require('./routes/importRoutes');
const authRoutes = require('./routes/authRoutes');

const tiktokPartnerPublicRoutes = require('./routes/tiktokPartnerPublicRoutes');
const tiktokShopRoutes = require('./routes/tiktokShopRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const queueRoutes = require('./routes/queueRoutes');
const { TikTokChannel, User } = require('./models');
const { encryptToken, isEncryptedToken } = require('./lib/tokenEncryption');
const { requireAdmin, requirePermission, requireAnyPermission } = require('./lib/session');
const { getAdminAccount } = require('./lib/adminAccount');
const { startDatabaseScheduler } = require('./services/scheduledJobService');
const { serverAdapter, bullBoardAuth } = require('./routes/bullBoardRoutes');
const { getMyrExchangeRates, FALLBACK_EXCHANGE_RATES } = require('./services/exchangeRateService');

const httpLogFormat = process.env.HTTP_LOG_FORMAT || ':method :url :status :response-time ms';

const createApp = () => {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  }));
  app.use(morgan(httpLogFormat));
  app.use(express.json({
    limit: '16mb',
    verify: (req, _res, buffer) => {
      req.rawBody = buffer;
    },
  }));
  app.use(CREATOR_AVATAR_PUBLIC_PREFIX, express.static(CREATOR_AVATAR_STORAGE_ROOT, {
    dotfiles: 'deny',
    fallthrough: false,
    maxAge: '7d',
  }));
  app.use('/api/bookings/tiktok-partner', tiktokPartnerPublicRoutes);

  app.get('/', (_req, res) => {
    res.json({ message: 'Content Performance Reporting API' });
  });

  app.use('/api/users', requireAdmin, requireAnyPermission(['admin.users.manage', 'admin.roles.manage', 'admin.teams.manage']), userRoutes);
  app.use('/api/roles', requireAdmin, requireAnyPermission(['admin.users.manage', 'admin.roles.manage', 'admin.teams.manage']), roleRoutes);
  app.use('/api/content-teams', requireAdmin, requireAnyPermission(['admin.users.manage', 'admin.roles.manage', 'admin.teams.manage']), contentTeamRoutes);
  app.use('/api/bookings', requireAdmin, requireAnyPermission(['shop.bookings.video.view', 'shop.bookings.product_performance.view', 'shop.bookings.by_product.view', 'shop.bookings.manage']), bookingRoutes);
  app.use('/api/videos', requireAdmin, requireAnyPermission(['shop.videos.library.view', 'shop.videos.performance.view', 'shop.bookings.video.view', 'shop.bookings.manage']), videoRoutes);
  app.use('/api/reports', requireAdmin, requireAnyPermission(['channels.dashboard.view', 'channels.reports.video.view', 'channels.reports.revenue.view', 'channels.reports.statistics.view', 'shop.affiliate.performance.view']), reportRoutes);
  app.use('/api/channels', channelRoutes);
  app.use('/api/products', requireAdmin, requireAnyPermission(['shop.videos.library.view', 'shop.bookings.manage']), productRoutes);
  app.use('/api/assignments', requireAdmin, requireAnyPermission(['shop.videos.library.view', 'shop.bookings.manage']), assignmentRoutes);
  app.use('/api/import', requireAdmin, requirePermission('shop.videos.library.view'), importRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/tiktok-shop', requireAdmin, requireAnyPermission(['shop.analytics.view', 'shop.videos.library.view', 'shop.videos.performance.view', 'shop.affiliate.open.view', 'shop.affiliate.target.view', 'shop.affiliate.discovery.view', 'shop.affiliate.performance.view', 'shop.affiliate.creators.view', 'shop.orders.view', 'shop.bookings.video.view', 'shop.bookings.product_performance.view', 'shop.bookings.by_product.view', 'shop.bookings.manage', 'shop.affiliate.invite', 'shop.affiliate.message', 'admin.shops.manage']), tiktokShopRoutes.adminRouter);
  app.get('/api/exchange-rates', async (req, res) => {
    try {
      res.json(await getMyrExchangeRates());
    } catch (err) {
      console.error('[exchange-rates] Error fetching exchange rates:', err.message);
      res.json(FALLBACK_EXCHANGE_RATES);
    }
  });
  app.use('/api/schedules', requireAdmin, requirePermission('admin.schedules.manage'), scheduleRoutes);
  app.use('/api/queues', requireAdmin, requirePermission('admin.queues.view'), queueRoutes);
  app.use('/admin/queues', bullBoardAuth, serverAdapter.getRouter());

  return app;
};

const app = createApp();

const startServer = async () => {
  try {
    if (!process.env.ADMIN_PASSWORD) {
      throw new Error('ADMIN_PASSWORD must be set in .env');
    }

    if (!process.env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET must be set in .env');
    }

    const channels = await TikTokChannel.findAll({
      attributes: ['id', 'access_token_encrypted', 'refresh_token_encrypted'],
    });

    for (const channel of channels) {
      const accessToken = channel.access_token_encrypted;
      const refreshToken = channel.refresh_token_encrypted;

      if ((accessToken && !isEncryptedToken(accessToken)) || (refreshToken && !isEncryptedToken(refreshToken))) {
        await channel.update({
          access_token_encrypted: accessToken ? encryptToken(accessToken) : null,
          refresh_token_encrypted: refreshToken ? encryptToken(refreshToken) : null,
        });
      }
    }

    const adminAccount = getAdminAccount();
    const [adminUser] = await User.findOrCreate({
      where: { email: adminAccount.email },
      defaults: {
        name: adminAccount.username,
        email: adminAccount.email,
        role: 'admin',
      },
    });

    if (adminUser.name !== adminAccount.username || adminUser.email !== adminAccount.email) {
      await adminUser.update({
        name: adminAccount.username,
        email: adminAccount.email,
      });
    }

    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
    startDatabaseScheduler();

    const gracefulShutdown = async (signal) => {
      console.log(`[Server] Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        const { closeAllQueuesAndWorkers } = require('./lib/queue');
        const { closeRedis } = require('./lib/redis');
        await closeAllQueuesAndWorkers().catch(() => {});
        await closeRedis().catch(() => {});
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, createApp, startServer };
