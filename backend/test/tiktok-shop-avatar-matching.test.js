const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('../src/controllers/tiktokShopController');

test('matches a suffixed shop name to a compact channel username', () => {
  const avatarUrl = 'https://example.com/follicas.jpg';
  const avatarIndex = new Map([
    [__test.alphanumericShopName('follicasmalaysia'), { avatar_url: avatarUrl }],
  ]);

  const shop = __test.addMatchingChannelAvatar({
    id: 7,
    name: 'Follicas Malaysia - Folliculitis',
  }, avatarIndex);

  assert.equal(shop.avatar_url, avatarUrl);
});

test('does not attach an unrelated channel avatar', () => {
  const avatarIndex = new Map([
    [__test.alphanumericShopName('actiscarmalaysia'), { avatar_url: 'https://example.com/actiscar.jpg' }],
  ]);

  const shop = __test.addMatchingChannelAvatar({
    id: 7,
    name: 'Follicas Malaysia - Folliculitis',
  }, avatarIndex);

  assert.equal(shop.avatar_url, undefined);
});
