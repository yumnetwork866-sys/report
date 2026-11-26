const up = async (sequelize, transaction) => {
  await sequelize.query(`
    ALTER TABLE user_content_attributions
    ADD COLUMN IF NOT EXISTS id SERIAL;

    ALTER TABLE user_content_attributions
    DROP CONSTRAINT IF EXISTS user_content_attributions_pkey;

    ALTER TABLE user_content_attributions
    ADD CONSTRAINT user_content_attributions_pkey PRIMARY KEY (id);

    CREATE INDEX IF NOT EXISTS user_content_attributions_user_idx
    ON user_content_attributions (user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS user_content_attributions_user_team_unique_idx
    ON user_content_attributions (user_id, team_id)
    WHERE team_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS user_content_attributions_user_null_team_unique_idx
    ON user_content_attributions (user_id)
    WHERE team_id IS NULL;
  `, { transaction });
};

const down = async (sequelize, transaction) => {
  await sequelize.query(`
    DROP INDEX IF EXISTS user_content_attributions_user_null_team_unique_idx;
    DROP INDEX IF EXISTS user_content_attributions_user_team_unique_idx;
    DROP INDEX IF EXISTS user_content_attributions_user_idx;

    DELETE FROM user_content_attributions a
    USING user_content_attributions b
    WHERE a.user_id = b.user_id AND a.id > b.id;

    ALTER TABLE user_content_attributions
    DROP CONSTRAINT IF EXISTS user_content_attributions_pkey;

    ALTER TABLE user_content_attributions
    DROP COLUMN IF EXISTS id;

    ALTER TABLE user_content_attributions
    ADD CONSTRAINT user_content_attributions_pkey PRIMARY KEY (user_id);
  `, { transaction });
};

module.exports = { name: '127_allow_multi_team_content_attributions', up, down };
