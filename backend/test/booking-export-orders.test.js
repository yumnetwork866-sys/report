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

  const bookingEndpointService = loadWithMocks(t, '../src/services/booking/bookingEndpointService', {
    '../src/repositories/bookingRepository': {
      findBookings: async () => mockBookings,
    },
    '../src/models': {
      sequelize: {
        query: async () => mockOrderSkus,
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
});

test('exportBookingOrders returns JSON when format=json', async (t) => {
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

  const bookingEndpointService = loadWithMocks(t, '../src/services/booking/bookingEndpointService', {
    '../src/repositories/bookingRepository': {
      findBookings: async () => mockBookings,
    },
    '../src/models': {
      sequelize: {
        query: async () => mockOrderSkus,
      },
    },
  });

  const req = {
    query: {
      month: '2026-11',
      format: 'json',
    },
    session: {
      role: 'admin',
      sub: 1,
    },
  };

  let jsonResult = null;
  const res = {
    status() { return res; },
    setHeader() { return res; },
    send(b) { jsonResult = b; return res; },
    json(b) { jsonResult = b; return res; },
  };

  await bookingEndpointService.exportBookingOrders(req, res);

  assert.ok(jsonResult);
  assert.equal(jsonResult.ok, true);
  assert.equal(jsonResult.count, 1);
  assert.equal(jsonResult.orders[0].orderId, '587123456789');
  assert.equal(jsonResult.orders[0].staffName, 'Thanh Hang');
  assert.equal(jsonResult.orders[0].videoId, '7701234567890');
});
