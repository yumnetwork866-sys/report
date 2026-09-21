const { z } = require('zod');
const {
  optionalIsoDate, positiveId, tiktokVideoId, withDateRange,
} = require('./commonSchemas');

const reportIdParamsSchema = z.object({ id: positiveId('report ID') });
const creatorIdParamsSchema = z.object({ creatorId: positiveId('creator ID') });
const memberIdParamsSchema = z.object({ userId: positiveId('user ID') });
const videoRevenueParamsSchema = z.object({
  platformVideoId: tiktokVideoId,
});

const reportDateQuerySchema = withDateRange(z.object({
  start_date: optionalIsoDate('start_date'),
  end_date: optionalIsoDate('end_date'),
}).passthrough());

module.exports = {
  creatorIdParamsSchema,
  memberIdParamsSchema,
  reportDateQuerySchema,
  reportIdParamsSchema,
  videoRevenueParamsSchema,
};
