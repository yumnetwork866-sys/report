const reportService = require('../services/report/reportEndpointService');
const { endpoint } = require('./controllerAdapter');

const actions = [
  'getReports', 'getReportById', 'getPublicReport', 'shareReport', 'createReport',
  'updateReport', 'deleteReport', 'getKpis', 'getKocDetail', 'getChannelReport',
  'getChannelReportMemberDetail', 'getChannelReportVideoDailyRevenue', 'generateWeeklyReport',
];

module.exports = Object.fromEntries(actions.map((action) => [action, endpoint(reportService, action)]));
module.exports.clearReportCache = reportService.clearReportCache;
module.exports.__test = reportService.__test;
