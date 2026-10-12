const express = require('express');
const router = express.Router();
const { requireAnyPermission, requirePermission } = require('../lib/session');
const { validateParams, validateQuery } = require('../middleware/validateRequest');
const {
  creatorIdParamsSchema,
  memberIdParamsSchema,
  reportDateQuerySchema,
  videoRevenueParamsSchema,
} = require('../schemas/reportSchemas');
const {
  getKpis,
  getKocDetail,
  getChannelReport,
  getChannelReportMemberDetail,
  getChannelReportVideoDailyRevenue
} = require('../controllers/reportController');
const { getDashboard, getDashboardVideos } = require('../controllers/dashboardController');

// GET /api/reports/kpis
router.get('/dashboard/videos', requirePermission('channels.dashboard.view'), getDashboardVideos);
router.get('/dashboard', requirePermission('channels.dashboard.view'), getDashboard);
router.get('/kpis', requirePermission('shop.affiliate.performance.view'), getKpis);
router.get('/channel', (req, res, next) => requireAnyPermission(
  req.query.metric === 'revenue'
    ? ['channels.reports.revenue.view']
    : ['channels.reports.video.view', 'channels.reports.statistics.view'],
)(req, res, next), validateQuery(reportDateQuerySchema), getChannelReport);
router.get('/channel/videos/:platformVideoId/revenue-daily', requirePermission('channels.reports.revenue.view'), validateParams(videoRevenueParamsSchema), validateQuery(reportDateQuerySchema), getChannelReportVideoDailyRevenue);
router.get('/channel/members/:userId', (req, res, next) => requireAnyPermission(
  req.query.metric === 'revenue'
    ? ['channels.reports.revenue.view']
    : ['channels.reports.video.view', 'channels.reports.statistics.view'],
)(req, res, next), validateParams(memberIdParamsSchema), validateQuery(reportDateQuerySchema), getChannelReportMemberDetail);
router.get('/koc/:creatorId/detail', requirePermission('shop.affiliate.performance.view'), validateParams(creatorIdParamsSchema), getKocDetail);

module.exports = router;
