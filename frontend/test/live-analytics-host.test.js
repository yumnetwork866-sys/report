import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findLivePerformanceForSession,
  resolveLiveSessionHost,
} from '../src/components/liveAnalyticsUtils.js';

test('findLivePerformanceForSession prefers an exact live id match', () => {
  const exact = { live_id: 'live-1', creator_username: 'other', start_time: 100, end_time: 200 };
  const fallback = { live_id: 'live-2', creator_username: 'creator.an', start_time: 100, end_time: 200 };
  assert.equal(findLivePerformanceForSession([fallback, exact], {
    sessionId: 'live-1',
    creatorUsername: 'creator.an',
    firstTime: 120,
    lastTime: 180,
  }), exact);
});

test('findLivePerformanceForSession falls back to a unique creator and overlapping time window', () => {
  const overlapping = { live_id: 'live-2', creator_username: 'Creator.An', start_time: 100, end_time: 300 };
  const notOverlapping = { live_id: 'live-3', creator_username: 'creator.an', start_time: 400, end_time: 500 };
  assert.equal(findLivePerformanceForSession([overlapping, notOverlapping], {
    sessionId: 'unknown',
    creatorUsername: 'creator.an',
    firstTime: 150,
    lastTime: 250,
  }), overlapping);
});

test('findLivePerformanceForSession ignores ambiguous creator and time matches', () => {
  const first = { live_id: 'live-1', creator_username: 'creator.an', start_time: 100, end_time: 300 };
  const second = { live_id: 'live-2', creator_username: 'creator.an', start_time: 150, end_time: 350 };
  assert.equal(findLivePerformanceForSession([first, second], {
    sessionId: 'unknown',
    creatorUsername: 'creator.an',
    firstTime: 200,
    lastTime: 250,
  }), null);
});

test('resolveLiveSessionHost prefers a manual host over the auto hashtag host', () => {
  const manual = { id: 1, name: 'Manual Host' };
  const auto = { id: 2, name: 'Auto Host' };
  assert.deepEqual(resolveLiveSessionHost(manual, auto), {
    host: manual,
    hostSource: 'manual',
  });
});

test('resolveLiveSessionHost falls back to the auto hashtag host', () => {
  const auto = { id: 2, name: 'Auto Host' };
  assert.deepEqual(resolveLiveSessionHost(null, auto), {
    host: auto,
    hostSource: 'auto_hashtag',
  });
});

test('resolveLiveSessionHost returns no host when neither source has a user', () => {
  assert.deepEqual(resolveLiveSessionHost(null, null), {
    host: null,
    hostSource: null,
  });
  assert.deepEqual(resolveLiveSessionHost({ name: 'No id' }, {}), {
    host: null,
    hostSource: null,
  });
});
