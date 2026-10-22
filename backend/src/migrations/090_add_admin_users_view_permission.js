const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE roles
    SET permissions = CASE
      WHEN key = 'admin' THEN permissions
      WHEN permissions ? 'admin.users.manage' OR key IN ('member', 'koc') THEN (
        SELECT COALESCE(jsonb_agg(DISTINCT permission), '[]'::jsonb)
        FROM jsonb_array_elements_text(permissions || '["admin.users.view"]'::jsonb) AS permission
      )
      ELSE permissions
    END,
    updated_at = NOW()
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE roles
    SET permissions = permissions - 'admin.users.view',
    updated_at = NOW()
  `, { transaction });
};

module.exports = { name: '090_add_admin_users_view_permission', up, down };
