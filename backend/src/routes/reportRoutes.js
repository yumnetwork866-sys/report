const express = require('express');
const router = express.Router();
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
router.get('/dashboard/videos', getDashboardVideos);
router.get('/dashboard', getDashboard);
router.get('/kpis', getKpis);
router.get('/channel', validateQuery(reportDateQuerySchema), getChannelReport);
router.get('/channel/videos/:platformVideoId/revenue-daily', validateParams(videoRevenueParamsSchema), validateQuery(reportDateQuerySchema), getChannelReportVideoDailyRevenue);
router.get('/channel/members/:userId', validateParams(memberIdParamsSchema), validateQuery(reportDateQuerySchema), getChannelReportMemberDetail);
router.get('/koc/:creatorId/detail', validateParams(creatorIdParamsSchema), getKocDetail);

module.exports = router;
