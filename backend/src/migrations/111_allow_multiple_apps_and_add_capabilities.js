const up = async ({ sequelize, transaction }) => {
  // 1. Drop the unique index that restricted one app per (app_type, region)
  await sequelize.query('DROP INDEX IF EXISTS tiktok_apps_app_type_region_uidx;', { transaction });

  // 2. Add non-unique index on (app_type, region) for fast candidate lookup
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_apps_app_type_region_idx
    ON tiktok_apps (app_type, region);
  `, { transaction });

  // 3. Ensure app_key is unique across all apps
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tiktok_apps_app_key_uidx
    ON tiktok_apps (app_key);
  `, { transaction });

  // 4. Add capabilities and declared_scopes columns (JSONB)
  await sequelize.query(`
    ALTER TABLE tiktok_apps
    ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE tiktok_apps
    ADD COLUMN IF NOT EXISTS declared_scopes JSONB NOT NULL DEFAULT '[]'::jsonb;
  `, { transaction });

  // 5. Seed default capabilities for existing apps
  await sequelize.query(`
    UPDATE tiktok_apps
    SET capabilities = CASE
      WHEN app_type = 'channel' THEN '["channel"]'::jsonb
      WHEN name ILIKE '%order%' OR name ILIKE '%oms%' THEN '["orders"]'::jsonb
      ELSE '["analytics", "compass", "affiliate", "orders"]'::jsonb
    END
    WHERE capabilities = '[]'::jsonb;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_apps DROP COLUMN IF EXISTS declared_scopes;
    ALTER TABLE tiktok_apps DROP COLUMN IF EXISTS capabilities;
    DROP INDEX IF EXISTS tiktok_apps_app_key_uidx;
    DROP INDEX IF EXISTS tiktok_apps_app_type_region_idx;
  `, { transaction });

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tiktok_apps_app_type_region_uidx
    ON tiktok_apps (app_type, region);
  `, { transaction });
};

module.exports = {
  name: '111_allow_multiple_apps_and_add_capabilities',
  up,
  down,
};

