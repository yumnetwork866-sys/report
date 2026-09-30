const assert = require('node:assert/strict');
const test = require('node:test');

const { parseTikTokShopDateTime } = require('../src/lib/tiktokShopDateTime');

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

