const { TikTokChannel, Video } = require('../models');

const normalizeUsername = (username) => String(username || '').replace(/^@/, '').trim();

const importPlatformData = async (req, res) => {
  try {
    const { channel: channelPayload = {}, videos = [] } = req.body;
    const username = normalizeUsername(channelPayload.username);

    if (!username) {
      return res.status(400).json({ message: 'channel.username is required' });
    }

    if (!Array.isArray(videos)) {
      return res.status(400).json({ message: 'videos must be an array' });
    }

    const [channel] = await TikTokChannel.findOrCreate({
      where: { username },
      defaults: {
        platform: channelPayload.platform || 'tiktok',
        username,
        tiktok_open_id: channelPayload.tiktok_open_id || null,
        display_name: channelPayload.display_name || username,
        avatar_url: channelPayload.avatar_url || null,
        profile_url: channelPayload.profile_url || null,
        sync_source: channelPayload.sync_source || 'import',
      },
    });

    await channel.update({
      ...channelPayload,
      platform: channelPayload.platform || channel.platform || 'tiktok',
      username,
      display_name: channelPayload.display_name || channel.display_name || username,
      profile_url: channelPayload.profile_url || channel.profile_url || null,
      sync_source: channelPayload.sync_source || channel.sync_source || 'import',
    });

    const results = {
      channel,
      created: 0,
      updated: 0,
      skipped: 0,
      videos: [],
    };

    for (const item of videos) {
      const platformVideoId = item.platform_video_id || item.id || item.video_id;

      if (!platformVideoId || !item.title) {
        results.skipped += 1;
        continue;
      }

      const [video, created] = await Video.findOrCreate({
        where: { platform_video_id: String(platformVideoId) },
        defaults: {
          platform: item.platform || 'unknown',
          platform_video_id: String(platformVideoId),
          channel_id: channel.id,
          title: item.title,
          video_url: item.video_url || null,
          thumbnail_url: item.thumbnail_url || null,
          published_at: item.published_at || null,
          views: item.views || 0,
          likes: item.likes || 0,
          comments: item.comments || 0,
          shares: item.shares || 0,
          duration: item.duration || null,
          campaign: item.campaign || null,
          content_type: item.content_type || null,
          last_synced_at: new Date(),
        },
      });

      if (!created) {
        await video.update({
          channel_id: channel.id,
          title: item.title,
          video_url: item.video_url || video.video_url,
          thumbnail_url: item.thumbnail_url || video.thumbnail_url,
          published_at: item.published_at || video.published_at,
          views: item.views ?? video.views,
          likes: item.likes ?? video.likes,
          comments: item.comments ?? video.comments,
          shares: item.shares ?? video.shares,
          duration: item.duration ?? video.duration,
          campaign: item.campaign ?? video.campaign,
          content_type: item.content_type ?? video.content_type,
          last_synced_at: new Date(),
        });
      }

      results[created ? 'created' : 'updated'] += 1;
      results.videos.push(video);
    }

    res.status(201).json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  importPlatformData,
};
