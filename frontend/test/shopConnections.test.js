import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionAppType, uniqueShopAuthorizations } from '../src/lib/shopConnections.js';

test('a connection used as both primary and order authorization appears only once', () => {
  const authorization = { id: 10, app: { id: 6, app_type: 'partner' } };
  const result = uniqueShopAuthorizations({ authorization, orderAuthorization: { ...authorization, id: '10' } });
  assert.deepEqual(result, [authorization]);
  assert.equal(connectionAppType(result[0]), 'partner');
});

test('different Seller and OMS connections remain separate even when both app types are partner', () => {
  const authorization = { id: 8, app: { id: 5, app_type: 'partner' } };
  const orderAuthorization = { id: 10, app: { id: 6, app_type: 'partner' } };
  assert.deepEqual(uniqueShopAuthorizations({ authorization, orderAuthorization }), [authorization, orderAuthorization]);
  assert.equal(connectionAppType(orderAuthorization), 'partner');
});

test('app labels follow configured app type rather than the authorization role or legacy alias', () => {
  assert.equal(connectionAppType({ app_type: 'partner_vn' }), 'partner');
  assert.equal(connectionAppType({ app_type: 'partner', app: { app_type: 'custom' } }), 'custom');
  assert.equal(connectionAppType({ app_type: 'custom', app: { app_type: 'partner' } }), 'partner');
});

test('a Shop with only one authorization keeps that connection', () => {
  const orderAuthorization = { id: 10, app_type: 'custom' };
  assert.deepEqual(uniqueShopAuthorizations({ orderAuthorization }), [orderAuthorization]);
  assert.deepEqual(uniqueShopAuthorizations({}), []);
});
