const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE roles
    SET permissions = permissions - 'shop.affiliate.target.view', updated_at = NOW()
    WHERE permissions ? 'shop.affiliate.target.view';
  `, { transaction });
};

const down = async () => {
  // Retired permissions are not re-granted automatically on rollback.
};

module.exports = { name: '113_remove_target_collaboration_permission', up, down };
