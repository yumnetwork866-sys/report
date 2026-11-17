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
  assert.ok(sentBody.includes('Thành công (COMPLETED)'));

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

test('exportBookingOrders returns multi-tab Excel (.xlsx) by default with "all" and individual staff tabs', async (t) => {
  const XLSX = require('xlsx');

  const mockBookings = [
    {
      id: 101,
      creator_name: 'Lan Anh',
      creator_username: 'lananh.review',
      staff: { name: 'Thanh Hằng', email: 'hang@yumnetwork.vn' },
      target_shop: { name: 'Actiscar Official' },
      booking_videos: [
        { platform_video_id: 'vid-1', title: 'Video Hang' },
      ],
      currency: 'VND',
    },
    {
      id: 102,
      creator_name: 'Ngọc Mai',
      creator_username: 'ngocmai.daily',
      staff: { name: 'Mai', email: 'mai@yumnetwork.vn' },
      target_shop: { name: 'Actiscar Official' },
      booking_videos: [
        { platform_video_id: 'vid-2', title: 'Video Mai' },
      ],
      currency: 'VND',
    },
  ];

  const mockOrderSkus = [
    {
      order_id: 'ord-hang-1',
      order_time: '2026-11-15T10:00:00.000Z',
      video_id: 'vid-1',
      creator_username: 'lananh.review',
      product_id: 'prod-1',
      product_name: 'Kem tri nam Actiscar',
      sku_id: 'sku-1',
      quantity: 1,
      refunded_quantity: 0,
      price: 250000,
      currency: 'VND',
      settlement_status: 'SETTLED',
      sku_raw_data: { sku_name: 'Hop 30g', commission_rate: 10 },
      order_raw_data: { order_status: 'COMPLETED' },
      shop_name: 'Actiscar Official',
    },
    {
      order_id: 'ord-mai-1',
      order_time: '2026-11-16T10:00:00.000Z',
      video_id: 'vid-2',
      creator_username: 'ngocmai.daily',
      product_id: 'prod-2',
      product_name: 'Serum Actiscar',
      sku_id: 'sku-2',
      quantity: 2,
      refunded_quantity: 0,
      price: 350000,
      currency: 'VND',
      settlement_status: 'SETTLED',
      sku_raw_data: { sku_name: 'Chai 50ml', commission_rate: 12 },
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
    },
    session: {
      role: 'admin',
      sub: 1,
    },
  };

  let responseStatus = 200;
  const responseHeaders = {};
  let sentBody = null;

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
  assert.equal(responseHeaders['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok(responseHeaders['Content-Disposition'].includes('attachment; filename="don_hang_booking_2026-11.xlsx"'));
  assert.ok(Buffer.isBuffer(sentBody), 'Default export body must be a Buffer for Excel');

  const workbook = XLSX.read(sentBody, { type: 'buffer', cellStyles: true });
  assert.ok(workbook.SheetNames.includes('all'), 'Workbook must have "all" sheet');
  assert.ok(workbook.SheetNames.includes('Thanh Hằng'), 'Workbook must have "Thanh Hằng" sheet');
  assert.ok(workbook.SheetNames.includes('Mai'), 'Workbook must have "Mai" sheet');

  const allRows = XLSX.utils.sheet_to_json(workbook.Sheets['all'], { header: 1 });
  assert.equal(allRows.length, 3); // header + 2 order rows

  const hangRows = XLSX.utils.sheet_to_json(workbook.Sheets['Thanh Hằng'], { header: 1 });
  assert.equal(hangRows.length, 2); // header + 1 order row
  assert.equal(hangRows[1][0], 'ord-hang-1');

  const maiRows = XLSX.utils.sheet_to_json(workbook.Sheets['Mai'], { header: 1 });
  assert.equal(maiRows.length, 2); // header + 1 order row
  assert.equal(maiRows[1][0], 'ord-mai-1');

  // Verify column widths (!cols) are configured so Excel does not clip or show ###
  const allSheet = workbook.Sheets['all'];
  assert.ok(Array.isArray(allSheet['!cols']), 'allSheet must have column width definitions');
  assert.ok(allSheet['!cols'].length >= 20);
  assert.ok(allSheet['!cols'][0].wch >= 22, 'Order ID column width should be at least 22');

  // Verify Order ID and Video ID cells are strictly formatted as Text ('s')
  assert.equal(allSheet['A2'].t, 's', 'Order ID must have string type');
  assert.equal(allSheet['H2'].t, 's', 'Video ID must have string type');
  assert.equal(allSheet['A2'].v, 'ord-hang-1');
  assert.equal(allSheet['H2'].v, 'vid-1');
});

test('exportBookingOrders deduplicates duplicate orders, filters out pending statuses, and preserves decimal currency', async (t) => {
  const XLSX = require('xlsx');

  const mockBookings = [
    {
      id: 201,
      creator_name: 'Huong Ly',
      creator_username: 'huongly.beauty',
      staff: { name: 'Thanh Hằng', email: 'hang@yumnetwork.vn' },
      target_shop: { name: 'Actiscar Malaysia' },
      booking_videos: [
        { platform_video_id: 'vid-my-1', title: 'Video Malaysia' },
      ],
      currency: 'MYR',
    },
  ];

  const mockOrderSkus = [
    // Order 1 with 2 SKUs (should be combined into 1 unique order row with total GMV 25.50 * 2 + 10.25 = 61.25)
    {
      order_id: 'ord-multi-1',
      order_time: '2026-11-15T10:00:00.000Z',
      video_id: 'vid-my-1',
      creator_username: 'huongly.beauty',
      product_id: 'prod-1',
      product_name: 'Kem Actiscar',
      sku_id: 'sku-1',
      quantity: 2,
      refunded_quantity: 0,
      price: 25.50,
      currency: 'MYR',
      settlement_status: 'SETTLED',
      sku_raw_data: { sku_name: '30g', commission_rate: 10 },
      order_raw_data: { order_status: 'COMPLETED' },
      shop_name: 'Actiscar Malaysia',
    },
    {
      order_id: 'ord-multi-1',
      order_time: '2026-11-15T10:00:00.000Z',
      video_id: 'vid-my-1',
      creator_username: 'huongly.beauty',
      product_id: 'prod-2',
      product_name: 'Serum Actiscar',
      sku_id: 'sku-2',
      quantity: 1,
      refunded_quantity: 0,
      price: 10.25,
      currency: 'MYR',
      settlement_status: 'SETTLED',
      sku_raw_data: { sku_name: '50ml', commission_rate: 10 },
      order_raw_data: { order_status: 'COMPLETED' },
      shop_name: 'Actiscar Malaysia',
    },
    // Duplicate of Order 1 SKU 1 (exact duplicate record, must be discarded)
    {
      order_id: 'ord-multi-1',
      order_time: '2026-11-15T10:00:00.000Z',
      video_id: 'vid-my-1',
      creator_username: 'huongly.beauty',
      product_id: 'prod-1',
      product_name: 'Kem Actiscar',
      sku_id: 'sku-1',
      quantity: 2,
      refunded_quantity: 0,
      price: 25.50,
      currency: 'MYR',
      settlement_status: 'SETTLED',
      sku_raw_data: { sku_name: '30g', commission_rate: 10 },
      order_raw_data: { order_status: 'COMPLETED' },
      shop_name: 'Actiscar Malaysia',
    },
    // Order 2: Status DELIVERED (must be included)
    {
      order_id: 'ord-delivered-2',
      order_time: '2026-11-16T12:00:00.000Z',
      video_id: 'vid-my-1',
      creator_username: 'huongly.beauty',
      product_id: 'prod-1',
      product_name: 'Kem Actiscar',
      sku_id: 'sku-1',
      quantity: 1,
      refunded_quantity: 0,
      price: 51.68,
      currency: 'MYR',
      settlement_status: 'UNSETTLED',
      sku_raw_data: { sku_name: '30g', commission_rate: 10 },
      order_raw_data: { order_status: 'DELIVERED' },
      shop_name: 'Actiscar Malaysia',
    },
    // Order 3: Status CANCELLED (must be included)
    {
      order_id: 'ord-cancelled-3',
      order_time: '2026-11-16T14:00:00.000Z',
      video_id: 'vid-my-1',
      creator_username: 'huongly.beauty',
      product_id: 'prod-1',
      product_name: 'Kem Actiscar',
      sku_id: 'sku-1',
      quantity: 1,
      refunded_quantity: 0,
      price: 30.00,
      currency: 'MYR',
      settlement_status: 'UNSETTLED',
      sku_raw_data: { sku_name: '30g', commission_rate: 10 },
      order_raw_data: { order_status: 'CANCELLED' },
      shop_name: 'Actiscar Malaysia',
    },
    // Order 4: Status AWAITING_SHIPMENT (pending, must be EXCLUDED)
    {
      order_id: 'ord-pending-4',
      order_time: '2026-11-16T15:00:00.000Z',
      video_id: 'vid-my-1',
      creator_username: 'huongly.beauty',
      product_id: 'prod-1',
      product_name: 'Kem Actiscar',
      sku_id: 'sku-1',
      quantity: 1,
      refunded_quantity: 0,
      price: 99.00,
      currency: 'MYR',
      settlement_status: 'UNSETTLED',
      sku_raw_data: { sku_name: '30g', commission_rate: 10 },
      order_raw_data: { order_status: 'AWAITING_SHIPMENT' },
      shop_name: 'Actiscar Malaysia',
    },
    // Order 5: Status IN_TRANSIT (must be EXCLUDED)
    {
      order_id: 'ord-transit-5',
      order_time: '2026-11-16T16:00:00.000Z',
      video_id: 'vid-my-1',
      creator_username: 'huongly.beauty',
      product_id: 'prod-1',
      product_name: 'Kem Actiscar',
      sku_id: 'sku-1',
      quantity: 1,
      refunded_quantity: 0,
      price: 88.00,
      currency: 'MYR',
      settlement_status: 'UNSETTLED',
      sku_raw_data: { sku_name: '30g', commission_rate: 10 },
      order_raw_data: { order_status: 'IN_TRANSIT' },
      shop_name: 'Actiscar Malaysia',
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
    },
    session: {
      role: 'admin',
      sub: 1,
    },
  };

  let sentBody = null;
  const res = {
    status() { return res; },
    setHeader() { return res; },
    send(body) { sentBody = body; return res; },
    json(body) { sentBody = body; return res; },
  };

  await bookingEndpointService.exportBookingOrders(req, res);

  const workbook = XLSX.read(sentBody, { type: 'buffer', cellStyles: true, cellNF: true });
  const allSheet = workbook.Sheets['all'];
  const allRows = XLSX.utils.sheet_to_json(allSheet, { header: 1 });

  // Header row + exactly 3 unique orders (ord-multi-1, ord-delivered-2, ord-cancelled-3)
  // ord-pending-4 and ord-transit-5 must be excluded!
  assert.equal(allRows.length, 4, 'Expected header + 3 unique orders');

  const orderMultiRow = allRows.find((r) => r[0] === 'ord-multi-1');
  assert.ok(orderMultiRow, 'ord-multi-1 must be present');
  // Quantity must be 2 + 1 = 3
  assert.equal(orderMultiRow[13], 3, 'Combined quantity should be 3');
  // GMV must be 25.50 * 2 + 10.25 = 61.25 (unrounded!)
  assert.equal(orderMultiRow[16], 61.25, 'Combined GMV should be unrounded 61.25');
  assert.equal(orderMultiRow[18], 'Thành công (COMPLETED)');

  const orderDeliveredRow = allRows.find((r) => r[0] === 'ord-delivered-2');
  assert.ok(orderDeliveredRow, 'ord-delivered-2 must be present');
  assert.equal(orderDeliveredRow[15], 51.68, 'Price should be unrounded 51.68');
  assert.equal(orderDeliveredRow[16], 51.68, 'GMV should be unrounded 51.68');
  assert.equal(orderDeliveredRow[18], 'Đã giao (DELIVERED)');

  const orderCancelledRow = allRows.find((r) => r[0] === 'ord-cancelled-3');
  assert.ok(orderCancelledRow, 'ord-cancelled-3 must be present');
  assert.equal(orderCancelledRow[18], 'Đã hủy (CANCELLED)');

  // ord-pending-4 and ord-transit-5 should NOT exist
  assert.ok(!allRows.some((r) => r[0] === 'ord-pending-4'), 'ord-pending-4 must be excluded');
  assert.ok(!allRows.some((r) => r[0] === 'ord-transit-5'), 'ord-transit-5 must be excluded');
});
