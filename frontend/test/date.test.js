import assert from 'node:assert/strict';
import test from 'node:test';
import { diffInDays, formatDateOnly, parseDateOnly } from '../src/lib/date.js';

test('formats date-only values without applying a timezone', () => {
  assert.equal(formatDateOnly('2026-08-10'), '10/08/2026');
  assert.equal(formatDateOnly('2026-08-10T23:30:00Z'), '10/08/2026');
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
