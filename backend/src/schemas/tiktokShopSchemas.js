const { z } = require('zod');
const {
  currency, isoDate, optionalIsoDate, paginationFields, positiveId, tiktokUsername, tiktokVideoId, withDateRange,
} = require('./commonSchemas');

const shopParamsSchema = z.object({ shopId: positiveId('shop ID') }).passthrough();
const authorizationParamsSchema = z.object({ authorizationId: positiveId('authorization ID') }).passthrough();
const shopVideoParamsSchema = z.object({
  shopId: positiveId('shop ID'),
  videoId: tiktokVideoId,
}).passthrough();
const creatorParamsSchema = z.object({
  shopId: positiveId('shop ID'),
  creatorId: z.string().trim().min(1, 'Invalid creator ID.').max(128, 'Invalid creator ID.'),
}).passthrough();
const applicationParamsSchema = z.object({
  shopId: positiveId('shop ID'),
  applicationId: z.string().trim().min(1, 'Invalid application ID.').max(128, 'Invalid application ID.'),
}).passthrough();
const shopOrderParamsSchema = z.object({
  shopId: positiveId('shop ID'),
  orderId: z.string().trim().min(1, 'Invalid order ID.').max(128, 'Invalid order ID.'),
}).passthrough();

const shopAnalyticsQuerySchema = withDateRange(z.object({
  start_date: optionalIsoDate('start_date'),
  end_date: optionalIsoDate('end_date'),
  currency: currency.optional(),
}).passthrough(), { exclusiveEnd: true });

const shopAnalyticsBodySchema = withDateRange(z.object({
  start_date: isoDate('start_date'),
  end_date: isoDate('end_date'),
  currency: currency.optional(),
}).passthrough(), { exclusiveEnd: true });

const shopAvatarChannelBodySchema = z.object({
  channel_id: positiveId('channel ID').nullable(),
});

const shopListQuerySchema = z.object({
  ...paginationFields,
  username: tiktokUsername.optional(),
  keyword: z.string().trim().max(200).optional(),
}).passthrough();

module.exports = {
  applicationParamsSchema,
  authorizationParamsSchema,
  creatorParamsSchema,
  shopAvatarChannelBodySchema,
  shopAnalyticsBodySchema,
  shopAnalyticsQuerySchema,
  shopListQuerySchema,
  shopOrderParamsSchema,
  shopParamsSchema,
  shopVideoParamsSchema,
};
