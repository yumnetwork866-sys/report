import assert from 'node:assert/strict';
import test from 'node:test';
import { diffInDays, formatDateOnly, parseDateOnly } from '../src/lib/date.js';
import { shopDateUnix, shopTimezone } from '../src/components/SellerAffiliatePanel/utils/sellerAffiliateUtils.js';

test('formats date-only values without applying a timezone', () => {
  assert.equal(formatDateOnly('2026-08-10'), '10/08/2026');
  assert.equal(formatDateOnly('2026-08-10T23:30:00Z'), '10/08/2026');
  assert.equal(formatDateOnly('2026-09-21T22:05:25.000Z'), '21/09/2026');
});

test('returns the requested fallback for missing or invalid dates', () => {
  assert.equal(formatDateOnly('', '—'), '—');
  assert.equal(formatDateOnly('2026-02-30', '—'), '—');
  assert.equal(parseDateOnly('not-a-date'), null);
});

test('diffInDays calculates day differences correctly without timezone drift', () => {
  assert.equal(diffInDays('2026-08-26', '2026-08-20'), 6);
  assert.equal(diffInDays('2026-08-20', '2026-08-20'), 0);
  assert.equal(diffInDays('2026-08-18', '2026-08-20'), -2);
  assert.equal(diffInDays('2026-08-26T12:00:00Z', '2026-08-20T18:00:00Z'), 6);
  assert.equal(diffInDays(null, '2026-08-20'), null);
});

test('shop date boundaries use the same timezone as displayed order timestamps', () => {
  assert.equal(shopTimezone('MY'), 'Asia/Kuala_Lumpur');
  assert.equal(shopTimezone('VN'), 'Asia/Ho_Chi_Minh');
  assert.equal(shopDateUnix('2026-09-21', 'MY'), Date.parse('2026-09-20T16:00:00.000Z') / 1000);
  assert.equal(shopDateUnix('2026-09-21', 'VN'), Date.parse('2026-09-20T17:00:00.000Z') / 1000);
});
