const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModule } = require('./helpers/mockModule');
const { withMonitorContext } = require('../src/services/scheduledRunMonitorService');

const loadSync = (t, { failVideo, failPage = false } = {}) => {
  const path = require.resolve('../src/controllers/channelController');
  const changes = [];
  const restores = [
    mockModule(require.resolve('../src/models'), {
      Video: {
        findOrCreate: async ({ where }) => {
          if (where.platform_video_id === failVideo) throw new Error('Database save failed');
          return [{ id: where.platform_video_id, update: async () => {} }, where.platform_video_id === '101'];
        },
        update: async () => [0],
      },
      VideoDailyStats: { upsert: async () => {} },
    }),
    mockModule(require.resolve('../src/lib/tokenEncryption'), { decryptToken: () => 'test-access-token' }),
    mockModule(require.resolve('../src/services/tiktokAppService'), { getAppCredentials: () => null }),
    mockModule(require.resolve('../src/lib/redis'), { delByPattern: async () => {} }),
  ];
  const originalFetch = global.fetch;
  let page = 0;
  global.fetch = async (url) => {
    if (String(url).includes('/video/list/')) {
      page++;
      if (failPage && page === 2) throw new Error('Next page network error');
      return new Response(JSON.stringify({ data: {
        videos: ['101', '102', '103', '104'].map((id) => ({ id, title: `Video ${id}`, cover_image_url: `https://images.test/${id}.jpg`, share_url: `https://www.tiktok.com/@demo/video/${id}` })),
        has_more: failPage, ...(failPage ? { cursor: 'next' } : {}),
      } }));
    }
    return new Response(JSON.stringify({ data: { user: { display_name: 'Demo' } } }));
  };
  delete require.cache[path];
  const sync = require(path).syncTiktokChannel;
  t.after(() => { global.fetch = originalFetch; delete require.cache[path]; restores.reverse().forEach((restore) => restore()); });
  const channel = { id: 7, username: 'demo', access_token_encrypted: 'encrypted', token_expires_at: new Date(Date.now() + 3600000), update: async (fields) => changes.push(fields) };
  const rows = new Map();
  const writer = async (fields, id) => {
    const key = id || String(rows.size + 1);
    rows.set(key, { ...rows.get(key), ...fields, id: key });
    return key;
  };
  return { run: () => withMonitorContext({ run_id: '91', channel_id: 7, writer }, () => sync(channel)), rows, changes };
};

test('channel run records video snapshots and distinguishes creates from updates', async (t) => {
  const fixture = loadSync(t);
  const summary = await fixture.run();
  assert.equal(summary.created, 1);
  assert.equal(summary.updated, 3);
  const videos = [...fixture.rows.values()].filter((row) => row.event_type === 'VIDEO_SYNC');
  assert.equal(videos.length, 4);
  assert.equal(videos[0].response_data.video_id, '101');
  assert.equal(videos[0].response_data.title, 'Video 101');
  assert.equal(videos[0].module_type, 'CREATED');
  assert.equal(videos[1].module_type, 'UPDATED');
  assert.ok(videos.every((row) => row.status === 'SUCCEEDED' && row.completed_at && row.channel_id === 7 && row.run_id === '91'));
});

test('failed video does not erase fetched videos that remain unprocessed', async (t) => {
  const fixture = loadSync(t, { failVideo: '103' });
  await assert.rejects(fixture.run(), (error) => {
    assert.deepEqual(error.videoSyncSummary, { total: 4, created: 1, updated: 1, video_failed: 1 });
    return true;
  });
  const videos = [...fixture.rows.values()].filter((row) => row.event_type === 'VIDEO_SYNC');
  assert.deepEqual(videos.map((row) => row.module_type), ['CREATED', 'UPDATED', 'FAILED', 'RECEIVED']);
  assert.equal(videos[2].message, 'Database save failed');
  assert.equal(videos[3].completed_at, null);
});

test('later API failure preserves counts and results for earlier pages', async (t) => {
  const fixture = loadSync(t, { failPage: true });
  await assert.rejects(fixture.run(), (error) => {
    assert.equal(error.videoSyncSummary.total, 4);
    assert.equal(error.videoSyncSummary.created, 1);
    assert.equal(error.videoSyncSummary.updated, 3);
    return true;
  });
  assert.equal([...fixture.rows.values()].filter((row) => row.event_type === 'VIDEO_SYNC').length, 4);
});
