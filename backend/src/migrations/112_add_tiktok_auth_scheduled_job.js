const up = async ({ sequelize: directSequelize, context, transaction }) => {
  const sequelize = directSequelize || context;
  await sequelize.query(`
    INSERT INTO scheduled_jobs (job_key, name, description, enabled, timezone, run_times, created_at, updated_at)
    VALUES (
      'tiktok_auth',
      'Xác thực & Kết nối',
      'Lịch sử ủy quyền OAuth Shop, Channel, KOC và làm mới Token.',
      false,
      'Asia/Ho_Chi_Minh',
      '[]'::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (job_key) DO NOTHING;
  `);

  const [authJobs] = await sequelize.query(`SELECT id FROM scheduled_jobs WHERE job_key = 'tiktok_auth' LIMIT 1`);
  const authJobId = authJobs[0]?.id;
  if (!authJobId) return;

  // Backfill existing shop authorizations as initial history runs
  try {
    const [shops] = await sequelize.query(`
      SELECT s.id, s.name, s.code, s.region,
             COALESCE(s.order_authorization_id, s.authorization_id) as auth_id,
             a.connected_at, a.updated_at, a.granted_scopes, a.app_type, a.app_id
      FROM tiktok_shops s
      LEFT JOIN tiktok_shop_authorizations a ON (s.authorization_id = a.id OR s.order_authorization_id = a.id)
      ORDER BY s.id ASC
    `);

    for (const shop of shops) {
      const scheduledKey = `OAUTH:HISTORICAL:SHOP:${shop.id}`;
      const connectedAt = shop.connected_at || shop.updated_at || new Date();
      const scopes = Array.isArray(shop.granted_scopes)
        ? shop.granted_scopes
        : (typeof shop.granted_scopes === 'string' ? JSON.parse(shop.granted_scopes || '[]') : []);

      const summary = {
        total: 1,
        succeeded: 1,
        failed: 0,
        auth_type: shop.app_type || 'partner',
        app_id: shop.app_id,
        results: [{
          status: 'SUCCEEDED',
          shop_id: shop.id,
          shop_name: shop.name,
          shop_code: shop.code,
          scopes,
          auth_type: shop.app_type || 'partner',
        }],
      };

      await sequelize.query(`
        INSERT INTO scheduled_job_runs (
          scheduled_job_id, trigger_type, scheduled_key, status, started_at, completed_at, summary, error
        )
        VALUES (
          :authJobId,
          'OAUTH',
          :scheduledKey,
          'SUCCEEDED',
          :connectedAt,
          :connectedAt,
          :summary::jsonb,
          NULL
        )
        ON CONFLICT (scheduled_job_id, scheduled_key) DO NOTHING;
      `, {
        replacements: {
          authJobId,
          scheduledKey,
          connectedAt,
          summary: JSON.stringify(summary),
        },
      });
    }
  } catch (err) {
    console.warn('[112_add_tiktok_auth_scheduled_job] Shop backfill skipped:', err.message);
  }

  // Backfill existing channels as initial history runs
  try {
    const [channels] = await sequelize.query(`
      SELECT id, display_name, username, last_sync_at, app_id
      FROM tiktok_channels
      ORDER BY id ASC
    `);

    for (const channel of channels) {
      const scheduledKey = `OAUTH:HISTORICAL:CHANNEL:${channel.id}`;
      const syncAt = channel.last_sync_at || new Date();
      const summary = {
        total: 1,
        succeeded: 1,
        failed: 0,
        auth_type: 'channel',
        app_id: channel.app_id,
        results: [{
          status: 'SUCCEEDED',
          channel_id: channel.id,
          channel_name: channel.display_name || channel.username,
          auth_type: 'channel',
        }],
      };

      await sequelize.query(`
        INSERT INTO scheduled_job_runs (
          scheduled_job_id, trigger_type, scheduled_key, status, started_at, completed_at, summary, error
        )
        VALUES (
          :authJobId,
          'OAUTH',
          :scheduledKey,
          'SUCCEEDED',
          :syncAt,
          :syncAt,
          :summary::jsonb,
          NULL
        )
        ON CONFLICT (scheduled_job_id, scheduled_key) DO NOTHING;
      `, {
        replacements: {
          authJobId,
          scheduledKey,
          syncAt,
          summary: JSON.stringify(summary),
        },
      });
    }
  } catch (err) {
    console.warn('[112_add_tiktok_auth_scheduled_job] Channel backfill skipped:', err.message);
  }
};

const down = async ({ sequelize: directSequelize, context }) => {
  const sequelize = directSequelize || context;
  await sequelize.query(`DELETE FROM scheduled_jobs WHERE job_key = 'tiktok_auth';`);
};

module.exports = { name: '112_add_tiktok_auth_scheduled_job', up, down };

