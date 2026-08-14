const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET name = 'Orders', updated_at = NOW()
    WHERE job_key = 'tiktok_affiliate_orders'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET name = 'TikTok Affiliate Orders', updated_at = NOW()
    WHERE job_key = 'tiktok_affiliate_orders'
  `, { transaction });
};

module.exports = { name: '063_rename_affiliate_order_job', up, down };
