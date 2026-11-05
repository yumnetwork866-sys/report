const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseTikTokShopDateTime,
  dateOnlyInTimezone,
  localMidnightToUtc,
} = require('../src/lib/tiktokShopDateTime');

test('TikTok Shop wall-clock timestamps use the shop region timezone', () => {
  assert.equal(
    parseTikTokShopDateTime('2026-09-29 21:21:49', 'MY'),
    '2026-09-29T13:21:49.000Z',
  );
  assert.equal(
    parseTikTokShopDateTime('2026-09-29 21:21:49', 'VN'),
    '2026-09-29T14:21:49.000Z',
  );
});

test('TikTok Shop timestamps with an explicit offset are preserved', () => {
  assert.equal(
    parseTikTokShopDateTime('2026-09-29T21:21:49+08:00', 'MY'),
    '2026-09-29T13:21:49.000Z',
  );
  assert.equal(parseTikTokShopDateTime('', 'MY'), null);
  assert.equal(parseTikTokShopDateTime('not-a-date', 'MY'), null);
});

test('dateOnlyInTimezone resolves regional date without UTC boundary drift', () => {
  // 01:04 AM on Nov 1 in Malaysia (UTC+8) is 17:04 on Oct 31 in UTC
  const utcIso = '2026-10-31T17:04:00.000Z';
  assert.equal(dateOnlyInTimezone(utcIso, 'MY'), '2026-11-01');
  assert.equal(dateOnlyInTimezone(utcIso, 'VN'), '2026-11-01');
  assert.equal(dateOnlyInTimezone(utcIso), '2026-10-31'); // default UTC fallback
  assert.equal(dateOnlyInTimezone('2026-11-01 01:04:00', 'MY'), '2026-11-01');
});

test('localMidnightToUtc converts local midnight to correct UTC Date', () => {
  assert.equal(localMidnightToUtc('2026-11-01', 'VN').toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(localMidnightToUtc('2026-11-01', 'MY').toISOString(), '2026-10-31T16:00:00.000Z');
});

