require('dotenv').config();

const { Video, TikTokChannel, sequelize } = require('../models');
const { batchCheckVideosAvailability } = require('../services/videoAvailabilityService');

const run = async ({ limit = 200, concurrency = 5, updateThumbnails = true } = {}) => {
  console.info('[Check Videos] Starting video availability check...');

  const videos = await Video.findAll({
    include: [{ model: TikTokChannel, as: 'channel' }],
    order: [['id', 'DESC']],
    limit: limit > 0 ? limit : undefined,
  });

  console.info(`[Check Videos] Found ${videos.length} videos to check.`);
  let activeCount = 0;
  let unavailableCount = 0;
  let updatedThumbsCount = 0;

  await batchCheckVideosAvailability(videos, {
    concurrency,
    onProgress: async ({ index, total, video, result }) => {
      if (result.status === 'unavailable') {
        unavailableCount += 1;
        if (video.status !== 'unavailable') {
          await video.update({ status: 'unavailable' });
          console.info(`[Check Videos] [${index + 1}/${total}] Video ${video.id} (${video.platform_video_id}) -> UNAVAILABLE`);
        }
      } else {
        activeCount += 1;
        const updates = {};
        if (video.status !== 'active') {
          updates.status = 'active';
        }
        if (updateThumbnails && result.thumbnail_url && result.thumbnail_url !== video.thumbnail_url) {
          updates.thumbnail_url = result.thumbnail_url;
          updatedThumbsCount += 1;
        }
        if (Object.keys(updates).length > 0) {
          await video.update(updates);
        }
      }
      if ((index + 1) % 25 === 0 || index + 1 === total) {
        console.info(`[Check Videos] Progress: ${index + 1}/${total} (Active: ${activeCount}, Unavailable: ${unavailableCount}, Refreshed Thumbs: ${updatedThumbsCount})`);
      }
    },
  });

  console.info('[Check Videos] Finished check:', {
    total: videos.length,
    active: activeCount,
    unavailable: unavailableCount,
    refreshedThumbnails: updatedThumbsCount,
  });
};

if (require.main === module) {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0; // 0 = all videos
  run({ limit })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { run };
