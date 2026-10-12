const { ALL_PERMISSIONS, LEGACY_PERMISSION_MAP } = require('../lib/permissions');

const replacements = {
  allPermissions: JSON.stringify(ALL_PERMISSIONS),
  reportsPermissions: JSON.stringify(LEGACY_PERMISSION_MAP.reports),
  tiktokPermissions: JSON.stringify(LEGACY_PERMISSION_MAP.tiktok),
  usersPermissions: JSON.stringify(LEGACY_PERMISSION_MAP.users),
};
const containsAny = (permissions) => permissions.map((permission) => `permissions ? '${permission}'`).join(' OR ');

const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE roles
    SET permissions = CASE
      WHEN key = 'admin' THEN CAST(:allPermissions AS jsonb)
      ELSE (
        SELECT COALESCE(jsonb_agg(DISTINCT permission), '[]'::jsonb)
        FROM jsonb_array_elements_text(
          (permissions - 'reports' - 'tiktok' - 'users')
          || CASE WHEN permissions ? 'reports' THEN CAST(:reportsPermissions AS jsonb) ELSE '[]'::jsonb END
          || CASE WHEN permissions ? 'tiktok' THEN CAST(:tiktokPermissions AS jsonb) ELSE '[]'::jsonb END
          || CASE WHEN permissions ? 'users' THEN CAST(:usersPermissions AS jsonb) ELSE '[]'::jsonb END
        ) AS permission
      )
    END,
    updated_at = NOW()
  `, { replacements, transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE roles
    SET permissions = CASE
      WHEN key = 'admin' THEN '["reports", "tiktok", "users"]'::jsonb
      ELSE (
        SELECT COALESCE(jsonb_agg(DISTINCT permission), '[]'::jsonb)
        FROM jsonb_array_elements_text(
          (CASE WHEN ${containsAny(LEGACY_PERMISSION_MAP.reports)} THEN '["reports"]'::jsonb ELSE '[]'::jsonb END)
          || (CASE WHEN ${containsAny(LEGACY_PERMISSION_MAP.tiktok)} THEN '["tiktok"]'::jsonb ELSE '[]'::jsonb END)
          || (CASE WHEN ${containsAny(LEGACY_PERMISSION_MAP.users)} THEN '["users"]'::jsonb ELSE '[]'::jsonb END)
        ) AS permission
      )
    END,
    updated_at = NOW()
  `, { transaction });
};

module.exports = { name: '089_expand_tiktok_permissions', up, down };
