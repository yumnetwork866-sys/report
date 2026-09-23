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

test('uses the explicitly linked channel before name matching', () => {
  const shop = __test.addMatchingChannelAvatar({
    id: 8,
    name: 'Actiscar Stretchmark Malaysia',
    avatar_channel_id: 12,
    avatar_channel: {
      avatar_url: 'https://example.com/stretchmark.jpg',
      avatar_large_url: 'https://example.com/stretchmark-large.jpg',
    },
  }, new Map([
    [__test.alphanumericShopName('actiscarmalaysia'), { avatar_url: 'https://example.com/wrong.jpg' }],
  ]));

  assert.equal(shop.avatar_url, 'https://example.com/stretchmark.jpg');
  assert.equal(shop.avatar_large_url, 'https://example.com/stretchmark-large.jpg');
});
