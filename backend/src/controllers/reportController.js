const reportService = require('../services/report/reportEndpointService');
const { endpoint } = require('./controllerAdapter');

const actions = [
  'getKpis', 'getKocDetail', 'getChannelReport',
  'getChannelReportMemberDetail', 'getChannelReportVideoDailyRevenue',
];

module.exports = Object.fromEntries(actions.map((action) => [action, endpoint(reportService, action)]));
module.exports.clearReportCache = reportService.clearReportCache;
module.exports.__test = reportService.__test;
