const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { mockModule } = require('./helpers/mockModule');

const loadController = (t, models) => {
  const controllerPath = require.resolve('../src/controllers/scheduleController');
  const restoreModels = mockModule(require.resolve('../src/models'), { Video: { findAll: async () => [] }, ...models });
  const restoreService = mockModule(require.resolve('../src/services/scheduledJobService'), {});
  delete require.cache[controllerPath];
  t.after(() => { delete require.cache[controllerPath]; restoreService(); restoreModels(); });
  return require(controllerPath);
};
const response = () => ({ code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });

test('run monitor paginates metadata without returning all response bodies and aggregates request outcomes', async (t) => {
  let query;
  const controller = loadController(t, {
    ScheduledJobRun: { findByPk: async () => ({ id: '91', status: 'RETRY_PENDING' }) },
    ScheduledJobRunEvent: {
      findAll: async (options) => {
        if (options.group) return [{ status: 'SUCCEEDED', count: '3' }, { status: 'FAILED', count: '1' }, { status: 'RECEIVED', count: '1' }];
        query = options;
        return [{ id: '9007199254740995' }, { id: '9007199254740994' }, { id: '9007199254740993' }];
      },
      findOne: async () => ({ updated_at: '2026-09-08T10:00:00Z' }),
    },
  });
  const res = response();
  await controller.listRunEvents({ params: { runId: '91' }, query: { limit: '2', before_id: '9007199254740996', status: 'ERRORS', q: 'request_123' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.next_cursor, '9007199254740994');
  assert.equal(res.body.events.length, 2);
  assert.equal(res.body.stats.requests, 5);
  assert.equal(res.body.stats.failed, 1);
  assert.equal(res.body.stats.in_flight, 1);
  assert.deepEqual(query.attributes.exclude, ['request_data', 'response_data', 'response_headers']);
  assert.equal(query.where.id[Op.lt], '9007199254740996');
  assert.equal(query.where.run_id, '91');
  assert.ok(query.where[Op.or][0].request_id[Op.iLike].includes('request\\_123'));
});

test('event detail is scoped to the requested run and invalid cursors are rejected', async (t) => {
  let where;
  const controller = loadController(t, {
    ScheduledJobRunEvent: { findOne: async (options) => { where = options.where; return null; } },
  });
  const missing = response();
  await controller.getRunEvent({ params: { runId: '91', eventId: '81' } }, missing);
  assert.equal(missing.code, 404);
  assert.deepEqual(where, { id: '81', run_id: '91' });
  const invalid = response();
  await controller.listRunEvents({ params: { runId: '91' }, query: { before_id: '-4' } }, invalid);
  assert.equal(invalid.code, 400);
});

test('recent schedule runs are loaded in one bounded query for all jobs', async (t) => {
  const controller = loadController(t, { sequelize: {} });
  let queryCount = 0;
  let capturedSql;
  let capturedOptions;
  const expected = [{ id: '12', scheduled_job_id: 3, summary: { total: 4 } }];
  const database = {
    query: async (sql, options) => {
      queryCount += 1;
      capturedSql = sql;
      capturedOptions = options;
      return expected;
    },
  };

  const rows = await controller.findRecentRunsForJobs([3, 7, 9], database);

  assert.equal(queryCount, 1);
  assert.equal(rows, expected);
  assert.deepEqual(capturedOptions.replacements.jobIds, [3, 7, 9]);
  assert.match(capturedSql, /CROSS JOIN LATERAL/);
  assert.match(capturedSql, /LIMIT 30/);
  assert.match(capturedSql, /jsonb_array_elements/);

  assert.deepEqual(await controller.findRecentRunsForJobs([], database), []);
  assert.equal(queryCount, 1);
});


test('monitor resolves legacy channel IDs in one query without changing saved logs', async (t) => {
  const stored = { id: '91', summary: { results: [
    { channelId: 7, status: 'success', total: 0 }, { channelId: 8, status: 'failed' },
  ] } };
  let identityQueries = 0;
  const controller = loadController(t, {
    ScheduledJobRun: { findByPk: async () => stored },
    TikTokChannel: { findAll: async (options) => {
      identityQueries++;
      assert.deepEqual(options.where.id[Op.in], [7, 8]);
      return [{ id: 7, display_name: 'Actiscar Live', username: 'actiscar.live', avatar_url: '/avatar.jpg' }];
    } },
    ScheduledJobRunEvent: {
      findAll: async (options) => options.group ? [] : [{ id: '1', channel_id: 7 }],
      findOne: async () => null,
    },
  });
  const res = response();
  await controller.listRunEvents({ params: { runId: '91' }, query: {} }, res);
  assert.equal(res.code, 200);
  assert.equal(identityQueries, 1);
  assert.equal(res.body.run.summary.results[0].channel_name, 'Actiscar Live');
  assert.equal(res.body.run.summary.results[0].total, 0);
  assert.equal(res.body.events[0].channel_username, 'actiscar.live');
  assert.equal(res.body.run.summary.results[1].channelId, 8);
  assert.equal(stored.summary.results[0].channel_name, undefined);
});


test('video list is scoped to run/channel and paginated independently of global outcome counts', async (t) => {
  let listQuery;
  let countQuery;
  const controller = loadController(t, {
    ScheduledJobRun: { findByPk: async () => ({ id: '91' }) },
    ScheduledJobRunEvent: { findAll: async (options) => {
      if (options.group) { countQuery = options; return [{ module_type: 'CREATED', count: '3' }, { module_type: 'FAILED', count: '2' }]; }
      listQuery = options;
      return Array.from({ length: 51 }, (_, i) => ({ id: String(100 - i), response_data: { video_id: String(i) } }));
    } },
  });
  const res = response();
  await controller.listRunVideos({ params: { runId: '91' }, query: { channel_id: '7', outcome: 'FAILED', before_id: '110' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.videos.length, 50);
  assert.equal(res.body.next_cursor, '51');
  assert.deepEqual(res.body.stats, { total: 5, created: 3, updated: 0, failed: 2, received: 0 });
  assert.equal(listQuery.where.run_id, '91');
  assert.equal(listQuery.where.channel_id, 7);
  assert.equal(listQuery.where.event_type, 'VIDEO_SYNC');
  assert.equal(listQuery.where.module_type, 'FAILED');
  assert.equal(listQuery.where.id[Op.lt], '110');
  assert.equal(countQuery.where.module_type, undefined);
  for (const query of [{ channel_id: '-1' }, { channel_id: '7', outcome: 'BAD' }, { channel_id: '7', before_id: '-2' }]) {
    const invalid = response();
    await controller.listRunVideos({ params: { runId: '91' }, query }, invalid);
    assert.equal(invalid.code, 400);
  }
});


test('video list resolves usable thumbnails by channel/video ID while keeping log URLs redacted', async (t) => {
  const logged = { id: '12', response_data: { video_id: '123', thumbnail_url: 'https://cdn.test/cover?x-signature=[REDACTED]' } };
  let mediaQuery;
  const controller = loadController(t, {
    ScheduledJobRun: { findByPk: async () => ({ id: '91' }) },
    ScheduledJobRunEvent: { findAll: async (options) => options.group ? [] : [logged, { id: '11', response_data: { video_id: '456' } }] },
    Video: { findAll: async (options) => {
      mediaQuery = options;
      return [{ platform_video_id: '123', thumbnail_url: 'https://cdn.test/usable.jpg' }];
    } },
  });
  const res = response();
  await controller.listRunVideos({ params: { runId: '91' }, query: { channel_id: '7' } }, res);
  assert.equal(res.code, 200);
  assert.equal(mediaQuery.where.channel_id, 7);
  assert.deepEqual(mediaQuery.where.platform_video_id[Op.in], ['123', '456']);
  assert.equal(res.body.videos[0].thumbnail_url, 'https://cdn.test/usable.jpg');
  assert.equal(res.body.videos[0].response_data.thumbnail_url, logged.response_data.thumbnail_url);
  assert.equal(res.body.videos[1].thumbnail_url, null);
  assert.equal(logged.thumbnail_url, undefined);
});
