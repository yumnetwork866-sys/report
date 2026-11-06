const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REGION_TIMEZONES,
  DEFAULT_TIMEZONE,
  resolveRegionTimezone,
  localMidnightToUtc,
  dateOnlyInTimezone,
  sqlDateInTimezone,
} = require('../src/lib/dateTimeUtils');

test('dateTimeUtils exports correct regional mappings', () => {
  assert.equal(DEFAULT_TIMEZONE, 'Asia/Ho_Chi_Minh');
  assert.equal(REGION_TIMEZONES.VN, 'Asia/Ho_Chi_Minh');
  assert.equal(REGION_TIMEZONES.MY, 'Asia/Kuala_Lumpur');
  assert.equal(resolveRegionTimezone('my'), 'Asia/Kuala_Lumpur');
  assert.equal(resolveRegionTimezone('VN'), 'Asia/Ho_Chi_Minh');
  assert.equal(resolveRegionTimezone('Asia/Bangkok'), 'Asia/Bangkok');
  assert.equal(resolveRegionTimezone(null), null);
});

test('localMidnightToUtc resolves regional midnight to UTC Date', () => {
  // Midnight 2026-11-01 in VN (UTC+7) is 2026-10-31 17:00:00 UTC
  const vnMidnight = localMidnightToUtc('2026-11-01', 'VN');
  assert.equal(vnMidnight.toISOString(), '2026-10-31T17:00:00.000Z');

  // Midnight 2026-11-01 in MY (UTC+8) is 2026-10-31 16:00:00 UTC
  const myMidnight = localMidnightToUtc('2026-11-01', 'MY');
  assert.equal(myMidnight.toISOString(), '2026-10-31T16:00:00.000Z');

  // Default timezone is Asia/Ho_Chi_Minh
  const defaultMidnight = localMidnightToUtc('2026-11-01');
  assert.equal(defaultMidnight.toISOString(), '2026-10-31T17:00:00.000Z');
});

test('dateOnlyInTimezone resolves regional dates accurately', () => {
  const utcIso = '2026-10-31T17:04:00.000Z';
  // 17:04 UTC + 8 hours = 01:04 on Nov 1 in Malaysia
  assert.equal(dateOnlyInTimezone(utcIso, 'MY'), '2026-11-01');
  // 17:04 UTC + 7 hours = 00:04 on Nov 1 in Vietnam
  assert.equal(dateOnlyInTimezone(utcIso, 'VN'), '2026-11-01');
  // Default UTC
  assert.equal(dateOnlyInTimezone(utcIso), '2026-10-31');

  // Plain local timestamp without tz offset
  assert.equal(dateOnlyInTimezone('2026-11-01 01:04:00', 'MY'), '2026-11-01');
  assert.equal(dateOnlyInTimezone(null), null);
});

test('sqlDateInTimezone builds Postgres AT TIME ZONE expression', () => {
  assert.equal(sqlDateInTimezone('v.published_at'), "(v.published_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date");
  assert.equal(sqlDateInTimezone('o.create_time', 'MY'), "(o.create_time AT TIME ZONE 'Asia/Kuala_Lumpur')::date");
});

