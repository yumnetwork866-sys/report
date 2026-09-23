const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    ALTER TABLE tiktok_shops
    ADD COLUMN IF NOT EXISTS avatar_channel_id INTEGER
      REFERENCES tiktok_channels(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  `, { transaction });

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS tiktok_shops_avatar_channel_id_idx
    ON tiktok_shops (avatar_channel_id);
  `, { transaction });

  await sequelize.query(`
    UPDATE tiktok_shops AS shop
    SET avatar_channel_id = channel.id
    FROM tiktok_channels AS channel,
      (VALUES
        ('Actiscar Malaysia', 'actiscar.malaysia'),
        ('Follicas Malaysia - Folliculitis', 'follicasmalaysia'),
        ('Actiscar Stretchmark Malaysia', 'actiscarstretch.my')
      ) AS mapping(shop_name, channel_username)
    WHERE shop.avatar_channel_id IS NULL
      AND LOWER(shop.name) = LOWER(mapping.shop_name)
      AND LOWER(channel.username) = LOWER(mapping.channel_username);
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP INDEX IF EXISTS tiktok_shops_avatar_channel_id_idx;', { transaction });
  await sequelize.query('ALTER TABLE tiktok_shops DROP COLUMN IF EXISTS avatar_channel_id;', { transaction });
};

module.exports = { name: '086_link_shop_avatar_channels', up, down };
