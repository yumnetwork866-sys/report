const uniqueValues = (values) => [...new Set(values
  .filter((value) => value !== undefined && value !== null && String(value).trim())
  .map(String))];

export const getAffiliateOrderProductIds = (order = {}) => uniqueValues([
  order.product_id,
  order.product?.id,
  ...(Array.isArray(order.skus) ? order.skus.map((sku) => sku?.product_id) : []),
]);

export const getAffiliateOrderProgramIds = (order = {}) => uniqueValues([
  order.program_id,
  order.collaboration_id,
  ...(Array.isArray(order.skus)
    ? order.skus.flatMap((sku) => [sku?.target_collaboration_id, sku?.open_collaboration_id])
    : []),
]);

export const getAffiliateOrderSources = (order = {}) => {
  const sources = [...(Array.isArray(order.skus) ? order.skus : []), order];
  const contents = [];
  const seen = new Set();

  for (const source of sources) {
    const contentType = String(source?.content_type || source?.content?.type || '').toUpperCase();
    const id = source?.video_id || source?.content_id || source?.content?.id;
    if (!id && !contentType) continue;

    const normalizedType = contentType || (source?.video_id ? 'VIDEO' : 'UNKNOWN');
    const normalizedId = id ? String(id) : '';
    const key = `${normalizedType}:${normalizedId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contents.push({
      id: normalizedId,
      type: normalizedType,
      username: source?.creator_username || source?.username || order.creator_username || order.username || null,
      url: source?.video_url || source?.content_url || source?.share_url || null,
      thumbnail: source?.thumbnail_url || source?.cover_image_url || source?.cover_url
        || source?.content?.thumbnail_url || order.thumbnail_url || null,
      title: source?.video_title || source?.content_title || source?.content?.title
        || order.video_title || order.content_title || null,
    });
  }

  return contents;
};

export const getAffiliateOrderVideos = (order = {}) => getAffiliateOrderSources(order)
  .filter((content) => content.type === 'VIDEO' && content.id)
  .map((content) => ({
    id: content.id,
    username: content.username,
    url: content.url,
    thumbnail: content.thumbnail,
    title: content.title,
  }));

const metricSources = (creator = {}) => [
  creator,
  creator.content_performance,
  creator.video_performance,
  creator.performance,
].filter(Boolean);

export const getCreatorMetric = (creator, names) => {
  for (const source of metricSources(creator)) {
    for (const name of names) {
      if (source[name] !== undefined && source[name] !== null && source[name] !== '') return source[name];
    }
  }
  return null;
};

const numericPercentage = (value) => {
  const numeric = Number(String(value ?? '').trim().replace('%', '').replaceAll(',', ''));
  return Number.isFinite(numeric) ? numeric : null;
};

// TikTok serializes unlabelled rate fields in hundredths of a percent (basis points),
// consistent with fields such as commission_rate and demographic percentages.
// Values carrying an explicit percent sign/unit are already percentages.
export const normalizeEngagementPercentage = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'object') {
    const numeric = numericPercentage(value);
    if (numeric === null) return null;
    return String(value).includes('%') ? numeric : numeric / 100;
  }

  if (value.percentage !== undefined) return numericPercentage(value.percentage);
  if (value.percentage_value !== undefined) return numericPercentage(value.percentage_value);
  if (value.ratio !== undefined) {
    const ratio = numericPercentage(value.ratio);
    return ratio === null ? null : ratio * 100;
  }

  const candidate = value.value ?? value.rate ?? value.amount;
  const numeric = numericPercentage(candidate);
  if (numeric === null) return null;
  const unit = String(value.unit || value.value_unit || value.rate_unit || '').trim().toUpperCase();
  if (['RATIO', 'FRACTION', 'DECIMAL'].includes(unit)) return numeric * 100;
  if (['BASIS_POINT', 'BASIS_POINTS', 'BPS', 'HUNDREDTH_OF_PERCENT'].includes(unit)) return numeric / 100;
  if (['PERCENT', 'PERCENTAGE', 'PCT'].includes(unit)) return numeric;
  return numeric / 100;
};

const finiteMetric = (creator, names) => {
  const value = getCreatorMetric(creator, names);
  if (value === null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const engagementMetricNames = {
  all: {
    rates: [
      'video_engagement_rate',
      'avg_video_engagement_rate',
      'video_engagement',
      'engagement_rate',
    ],
    views: ['avg_video_play_count', 'avg_video_view_count', 'avg_video_views'],
    interactions: ['avg_video_interaction_count'],
    likes: ['avg_video_like_count'],
    comments: ['avg_video_comment_count'],
    shares: ['avg_video_share_count'],
  },
  shoppable: {
    rates: [
      'ec_video_engagement_rate',
      'avg_ec_video_engagement_rate',
      'ec_video_engagement',
    ],
    views: ['avg_ec_video_play_count', 'avg_ec_video_view_count', 'avg_ec_video_views'],
    interactions: ['avg_ec_video_interaction_count'],
    likes: ['avg_ec_video_like_count'],
    comments: ['avg_ec_video_comment_count'],
    shares: ['avg_ec_video_share_count'],
  },
};

export const getCreatorVideoEngagementRate = (creator, { scope = 'all' } = {}) => {
  const names = scope === 'shoppable' ? engagementMetricNames.shoppable : engagementMetricNames.all;
  const providedRate = getCreatorMetric(creator, names.rates);
  if (providedRate !== null) return normalizeEngagementPercentage(providedRate);

  const views = finiteMetric(creator, names.views);
  if (views !== null && views > 0) {
    const interactions = finiteMetric(creator, names.interactions);
    if (interactions !== null) return interactions / views * 100;

    const likes = finiteMetric(creator, names.likes);
    const comments = finiteMetric(creator, names.comments);
    const shares = finiteMetric(creator, names.shares);
    if (likes !== null || comments !== null || shares !== null) {
      return ((likes || 0) + (comments || 0) + (shares || 0)) / views * 100;
    }
  }

  return null;
};
