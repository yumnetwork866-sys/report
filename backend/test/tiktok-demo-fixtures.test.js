const assert = require('node:assert/strict');
const test = require('node:test');

const {
  creatorOverviewFixture,
  isDemoAuthorization,
  sellerAffiliateFixture,
} = require('../src/lib/tiktokDemoFixtures');

test('TikTok demo fixtures only activate for demo authorizations', () => {
  assert.equal(isDemoAuthorization({ open_id: 'demo_full_seller_open' }), true);
  assert.equal(isDemoAuthorization({ open_id: 'real-seller-open-id' }), false);
});

test('TikTok demo fixtures provide Seller Affiliate and Creator data', () => {
  const authorization = {
    open_id: 'demo_full_creator_open_1',
    username: 'demo.creator',
    showcase_count: 12,
  };
  const seller = sellerAffiliateFixture('open-collaborations', { name: 'Demo Shop' });
  const marketplace = sellerAffiliateFixture('marketplace-creators', { name: 'Demo Shop' }, { keyword: '@demo.creator.1' });
  const creator = creatorOverviewFixture(authorization);
  assert.equal(seller.data.open_collaborations.length, 8);
  assert.equal(marketplace.data.creators.length, 1);
  assert.equal(marketplace.data.creators[0].username, 'demo.creator.1');
  assert.equal(creator.profile.username, 'demo.creator');
  assert.equal(creator.showcase.products.length, 8);
  assert.equal(creator.errors.profile, null);
});

test('TikTok demo order KPIs honor the requested date range', () => {
  const now = Math.floor(Date.now() / 1000);
  const recent = sellerAffiliateFixture('order-overview', { name: 'Demo Shop' }, {
    create_time_ge: now - 3600,
    create_time_lt: now + 3600,
  });
  const future = sellerAffiliateFixture('order-overview', { name: 'Demo Shop' }, {
    create_time_ge: now + 86400,
    create_time_lt: now + 172800,
  });

  assert.equal(recent.data.kpis.orders, 1);
  assert.equal(future.data.kpis.orders, 0);
  assert.equal(future.data.kpis.items_sold, 0);
});
