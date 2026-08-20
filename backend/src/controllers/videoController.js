const {
  col,
  fn,
  Op,
  QueryTypes,
} = require('sequelize');
const {
  Product,
  TikTokChannel,
  User,
  Video,
  VideoAssignment,
  sequelize,
} = require('../models');
const { getOrSetCache, delByPattern } = require('../lib/redis');

const videoDetailInclude = [
  { model: TikTokChannel, as: 'channel' },
  { model: Product, as: 'products', through: { attributes: [] } },
  {
    model: VideoAssignment,
    as: 'assignments',
    include: [{ model: User, as: 'user' }],
  },
];
const VIDEO_LIST_ATTRIBUTES = [
  'id',
  'platform',
  'platform_video_id',
  'channel_id',
  'title',
  'video_url',
  'thumbnail_url',
  'published_at',
  'views',
  'likes',
  'comments',
  'shares',
  'duration',
  'campaign',
  'content_type',
  'last_synced_at',
];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = (value) => {
  const text = String(value || '');
  if (!DATE_PATTERN.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
};

const positiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

const videoListOptions = (query = {}) => {
  const page = positiveInteger(query.page, 1);
  const pageSize = positiveInteger(query.page_size, 20, 100);
  const where = {};
  const channelId = Number(query.channel_id);
  if (Number.isInteger(channelId) && channelId > 0) where.channel_id = channelId;

  const startDate = dateOnly(query.start_date);
  const endDate = dateOnly(query.end_date);
  if (startDate || endDate) {
    where.published_at = {
      ...(startDate ? { [Op.gte]: new Date(`${startDate}T00:00:00.000Z`) } : {}),
      ...(endDate ? { [Op.lt]: new Date(new Date(`${endDate}T00:00:00.000Z`).getTime() + 86400000) } : {}),
    };
  }

  return { page, pageSize, where };
};

const syncVideoProducts = async (video, productIds) => {
  if (!Array.isArray(productIds)) {
    return;
  }

  const products = await Product.findAll({ where: { id: productIds } });
  await video.setProducts(products);
};

const addLatestShopPerformance = async (videos) => {
  const platformIds = [...new Set(videos.map((video) => String(video.platform_video_id || '')).filter(Boolean))];
  if (!platformIds.length) return videos.map((video) => video.toJSON());
  const snapshots = await sequelize.query(`
    SELECT DISTINCT ON (sv.platform_video_id)
      sv.platform_video_id,
      snapshot.gross_gmv,
      snapshot.currency,
      snapshot.synced_at
    FROM shop_videos sv
    JOIN shop_video_performance_snapshots snapshot ON snapshot.shop_video_id = sv.id
    WHERE sv.platform_video_id IN (:platformIds)
    ORDER BY sv.platform_video_id, snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
  `, {
    replacements: { platformIds },
    type: QueryTypes.SELECT,
  });
  const latestByPlatformId = new Map(
    snapshots.map((snapshot) => [String(snapshot.platform_video_id), snapshot]),
  );
  return videos.map((video) => {
    const value = video.toJSON();
    const snapshot = latestByPlatformId.get(String(value.platform_video_id));
    return snapshot ? {
      ...value,
      gross_gmv: Number(snapshot.gross_gmv || 0),
      sales_currency: snapshot.currency || null,
      sales_synced_at: snapshot.synced_at || null,
    } : value;
  });
};

const getVideos = async (req, res) => {
  try {
    const { page, pageSize, where } = videoListOptions(req.query);
    const channelId = req.query.channel_id || 'all';
    const startDate = req.query.start_date || 'none';
    const endDate = req.query.end_date || 'none';
    const cacheKey = `videos:list:${channelId}:${startDate}:${endDate}:${page}:${pageSize}`;

    const { data: payload, hit } = await getOrSetCache(cacheKey, 120, async () => {
      const [{ count, rows }, summary] = await Promise.all([
        Video.findAndCountAll({
          where,
          attributes: VIDEO_LIST_ATTRIBUTES,
          include: [{
            model: TikTokChannel,
            as: 'channel',
            attributes: ['id', 'username', 'display_name', 'avatar_url', 'avatar_large_url'],
            required: false,
          }],
          order: [['published_at', 'DESC'], ['id', 'DESC']],
          limit: pageSize,
          offset: (page - 1) * pageSize,
          distinct: true,
        }),
        Video.findOne({
          where,
          attributes: [
            [fn('COUNT', col('id')), 'video_count'],
            [fn('COALESCE', fn('SUM', col('views')), 0), 'views'],
            [fn('COALESCE', fn('SUM', col('likes')), 0), 'likes'],
            [fn('COALESCE', fn('SUM', col('comments')), 0), 'comments'],
            [fn('COALESCE', fn('SUM', col('shares')), 0), 'shares'],
          ],
          raw: true,
        }),
      ]);
      return {
        items: await addLatestShopPerformance(rows),
        summary: Object.fromEntries(
          Object.entries(summary || {}).map(([key, value]) => [key, Number(value || 0)]),
        ),
        pagination: {
          page,
          page_size: pageSize,
          total: count,
          total_pages: Math.max(1, Math.ceil(count / pageSize)),
        },
      };
    });

    if (hit) {
      res.setHeader('X-Cache', 'HIT');
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getVideoOptions = async (_req, res) => {
  try {
    const videos = await Video.findAll({
      attributes: ['id', 'title', 'channel_id'],
      order: [['published_at', 'DESC'], ['id', 'DESC']],
    });
    res.json(videos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getVideoById = async (req, res) => {
  try {
    const video = await Video.findByPk(req.params.id, { include: videoDetailInclude });
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    res.json(video);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createVideo = async (req, res) => {
  try {
    const { product_ids, ...payload } = req.body;
    const video = await Video.create({
      ...payload,
      last_synced_at: payload.last_synced_at || new Date(),
    });

    await syncVideoProducts(video, product_ids);
    await Promise.all([
      delByPattern('videos:*'),
      delByPattern('dashboard:*'),
      delByPattern('report:*'),
    ]).catch(() => {});

    const createdVideo = await Video.findByPk(video.id, { include: videoDetailInclude });
    res.status(201).json(createdVideo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateVideo = async (req, res) => {
  try {
    const { product_ids, ...payload } = req.body;
    const video = await Video.findByPk(req.params.id);

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    await video.update({
      ...payload,
      last_synced_at: payload.last_synced_at || new Date(),
    });
    await syncVideoProducts(video, product_ids);
    await Promise.all([
      delByPattern('videos:*'),
      delByPattern('dashboard:*'),
      delByPattern('report:*'),
    ]).catch(() => {});

    const updatedVideo = await Video.findByPk(req.params.id, { include: videoDetailInclude });
    res.json(updatedVideo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteVideo = async (req, res) => {
  try {
    const deleted = await Video.destroy({
      where: { id: req.params.id },
    });
    if (deleted) {
      await Promise.all([
        delByPattern('videos:*'),
        delByPattern('dashboard:*'),
        delByPattern('report:*'),
      ]).catch(() => {});
      res.json({ message: 'Video deleted successfully' });
    } else {
      res.status(404).json({ message: 'Video not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addLatestShopPerformance,
  getVideos,
  getVideoOptions,
  getVideoById,
  createVideo,
  updateVideo,
  deleteVideo,
  videoListOptions,
};
