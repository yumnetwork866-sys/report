const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const {
  CREATOR_AVATAR_STORAGE_ROOT,
  CREATOR_AVATAR_PUBLIC_PREFIX,
} = require('./services/creatorAvatarStorageService');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

// Import routes
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roleRoutes');
const contentTeamRoutes = require('./routes/contentTeamRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const videoRoutes = require('./routes/videoRoutes');
const reportRoutes = require('./routes/reportRoutes');
const channelRoutes = require('./routes/channelRoutes');
const importRoutes = require('./routes/importRoutes');
const authRoutes = require('./routes/authRoutes');

const tiktokPartnerPublicRoutes = require('./routes/tiktokPartnerPublicRoutes');
const tiktokShopRoutes = require('./routes/tiktokShopRoutes');
const tiktokAppRoutes = require('./routes/tiktokAppRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const queueRoutes = require('./routes/queueRoutes');
const { requireAdmin, requirePermission, requireAnyPermission } = require('./lib/session');
const { requestTelemetry } = require('./lib/requestTelemetry');
const { loginRateLimit } = require('./middleware/rateLimit');
const { createHealthRouter } = require('./routes/healthRoutes');
const { serverAdapter, bullBoardAuth } = require('./routes/bullBoardRoutes');
const { getMyrExchangeRates, FALLBACK_EXCHANGE_RATES } = require('./services/exchangeRateService');

const captureRawBody = (req, _res, buffer) => {
  req.rawBody = buffer;
};

const createApp = () => {
  const app = express();
  if (process.env.TRUST_PROXY) {
    const trustProxy = /^\d+$/.test(process.env.TRUST_PROXY)
      ? Number(process.env.TRUST_PROXY)
      : process.env.TRUST_PROXY === 'true';
    app.set('trust proxy', trustProxy);
  }

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  }));
  app.use(requestTelemetry);
  app.use(createHealthRouter());
  app.use('/api/import', requireAdmin, requirePermission('shop.videos.library.view'), express.json({
    limit: process.env.IMPORT_BODY_LIMIT || '16mb',
    verify: captureRawBody,
  }), importRoutes);
  app.use(express.json({
    limit: process.env.JSON_BODY_LIMIT || '2mb',
    verify: captureRawBody,
  }));
  app.use(CREATOR_AVATAR_PUBLIC_PREFIX, express.static(CREATOR_AVATAR_STORAGE_ROOT, {
    dotfiles: 'deny',
    fallthrough: false,
    maxAge: '1y',
    immutable: true,
  }));
  app.use('/api/bookings/tiktok-partner', tiktokPartnerPublicRoutes);

  app.get('/', (_req, res) => {
    res.json({ message: 'Content Performance Reporting API' });
  });

  app.use('/api/users', requireAdmin, requireAnyPermission(['admin.users.view', 'admin.users.manage', 'admin.roles.manage', 'admin.teams.manage']), userRoutes);
  app.use('/api/roles', requireAdmin, requireAnyPermission(['admin.users.view', 'admin.users.manage', 'admin.roles.manage', 'admin.teams.manage']), roleRoutes);
  app.use('/api/content-teams', requireAdmin, requireAnyPermission(['admin.users.view', 'admin.users.manage', 'admin.roles.manage', 'admin.teams.manage']), contentTeamRoutes);
  app.use('/api/bookings', requireAdmin, requireAnyPermission(['shop.bookings.video.view', 'shop.bookings.product_performance.view', 'shop.bookings.by_product.view', 'shop.bookings.manage']), bookingRoutes);
  app.use('/api/videos', requireAdmin, requireAnyPermission(['shop.videos.library.view', 'shop.videos.performance.view', 'shop.bookings.video.view', 'shop.bookings.manage']), videoRoutes);
  app.use('/api/reports', requireAdmin, requireAnyPermission(['channels.dashboard.view', 'channels.reports.video.view', 'channels.reports.revenue.view', 'channels.reports.statistics.view', 'shop.affiliate.performance.view']), reportRoutes);
  app.use('/api/channels', channelRoutes);
  app.use('/api/auth/login', loginRateLimit);
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
  app.use('/api/tiktok-apps', requireAdmin, tiktokAppRoutes);
  app.use('/admin/queues', bullBoardAuth, serverAdapter.getRouter());

  app.use((err, req, res, _next) => {
    const status = Number(err.status || err.statusCode) || 500;
    if (status >= 500) {
      console.error('[HTTP] Unhandled request error', {
        request_id: req.requestId,
        method: req.method,
        path: req.originalUrl,
        message: err.message,
      });
    }
    res.status(status).json({
      message: status === 413 ? 'Request body is too large.' : (status >= 500 ? 'Internal server error.' : err.message),
      request_id: req.requestId,
    });
  });

  return app;
};

const app = createApp();

module.exports = { app, createApp };
