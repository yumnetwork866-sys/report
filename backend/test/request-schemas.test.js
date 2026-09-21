const test = require('node:test');
const assert = require('node:assert/strict');
const {
  booleanQuery, currency, isoDate, paginationQuerySchema, positiveId, tiktokUsername, tiktokVideoId, withDateRange,
} = require('../src/schemas/commonSchemas');
const { shopAnalyticsBodySchema } = require('../src/schemas/tiktokShopSchemas');
const { z } = require('zod');

test('common request schemas coerce IDs, pagination and booleans', () => {
  assert.equal(positiveId().parse('42'), 42);
  assert.deepEqual(paginationQuerySchema.parse({ page: '2', page_size: '50' }), {
    page: 2,
    page_size: 50,
  });
  assert.equal(booleanQuery.parse('true'), true);
  assert.equal(booleanQuery.parse('0'), false);
});

test('date range schema validates real ISO dates and ordering', () => {
  assert.equal(isoDate().parse('2026-09-21'), '2026-09-21');
  assert.equal(isoDate().safeParse('2026-02-30').success, false);
  const schema = withDateRange(z.object({ start_date: isoDate(), end_date: isoDate() }));
  assert.equal(schema.safeParse({ start_date: '2026-09-22', end_date: '2026-09-21' }).success, false);
});

test('currency and TikTok username normalization are stable', () => {
  assert.equal(currency.parse('myr'), 'MYR');
  assert.equal(tiktokUsername.parse('@@creator.name'), 'creator.name');
  assert.equal(tiktokVideoId.parse('7481234567890123456'), '7481234567890123456');
});

test('TikTok analytics body requires an exclusive date range', () => {
  assert.equal(shopAnalyticsBodySchema.safeParse({
    start_date: '2026-09-01',
    end_date: '2026-09-21',
    currency: 'myr',
  }).success, true);
  assert.equal(shopAnalyticsBodySchema.safeParse({
    start_date: '2026-09-21',
    end_date: '2026-09-21',
  }).success, false);
});
