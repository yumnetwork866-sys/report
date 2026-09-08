const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { mockModule } = require('./helpers/mockModule');

const loadController = (t, models) => {
  const controllerPath = require.resolve('../src/controllers/scheduleController');
  const restoreModels = mockModule(require.resolve('../src/models'), models);
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
