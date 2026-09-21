const express = require('express');
const router = express.Router();
const { validateParams, validateQuery } = require('../middleware/validateRequest');
const {
  creatorIdParamsSchema,
  memberIdParamsSchema,
  reportDateQuerySchema,
  reportIdParamsSchema,
  videoRevenueParamsSchema,
} = require('../schemas/reportSchemas');
const {
  getReports,
  getReportById,
  shareReport,
  createReport,
  updateReport,
  deleteReport,
  getKpis,
  getKocDetail,
  getChannelReport,
  getChannelReportMemberDetail,
  getChannelReportVideoDailyRevenue,
  generateWeeklyReport
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

// POST /api/reports/generate
router.post('/generate', generateWeeklyReport);
router.post('/:id/share', validateParams(reportIdParamsSchema), shareReport);

// GET /api/reports
router.get('/', getReports);

// GET /api/reports/:id
router.get('/:id', validateParams(reportIdParamsSchema), getReportById);

// POST /api/reports
router.post('/', createReport);

// PUT /api/reports/:id
router.put('/:id', validateParams(reportIdParamsSchema), updateReport);

// DELETE /api/reports/:id
router.delete('/:id', validateParams(reportIdParamsSchema), deleteReport);

module.exports = router;
