import assert from 'node:assert/strict';
import test from 'node:test';

import { formatErrorDates, getRunErrorMessages } from '../src/lib/scheduleErrors.js';

test('schedule errors prefer the real nested shop error over a generic run failure', () => {
  assert.deepEqual(getRunErrorMessages({
    error: '1/1 Shop syncs failed.',
    summary: {
      total: 1,
      failed: 1,
      results: [{ shop_id: 7, status: 'FAILED', error: 'TikTok access token expired.' }],
    },
  }), ['Shop 7: TikTok access token expired.']);
});

test('schedule errors retain multiple nested details and direct non-generic errors', () => {
  assert.deepEqual(getRunErrorMessages({
    error: 'Export failed after retries.',
    summary: {
      failed: [
        { date: '2026-08-14', error: 'Rate limited.' },
        { metric_date: '2026-08-15', errors: ['Invalid response.', 'Missing videos.'] },
      ],
    },
  }), [
    '2026-08-14: Rate limited.',
    '2026-08-15: Invalid response.',
    '2026-08-15: Missing videos.',
    'Export failed after retries.',
  ]);
});

test('schedule error timestamps are formatted in Vietnam time for display', () => {
  assert.equal(
    formatErrorDates('Shop 1: TikTok Compass is cooling down until 2026-08-17T07:47:49.429Z.'),
    'Shop 1: TikTok Compass is cooling down until 17/08/2026 14:47:49.',
  );
});
