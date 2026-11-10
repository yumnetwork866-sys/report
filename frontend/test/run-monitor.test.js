import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMonitorEvents, formatMonitorDuration, isMonitorActive, filterMonitorResults, monitorResultStatus, monitorVideoUrl } from '../src/lib/runMonitor.js';

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

test('progress filters search channel identity and errors and normalize legacy success status', () => {
  const results = [
    { channelId: 7, channel_name: 'Actiscar Live', channel_username: 'actiscar.live', status: 'success' },
    { channelId: 8, channel_name: 'Other', status: 'failed', error: 'Token expired' },
    { shop_id: 9, shop_name: 'Shop VN', status: 'SUCCEEDED' },
  ];
  assert.equal(monitorResultStatus('success'), 'SUCCEEDED');
  assert.equal(monitorResultStatus(null), 'UNKNOWN');
  assert.deepEqual(filterMonitorResults(results, ' ACTISCAR.LIVE ', 'SUCCEEDED'), [results[0]]);
  assert.deepEqual(filterMonitorResults(results, 'token', 'FAILED'), [results[1]]);
  assert.deepEqual(filterMonitorResults(results, '7'), [results[0]]);
  assert.deepEqual(filterMonitorResults(results, '', 'SUCCEEDED'), [results[0], results[2]]);
  assert.deepEqual(filterMonitorResults(results, 'Actiscar', 'FAILED'), []);
});

test('video links preserve safe share URLs and reject executable URLs', () => {
  assert.equal(monitorVideoUrl({ video_url: 'https://www.tiktok.com/@live/video/123' }), 'https://www.tiktok.com/@live/video/123');
  assert.equal(monitorVideoUrl({ video_url: 'javascript:alert(1)' }), null);
  assert.equal(monitorVideoUrl({ video_id: '123' }, '@actiscar.live'), 'https://www.tiktok.com/@actiscar.live/video/123');
  assert.equal(monitorVideoUrl({ video_id: 'bad/id' }, 'actiscar.live'), null);
});
