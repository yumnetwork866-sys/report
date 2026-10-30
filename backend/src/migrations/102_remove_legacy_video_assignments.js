const up = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS video_assignments RESTRICT', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  // Rollback restores the retired schema only. Any deleted rows must be
  // recovered from the backup created by the migration runner.
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS video_assignments (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL REFERENCES videos(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      assignment_role VARCHAR(255) NOT NULL,
      UNIQUE (video_id, user_id, assignment_role)
    );
    CREATE INDEX IF NOT EXISTS video_assignments_user_id_video_id_idx
    ON video_assignments (user_id, video_id)
  `, { transaction });
};

module.exports = { name: '102_remove_legacy_video_assignments', up, down };
