const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET name = 'Video TikTok Shop', updated_at = NOW()
    WHERE job_key = 'tiktok_shop_video_catalog'
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    UPDATE scheduled_jobs
    SET name = 'TikTok Shop Video Catalog', updated_at = NOW()
    WHERE job_key = 'tiktok_shop_video_catalog'
  `, { transaction });
};

module.exports = { name: '065_rename_tiktok_shop_video_catalog_job', up, down };
