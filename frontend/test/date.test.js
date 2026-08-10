import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDateOnly, parseDateOnly } from '../src/lib/date.js';

test('formats date-only values without applying a timezone', () => {
  assert.equal(formatDateOnly('2026-08-10'), '10/08/2026');
  assert.equal(formatDateOnly('2026-08-10T23:30:00Z'), '10/08/2026');
});

test('returns the requested fallback for missing or invalid dates', () => {
  assert.equal(formatDateOnly('', '—'), '—');
  assert.equal(formatDateOnly('2026-02-30', '—'), '—');
  assert.equal(parseDateOnly('not-a-date'), null);
});
