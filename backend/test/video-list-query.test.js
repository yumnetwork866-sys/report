const assert = require('node:assert/strict');
const test = require('node:test');
const { Op } = require('sequelize');

const { videoListOptions } = require('../src/controllers/videoController');
const { dashboardFilters } = require('../src/controllers/dashboardController');

test('video list query applies bounded pagination and supported filters', () => {
  const options = videoListOptions({
    page: '3',
    page_size: '500',
    channel_id: '7',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
  });

  assert.equal(options.page, 3);
  assert.equal(options.pageSize, 100);
  assert.equal(options.where.channel_id, 7);
  assert.equal(options.where.published_at[Op.gte].toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal(options.where.published_at[Op.lt].toISOString(), '2026-08-01T00:00:00.000Z');
});

test('dashboard query only accepts safe channel, date, and metric values', () => {
  assert.deepEqual(dashboardFilters({
    channel_id: '9',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    user_id: '12',
    metric: 'shares',
    top_metric: 'likes',
  }), {
    channelId: 9,
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    userId: 12,
    metric: 'shares',
    topMetric: 'likes',
    page: 1,
    pageSize: 20,
    search: '',
    sortBy: 'published_at',
    sortDirection: 'desc',
  });

  assert.deepEqual(dashboardFilters({
    channel_id: 'invalid',
    start_date: 'yesterday',
    user_id: '-4',
    metric: 'DROP TABLE videos',
    top_metric: 'sales.gross_gmv; DROP TABLE videos',
  }), {
    channelId: null,
    startDate: null,
    endDate: null,
    userId: null,
    metric: 'views',
    topMetric: 'gmv',
    page: 1,
    pageSize: 20,
    search: '',
    sortBy: 'published_at',
    sortDirection: 'desc',
  });
});

test('dashboard video query accepts bounded search and allowlisted sorting', () => {
  const filters = dashboardFilters({
    search: '  #summer  ',
    sort_by: 'gmv',
    sort_direction: 'asc',
  });
  assert.equal(filters.search, '#summer');
  assert.equal(filters.sortBy, 'gmv');
  assert.equal(filters.sortDirection, 'asc');

  const unsafe = dashboardFilters({ sort_by: 'v.id; DROP TABLE videos', sort_direction: 'sideways' });
  assert.equal(unsafe.sortBy, 'published_at');
  assert.equal(unsafe.sortDirection, 'desc');
});
