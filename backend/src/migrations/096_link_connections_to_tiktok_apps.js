const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_channels
    ADD COLUMN IF NOT EXISTS app_id INTEGER REFERENCES tiktok_apps(id) ON DELETE SET NULL;

    ALTER TABLE tiktok_shop_authorizations
    ADD COLUMN IF NOT EXISTS app_id INTEGER REFERENCES tiktok_apps(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS tiktok_channels_app_id_idx
      ON tiktok_channels (app_id);
    CREATE INDEX IF NOT EXISTS tiktok_shop_authorizations_app_id_idx
      ON tiktok_shop_authorizations (app_id);

    UPDATE tiktok_channels
    SET app_id = (
      SELECT id
      FROM tiktok_apps
      WHERE app_type = 'channel'
      ORDER BY is_active DESC, updated_at DESC, id DESC
      LIMIT 1
    )
    WHERE app_id IS NULL
      AND sync_source = 'oauth';

    UPDATE tiktok_shop_authorizations AS auth
    SET app_id = (
      SELECT app.id
      FROM tiktok_apps AS app
      WHERE app.app_type = auth.app_type
      ORDER BY
        CASE
          WHEN app.region = COALESCE((
            SELECT shop.region
            FROM tiktok_shops AS shop
            WHERE shop.authorization_id = auth.id
               OR shop.order_authorization_id = auth.id
            ORDER BY shop.id
            LIMIT 1
          ), '') THEN 0
          WHEN app.region = 'AUTO' THEN 1
          WHEN app.region = 'ALL' THEN 2
          ELSE 3
        END,
        app.is_active DESC,
        app.updated_at DESC,
        app.id DESC
      LIMIT 1
    )
    WHERE auth.app_id IS NULL;

    UPDATE tiktok_shop_authorizations AS auth
    SET app_id = (
      SELECT app.id
      FROM tiktok_apps AS app
      WHERE app.app_type = 'partner'
      ORDER BY app.is_active DESC, app.updated_at DESC, app.id DESC
      LIMIT 1
    )
    WHERE auth.app_id IS NULL;
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DROP INDEX IF EXISTS tiktok_shop_authorizations_app_id_idx;
    DROP INDEX IF EXISTS tiktok_channels_app_id_idx;
    ALTER TABLE tiktok_shop_authorizations DROP COLUMN IF EXISTS app_id;
    ALTER TABLE tiktok_channels DROP COLUMN IF EXISTS app_id;
  `, { transaction });
};

module.exports = { name: '096_link_connections_to_tiktok_apps', up, down };
