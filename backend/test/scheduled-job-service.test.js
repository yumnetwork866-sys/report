const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeRunTimes,
  assertTimezone,
  localScheduleParts,
  latestScheduledSlot,
  sixMonthSnapshotIsFresh,
  creatorDailyBackfillDates,
  assertRequestedCreatorPerformanceSynced,
  catchUpScheduledJobs,
} = require('../src/services/scheduledJobService');

test('creator daily backfill selects only the newest missing historical date', () => {
  const dates = creatorDailyBackfillDates('2026-08-07', [
    '2026-08-06',
    '2026-08-04',
  ]);

  assert.deepEqual(dates, ['2026-08-05']);
});

test('Creator Performance run fails when it reuses fallback data instead of the requested day', () => {
  const fallbackExport = {
    window_type: 'PAST_7_DAYS',
    requested_end_day: 20260816,
    effective_end_day: 20260809,
    fallback_days: 7,
    export_id: 153,
  };
  assert.throws(
    () => assertRequestedCreatorPerformanceSynced([fallbackExport]),
    (error) => error.code === 'CREATOR_PERFORMANCE_FALLBACK'
      && error.message.includes('requested 20260816, used 20260809'),
  );
});

test('Creator Performance run accepts exports for the requested day', () => {
  assert.doesNotThrow(() => assertRequestedCreatorPerformanceSynced([{
    window_type: 'PAST_7_DAYS',
    requested_end_day: 20260816,
    effective_end_day: 20260816,
    fallback_days: 0,
    export_id: 180,
  }]));
});

test('180-day creator aggregate refreshes only after 30 days', () => {
  assert.equal(sixMonthSnapshotIsFresh('2026-07-31', 20260801), true);
  assert.equal(sixMonthSnapshotIsFresh('2026-07-03', 20260801), true);
  assert.equal(sixMonthSnapshotIsFresh('2026-07-02', 20260801), false);
  assert.equal(sixMonthSnapshotIsFresh('', 20260801), false);
});

test('schedule run times are validated, deduplicated and sorted', () => {
  assert.deepEqual(normalizeRunTimes(['14:00', '02:00', '14:00']), ['02:00', '14:00']);
  assert.throws(() => normalizeRunTimes([]), /between 1 and 6/);
  assert.throws(() => normalizeRunTimes(['25:00']), /HH:mm/);
  assert.throws(() => normalizeRunTimes(Array.from({ length: 7 }, (_, index) => `0${index}:00`)), /between 1 and 6/);
});

test('schedule timezone and local minute are resolved correctly', () => {
  assert.equal(assertTimezone('Asia/Ho_Chi_Minh'), 'Asia/Ho_Chi_Minh');
  assert.throws(() => assertTimezone('Invalid/Timezone'), /invalid/);
  assert.deepEqual(localScheduleParts(new Date('2026-07-17T01:30:00.000Z'), 'Asia/Ho_Chi_Minh'), {
    date: '2026-07-17',
    time: '08:30',
  });
  assert.deepEqual(localScheduleParts(new Date('2026-07-17T01:30:00.000Z'), 'Asia/Kuala_Lumpur'), {
    date: '2026-07-17',
    time: '09:30',
  });
});

test('latest scheduled slot uses the most recent local run time', () => {
  const job = {
    timezone: 'Asia/Kuala_Lumpur',
    run_times: ['04:00'],
  };
  const afterSchedule = latestScheduledSlot(job, new Date('2026-07-22T03:00:00.000Z'));
  assert.equal(afterSchedule.date, '2026-07-22');
  assert.equal(afterSchedule.time, '04:00');
  assert.equal(afterSchedule.scheduledAt.toISOString(), '2026-07-21T20:00:00.000Z');

  const beforeSchedule = latestScheduledSlot(job, new Date('2026-07-21T19:00:00.000Z'));
  assert.equal(beforeSchedule.date, '2026-07-21');
  assert.equal(beforeSchedule.time, '04:00');
  assert.equal(beforeSchedule.scheduledAt.toISOString(), '2026-07-20T20:00:00.000Z');
});

test('startup catch-up queues an overdue job with an idempotent key', async () => {
  const job = {
    id: 1,
    job_key: 'tiktok_creator_performance',
    timezone: 'Asia/Kuala_Lumpur',
    run_times: ['04:00'],
  };
  const queued = [];
  const results = await catchUpScheduledJobs(new Date('2026-07-22T03:00:00.000Z'), {
    JobModel: { async findAll() { return [job]; } },
    RunModel: { async findOne() { return null; } },
    enqueue: async (queuedJob, options) => {
      queued.push({ queuedJob, options });
      return { run: { id: 17 }, created: true };
    },
  });

  assert.equal(queued.length, 1);
  assert.equal(queued[0].options.triggerType, 'CATCH_UP');
  assert.equal(queued[0].options.scheduledKey, 'CATCH_UP:2026-07-22:04:00:2026-07-22');
  assert.deepEqual(results, [{
    job_key: 'tiktok_creator_performance',
    caught_up: true,
    reason: 'overdue',
    run_id: 17,
  }]);
});

test('startup catch-up skips a job already completed after its latest slot', async () => {
  let enqueueCalls = 0;
  const job = {
    id: 1,
    job_key: 'tiktok_creator_performance',
    timezone: 'Asia/Kuala_Lumpur',
    run_times: ['04:00'],
  };
  const results = await catchUpScheduledJobs(new Date('2026-07-22T03:00:00.000Z'), {
    JobModel: { async findAll() { return [job]; } },
    RunModel: { async findOne() { return { id: 16, status: 'SUCCEEDED' }; } },
    enqueue: async () => { enqueueCalls += 1; },
  });

  assert.equal(enqueueCalls, 0);
  assert.deepEqual(results, [{
    job_key: 'tiktok_creator_performance',
    caught_up: false,
    reason: 'already_current',
  }]);
});
