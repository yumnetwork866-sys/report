const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const loadWithMocks = (t, modulePath, mocks) => {
  const resolvedModulePath = require.resolve(modulePath);
  const restores = Object.entries(mocks).map(([target, value]) => (
    mockModule(require.resolve(target), value)
  ));
  delete require.cache[resolvedModulePath];
  t.after(() => {
    delete require.cache[resolvedModulePath];
    restores.reverse().forEach((restore) => restore());
  });
  return require(resolvedModulePath);
};

test('booking query service loads and presents a booking', async (t) => {
  const row = { id: 12 };
  const service = loadWithMocks(t, '../src/services/booking/bookingQueryService', {
    '../src/repositories/bookingRepository': {
      findByIdWithRelations: async (id) => {
        assert.equal(id, 12);
        return row;
      },
    },
    '../src/presenters/bookingPresenter': {
      serializeBookings: async (bookings) => [{ ...bookings[0], presented: true }],
    },
  });

  assert.deepEqual(await service.getBookingById(12), { id: 12, presented: true });
});

test('booking query service exposes a typed 404 error', async (t) => {
  const service = loadWithMocks(t, '../src/services/booking/bookingQueryService', {
    '../src/repositories/bookingRepository': {
      findByIdWithRelations: async () => null,
    },
    '../src/presenters/bookingPresenter': {
      serializeBookings: async () => [],
    },
  });

  await assert.rejects(
    service.getBookingById(404),
    (error) => error.status === 404 && error.message === 'Booking not found',
  );
});

test('booking command service deletes through repository and clears related caches', async (t) => {
  const deletedIds = [];
  const clearedPatterns = [];
  const service = loadWithMocks(t, '../src/services/booking/bookingCommandService', {
    '../src/repositories/bookingRepository': {
      deleteById: async (id) => {
        deletedIds.push(id);
        return 1;
      },
    },
    '../src/lib/redis': {
      delByPattern: async (pattern) => clearedPatterns.push(pattern),
    },
  });

  assert.deepEqual(await service.deleteBooking(7), {
    message: 'Booking deleted successfully',
  });
  assert.deepEqual(deletedIds, [7]);
  assert.deepEqual(clearedPatterns.sort(), ['bookings:*', 'dashboard:*', 'report:*']);
});

test('booking command service creates a booking from a resolved target creator', async (t) => {
  let createdPayload;
  let linkedBooking;
  const createdRow = { id: 81 };
  const service = loadWithMocks(t, '../src/services/booking/bookingCommandService', {
    '../src/repositories/bookingRepository': {
      create: async (payload) => {
        createdPayload = payload;
        return createdRow;
      },
      findByIdWithRelations: async () => ({ id: 81, ...createdPayload }),
      findStaffById: async () => ({ id: 9, name: 'Owner' }),
    },
    '../src/lib/redis': { delByPattern: async () => {} },
    '../src/presenters/bookingPresenter': {
      serializeBookings: async (rows) => rows,
    },
    '../src/services/shopProductCatalogService': {
      upsertShopProducts: async () => {},
    },
    '../src/services/booking/bookingTargetService': {
      findTargetCreator: async () => ({
        shopId: 3,
        collaboration: null,
        raw: null,
        profile: {
          creator_open_id: null,
          username: 'creator',
          nickname: 'Creator',
          avatar_url: null,
        },
        performance: { currency: 'MYR' },
      }),
    },
    '../src/services/booking/bookingVideoService': {
      autoLinkCreatedBooking: async (booking) => { linkedBooking = booking; },
    },
  });

  const result = await service.createBooking({
    body: {
      target_shop_id: 3,
      creator_username: 'creator',
      staff_id: 9,
      booking_cost: 120,
      product_ids: ['product-1'],
    },
    session: { role: 'admin' },
  });

  assert.equal(result.id, 81);
  assert.equal(createdPayload.staff_id, 9);
  assert.equal(createdPayload.total_cost, 120);
  assert.deepEqual(createdPayload.evaluation_snapshot.product_ids, ['product-1']);
  assert.equal(linkedBooking, createdRow);
});

test('booking command service updates through repository and returns presented data', async (t) => {
  let updateCall;
  const service = loadWithMocks(t, '../src/services/booking/bookingCommandService', {
    '../src/repositories/bookingRepository': {
      updateById: async (id, payload) => {
        updateCall = { id, payload };
        return [1];
      },
      findByIdWithRelations: async (id) => ({ id, target_shop_id: 3 }),
    },
    '../src/lib/redis': { delByPattern: async () => {} },
    '../src/presenters/bookingPresenter': {
      serializeBookings: async (rows) => rows.map((row) => ({ ...row, presented: true })),
    },
    '../src/services/shopProductCatalogService': {
      upsertShopProducts: async () => {},
    },
    '../src/services/booking/bookingTargetService': {
      findTargetCreator: async () => null,
    },
    '../src/services/booking/bookingVideoService': {
      autoLinkCreatedBooking: async () => {},
    },
  });

  const result = await service.updateBooking(42, {
    body: {
      total_cost: 75,
      status: 'booked',
      start_date: '2026-09-01',
      end_date: '2026-09-15',
    },
    session: { role: 'admin' },
  });

  assert.equal(updateCall.id, 42);
  assert.equal(updateCall.payload.total_cost, 75);
  assert.equal(updateCall.payload.booking_cost, 75);
  assert.equal(updateCall.payload.deadline, '2026-09-15');
  assert.deepEqual(result, { id: 42, target_shop_id: 3, presented: true });
});

test('booking performance service resolves month range and formats the response', async (t) => {
  const calls = [];
  const service = loadWithMocks(t, '../src/services/booking/bookingPerformanceService', {
    '../src/repositories/bookingRepository': {
      findForProductPerformance: async () => [{ id: 1 }],
    },
    '../src/services/bookingVideoPerformanceService': {
      loadOrderMetricsForBookingProducts: async (options) => {
        calls.push(options);
        return new Map([['product-1', { orders: 3 }]]);
      },
    },
  });

  const result = await service.getBookingProductPerformance({
    month: '2024-02',
    start_time: '10',
    end_time: '20',
  });

  assert.deepEqual(result, {
    performance: { 'product-1': { orders: 3 } },
  });
  assert.deepEqual(calls[0], {
    bookings: [{ id: 1 }],
    startDate: '2024-02-01',
    endDate: '2024-02-29',
    startTime: 10,
    endTime: 20,
  });
});

test('findTargetCreator resolves cross-shop creator when target shop has no synced records', async (t) => {
  const targetService = loadWithMocks(t, '../src/services/booking/bookingTargetService', {
    '../src/repositories/bookingRepository': {
      findTargetCollaborations: async ({ shopId }) => {
        // Shop 7 has no collabs, but Shop 1 has
        if (shopId === 7) return [];
        return [];
      },
      findCreatorPerformance: async ({ shopId, username }) => {
        // If searching shop 7, not found
        if (shopId === 7) return null;
        // If searching across all shops (shopId is undefined), found!
        if (!shopId && username === 'cross_creator') {
          return {
            toJSON: () => ({
              creator_open_id: 'open-123',
              username: 'cross_creator',
              nickname: 'Cross Creator',
              avatar_url: 'https://img.com/avatar.jpg',
            }),
          };
        }
        return null;
      },
    },
    '../src/services/booking/bookingPerformanceService': {
      enrichPerformanceViews: async (p) => p,
    },
  });

  const resolved = await targetService.findTargetCreator({
    shopId: 7,
    creatorUsername: 'cross_creator',
  });

  assert.equal(resolved.shopId, 7);
  assert.equal(resolved.profile.username, 'cross_creator');
  assert.equal(resolved.profile.nickname, 'Cross Creator');
  assert.equal(resolved.profile.avatar_url, 'https://img.com/avatar.jpg');
  assert.equal(resolved.performance, null);
});

test('findTargetCreator falls back to raw username for completely new creator without sync data', async (t) => {
  const targetService = loadWithMocks(t, '../src/services/booking/bookingTargetService', {
    '../src/repositories/bookingRepository': {
      findTargetCollaborations: async () => [],
      findCreatorPerformance: async () => null,
      findCreatorProfile: async () => null,
    },
    '../src/services/booking/bookingPerformanceService': {
      enrichPerformanceViews: async (p) => p,
    },
  });

  const resolved = await targetService.findTargetCreator({
    shopId: 7,
    creatorUsername: '@brand_new_koc',
    fallbackProfile: { nickname: 'Brand New KOC' },
  });

  assert.equal(resolved.shopId, 7);
  assert.equal(resolved.profile.username, 'brand_new_koc');
  assert.equal(resolved.profile.nickname, 'Brand New KOC');
  assert.equal(resolved.performance, null);
});
