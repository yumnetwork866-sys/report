const express = require('express');
const router = express.Router();
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
const { getDashboard } = require('../controllers/dashboardController');

// GET /api/reports/kpis
router.get('/dashboard', getDashboard);
router.get('/kpis', getKpis);
router.get('/channel', getChannelReport);
router.get('/channel/videos/:platformVideoId/revenue-daily', getChannelReportVideoDailyRevenue);
router.get('/channel/members/:userId', getChannelReportMemberDetail);
router.get('/koc/:creatorId/detail', getKocDetail);

// POST /api/reports/generate
router.post('/generate', generateWeeklyReport);
router.post('/:id/share', shareReport);

// GET /api/reports
router.get('/', getReports);

// GET /api/reports/:id
router.get('/:id', getReportById);

// POST /api/reports
router.post('/', createReport);

// PUT /api/reports/:id
router.put('/:id', updateReport);

// DELETE /api/reports/:id
router.delete('/:id', deleteReport);

module.exports = router;
