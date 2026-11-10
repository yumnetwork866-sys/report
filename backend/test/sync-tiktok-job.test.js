const test = require('node:test');
const assert = require('node:assert/strict');

const { mockModule } = require('./helpers/mockModule');

const modelsPath = require.resolve('../src/models');
const channelControllerPath = require.resolve('../src/controllers/channelController');

test('TikTok sync job processes channels with mocked dependencies', async (t) => {
  process.env.TIKTOK_SYNC_CONCURRENCY = '2';

  const channels = [
    { id: 11, sync_source: 'oauth', display_name: 'Channel Eleven', username: 'eleven', avatar_url: '/eleven.jpg' },
    { id: 12, sync_source: 'oauth' },
  ];

  let active = 0;
  let maxActive = 0;
  const syncCalls = [];
  const restoreModels = mockModule(modelsPath, {
    sequelize: {
      async query(sql) {
        if (sql.includes('pg_try_advisory_xact_lock')) {
          return [{ acquired: true }];
        }
        return [];
      },
      async transaction(fn) {
        return fn({ transaction: true });
      },
      async close() {
        return undefined;
      },
    },
    TikTokChannel: {
      async findAll(options) {
        assert.deepEqual(options.where, { sync_source: 'oauth' });
        return channels;
      },
    },
  });

  const restoreController = mockModule(channelControllerPath, {
    syncTiktokChannel: async (channel) => {
      syncCalls.push(channel.id);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      if (channel.id === 12) throw new Error('Token expired');
      return { total: channel.id * 10, profileUpdated: true };
    },
  });

  t.after(() => {
    restoreController();
    restoreModels();
    delete process.env.TIKTOK_SYNC_CONCURRENCY;
  });

  const { run } = require('../src/jobs/syncTiktokChannels');

  const summary = await run({ closeConnection: false });
  const success = summary.results.find((item) => item.channelId === 11);
  assert.equal(success.channel_name, 'Channel Eleven');
  assert.equal(success.channel_username, 'eleven');
  assert.equal(success.total, 110);
  assert.equal(success.profile_updated, true);
  assert.ok(success.duration_ms >= 0);
  assert.equal(summary.results.find((item) => item.channelId === 12).error, 'Token expired');
  assert.equal(summary.failed, 1);

  assert.deepEqual(syncCalls.sort(), [11, 12]);
  assert.equal(maxActive >= 2, true);
  assert.equal(process.exitCode, undefined);
});

