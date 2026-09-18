export const DEFAULT_PERFORMANCE_WINDOW = 'LIFETIME';

export const PRODUCT_ORDERS_CACHE_TTL_MS = 5 * 60 * 1000;
export const BOOKING_UI_SESSION_KEY = 'booking-management-ui';
export const PRODUCT_ORDERS_CACHE_SESSION_KEY = 'booking-product-orders-cache';

export const generateBookingMonthOptions = (count = 3) => {
  const options = [{ value: 'all', labelKey: 'booking.allMonths' }];
  const d = new Date();
  for (let i = 0; i < count; i += 1) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    options.push({
      value: `${year}-${month}`,
      label: `${month}/${year}`,
    });
    d.setMonth(d.getMonth() - 1);
  }
  options.push({ value: 'custom', labelKey: 'booking.periodCustom' });
  return options;
};

const bookingResourceCache = new Map();

export const cachedBookingResource = (key, load) => {
  const cached = bookingResourceCache.get(key);
  if (cached && Date.now() - cached.createdAt < PRODUCT_ORDERS_CACHE_TTL_MS) return cached.promise;
  const promise = Promise.resolve().then(load).catch((error) => {
    bookingResourceCache.delete(key);
    throw error;
  });
  bookingResourceCache.set(key, { createdAt: Date.now(), promise });
  return promise;
};

export const bookingUiSession = () => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(BOOKING_UI_SESSION_KEY) || '{}');
  } catch {
    return {};
  }
};

export const productOrdersCacheSession = () => {
  if (typeof window === 'undefined') return new Map();
  try {
    const now = Date.now();
    const entries = JSON.parse(window.sessionStorage.getItem(PRODUCT_ORDERS_CACHE_SESSION_KEY) || '[]');
    return new Map(entries.filter(([, cached]) => (
      cached?.ordersByShop && now - Number(cached.fetchedAt) < PRODUCT_ORDERS_CACHE_TTL_MS
    )));
  } catch {
    return new Map();
  }
};

export const persistProductOrdersCache = (cache) => {
  try {
    window.sessionStorage.setItem(PRODUCT_ORDERS_CACHE_SESSION_KEY, JSON.stringify([...cache]));
  } catch {
    // Keep the in-memory cache when session storage is unavailable or full.
  }
};

export const dateInputValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export const shiftDateInputValue = (value, days) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const bookingDateOf = (booking) => {
  if (!booking) return '';
  const raw = booking.start_date || booking.booking_date || booking.created_at;
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  if (raw instanceof Date) return dateInputValue(raw);
  return String(raw).slice(0, 10);
};

export const isBookingInPeriod = (booking, activeRange) => {
  if (!activeRange || (!activeRange.startDate && !activeRange.endDate)) return true;
  const bDate = bookingDateOf(booking);
  if (!bDate) return false;
  if (activeRange.startDate && bDate < activeRange.startDate) return false;
  if (activeRange.endDate && bDate > activeRange.endDate) return false;
  return true;
};

export const defaultBookingForm = () => ({
  creator_key: '',
  staff_id: '',
  booking_date: dateInputValue(new Date()),
  total_cost: '',
  product_ids: [],
});

export const defaultCustomRange = () => {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start: dateInputValue(start), end: dateInputValue(end) };
};

export const targetKocKey = (creator) => {
  const identity = creator.creator_open_id || `username:${String(creator.username || '').toLocaleLowerCase()}`;
  return `${creator.shop_id}:${identity}`;
};

export const snapshotOf = (booking) => booking?.evaluation_snapshot || {};

export const bookingVideosOf = (booking) => Array.isArray(booking?.booking_videos) ? booking.booking_videos : [];

export const bookingProductsOf = (booking) => {
  const snapshot = snapshotOf(booking);
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const byId = new Map(products.map((product) => [String(product.id || product.product_id), product]));
  for (const value of Array.isArray(snapshot.product_ids) ? snapshot.product_ids : []) {
    const id = String(value || '').trim();
    if (id && !byId.has(id)) byId.set(id, { id, name: id, image_url: null });
  }
  return [...byId.values()].filter((product) => String(product.id || product.product_id || '').trim());
};

export const orderRangeForPeriod = (period, customRange) => {
  if (!period || period === 'all') {
    return { startTime: null, endTime: null, windowType: 'LIFETIME' };
  }
  const malaysiaMidnightUnix = (value) => Math.floor(new Date(`${value}T00:00:00+08:00`).getTime() / 1000);
  if (period === 'custom') {
    if (!customRange?.start || !customRange?.end) {
      return { startTime: null, endTime: null, windowType: 'LIFETIME' };
    }
    const todayStr = dateInputValue(new Date());
    const isPast = customRange.end < todayStr;
    return {
      startTime: malaysiaMidnightUnix(customRange.start),
      endTime: malaysiaMidnightUnix(shiftDateInputValue(customRange.end, 1)),
      startDate: customRange.start,
      endDate: customRange.end,
      windowType: isPast ? 'CUSTOM' : 'LIFETIME',
    };
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-').map(Number);
    const startStr = `${period}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endStr = `${period}-${String(lastDay).padStart(2, '0')}`;
    const todayStr = dateInputValue(new Date());
    const isPast = endStr < todayStr;
    return {
      startTime: malaysiaMidnightUnix(startStr),
      endTime: malaysiaMidnightUnix(nextMonthStr),
      startDate: startStr,
      endDate: endStr,
      windowType: isPast ? 'CUSTOM' : 'LIFETIME',
    };
  }
  return { startTime: null, endTime: null, windowType: 'LIFETIME' };
};

export const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const BOOKING_PERFORMANCE_SORT_FIELDS = {
  refunds: 'refunded_gmv',
  items_sold: 'items_sold',
  samples: 'samples_shipped',
  commission: 'estimated_commission',
};

export const bookingPerformanceSortValue = (performance, sortKey) => (
  finiteNumber(performance?.[BOOKING_PERFORMANCE_SORT_FIELDS[sortKey]])
);

export const optionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const editableCurrencyAmount = (value, currency) => {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return String(currency === 'VND' ? Math.round(amount) : Math.round(amount * 100) / 100);
};

export const bookingProductOrderPerformance = (booking, orders = [], periodRange = null) => {
  const selectedProducts = bookingProductsOf(booking);
  const selectedIds = new Set(selectedProducts.map((product) => String(product.id || product.product_id)));
  const creatorUsername = String(booking?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
  const orderIds = new Set();
  let affiliateGmv = 0;
  let refundedGmv = 0;
  let itemsSold = 0;
  let itemsRefunded = 0;
  let estimatedCommission = 0;
  let currency = booking?.currency || 'MYR';

  for (const order of orders) {
    if (periodRange && (periodRange.startTime || periodRange.endTime)) {
      const rawTime = order?.create_time ?? order?.order_create_time ?? order?.created_time ?? order?.paid_time;
      const orderTimeUnix = typeof rawTime === 'number'
        ? rawTime
        : (typeof rawTime === 'string' && /^\d+$/.test(rawTime.trim()))
          ? Number(rawTime.trim())
          : Math.floor(new Date(rawTime || 0).getTime() / 1000);
      if (orderTimeUnix) {
        if (periodRange.startTime && orderTimeUnix < periodRange.startTime) continue;
        if (periodRange.endTime && orderTimeUnix >= periodRange.endTime) continue;
      }
    }
    const orderId = String(order?.id || order?.order_id || '').trim();
    let matchedOrder = false;
    for (const sku of Array.isArray(order?.skus) ? order.skus : []) {
      const productId = String(sku?.product_id || '').trim();
      const skuCreator = String(sku?.creator_username || order?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
      if (!selectedIds.has(productId) || (creatorUsername && skuCreator !== creatorUsername)) continue;
      const quantity = Math.max(0, finiteNumber(sku?.quantity));
      const refundedQuantity = Math.min(quantity, Math.max(0, finiteNumber(sku?.refunded_quantity)));
      const price = Math.max(0, finiteNumber(sku?.price?.amount ?? sku?.price_amount));
      const rawCommRate = finiteNumber(sku?.creator_commission_rate);
      const commissionRate = rawCommRate > 100 ? rawCommRate / 10000 : rawCommRate / 100;
      currency = sku?.price?.currency || sku?.currency || currency;
      itemsSold += quantity;
      itemsRefunded += refundedQuantity;
      affiliateGmv += price * quantity;
      refundedGmv += price * refundedQuantity;
      estimatedCommission += price * (quantity - refundedQuantity) * commissionRate;
      matchedOrder = true;
    }
    if (matchedOrder && orderId) orderIds.add(orderId);
  }

  return {
    source: 'AFFILIATE_ORDERS',
    has_products: selectedProducts.length > 0,
    currency,
    affiliate_gmv: affiliateGmv,
    affiliate_orders: orderIds.size,
    items_sold: itemsSold,
    items_refunded: itemsRefunded,
    refunded_gmv: refundedGmv,
    estimated_commission: estimatedCommission,
    selected_products: selectedProducts,
  };
};

export const bookingProductOrderBreakdown = (booking, orders = []) => {
  const selectedProducts = bookingProductsOf(booking);
  const selectedIds = new Set(selectedProducts.map((product) => String(product.id || product.product_id)));
  const creatorUsername = String(booking?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
  const rowsById = new Map(selectedProducts.map((product) => {
    const id = String(product.id || product.product_id);
    return [id, {
      id,
      name: product.name || product.title || product.product_name || id,
      thumbnailUrl: product.main_image_url || product.thumbnail_url || product.thumbnailUrl || product.image_url || null,
      orderIds: new Set(),
      quantity: 0,
    }];
  }));

  orders.forEach((order, orderIndex) => {
    const orderKey = String(order?.id || order?.order_id || `order:${orderIndex}`);
    const orderProducts = new Map((Array.isArray(order?.products) ? order.products : [])
      .map((product) => [String(product?.id || product?.product_id || ''), product]));
    for (const sku of Array.isArray(order?.skus) ? order.skus : []) {
      const productId = String(sku?.product_id || '').trim();
      const skuCreator = String(sku?.creator_username || order?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
      if (!selectedIds.has(productId) || (creatorUsername && skuCreator !== creatorUsername)) continue;

      const product = orderProducts.get(productId) || {};
      const row = rowsById.get(productId);
      if (row) {
        row.name = sku?.product_name || product?.title || product?.name || product?.product_name || row.name;
        row.thumbnailUrl = product?.main_image_url || product?.thumbnail_url || product?.thumbnailUrl || product?.image_url || row.thumbnailUrl;
        row.orderIds.add(orderKey);
        row.quantity += Math.max(0, finiteNumber(sku?.quantity));
      }
    }
  });

  return [...rowsById.values()]
    .map(({ orderIds, ...product }) => ({ ...product, orderCount: orderIds.size }))
    .sort((left, right) => right.orderCount - left.orderCount || right.quantity - left.quantity || left.name.localeCompare(right.name));
};

export const latestBookingVideoSnapshot = (video) => [...(video?.performance_snapshots || [])]
  .sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || null;

const normalizedHashtag = (value) => {
  const tag = String(value || '').trim().toLocaleLowerCase('en').replace(/^#+/, '');
  return tag ? `#${tag}` : '';
};

export const bookingVideoHashtags = (video) => {
  const raw = latestBookingVideoSnapshot(video)?.raw_metrics || {};
  const list = raw?.video?.list || raw?.list || raw?.video || raw;
  const provided = [
    video?.hashtags,
    video?.hash_tags,
    video?.raw_data?.hashtags,
    video?.raw_data?.hash_tags,
    raw?.hashtags,
    raw?.hash_tags,
    list?.hashtags,
    list?.hash_tags,
  ].flatMap((value) => Array.isArray(value) ? value : (value ? [value] : []));
  const text = [
    video?.title,
    video?.description,
    video?.caption,
    video?.raw_data?.title,
    video?.raw_data?.description,
    raw?.title,
    raw?.description,
    list?.title,
    list?.description,
  ].filter(Boolean).join(' ');
  const extracted = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  const supplied = provided.flatMap((value) => {
    if (value && typeof value === 'object') {
      return [value.name || value.hashtag_name || value.hashtag || value.title || ''];
    }
    return String(value || '').split(/[\s,]+/);
  });
  return [...new Set([...supplied, ...extracted].map(normalizedHashtag).filter(Boolean))];
};

export const bookingVideoMatchesHashtags = (video, configuredHashtags = []) => {
  const configured = new Set((Array.isArray(configuredHashtags) ? configuredHashtags : [])
    .map(normalizedHashtag)
    .filter(Boolean));
  if (!configured.size) return false;
  return bookingVideoHashtags(video).some((hashtag) => configured.has(hashtag));
};

export const bookingVideoOrderMetrics = (video, booking, orders = []) => {
  const normVideoId = String(video?.platform_video_id || '').trim();
  const normCreator = String(booking?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
  if (!normVideoId || !Array.isArray(orders) || !orders.length) return null;

  let gmv = 0;
  let itemsSold = 0;
  let itemsRefunded = 0;
  let refundedGmv = 0;
  let estimatedCommission = 0;
  const orderIds = new Set();
  let currency = null;
  let hasMatch = false;

  for (const order of orders) {
    const orderId = String(order?.id || order?.order_id || '').trim();
    let matchedInOrder = false;
    for (const sku of Array.isArray(order?.skus) ? order.skus : []) {
      if (String(sku?.content_id || '').trim() !== normVideoId) continue;
      const skuCreator = String(sku?.creator_username || order?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
      if (normCreator && skuCreator && skuCreator !== normCreator) continue;

      const rawQuantity = sku?.quantity ?? sku?.sku_quantity ?? sku?.item_count ?? sku?.product_count ?? sku?.count;
      const quantity = Math.max(0, finiteNumber(rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '' ? rawQuantity : 1));
      const refundedQuantity = Math.min(quantity, Math.max(0, finiteNumber(sku?.refunded_quantity ?? sku?.refund_quantity ?? 0)));
      const rawPrice = typeof sku?.price === 'object' ? sku?.price?.amount : (sku?.price ?? sku?.price_amount ?? sku?.original_price);
      const price = Math.max(0, finiteNumber(rawPrice));
      const rawCommRate = finiteNumber(sku?.creator_commission_rate);
      const commissionRate = rawCommRate > 100 ? rawCommRate / 10000 : rawCommRate / 100;

      itemsSold += quantity;
      itemsRefunded += refundedQuantity;
      gmv += price * quantity;
      refundedGmv += price * refundedQuantity;
      estimatedCommission += price * (quantity - refundedQuantity) * commissionRate;
      currency = sku?.price?.currency || sku?.currency || currency;
      hasMatch = true;
      matchedInOrder = true;
    }
    if (matchedInOrder && orderId) {
      orderIds.add(orderId);
    }
  }

  if (!hasMatch) return null;
  return {
    itemsSold,
    itemsRefunded,
    orderCount: orderIds.size,
    grossGmv: gmv,
    refundedGmv,
    estimatedCommission,
    currency,
  };
};

export const bookingVideosByRevenue = (videos = []) => videos
  .map((video, index) => ({ video, index, revenue: finiteNumber(latestBookingVideoSnapshot(video)?.gross_gmv) }))
  .sort((left, right) => right.revenue - left.revenue || left.index - right.index)
  .map(({ video }) => video);

export const filterVideosByPeriod = (videos = [], periodRange = null) => {
  const list = Array.isArray(videos) ? videos : [];
  if (!periodRange || (!periodRange.startDate && !periodRange.endDate)) {
    return list;
  }
  return list.filter((video) => {
    const rawPostDate = video?.posted_at || video?.video_post_time || video?.post_date || video?.post_time;
    if (!rawPostDate) return false;
    const postDate = String(rawPostDate).slice(0, 10);
    if (periodRange.startDate && postDate < periodRange.startDate) return false;
    if (periodRange.endDate && postDate > periodRange.endDate) return false;
    return true;
  });
};

export const bookingVideoPerformanceForVideos = (videos = [], basePerformance = null, shopOrders = []) => {
  if (!videos.length) {
    return {
      gross_gmv: 0,
      views: 0,
      orders: 0,
      items_sold: 0,
      items_refunded: 0,
      refunded_gmv: 0,
      currency: basePerformance?.currency || 'MYR',
      video_count: 0,
      samples_shipped: basePerformance?.samples_shipped ?? 0,
      estimated_commission: 0,
    };
  }
  let grossGmv = 0;
  let views = 0;
  let orders = 0;
  let itemsSold = 0;
  let refundedGmv = 0;
  let itemsRefunded = 0;
  let estimatedCommission = 0;
  let hasAnyRefunds = false;
  let hasAnyRefundedItems = false;
  let hasAnyCommission = false;
  let currency = basePerformance?.currency || 'MYR';

  for (const video of videos) {
    const latest = latestBookingVideoSnapshot(video);
    const live = bookingVideoOrderMetrics(video, null, shopOrders);
    const videoGmv = live ? live.grossGmv : finiteNumber(latest?.gross_gmv ?? video?.gross_gmv ?? video?.gmv);
    const videoOrders = live ? live.orderCount : finiteNumber(latest?.orders ?? video?.orders);
    const videoItems = live ? live.itemsSold : finiteNumber(latest?.items_sold ?? video?.items_sold);
    const videoViews = finiteNumber(latest?.views ?? video?.views ?? latest?.raw_metrics?.views);
    const rawRefunded = live ? live.refundedGmv : (latest?.refunded_gmv ?? video?.refunded_gmv);
    const rawItemsRefunded = live ? live.itemsRefunded : (latest?.items_refunded ?? video?.items_refunded);
    const rawCommission = live ? live.estimatedCommission : (latest?.estimated_commission ?? video?.estimated_commission);
    const videoRefunded = finiteNumber(rawRefunded);
    const videoItemsRefunded = finiteNumber(rawItemsRefunded);
    const videoCommission = finiteNumber(rawCommission);
    grossGmv += videoGmv;
    views += videoViews;
    orders += videoOrders;
    itemsSold += videoItems;
    refundedGmv += videoRefunded;
    itemsRefunded += videoItemsRefunded;
    estimatedCommission += videoCommission;
    hasAnyRefunds = hasAnyRefunds || (rawRefunded !== null && rawRefunded !== undefined);
    hasAnyRefundedItems = hasAnyRefundedItems || (rawItemsRefunded !== null && rawItemsRefunded !== undefined);
    hasAnyCommission = hasAnyCommission || (rawCommission !== null && rawCommission !== undefined);
    if (latest?.currency) currency = latest.currency;
    else if (video?.currency) currency = video.currency;
  }
  return {
    gross_gmv: grossGmv,
    views,
    orders,
    items_sold: itemsSold,
    refunded_gmv: hasAnyRefunds ? refundedGmv : null,
    items_refunded: hasAnyRefundedItems ? itemsRefunded : null,
    currency,
    video_count: videos.length,
    samples_shipped: basePerformance?.samples_shipped ?? 0,
    estimated_commission: hasAnyCommission
      ? estimatedCommission
      : (basePerformance?.estimated_commission ?? null),
  };
};

export const bookingVideoSocialMetrics = (snapshot) => {
  const rawVideo = snapshot?.raw_metrics?.video || snapshot?.raw_metrics || {};
  const listVideo = rawVideo?.list || rawVideo;
  const traffic = rawVideo?.detail?.performance?.intervals?.[0]?.traffic || {};
  const shared = snapshot?.raw_metrics?.social_metrics;
  if (shared) {
    return {
      views: optionalNumber(shared.views) ?? optionalNumber(snapshot?.views) ?? optionalNumber(listVideo?.views),
      likes: shared.available ? optionalNumber(shared.likes) : null,
      comments: shared.available ? optionalNumber(shared.comments) : null,
      shares: shared.available ? optionalNumber(shared.shares) : null,
      available: Boolean(shared.available),
      metricWindow: shared.metric_window || 'PAST_30_DAYS',
      syncedAt: shared.synced_at || null,
    };
  }
  const available = ['likes', 'comments', 'shares'].some((key) => traffic[key] !== null && traffic[key] !== undefined);
  return {
    views: optionalNumber(snapshot?.views ?? listVideo?.views ?? traffic.views),
    likes: available ? optionalNumber(traffic.likes ?? listVideo?.likes ?? rawVideo?.likes) : null,
    comments: available ? optionalNumber(traffic.comments ?? listVideo?.comments ?? rawVideo?.comments) : null,
    shares: available ? optionalNumber(traffic.shares ?? listVideo?.shares ?? rawVideo?.shares) : null,
    available,
    metricWindow: available ? 'PAST_30_DAYS' : null,
    syncedAt: available ? snapshot?.synced_at || null : null,
  };
};

export const formatOrderTimestamp = (value) => {
  if (!value) return { date: '—', time: '' };
  const num = Number(value);
  const date = !Number.isNaN(num) && num > 0
    ? new Date(num > 1e11 ? num : num * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return { date: String(value), time: '' };
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return {
    date: `${day}/${month}/${year}`,
    time: `${hours}:${minutes}`,
  };
};

export const cleanDisplayProductName = (fullName) => {
  if (!fullName) return '';
  const firstPart = String(fullName).split(/\s*[-–|]\s*/)[0].trim();
  return firstPart.replace(/^\[[^\]]+\]\s*/i, '').trim();
};

export const resolveProductClassification = (skuName, productName) => {
  const normSku = String(skuName || '').trim();
  const normProd = String(productName || '').trim();

  if (normSku && normSku !== normProd && normSku.toLowerCase() !== 'mặc định' && normSku.toLowerCase() !== 'default') {
    return normSku;
  }

  if (!normProd) return normSku || 'Mặc định';

  const parenMatch = normProd.match(/\(([^)]+)\)\s*$/);
  const parenContent = parenMatch ? parenMatch[1].trim() : null;

  const parts = normProd.split(/\s*[-–|]\s*/);
  const firstPart = parts[0].trim();

  const cleanBrand = (str) => str
    .replace(/^\[[^\]]+\]\s*/i, '')
    .replace(/^(FOLLICAS|ACTISCAR)\s+/i, '')
    .trim();

  const brandCleaned = cleanBrand(firstPart);

  if (parenContent) {
    const formattedSpec = parenContent.replace(/\s+dan\s+/gi, ' + ');
    if (/^Kombo\b/i.test(brandCleaned)) {
      return `Kombo (${formattedSpec})`;
    }
    if (/^Serum\b/i.test(brandCleaned)) {
      return `Serum (${formattedSpec})`;
    }
    if (/^Krim\b/i.test(brandCleaned)) {
      return `Krim (${formattedSpec})`;
    }
    return formattedSpec;
  }

  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i += 1) {
      const part = parts[i].trim();
      if (/ml|g|tampalan|spray|krim|serum|combo/i.test(part) && part.length <= 40) {
        return part.replace(/\s+dan\s+/gi, ' + ');
      }
    }
  }

  const countMatch = firstPart.match(/\b\d+\s*tampalan\b/i);
  if (countMatch) {
    return countMatch[0];
  }

  if (/\b\d+\s*(ml|g)\b/i.test(firstPart)) {
    return brandCleaned;
  }

  if (brandCleaned && brandCleaned.length <= 30) {
    return brandCleaned;
  }

  return 'Mặc định';
};

export const extractProductOrderRows = (orders = [], productId, creatorUsername, videoId = null) => {
  const normProdId = String(productId || '').trim();
  const normCreator = String(creatorUsername || '').trim().replace(/^@+/, '').toLocaleLowerCase();
  const normVideoId = String(videoId || '').trim();

  const rows = [];
  const orderIds = new Set();
  let totalItems = 0;
  let totalRefundedItems = 0;
  let totalGmv = 0;
  let totalRefundedGmv = 0;
  let totalCommission = 0;
  let currency = 'MYR';

  for (const order of orders) {
    const orderId = String(order?.id || order?.order_id || '').trim();
    const orderTime = order?.create_time || order?.order_create_time || order?.created_time || order?.paid_time;
    const orderStatus = order?.order_status || order?.status || null;

    for (const sku of Array.isArray(order?.skus) ? order.skus : []) {
      const skuProdId = String(sku?.product_id || '').trim();
      if (normProdId && skuProdId !== normProdId) continue;

      const skuCreator = String(sku?.creator_username || order?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
      if (normCreator && skuCreator && skuCreator !== normCreator) continue;

      const rawQuantity = sku?.quantity ?? sku?.sku_quantity ?? sku?.item_count ?? sku?.product_count ?? sku?.count;
      const quantity = Math.max(0, finiteNumber(rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '' ? rawQuantity : 1));
      const refundedQuantity = Math.min(quantity, Math.max(0, finiteNumber(sku?.refunded_quantity ?? sku?.refund_quantity ?? 0)));
      const rawPrice = typeof sku?.price === 'object' ? sku?.price?.amount : (sku?.price ?? sku?.price_amount ?? sku?.original_price);
      const price = Math.max(0, finiteNumber(rawPrice));
      const rawCommRate = finiteNumber(sku?.creator_commission_rate);
      const commissionRate = rawCommRate > 100 ? rawCommRate / 10000 : rawCommRate / 100;
      const skuCurrency = sku?.price?.currency || sku?.currency || order?.currency || currency;
      currency = skuCurrency;

      const orderProd = Array.isArray(order?.products)
        ? order.products.find((p) => String(p?.id || p?.product_id || '').trim() === skuProdId)
        : null;
      const orderProdThumb = orderProd?.main_image_url || orderProd?.image_url || orderProd?.thumbnail_url || orderProd?.thumbnailUrl || null;

      const skuThumb = sku?.sku_image || sku?.thumbnail_url || sku?.thumbnailUrl || sku?.image_url
        || sku?.main_image_url || sku?.product_image || sku?.raw_data?.sku_image
        || sku?.raw_data?.image_url || sku?.raw_data?.product_image
        || orderProdThumb || null;

      const gmv = price * quantity;
      const refundedGmv = price * refundedQuantity;
      const commission = finiteNumber(sku?.commission_amount ?? sku?.estimated_commission)
        || (price * (quantity - refundedQuantity) * commissionRate);

      const isVideoMatch = normVideoId ? String(sku?.content_id || '').trim() === normVideoId : false;
      const contentType = String(sku?.content_type || (sku?.content_id ? 'VIDEO' : 'OTHER')).toUpperCase();

      totalItems += quantity;
      totalRefundedItems += refundedQuantity;
      totalGmv += gmv;
      totalRefundedGmv += refundedGmv;
      totalCommission += commission;
      if (orderId) orderIds.add(orderId);

      const rawProdName = sku?.product_name || sku?.title || '';
      const rawSkuName = sku?.sku_name || '';
      const classification = resolveProductClassification(rawSkuName, rawProdName);
      const displayProductName = cleanDisplayProductName(rawProdName);

      rows.push({
        orderId: orderId || `order-${rows.length}`,
        orderTime,
        orderStatus: sku?.item_status || orderStatus || 'COMPLETED',
        skuId: sku?.sku_id || '',
        productId: skuProdId,
        productName: rawProdName,
        displayProductName,
        skuName: classification,
        classification,
        thumbnailUrl: skuThumb,
        quantity,
        refundedQuantity,
        price,
        gmv,
        refundedGmv,
        commission,
        currency: skuCurrency,
        contentType,
        contentId: sku?.content_id || null,
        videoTitle: sku?.video_title || null,
        isVideoMatch,
      });
    }
  }

  rows.sort((a, b) => {
    const timeA = Number(a.orderTime) || (new Date(a.orderTime).getTime() / 1000) || 0;
    const timeB = Number(b.orderTime) || (new Date(b.orderTime).getTime() / 1000) || 0;
    return timeB - timeA;
  });

  return {
    rows,
    totalOrders: orderIds.size,
    totalItems,
    totalRefundedItems,
    totalGmv,
    totalRefundedGmv,
    totalCommission,
    currency,
  };
};

export const productsOfBookingVideo = (video, snapshot) => {
  const raw = snapshot?.raw_metrics || {};
  const rawVideo = raw?.video || raw;
  const listVideo = rawVideo?.list || rawVideo;
  const breakdowns = rawVideo?.detail?.performance?.intervals?.[0]?.sales?.breakdowns || [];
  const sourceProducts = [
    ...(Array.isArray(video?.affiliate_products) ? video.affiliate_products : []),
    ...(Array.isArray(raw.products) ? raw.products : []),
    ...(Array.isArray(listVideo.products) ? listVideo.products : []),
    ...(Array.isArray(breakdowns) ? breakdowns : []),
  ];
  const byId = new Map();
  for (const product of sourceProducts) {
    const id = String(product?.id || product?.product_id || '').trim();
    if (!id) continue;
    const existing = byId.get(id) || {};
    const quantity = optionalNumber(
      product?.items_sold
      ?? product?.quantity
      ?? product?.units_sold
      ?? product?.sold_count,
    );
    byId.set(id, {
      id,
      name: product?.name || product?.title || product?.product_name || existing.name || null,
      thumbnailUrl: product?.main_image_url || product?.thumbnail_url || product?.thumbnailUrl || product?.image_url || existing.thumbnailUrl || null,
      quantity: quantity ?? existing.quantity ?? null,
    });
  }
  const ids = [raw.product_id, rawVideo.product_id, listVideo.product_id]
    .flatMap((value) => String(value || '').split(','))
    .map((id) => id.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!byId.has(id)) byId.set(id, { id, name: null, thumbnailUrl: null, quantity: null });
  }
  if (byId.size === 1) {
    const [id, product] = [...byId.entries()][0];
    if (product.quantity === null || product.quantity === undefined) {
      const totalItemsSold = optionalNumber(snapshot?.items_sold);
      if (totalItemsSold !== null) byId.set(id, { ...product, quantity: totalItemsSold });
    }
  }
  return [...byId.values()];
};

export const productCtrOfBookingVideo = (snapshot) => {
  const raw = snapshot?.raw_metrics || {};
  const rawVideo = raw?.video || raw;
  const listVideo = rawVideo?.list || rawVideo;
  const sales = rawVideo?.detail?.performance?.intervals?.[0]?.sales || {};
  const ratioOf = (source) => {
    const impressions = optionalNumber(source?.product_impressions);
    const clicks = optionalNumber(source?.product_clicks);
    return impressions !== null && impressions > 0 ? (clicks || 0) / impressions : null;
  };
  const overallRatio = ratioOf(sales.overall) ?? ratioOf(raw);
  if (overallRatio !== null) return overallRatio;
  const productRows = Array.isArray(sales.breakdowns) && sales.breakdowns.length
    ? sales.breakdowns
    : Array.isArray(listVideo.products) ? listVideo.products : [];
  const totals = productRows.reduce((result, product) => {
    const impressions = optionalNumber(product?.product_impressions);
    if (impressions === null) return result;
    result.impressions += impressions;
    result.clicks += optionalNumber(product?.product_clicks) || 0;
    return result;
  }, { clicks: 0, impressions: 0 });
  return totals.impressions > 0 ? totals.clicks / totals.impressions : null;
};
