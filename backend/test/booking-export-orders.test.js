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

test('exportBookingOrders returns CSV attachment with UTF-8 BOM when called', async (t) => {
  const mockBookings = [
    {
      id: 101,
      creator_name: 'Lan Anh',
      creator_username: 'lananh.review',
      staff: { name: 'Thanh Hang', email: 'hang@yumnetwork.vn' },
      target_shop: { name: 'Actiscar Official' },
      booking_videos: [
        { platform_video_id: '7701234567890', title: 'Review tri nam' },
      ],
      currency: 'VND',
    },
  ];

  const mockOrderSkus = [
    {
      order_id: '587123456789',
      order_time: '2026-11-15T10:00:00.000Z',
      video_id: '7701234567890',
      creator_username: 'lananh.review',
      product_id: 'prod-1',
      product_name: 'Kem tri nam Actiscar',
      sku_id: 'sku-1',
      quantity: 2,
      refunded_quantity: 0,
      price: 250000,
      currency: 'VND',
      settlement_status: 'SETTLED',
      sku_raw_data: { sku_name: 'Hop 30g', commission_rate: 10 },
      order_raw_data: { order_status: 'COMPLETED' },
      shop_name: 'Actiscar Official',
    },
  ];

  let capturedSql = '';
  let capturedReplacements = null;

  const bookingEndpointService = loadWithMocks(t, '../src/services/booking/bookingEndpointService', {
    '../src/repositories/bookingRepository': {
      findBookings: async () => mockBookings,
    },
    '../src/models': {
      sequelize: {
        query: async (sql, options) => {
          capturedSql = sql;
          capturedReplacements = options.replacements;
          return mockOrderSkus;
        },
      },
    },
  });

  const req = {
    query: {
      month: '2026-11',
      format: 'csv',
    },
    session: {
      role: 'admin',
      sub: 1,
    },
  };

  let responseStatus = 200;
  const responseHeaders = {};
  let sentBody = '';

  const res = {
    status(s) {
      responseStatus = s;
      return res;
    },
    setHeader(k, v) {
      responseHeaders[k] = v;
      return res;
    },
    send(body) {
      sentBody = body;
      return res;
    },
    json(body) {
      sentBody = body;
      return res;
    },
  };

  await bookingEndpointService.exportBookingOrders(req, res);

  assert.equal(responseStatus, 200);
  assert.equal(responseHeaders['Content-Type'], 'text/csv; charset=utf-8');
  assert.ok(responseHeaders['Content-Disposition'].includes('attachment; filename="don_hang_booking_2026-11.csv"'));
  assert.ok(typeof sentBody === 'string');
  assert.ok(sentBody.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');
  assert.ok(sentBody.includes('Mã đơn hàng'));
  assert.ok(sentBody.includes('587123456789'));
  assert.ok(sentBody.includes('Thanh Hang'));
  assert.ok(sentBody.includes('7701234567890'));
  assert.ok(sentBody.includes('Kem tri nam Actiscar'));
  assert.ok(sentBody.includes('Hoàn thành (COMPLETED)'));

  // Verify date filter is applied in SQL query
  assert.ok(capturedSql.includes('o.create_time >= :startDateTime'));
  assert.ok(capturedSql.includes('o.create_time < :endDateTime'));
  assert.equal(capturedReplacements.startDateTime, '2026-11-01T00:00:00.000Z');
  assert.equal(capturedReplacements.endDateTime, '2026-12-01T00:00:00.000Z');
});

test('exportBookingOrders filters by explicit videoIds (e.g. hashtag matched videos)', async (t) => {
  let capturedReplacements = null;

  const bookingEndpointService = loadWithMocks(t, '../src/services/booking/bookingEndpointService', {
    '../src/repositories/bookingRepository': {
      findBookings: async () => [],
    },
    '../src/models': {
      sequelize: {
        query: async (sql, options) => {
          capturedReplacements = options.replacements;
          return [];
        },
      },
    },
  });

  const req = {
    body: {
      month: '2026-10',
      video_ids: ['tag_video_1', 'tag_video_2'],
      format: 'csv',
    },
    session: {
      role: 'admin',
      sub: 1,
    },
  };

  let sentBody = '';
  const res = {
    status() { return res; },
    setHeader() { return res; },
    send(b) { sentBody = b; return res; },
    json(b) { sentBody = b; return res; },
  };

  await bookingEndpointService.exportBookingOrders(req, res);

  assert.deepEqual(capturedReplacements.videoIds, ['tag_video_1', 'tag_video_2']);
  assert.equal(capturedReplacements.startDateTime, '2026-10-01T00:00:00.000Z');
  assert.equal(capturedReplacements.endDateTime, '2026-11-01T00:00:00.000Z');
  assert.ok(sentBody.startsWith('\uFEFF'));
});

test('exportBookingOrders returns empty CSV when video_ids is empty array', async (t) => {
  let queryExecuted = false;

  const bookingEndpointService = loadWithMocks(t, '../src/services/booking/bookingEndpointService', {
    '../src/repositories/bookingRepository': {
      findBookings: async () => [],
    },
    '../src/models': {
      sequelize: {
        query: async () => {
          queryExecuted = true;
          return [];
        },
      },
    },
  });

  const req = {
    body: {
      month: '2026-10',
      video_ids: [],
      format: 'csv',
    },
    session: {
      role: 'admin',
      sub: 1,
    },
  };

  let sentBody = '';
  const res = {
    status() { return res; },
    setHeader() { return res; },
    send(b) { sentBody = b; return res; },
    json(b) { sentBody = b; return res; },
  };

  await bookingEndpointService.exportBookingOrders(req, res);

  assert.equal(queryExecuted, false, 'Database query should be skipped when video_ids is empty');
  assert.ok(sentBody.startsWith('\uFEFF'));
  assert.ok(sentBody.includes('Mã đơn hàng'));
});
