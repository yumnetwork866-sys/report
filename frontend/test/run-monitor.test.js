import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMonitorEvents, formatMonitorDuration, isMonitorActive } from '../src/lib/runMonitor.js';

test('live updates replace in-flight events without losing older pages or bigint order', () => {
  const merged = mergeMonitorEvents([
    { id: '9007199254740994', status: 'IN_FLIGHT' }, { id: '9007199254740992', status: 'SUCCEEDED' },
  ], [{ id: '9007199254740995', status: 'IN_FLIGHT' }, { id: '9007199254740994', status: 'FAILED' }]);
  assert.deepEqual(merged.map((row) => row.id), ['9007199254740995', '9007199254740994', '9007199254740992']);
  assert.equal(merged[1].status, 'FAILED');
});
test('monitor refresh and duration distinguish queued retries, milliseconds and missing timing', () => {
  assert.equal(isMonitorActive('RETRY_PENDING'), true);
  assert.equal(isMonitorActive('CANCELLED'), false);
  assert.equal(formatMonitorDuration(null), '—');
  assert.equal(formatMonitorDuration(84), '84 ms');
  assert.equal(formatMonitorDuration(1456), '1.46 s');
  assert.equal(formatMonitorDuration(61000), '1m 1s');
});
