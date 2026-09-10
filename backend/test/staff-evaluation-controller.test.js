const assert = require('node:assert/strict');
const test = require('node:test');
const { mockModule } = require('./helpers/mockModule');

const loadHelpers = (t) => {
  const controllerPath = require.resolve('../src/controllers/staffEvaluationController');
  const restore = mockModule(require.resolve('../src/models'), {
    Booking: {}, BookingVideo: {}, BookingVideoPerformanceSnapshot: {}, TikTokShop: {}, User: {}, sequelize: {},
  });
  delete require.cache[controllerPath];
  t.after(() => { delete require.cache[controllerPath]; restore(); });
  return require(controllerPath).__test;
};

const booking = (overrides = {}) => ({
  id: 1,
  staff_id: 7,
  staff: { name: 'An', email: 'an@example.test' },
  creator_name: 'Creator A',
  target_shop_id: 2,
  target_shop: { id: 2, name: 'Shop A' },
  created_at: '2026-01-01T00:00:00.000Z',
  deadline: '2026-03-15',
  total_cost: 100,
  currency: 'MYR',
  evaluation_snapshot: { product_ids: ['product-a'] },
  booking_videos: [{
    platform_video_id: 'video-a',
    posted_at: '2026-03-14T10:00:00.000Z',
    performance_snapshots: [{ snapshot_date: '2026-03-20', views: 1200 }],
  }],
  ...overrides,
});

test('staff evaluation measures completion as of the report end and scopes GMV to booking products', (t) => {
  const { evaluateStaffBookings, summarizeStaff } = loadHelpers(t);
  const evaluated = evaluateStaffBookings({
    bookings: [booking()],
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    orderRows: [
      { shop_id: 2, video_id: 'video-a', product_id: 'product-a', order_id: 'order-1', currency: 'MYR', gmv: '350' },
      { shop_id: 2, video_id: 'video-a', product_id: 'other', order_id: 'order-2', currency: 'MYR', gmv: '900' },
    ],
  });
  const staff = evaluated.staffRankings[0];
  assert.equal(staff.due_deliverables, 1);
  assert.equal(staff.completed_deliverables, 1);
  assert.equal(staff.on_time_deliverables, 1);
  assert.equal(staff.videos_aired_in_period, 1);
  assert.equal(staff.period_orders, 1);
  assert.deepEqual(staff.period_gmv_by_currency, [{ currency: 'MYR', amount: 350 }]);
  assert.equal(summarizeStaff([staff]).completion_rate, 100);
});

test('staff evaluation uses report end for overdue state and does not count later videos', (t) => {
  const { evaluateStaffBookings } = loadHelpers(t);
  const evaluated = evaluateStaffBookings({
    bookings: [booking({ booking_videos: [{ platform_video_id: 'video-a', posted_at: '2026-04-02T00:00:00.000Z' }] })],
    startDate: '2026-03-01',
    endDate: '2026-03-31',
  });
  const staff = evaluated.staffRankings[0];
  assert.equal(staff.completed_deliverables, 0);
  assert.equal(staff.overdue_deliverables, 1);
  assert.equal(staff.avg_overdue_days, 16);
  assert.equal(staff.videos_aired_in_period, 0);
});

test('videos linked to multiple bookings are excluded instead of inflating staff KPIs', (t) => {
  const { evaluateStaffBookings } = loadHelpers(t);
  const evaluated = evaluateStaffBookings({
    bookings: [booking(), booking({ id: 2, staff_id: 8, staff: { name: 'Binh' } })],
    startDate: '2026-03-01',
    endDate: '2026-03-31',
  });
  assert.equal(evaluated.dataQuality.duplicate_video_count, 1);
  assert.equal(evaluated.staffRankings.reduce((sum, staff) => sum + staff.videos_aired_in_period, 0), 0);
  assert.equal(evaluated.staffRankings.reduce((sum, staff) => sum + staff.completed_deliverables, 0), 0);
});

test('staff with no due deliverable receives no artificial perfect rate', (t) => {
  const { evaluateStaffBookings } = loadHelpers(t);
  const evaluated = evaluateStaffBookings({
    bookings: [booking({ created_at: '2026-03-05T00:00:00.000Z', deadline: null, booking_videos: [] })],
    startDate: '2026-03-01',
    endDate: '2026-03-31',
  });
  assert.equal(evaluated.staffRankings[0].completion_rate, null);
  assert.equal(evaluated.staffRankings[0].on_time_rate, null);
});
