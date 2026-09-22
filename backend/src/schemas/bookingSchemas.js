const { z } = require('zod');
const {
  booleanQuery, currency, optionalIsoDate, paginationFields, positiveId, withDateRange,
} = require('./commonSchemas');

const bookingIdParamsSchema = z.object({
  id: positiveId('booking ID'),
});

const creatorIdParamsSchema = z.object({
  creatorId: positiveId('creator ID'),
});

const bookingListQuerySchema = withDateRange(z.object({
  ...paginationFields,
  month: z.string().trim().optional(),
  start_date: optionalIsoDate('start_date'),
  end_date: optionalIsoDate('end_date'),
  staff_id: positiveId('staff ID').optional(),
  include_product_performance: booleanQuery.optional(),
}).passthrough());

const bookingBodySchema = z.object({
  total_cost: z.coerce.number().nonnegative().optional(),
  booking_cost: z.coerce.number().nonnegative().optional(),
  currency: currency.optional(),
  status: z.enum(['draft', 'booked', 'waiting_video', 'video_posted', 'done', 'cancelled']).optional(),
  start_date: optionalIsoDate('start_date'),
  end_date: optionalIsoDate('end_date'),
  deadline: optionalIsoDate('deadline'),
}).passthrough();

module.exports = {
  bookingBodySchema,
  bookingIdParamsSchema,
  bookingListQuerySchema,
  creatorIdParamsSchema,
};
