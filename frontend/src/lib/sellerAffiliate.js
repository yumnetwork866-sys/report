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

const finiteNumber = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const numeric = Number(String(value).replaceAll(',', '').trim());
  return Number.isFinite(numeric) ? numeric : null;
};

const moneyValue = (value, fallbackCurrency) => {
  const amount = finiteNumber(typeof value === 'object' ? value?.amount : value);
  if (amount === null) return null;
  return {
    amount,
    currency: String((typeof value === 'object' ? value?.currency : null) || fallbackCurrency || 'USD').toUpperCase(),
  };
};

const productForSku = (order, sku) => (Array.isArray(order?.products) ? order.products : [])
  .find((product) => String(product?.id || product?.product_id || '') === String(sku?.product_id || ''));

export const getAffiliateOrderItems = (order = {}) => {
  const skus = Array.isArray(order.skus) ? order.skus : [];
  return skus.map((sku, index) => {
    const product = productForSku(order, sku);
    const productName = sku?.product_name || sku?.product_title || sku?.title
      || product?.title || product?.name || sku?.product_id || '—';
    const skuName = sku?.sku_name || sku?.variation_name || sku?.variation
      || sku?.seller_sku || sku?.sku?.name || '';
    const quantity = Math.max(0, finiteNumber(
      sku?.quantity ?? sku?.sku_quantity ?? sku?.item_count ?? sku?.product_count ?? sku?.count ?? 1,
    ) ?? 0);
    const price = moneyValue(
      sku?.price ?? sku?.price_amount ?? sku?.original_price,
      sku?.currency || order?.currency,
    );
    return {
      id: String(sku?.sku_id || `${sku?.product_id || 'product'}-${index}`),
      productId: String(sku?.product_id || product?.id || ''),
      productName,
      skuName: skuName && skuName !== productName ? String(skuName) : '',
      quantity,
      refundedQuantity: Math.max(0, finiteNumber(sku?.refunded_quantity ?? sku?.refund_quantity) ?? 0),
      imageUrl: sku?.sku_image || sku?.thumbnail_url || sku?.image_url || sku?.product_image
        || product?.main_image_url || product?.image_url || product?.thumbnail_url || null,
      price,
      raw: sku,
    };
  });
};

export const getAffiliateOrderCreators = (order = {}) => {
  const candidates = [...(Array.isArray(order.skus) ? order.skus : []), order];
  const creators = new Map();
  for (const item of candidates) {
    const username = String(item?.creator_username || item?.creator?.username || item?.username || '')
      .trim().replace(/^@+/, '');
    const name = item?.creator_nickname || item?.creator_name || item?.creator?.nickname
      || item?.nickname || username;
    if (!username && !name) continue;
    const key = username.toLocaleLowerCase() || String(name).toLocaleLowerCase();
    const current = creators.get(key) || {};
    creators.set(key, {
      username: username || current.username || '',
      name: name || current.name || '',
      avatarUrl: item?.creator_avatar_url || item?.creator?.avatar_url || item?.creator?.avatar?.url
        || item?.avatar_url || current.avatarUrl || null,
    });
  }
  return [...creators.values()];
};

const addMoney = (map, money, multiplier = 1) => {
  if (!money || !Number.isFinite(money.amount)) return;
  map.set(money.currency, (map.get(money.currency) || 0) + money.amount * multiplier);
};

const moneyMapValues = (map) => [...map.entries()].map(([currency, amount]) => ({ currency, amount }));

export const getAffiliateOrderValue = (order = {}) => {
  const totals = new Map();
  for (const item of getAffiliateOrderItems(order)) addMoney(totals, item.price, item.quantity);
  if (!totals.size) {
    addMoney(totals, moneyValue(
      order?.gmv ?? order?.order_amount ?? order?.total_amount,
      order?.currency,
    ));
  }
  return moneyMapValues(totals);
};

const percentageRate = (value) => {
  const numeric = finiteNumber(typeof value === 'object'
    ? value?.percentage ?? value?.rate ?? value?.value
    : value);
  if (numeric === null) return null;
  return numeric > 100 ? numeric / 100 : numeric;
};

export const getAffiliateOrderCommission = (order = {}) => {
  const totals = new Map();
  const rates = new Set();
  const fallbackCurrency = order?.currency;
  const topLevelCommission = moneyValue(
    order?.commission_amount ?? order?.actual_commission ?? order?.estimated_commission,
    fallbackCurrency,
  );
  if (topLevelCommission) addMoney(totals, topLevelCommission);

  if (!topLevelCommission) {
    for (const item of getAffiliateOrderItems(order)) {
      const sku = item.raw;
      const explicit = moneyValue(
        sku?.commission_amount ?? sku?.actual_commission ?? sku?.estimated_commission,
        item.price?.currency || fallbackCurrency,
      );
      const rate = percentageRate(sku?.creator_commission_rate ?? sku?.commission_rate);
      if (rate !== null) rates.add(rate);
      if (explicit) addMoney(totals, explicit);
      else if (item.price && rate !== null) {
        addMoney(totals, item.price, Math.max(0, item.quantity - item.refundedQuantity) * rate / 100);
      }
    }
  }

  const topLevelRate = percentageRate(order?.creator_commission_rate ?? order?.commission_rate);
  if (topLevelRate !== null) rates.add(topLevelRate);
  return { amounts: moneyMapValues(totals), rates: [...rates] };
};

export const getAffiliateOrderSettlementStatus = (order = {}) => {
  const items = getAffiliateOrderItems(order);
  const statuses = items.map((item) => String(
    item.raw?.settlement_status || item.raw?.item_status || '',
  ).toUpperCase()).filter(Boolean);
  const returned = items.some((item) => item.raw?.fully_return === true
    || String(item.raw?.fully_return).toLowerCase() === 'true'
    || (item.quantity > 0 && item.refundedQuantity >= item.quantity)
    || /REFUND|RETURN|CANCEL/.test(String(item.raw?.settlement_status || item.raw?.item_status || '').toUpperCase()));
  if (returned || /REFUND|RETURN|CANCEL/.test(String(order?.settlement_status || order?.order_status || order?.status || '').toUpperCase())) return 'REFUNDED';
  const orderStatus = String(order?.settlement_status || '').toUpperCase();
  if (statuses.some((status) => /UNSETTLED|PENDING|PROCESSING/.test(status)) || /UNSETTLED|PENDING|PROCESSING/.test(orderStatus)) return 'UNSETTLED';
  if ((statuses.length && statuses.every((status) => /SETTLED|COMPLETED/.test(status))) || /SETTLED|COMPLETED/.test(orderStatus)) return 'SETTLED';
  return 'UNKNOWN';
};

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
