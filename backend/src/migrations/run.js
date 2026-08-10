require('dotenv').config();

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const { QueryTypes } = require('sequelize');
const seedData = require('./002_seed_data');
const { sequelize } = require('../models');
const migrations = [
  require('./001_create_tables'),
  require('./003_add_tiktok_token_lifecycle'),
  require('./004_add_kpi_indexes'),
  require('./005_add_facebook_chatbot_tables'),
  require('./006_add_chatbot_settings'),
  require('./007_add_chatbot_message_profile_fields'),
  require('./008_add_facebook_user_avatar_url'),
  require('./009_add_facebook_page_avatar_url'),
  require('./010_drop_teams'),
  require('./011_create_bookings'),
  require('./012_create_tiktok_partner_authorizations'),
  require('./013_add_tiktok_partner_creator_metadata'),
  require('./013_unique_tiktok_partner_open_id'),
  require('./014_add_tiktok_partner_sync_result'),
  require('./015_create_tiktok_partner_sync_logs'),
  require('./016_add_unique_video_daily_stats'),
  require('./017_create_tiktok_shop_analytics'),
  require('./018_create_roles'),
  require('./019_add_user_avatar_url'),
  require('./020_add_koc_tiktok_channel_mapping'),
  require('./021_create_tiktok_creator_performance'),
  require('./022_add_creator_performance_profile'),
  require('./023_add_creator_performance_open_id'),
  require('./024_create_scheduled_jobs'),
  require('./025_create_tiktok_creator_profiles'),
  require('./026_create_tiktok_base_performance_snapshots'),
  require('./027_create_whatsapp_tables'),
  require('./028_create_tiktok_api_cooldowns'),
  require('./029_allow_booking_deadline_null'),
  require('./030_create_tiktok_marketplace_creator_details'),
  require('./031_create_tiktok_marketplace_search_snapshots'),
  require('./032_create_tiktok_marketplace_request_gates'),
  require('./033_create_tiktok_marketplace_discovery_store'),
  require('./034_add_creator_performance_full_metrics'),
  require('./035_create_tiktok_creator_contact_histories'),
  require('./036_allow_booking_target_creators'),
  require('./037_add_booking_timestamps'),
  require('./038_create_booking_evaluations'),
  require('./039_add_weekly_report_public_sharing'),
  require('./040_create_booking_video_performance'),
  require('./041_create_shop_video_catalog'),
  require('./042_improve_booking_evaluation_data'),
  require('./043_add_creator_performance_six_month_schedule'),
  require('./044_add_channel_content_attribution_rules'),
  require('./045_create_content_teams'),
  require('./046_add_marketplace_discovery_crawl_state'),
  require('./047_expand_video_title'),
  require('./048_backfill_marketplace_creator_profiles'),
  require('./049_add_marketplace_discovery_recovery_state'),
  require('./050_add_marketplace_discovery_segment_limits'),
  require('./051_cleanup_duplicate_video_indexes'),
  require('./052_create_tiktok_video_performance_exports'),
  require('./053_add_video_performance_schedule'),
  require('./054_merge_creator_performance_schedules'),
  require('./055_update_affiliate_video_schedule_periods'),
  require('./056_add_users_is_active'),
  require('./057_add_role_permissions'),
  require('./058_remove_chatbots_permission'),
  require('./059_remove_whatsapp'),
];

const createMigrationRunner = ({
  sequelizeInstance = sequelize,
  migrationsList = migrations,
  seed = seedData,
  fsModule = fs,
  pathModule = path,
  execFileFn = promisify(execFile),
} = {}) => {
  const createMigrationTable = () => sequelizeInstance.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

  const getDatabaseUrl = () => {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const required = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST'];
    if (required.some((key) => !process.env[key])) throw new Error('DATABASE_URL or DB_* variables are required for a backup.');
    const user = encodeURIComponent(process.env.DB_USER);
    const password = encodeURIComponent(process.env.DB_PASSWORD);
    return `postgresql://${user}:${password}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`;
  };

  const backup = async () => {
    const directory = pathModule.resolve(process.env.DB_BACKUP_DIR || pathModule.join(process.cwd(), 'backups'));
    await fsModule.mkdir(directory, { recursive: true });
    const filename = `report-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
    const output = pathModule.join(directory, filename);
    await execFileFn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', output, getDatabaseUrl()]);
    console.log(`Database backup created: ${output}`);
    return output;
  };

  const appliedMigrationNames = async () => {
    const rows = await sequelizeInstance.query('SELECT name FROM schema_migrations ORDER BY name ASC', { type: QueryTypes.SELECT });
    return new Set(rows.map((row) => row.name));
  };

  const migrate = async () => {
    await createMigrationTable();
    const applied = await appliedMigrationNames();
    for (const migration of migrationsList) {
      if (applied.has(migration.name)) continue;
      await sequelizeInstance.transaction(async (transaction) => {
        await migration.up({ sequelize: sequelizeInstance, transaction });
        await sequelizeInstance.query('INSERT INTO schema_migrations (name) VALUES (:name)', {
          replacements: { name: migration.name }, transaction,
        });
      });
      console.log(`Applied migration: ${migration.name}`);
    }
  };

  const rollback = async () => {
    await createMigrationTable();
    const rows = await sequelizeInstance.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1', { type: QueryTypes.SELECT });
    if (!rows.length) {
      console.log('No migration to roll back.');
      return;
    }
    const migration = migrationsList.find((item) => item.name === rows[0].name);
    if (!migration) throw new Error(`Migration ${rows[0].name} is not available in this release.`);
    await sequelizeInstance.transaction(async (transaction) => {
      await migration.down({ sequelize: sequelizeInstance, transaction });
      await sequelizeInstance.query('DELETE FROM schema_migrations WHERE name = :name', {
        replacements: { name: migration.name }, transaction,
      });
    });
    console.log(`Rolled back migration: ${migration.name}`);
  };

  const rollbackAll = async () => {
    while (true) {
      const rows = await sequelizeInstance.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1', { type: QueryTypes.SELECT });
      if (!rows.length) return;
      await rollback();
    }
  };

  const tasks = {
    backup,
    migrate,
    rollback,
    seed: async () => { await migrate(); await seed.up(); },
    init: async () => { await migrate(); await seed.up(); },
    reset: async () => { await seed.down(); await rollbackAll(); },
  };

  return {
    backup,
    migrate,
    rollback,
    rollbackAll,
    close: () => sequelizeInstance.close(),
    tasks,
  };
};

const runTask = async ({ taskName = process.argv[2] || 'migrate', skipBackup = process.argv.includes('--no-backup'), runner = createMigrationRunner() } = {}) => {
  const task = runner.tasks[taskName];
  if (!task) {
    throw new Error(`Unknown migration task: ${taskName}`);
  }

  try {
    if (!skipBackup && taskName !== 'backup') await runner.backup();
    await task();
  } finally {
    if (typeof runner.close === 'function') {
      await runner.close();
    }
  }
};

if (require.main === module) {
  runTask().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createMigrationRunner, runTask };
