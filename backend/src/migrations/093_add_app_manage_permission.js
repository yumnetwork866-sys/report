const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE roles
    SET permissions = CASE
      WHEN key = 'admin' THEN (
        SELECT COALESCE(jsonb_agg(DISTINCT permission), '[]'::jsonb)
        FROM jsonb_array_elements_text(permissions || '["app.manage"]'::jsonb) AS permission
      )
      ELSE permissions
    END,
    updated_at = NOW()
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE roles
    SET permissions = CASE
      WHEN key = 'admin' THEN permissions - 'app.manage'
      ELSE permissions
    END,
    updated_at = NOW()
  `, { transaction });
};

module.exports = { name: '093_add_app_manage_permission', up, down };
