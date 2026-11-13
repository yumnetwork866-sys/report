import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDurationSeconds,
  extractSessionComments,
  formatLiveDuration,
  formatTotalDuration,
  isInternalLiveChannel,
  resolveLiveSessionSource,
} from '../src/components/liveAnalyticsUtils.js';

test('calculateDurationSeconds calculates difference between start and end timestamps', () => {
  const start = 1700000000000;
  const end = start + 3 * 3600 * 1000 + 15 * 60 * 1000; // 3h 15m
  assert.equal(calculateDurationSeconds(start, end), 3 * 3600 + 15 * 60);
  assert.equal(calculateDurationSeconds(start, start), 0);
  assert.equal(calculateDurationSeconds(null, end), 0);
  assert.equal(calculateDurationSeconds(start, null), 0);
  assert.equal(calculateDurationSeconds(end, start), 0);
});

test('formatLiveDuration formats duration in Vietnamese and English', () => {
  const start = 1700000000000;
  const threeHours = start + 3 * 3600 * 1000;
  const threeHoursFifteen = start + (3 * 3600 + 15 * 60) * 1000;
  const fortyFiveMins = start + 45 * 60 * 1000;

  // Vietnamese
  assert.equal(formatLiveDuration(start, threeHours, 'vi'), '3 tiếng');
  assert.equal(formatLiveDuration(start, threeHoursFifteen, 'vi'), '3 tiếng 15 phút');
  assert.equal(formatLiveDuration(start, fortyFiveMins, 'vi'), '45 phút');
  assert.equal(formatLiveDuration(start, start, 'vi'), '< 1 phút (1 đơn)');
  assert.equal(formatLiveDuration(null, null, 'vi'), '—');

  // English
  assert.equal(formatLiveDuration(start, threeHours, 'en'), '3 hours');
  assert.equal(formatLiveDuration(start, threeHoursFifteen, 'en'), '3h 15m');
  assert.equal(formatLiveDuration(start, fortyFiveMins, 'en'), '45 mins');
  assert.equal(formatLiveDuration(start, start, 'en'), '< 1 min (1 order)');
});

test('formatTotalDuration formats aggregated channel broadcast time', () => {
  // 12 hours 30 mins = 45000 seconds
  assert.equal(formatTotalDuration(45000, 'vi'), '12 tiếng 30 phút');
  assert.equal(formatTotalDuration(45000, 'en'), '12h 30m');
  assert.equal(formatTotalDuration(3600, 'vi'), '1 tiếng');
  assert.equal(formatTotalDuration(3600, 'en'), '1 hours');
  assert.equal(formatTotalDuration(1800, 'vi'), '30 phút');
  assert.equal(formatTotalDuration(0, 'vi'), '—');
});

test('extractSessionComments extracts total comments from performance or session object', () => {
  assert.equal(extractSessionComments({ total_comments: 120 }), 120);
  assert.equal(extractSessionComments({ comments: 85 }), 85);
  assert.equal(extractSessionComments({ interaction_performance: { comments: 534 } }), 534);
  assert.equal(extractSessionComments(null, { totalComments: 42 }), 42);
  assert.equal(extractSessionComments(null, { total_comments: '99' }), 99);
  assert.equal(extractSessionComments(null, null), null);
  assert.equal(extractSessionComments({}, {}), null);
});

test('isInternalLiveChannel recognizes official and marketing author types, internal channels, and shop slug match', () => {
  assert.equal(isInternalLiveChannel({ authorType: 'OFFICIAL' }), true);
  assert.equal(isInternalLiveChannel({ authorType: 'MARKETING' }), true);
  assert.equal(isInternalLiveChannel({ authorType: 'AFFILIATE' }), false);

  assert.equal(isInternalLiveChannel({
    creatorUsername: 'yum.official',
    internalChannelUsernames: new Set(['yum.official']),
  }), true);

  assert.equal(isInternalLiveChannel({
    creatorUsername: 'aurabeauty',
    avatarChannelUsername: 'aurabeauty',
  }), true);

  assert.equal(isInternalLiveChannel({
    creatorUsername: 'aurabeauty',
    shopName: 'Aura Beauty Official',
  }), true);

  assert.equal(isInternalLiveChannel({
    creatorUsername: 'koc_ngoctrinh',
    shopName: 'Aura Beauty Official',
  }), false);
});

test('resolveLiveSessionSource returns false for shop internal and true for external KOC', () => {
  // Official account is always internal (isExternal = false)
  assert.equal(resolveLiveSessionSource({
    creatorUsername: 'creator_1',
    authorType: 'OFFICIAL',
    totalCommission: 500,
  }), false);

  // Marketing account is internal (isExternal = false)
  assert.equal(resolveLiveSessionSource({
    creatorUsername: 'creator_2',
    authorType: 'MARKETING',
  }), false);

  // Affiliate author type is external (isExternal = true)
  assert.equal(resolveLiveSessionSource({
    creatorUsername: 'koc_affiliate',
    authorType: 'AFFILIATE',
  }), true);

  // Internal channel in system is internal (isExternal = false)
  assert.equal(resolveLiveSessionSource({
    creatorUsername: 'my.shop.channel',
    internalChannelUsernames: ['my.shop.channel'],
  }), false);

  // Unknown creator with commission is external (isExternal = true)
  assert.equal(resolveLiveSessionSource({
    creatorUsername: 'unknown_koc',
    shopName: 'My Brand',
    totalCommission: 1000,
  }), true);
});
