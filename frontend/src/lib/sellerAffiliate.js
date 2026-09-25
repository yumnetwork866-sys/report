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

const catalogSkuFor = (product, sku) => (Array.isArray(product?.skus) ? product.skus : [])
  .find((candidate) => String(candidate?.id || candidate?.sku_id || '') === String(sku?.sku_id || ''));

export const getAffiliateOrderItems = (order = {}) => {
  const skus = Array.isArray(order.skus) ? order.skus : [];
  return skus.map((sku, index) => {
    const product = productForSku(order, sku);
    const catalogSku = catalogSkuFor(product, sku);
    const productName = product?.title || product?.name
      || sku?.product_name || sku?.product_title || sku?.title || sku?.product_id || '—';
    const skuName = catalogSku?.sku_name || catalogSku?.variant_name
      || (Array.isArray(catalogSku?.sales_attributes) ? catalogSku.sales_attributes.map((attribute) => attribute?.value_name || attribute?.name || attribute?.value).filter(Boolean).join(' / ') : '')
      || sku?.sku_name || sku?.variation_name || sku?.variation
      || catalogSku?.seller_sku || sku?.seller_sku || sku?.sku?.name || '';
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
      imageUrl: catalogSku?.image_url || catalogSku?.main_image_url || sku?.sku_image
        || product?.main_image_url || product?.image_url || product?.thumbnail_url
        || sku?.thumbnail_url || sku?.image_url || sku?.product_image || null,
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

export const getOrderPaymentValue = (order = {}) => moneyValue(
  order?.payment?.total_amount ?? order?.payment?.total ?? order?.total_amount ?? order?.order_amount,
  order?.payment?.currency || order?.currency,
);

export const getOrderFinanceSummary = (order = {}) => {
  const finance = order?.finance;
  if (!finance) return null;
  const currency = finance.currency || order?.payment?.currency || order?.currency;
  const refundSignedAmount = (Array.isArray(finance.sku_transactions) ? finance.sku_transactions : [])
    .flatMap((transaction) => Object.entries(transaction?.revenue_breakdown || {}))
    .filter(([key]) => /refund/i.test(key))
    .reduce((sum, [, value]) => sum + (finiteNumber(value) || 0), 0);
  return {
    currency: String(currency || 'USD').toUpperCase(),
    revenue: moneyValue(finance.revenue_amount, currency),
    refund: moneyValue(Math.abs(refundSignedAmount), currency),
    fees: moneyValue(finance.fee_and_tax_amount ?? finance.fee_tax_amount, currency),
    settlement: moneyValue(finance.settlement_amount, currency),
    shippingCost: moneyValue(finance.shipping_cost_amount, currency),
  };
};

const numericLeaves = (value, path = '') => {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    if (child && typeof child === 'object') return numericLeaves(child, childPath);
    const amount = finiteNumber(child);
    return amount === null ? [] : [{ path: childPath, amount }];
  });
};

const sumFinanceFields = (transactions, section, matcher) => transactions
  .flatMap((transaction) => numericLeaves(transaction?.[section] || {}))
  .filter(({ path }) => matcher(path))
  .reduce((sum, { amount }) => sum + amount, 0);

export const getOrderFinanceBreakdown = (order = {}) => {
  const finance = order?.finance;
  if (!finance) return null;
  const currency = finance.currency || order?.payment?.currency || order?.currency;
  const transactions = Array.isArray(finance.sku_transactions) ? finance.sku_transactions : [];
  const sellerDiscountAmount = sumFinanceFields(
    transactions,
    'revenue_breakdown',
    (path) => /(^|\.)seller_discount_amount$/i.test(path) && !/refund/i.test(path),
  );
  const refundSignedAmount = sumFinanceFields(
    transactions,
    'revenue_breakdown',
    (path) => /refund/i.test(path),
  );
  const subtotalAmount = sumFinanceFields(
    transactions,
    'revenue_breakdown',
    (path) => /(^|\.)subtotal_before_discount_amount$/i.test(path) && !/refund/i.test(path),
  );
  const taxAmount = sumFinanceFields(
    transactions,
    'fee_tax_breakdown',
    (path) => /tax/i.test(path),
  );
  const combinedFeeTaxAmount = finiteNumber(finance.fee_and_tax_amount ?? finance.fee_tax_amount);
  const feeAmount = combinedFeeTaxAmount === null ? null : combinedFeeTaxAmount - taxAmount;
  return {
    currency: String(currency || 'USD').toUpperCase(),
    productRevenue: moneyValue(subtotalAmount || finance.revenue_amount, currency),
    sellerDiscount: moneyValue(sellerDiscountAmount, currency),
    fees: moneyValue(feeAmount, currency),
    taxes: moneyValue(taxAmount, currency),
    shippingCost: moneyValue(finance.shipping_cost_amount, currency),
    refund: moneyValue(refundSignedAmount ? -Math.abs(refundSignedAmount) : 0, currency),
    settlement: moneyValue(finance.settlement_amount, currency),
  };
};

export const getOrderProductDetails = (order = {}) => getAffiliateOrderItems(order).map((item) => {
  const raw = item.raw || {};
  const product = productForSku(order, raw) || {};
  const catalogSku = catalogSkuFor(product, raw) || {};
  const currency = raw.currency || item.price?.currency || order?.payment?.currency || order?.currency;
  const sellerDiscountAmount = finiteNumber(raw.seller_discount) || 0;
  const platformDiscountAmount = finiteNumber(raw.platform_discount) || 0;
  return {
    ...item,
    sellerSku: String(catalogSku.seller_sku || catalogSku.external_sku_id || raw.seller_sku || ''),
    productStatus: product.status || product.product_status || raw.product_status || null,
    productUrl: product.product_url || product.url || product.share_url || raw.product_url || null,
    originalPrice: moneyValue(raw.original_price ?? item.price, currency),
    salePrice: moneyValue(raw.sale_price ?? item.price, currency),
    sellerDiscount: moneyValue(raw.seller_discount, currency),
    platformDiscount: moneyValue(raw.platform_discount, currency),
    totalDiscount: moneyValue(sellerDiscountAmount + platformDiscountAmount, currency),
  };
});

export const getOrderShipping = (order = {}) => {
  const packages = Array.isArray(order.packages)
    ? order.packages
    : (Array.isArray(order.package_list) ? order.package_list : []);
  const firstPackage = packages[0] || {};
  const firstLineItem = (Array.isArray(order.line_items) ? order.line_items[0] : null)
    || (Array.isArray(order.skus) ? order.skus[0] : null)
    || {};
  return {
    packageId: String(firstPackage.id || firstPackage.package_id || firstLineItem.package_id || order.package_id || ''),
    status: String(
      firstPackage.status || firstPackage.delivery_status || firstLineItem.display_status
      || firstLineItem.delivery_status || firstLineItem.package_status || order.delivery_status
      || order.order_status || order.status || 'UNKNOWN',
    ).toUpperCase(),
    provider: order.shipping_provider || firstPackage.shipping_provider
      || firstPackage.provider_name || firstLineItem.shipping_provider_name
      || firstLineItem.shipping_provider || order.delivery_option_name || '',
    trackingNumber: order.tracking_number || firstPackage.tracking_number || firstPackage.tracking_no
      || firstLineItem.tracking_number || firstLineItem.tracking_no || '',
  };
};

export const getOrderDeliveryHistory = (order = {}) => {
  const status = String(order.order_status || order.status || 'UNKNOWN').toUpperCase();
  const candidates = [
    { status: 'CREATED', time: order.create_time || order.created_time },
    { status: 'PAID', time: order.paid_time },
    { status, time: order.update_time },
    { status: 'DELIVERED', time: order.delivery_time },
  ];
  const seen = new Set();
  return candidates
    .map((event) => ({ ...event, time: finiteNumber(event.time) }))
    .filter((event) => event.time && !seen.has(`${event.status}:${event.time}`) && seen.add(`${event.status}:${event.time}`))
    .sort((left, right) => left.time - right.time);
};

export const getOrderSla = (order = {}, nowSeconds = Date.now() / 1000) => {
  const status = String(order.order_status || order.status || '').toUpperCase();
  if (/DELIVERED|COMPLETED|CANCELLED/.test(status)) return { state: 'DONE', deadline: null };
  const deadlineFields = {
    UNPAID: ['cancel_order_sla_time'],
    ON_HOLD: ['cancel_order_sla_time'],
    AWAITING_SHIPMENT: ['rts_sla_time', 'tts_sla_time', 'recommended_shipping_time', 'shipping_due_time'],
    PARTIALLY_SHIPPING: ['collection_due_time', 'shipping_due_time'],
    AWAITING_COLLECTION: ['collection_due_time', 'shipping_due_time'],
    IN_TRANSIT: ['shipping_due_time'],
  };
  const fields = deadlineFields[status] || [
    'shipping_due_time',
    'collection_due_time',
    'cancel_order_sla_time',
    'rts_sla_time',
    'tts_sla_time',
    'recommended_shipping_time',
  ];
  const candidates = fields.map((field) => finiteNumber(order[field]))
    .filter((value) => value && value > 0);
  const deadline = candidates.length ? Math.min(...candidates) : null;
  if (!deadline) return { state: 'UNKNOWN', deadline: null };
  const remaining = deadline - nowSeconds;
  if (remaining < 0) return { state: 'OVERDUE', deadline };
  if (remaining <= 24 * 60 * 60) return { state: 'DUE_SOON', deadline };
  return { state: 'ON_TRACK', deadline };
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

export const getTrackingUrl = (provider, trackingNumber) => {
  if (!trackingNumber) return null;
  const cleanTrack = String(trackingNumber).trim();
  const lowerProvider = String(provider || '').toLowerCase();
  if (lowerProvider.includes('j&t') || lowerProvider.includes('jt')) {
    return `https://jtexpress.vn/vi/tracking?billcode=${encodeURIComponent(cleanTrack)}`;
  }
  if (lowerProvider.includes('spx') || lowerProvider.includes('shopee')) {
    return `https://spx.vn/track?tracking_number=${encodeURIComponent(cleanTrack)}`;
  }
  if (lowerProvider.includes('ghn') || lowerProvider.includes('giao hàng nhanh')) {
    return `https://donhang.ghn.vn/?order_code=${encodeURIComponent(cleanTrack)}`;
  }
  if (lowerProvider.includes('viettel')) {
    return `https://viettelpost.com.vn/tra-cuu-hanh-trinh-don/?order_number=${encodeURIComponent(cleanTrack)}`;
  }
  if (lowerProvider.includes('ninja')) {
    return `https://www.ninjavan.co/vi-vn/tracking?id=${encodeURIComponent(cleanTrack)}`;
  }
  if (lowerProvider.includes('best')) {
    return `https://best-inc.vn/track?bills=${encodeURIComponent(cleanTrack)}`;
  }
  return null;
};
