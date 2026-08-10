const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { mockModule } = require('./helpers/mockModule');

const modelsPath = require.resolve('../src/models');
const seedPath = require.resolve('../src/migrations/002_seed_data');
const defaultMigrationNames = [
  '001_create_tables',
  '003_add_tiktok_token_lifecycle',
  '004_add_kpi_indexes',
  '005_add_facebook_chatbot_tables',
  '006_add_chatbot_settings',
  '007_add_chatbot_message_profile_fields',
  '008_add_facebook_user_avatar_url',
  '009_add_facebook_page_avatar_url',
  '010_drop_teams',
  '011_create_bookings',
  '012_create_tiktok_partner_authorizations',
  '013_add_tiktok_partner_creator_metadata',
  '013_unique_tiktok_partner_open_id',
  '014_add_tiktok_partner_sync_result',
  '015_create_tiktok_partner_sync_logs',
  '016_add_unique_video_daily_stats',
  '017_create_tiktok_shop_analytics',
  '018_create_roles',
  '019_add_user_avatar_url',
  '020_add_koc_tiktok_channel_mapping',
  '021_create_tiktok_creator_performance',
  '022_add_creator_performance_profile',
  '023_add_creator_performance_open_id',
  '024_create_scheduled_jobs',
  '025_create_tiktok_creator_profiles',
  '026_create_tiktok_base_performance_snapshots',
  '027_create_whatsapp_tables',
  '028_create_tiktok_api_cooldowns',
  '029_allow_booking_deadline_null',
  '030_create_tiktok_marketplace_creator_details',
  '031_create_tiktok_marketplace_search_snapshots',
  '032_create_tiktok_marketplace_request_gates',
  '033_create_tiktok_marketplace_discovery_store',
  '034_add_creator_performance_full_metrics',
  '035_create_tiktok_creator_contact_histories',
  '036_allow_booking_target_creators',
  '037_add_booking_timestamps',
  '038_create_booking_evaluations',
  '039_add_weekly_report_public_sharing',
  '040_create_booking_video_performance',
  '041_create_shop_video_catalog',
  '042_improve_booking_evaluation_data',
  '043_add_creator_performance_six_month_schedule',
  '044_add_channel_content_attribution_rules',
  '045_create_content_teams',
  '046_add_marketplace_discovery_crawl_state',
  '047_expand_video_title',
  '048_backfill_marketplace_creator_profiles',
  '049_add_marketplace_discovery_recovery_state',
  '050_add_marketplace_discovery_segment_limits',
  '051_cleanup_duplicate_video_indexes',
  '052_create_tiktok_video_performance_exports',
  '053_add_video_performance_schedule',
  '054_merge_creator_performance_schedules',
  '055_update_affiliate_video_schedule_periods',
  '056_add_users_is_active',
  '057_add_role_permissions',
  '058_remove_chatbots_permission',
  '059_remove_whatsapp',
];
const migrationPaths = defaultMigrationNames
  .map((name) => require.resolve(`../src/migrations/${name}`));

const makeMigration = (name) => ({
  name,
  up: async () => {},
  down: async () => {},
});

test('migration runner backs up, applies, and rolls back migrations', async (t) => {
  const restores = [
    mockModule(modelsPath, { sequelize: {} }),
    mockModule(seedPath, { up: async () => {}, down: async () => {} }),
    ...migrationPaths.map((modulePath) => mockModule(modulePath, makeMigration(path.basename(modulePath, '.js')))),
  ];

  t.after(() => {
    restores.reverse().forEach((restore) => restore());
  });

  const { createMigrationRunner } = require('../src/migrations/run');

  const applied = new Set(['001_create_tables']);
  const queryLog = [];
  const fakeSequelize = {
    async query(sql, options = {}) {
      queryLog.push(sql);

      if (sql.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {
        return [];
      }

      if (sql.startsWith('SELECT name FROM schema_migrations ORDER BY name ASC')) {
        return Array.from(applied).sort().map((name) => ({ name }));
      }

      if (sql.startsWith('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1')) {
        const rows = Array.from(applied).sort().reverse().slice(0, 1).map((name) => ({ name }));
        return rows;
      }

      if (sql.startsWith('INSERT INTO schema_migrations')) {
        applied.add(options.replacements.name);
        return [];
      }

      if (sql.startsWith('DELETE FROM schema_migrations')) {
        applied.delete(options.replacements.name);
        return [];
      }

      return [];
    },
    async transaction(fn) {
      return fn({ tx: true });
    },
    async close() {},
  };

  const backupCalls = [];
  const runner = createMigrationRunner({
    sequelizeInstance: fakeSequelize,
    migrationsList: [
      makeMigration('001_create_tables'),
      makeMigration('003_add_tiktok_token_lifecycle'),
      makeMigration('004_add_kpi_indexes'),
      makeMigration('005_add_facebook_chatbot_tables'),
      makeMigration('006_add_chatbot_settings'),
    ],
    seed: { up: async () => {}, down: async () => {} },
    fsModule: {
      async mkdir() {},
    },
    pathModule: path,
    execFileFn: async (cmd, args) => {
      backupCalls.push({ cmd, args });
    },
  });

  const backupPath = await runner.backup();
  assert.equal(backupCalls[0].cmd, 'pg_dump');
  assert.match(backupCalls[0].args.join(' '), /--format=custom/);
  assert.match(backupPath, /\.dump$/);

  await runner.migrate();
  assert.deepEqual(Array.from(applied).sort(), [
    '001_create_tables',
    '003_add_tiktok_token_lifecycle',
    '004_add_kpi_indexes',
    '005_add_facebook_chatbot_tables',
    '006_add_chatbot_settings',
  ]);

  await runner.rollback();
  assert.deepEqual(Array.from(applied).sort(), [
    '001_create_tables',
    '003_add_tiktok_token_lifecycle',
    '004_add_kpi_indexes',
    '005_add_facebook_chatbot_tables',
  ]);

  const defaultRunner = createMigrationRunner({
    sequelizeInstance: fakeSequelize,
    seed: { up: async () => {}, down: async () => {} },
  });
  await defaultRunner.migrate();
  assert.deepEqual(Array.from(applied).sort(), defaultMigrationNames.slice().sort());

  assert.ok(queryLog.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')));
  assert.ok(queryLog.some((sql) => sql.startsWith('INSERT INTO schema_migrations')));
  assert.ok(queryLog.some((sql) => sql.startsWith('DELETE FROM schema_migrations')));
});
