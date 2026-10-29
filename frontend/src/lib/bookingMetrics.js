export const DEFAULT_PERFORMANCE_WINDOW = 'LIFETIME';

export const PRODUCT_ORDERS_CACHE_TTL_MS = 5 * 60 * 1000;
export const BOOKING_UI_SESSION_KEY = 'booking-management-ui';
export const PRODUCT_ORDERS_CACHE_SESSION_KEY = 'booking-product-orders-cache';

export const currentBookingMonth = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

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

export const isBookingVisibleInPeriod = (booking, activeRange, bookingTab, productPerformance = null) => {
  if (isBookingInPeriod(booking, activeRange)) return true;
  if (bookingTab !== 'product' || finiteNumber(productPerformance?.affiliate_videos) <= 0) return false;
  const bookingDate = bookingDateOf(booking);
  return Boolean(bookingDate && (!activeRange?.endDate || bookingDate <= activeRange.endDate));
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

export const uniqueBookingVideosForBookings = (bookings = [], videoPerformanceByBooking = new Map()) => {
  const videos = new Map();
  for (const booking of Array.isArray(bookings) ? bookings : []) {
    const videoData = videoPerformanceByBooking.get(String(booking?.id));
    const list = videoData?.videos || bookingVideosOf(booking);
    list.forEach((video, index) => {
      const identity = String(video?.platform_video_id || video?.id || '').trim();
      const shopId = String(booking?.target_shop_id || booking?.target_shop?.id || 'no-shop');
      const key = identity ? `${shopId}:${identity}` : `${shopId}:booking:${booking?.id}:video:${index}`;
      const existing = videos.get(key);
      if (!existing) {
        videos.set(key, {
          ...video,
          attributed_product_ids: [...new Set(video?.attributed_product_ids || [])],
          _booking_shop_id: shopId,
        });
        return;
      }
      existing.attributed_product_ids = [...new Set([
        ...(existing.attributed_product_ids || []),
        ...(video?.attributed_product_ids || []),
      ].map((value) => String(value || '').trim()).filter(Boolean))];
      existing.is_shared_booking_video = true;
      existing.shared_booking_count = Math.max(
        Number(existing.shared_booking_count || 1),
        Number(video?.shared_booking_count || 2),
      );
    });
  }
  return [...videos.values()];
};

export const bookingVideoLinkCountForBookings = (bookings = [], videoPerformanceByBooking = new Map()) => (
  (Array.isArray(bookings) ? bookings : []).reduce((total, booking) => {
    const videoData = videoPerformanceByBooking.get(String(booking?.id));
    const videos = videoData?.videos || bookingVideosOf(booking);
    return total + videos.length;
  }, 0)
);

export const bookingProductsOf = (booking) => {
  const snapshot = snapshotOf(booking);
  const products = [
    ...(Array.isArray(snapshot?.products) ? snapshot.products : []),
    ...(Array.isArray(booking?.products) ? booking.products : []),
    ...(Array.isArray(booking?.selected_products) ? booking.selected_products : []),
  ];
  const byId = new Map(products.map((product) => [String(product.id || product.product_id), product]));
  const productIds = [
    ...(Array.isArray(snapshot?.product_ids) ? snapshot.product_ids : []),
    ...(Array.isArray(booking?.product_ids) ? booking.product_ids : []),
  ];
  for (const value of productIds) {
    const id = String(value || '').trim();
    if (id && !byId.has(id)) byId.set(id, { id, name: id, image_url: null });
  }
  return [...byId.values()].filter((product) => String(product.id || product.product_id || '').trim());
};

export const bookingCreatorKey = (booking) => {
  const openId = String(booking?.creator_open_id || '').trim();
  if (openId) return `open:${openId}`;
  const username = String(booking?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase('en');
  if (username) return `username:${username}`;
  const creatorId = String(booking?.creator_id || '').trim();
  if (creatorId) return `creator:${creatorId}`;
  return `booking:${booking?.id || ''}`;
};

export const groupBookingRowsByCreator = (bookings = []) => {
  const groups = new Map();
  for (const booking of Array.isArray(bookings) ? bookings : []) {
    const shopId = String(booking?.target_shop_id || booking?.target_shop?.id || 'no-shop');
    const key = `${shopId}:${bookingCreatorKey(booking)}`;
    const existing = groups.get(key);
    if (existing) {
      existing._creator_bookings.push(booking);
      continue;
    }
    groups.set(key, {
      ...booking,
      _creator_bookings: [booking],
    });
  }
  return [...groups.values()];
};

export const mergeBookingProductBreakdowns = (performances = []) => {
  const products = new Map();
  for (const performance of Array.isArray(performances) ? performances : []) {
    for (const product of Array.isArray(performance?.breakdown) ? performance.breakdown : []) {
      const id = String(product?.id || product?.product_id || '').trim();
      if (!id) continue;
      const existing = products.get(id);
      if (!existing) {
        products.set(id, { ...product, id });
        continue;
      }
      products.set(id, {
        ...existing,
        name: existing.name || product.name || id,
        ...((existing.thumbnailUrl || product.thumbnailUrl || product.image_url)
          ? { thumbnailUrl: existing.thumbnailUrl || product.thumbnailUrl || product.image_url }
          : {}),
        // Repeated bookings for the same KOC/product are backed by the same orders.
        // Keep the largest scoped value instead of summing the same orders twice.
        orderCount: Math.max(finiteNumber(existing.orderCount), finiteNumber(product.orderCount)),
        quantity: Math.max(finiteNumber(existing.quantity), finiteNumber(product.quantity)),
      });
    }
  }
  return [...products.values()];
};

export const bookingProductVideoSummary = (performances = []) => {
  const viewsByVideoId = new Map();
  for (const performance of Array.isArray(performances) ? performances : []) {
    const detailedViews = new Map((Array.isArray(performance?.affiliate_video_views)
      ? performance.affiliate_video_views
      : []).map((video) => [String(video?.id || '').trim(), finiteNumber(video?.views)]));
    for (const rawVideoId of performance?.affiliate_video_ids || []) {
      const videoId = String(rawVideoId || '').trim();
      if (!videoId) continue;
      viewsByVideoId.set(videoId, Math.max(
        viewsByVideoId.get(videoId) || 0,
        detailedViews.get(videoId) || 0,
      ));
    }
  }
  const videos = [...viewsByVideoId].map(([id, views]) => ({ id, views }));
  return {
    videos,
    videoIds: videos.map((video) => video.id),
    videoCount: videos.length,
    views: videos.reduce((sum, video) => sum + video.views, 0),
  };
};

export const countPaidBookingKocs = (bookings = [], isInPeriod = () => true) => new Set(
  (Array.isArray(bookings) ? bookings : [])
    .filter((booking) => (
      isInPeriod(booking)
      && finiteNumber(booking?.total_cost ?? booking?.booking_cost) > 0
    ))
    .map(bookingCreatorKey),
).size;

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
  views: 'views',
  refunds: 'refunded_gmv',
  items_sold: 'items_sold',
  samples: 'samples_shipped',
  commission: 'estimated_commission',
};

export const bookingPerformanceSortValue = (performance, sortKey) => (
  finiteNumber(performance?.[BOOKING_PERFORMANCE_SORT_FIELDS[sortKey]])
);

export const DEFAULT_BOOKING_SORT_BY_TAB = Object.freeze({
  video: Object.freeze({ key: 'cost', direction: 'desc' }),
  product: Object.freeze({ key: 'revenue', direction: 'desc' }),
});

export const defaultBookingSortForTab = (tab) => (
  DEFAULT_BOOKING_SORT_BY_TAB[tab] || DEFAULT_BOOKING_SORT_BY_TAB.video
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

export const bookingProductOrderPerformance = (booking, orders = [], periodRange = null, options = {}) => {
  const selectedProducts = bookingProductsOf(booking);
  const selectedIds = new Set(selectedProducts.map((product) => String(product.id || product.product_id)));
  const creatorUsername = String(booking?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
  const bypassProductMatch = Boolean(options?.bypassProductMatch);
  const orderIds = new Set();
  const videoIds = new Set();
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
      if ((!bypassProductMatch && !selectedIds.has(productId)) || (creatorUsername && skuCreator !== creatorUsername)) continue;
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
      const contentId = String(sku?.content_id || '').trim();
      const contentType = String(sku?.content_type || sku?.raw_data?.content_type || '').toUpperCase();
      if (contentId && (!contentType || contentType.includes('VIDEO'))) videoIds.add(contentId);
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
    affiliate_videos: videoIds.size,
    affiliate_video_ids: [...videoIds],
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

export const latestBookingVideoSnapshot = (video) => video?.latest_performance || [...(video?.performance_snapshots || [])]
  .sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || null;

const normalizedHashtag = (value) => {
  const tag = String(value || '').trim().toLocaleLowerCase('en').replace(/^#+/, '');
  return tag ? `#${tag}` : '';
};

export const fullTitleOfVideo = (video, snapshot = null) => {
  const videoId = String(video?.platform_video_id || video?.id || '').trim();
  const raw = snapshot?.raw_metrics || video?.raw_metrics || {};
  const list = raw?.video?.list || raw?.list || raw?.video || raw;
  const candidates = [
    video?.title,
    video?.caption,
    video?.description,
    snapshot?.title,
    raw?.title,
    list?.title,
    video?.raw_data?.title,
    video?.raw_data?.item_title,
    video?.raw_data?.caption,
  ]
    .map((text) => String(text || '').trim())
    .filter((text) => text && text !== videoId);

  if (candidates.length) return candidates[0];
  return video?.title || videoId || 'TikTok Video';
};

export const extractVideoHashtags = (video, fullTitle = '') => {
  const raw = latestBookingVideoSnapshot(video)?.raw_metrics || {};
  const list = raw?.video?.list || raw?.list || raw?.video || raw;
  const text = [
    fullTitle,
    video?.title,
    video?.caption,
    video?.description,
    video?.raw_data?.title,
    video?.raw_data?.item_title,
    video?.raw_data?.caption,
    raw?.title,
    list?.title,
  ].filter(Boolean).join(' ');

  const matches = (text.match(/#[^\s#]+/g) || []).map((t) => t.replace(/[.,;:!?]+$/, ''));
  const seen = new Set();
  const result = [];
  for (const tag of matches) {
    const clean = tag.trim();
    const lower = clean.toLowerCase();
    if (clean && !seen.has(lower)) {
      seen.add(lower);
      result.push(clean.startsWith('#') ? clean : `#${clean}`);
    }
  }
  return result;
};

export const bookingVideoHashtags = (video) => {
  const raw = latestBookingVideoSnapshot(video)?.raw_metrics || {};
  const list = raw?.video?.list || raw?.list || raw?.video || raw;
  const provided = [
    video?.hashtags,
    video?.raw_data?.hashtags,
    raw?.hashtags,
    list?.hashtags,
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
  const videoTags = bookingVideoHashtags(video);
  return videoTags.some((tag) => {
    if (configured.has(tag)) return true;
    const cleanTag = tag.replace(/^#+/, '');
    for (const conf of configured) {
      const cleanConf = conf.replace(/^#+/, '');
      if (cleanConf && cleanTag.endsWith(cleanConf)) return true;
    }
    return false;
  });
};

export const videoProductIdsOf = (video) => {
  const latest = latestBookingVideoSnapshot(video);
  const raw = latest?.raw_metrics || {};
  const list = raw?.video?.list || raw?.list || raw?.video || raw;
  const listProducts = Array.isArray(list?.products) ? list.products : [];
  const rawProducts = Array.isArray(raw?.products) ? raw.products : [];
  const videoProducts = Array.isArray(video?.products) ? video.products : [];
  const rawDataProducts = Array.isArray(video?.raw_data?.products) ? video.raw_data.products : [];

  const ids = [
    ...(Array.isArray(video?.attributed_product_ids) ? video.attributed_product_ids : []),
    ...(Array.isArray(raw?.selected_product_ids) ? raw.selected_product_ids : []),
    ...(Array.isArray(raw?.order_metrics?.product_ids) ? raw.order_metrics.product_ids : []),
    ...listProducts.map((p) => p?.id || p?.product_id),
    ...rawProducts.map((p) => p?.id || p?.product_id),
    ...videoProducts.map((p) => p?.id || p?.product_id),
    ...rawDataProducts.map((p) => p?.id || p?.product_id),
    video?.product_id,
    raw?.product_id,
  ].map((val) => String(val || '').trim()).filter(Boolean);
  return new Set(ids);
};

export const bookingVideoMatchesProducts = (video, booking) => {
  const selectedProducts = bookingProductsOf(booking);
  if (!selectedProducts.length) return true;
  const selectedIds = new Set(selectedProducts.map((p) => String(p.id || p.product_id)));
  const videoProductIds = videoProductIdsOf(video);
  if (!videoProductIds.size) return true;
  for (const id of videoProductIds) {
    if (selectedIds.has(id)) return true;
  }
  return false;
};

export const bookingVideoOrderMetrics = (video, booking, orders = [], options = {}) => {
  const normVideoId = String(video?.platform_video_id || '').trim();
  const normCreator = String(booking?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
  const selectedProductIds = new Set((Array.isArray(video?.attributed_product_ids) ? video.attributed_product_ids : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean));
  if (!normVideoId || !Array.isArray(orders) || !orders.length) return null;
  const bypassProductMatch = Boolean(options?.bypassProductMatch);

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
      const productId = String(sku?.product_id || '').trim();
      if (!bypassProductMatch && selectedProductIds.size && !selectedProductIds.has(productId)) continue;
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
    const postDate = rawPostDate instanceof Date
      ? dateInputValue(rawPostDate)
      : String(rawPostDate).slice(0, 10);
    if (periodRange.startDate && postDate < periodRange.startDate) return false;
    if (periodRange.endDate && postDate > periodRange.endDate) return false;
    return true;
  });
};

export const bookingVideoPerformanceForVideos = (videos = [], basePerformance = null, shopOrders = [], options = {}) => {
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
  let hasCompleteViews = true;
  let hasAnyViews = false;
  let hasAnyRefunds = false;
  let hasAnyRefundedItems = false;
  let hasAnyCommission = false;
  let revenueCurrency = null;
  let activityCurrency = null;
  let observedCurrency = null;

  for (const video of videos) {
    const latest = latestBookingVideoSnapshot(video);
    const live = bookingVideoOrderMetrics(video, null, shopOrders, options);
    const videoGmv = live ? live.grossGmv : finiteNumber(latest?.gross_gmv ?? video?.gross_gmv ?? video?.gmv);
    const videoOrders = live ? live.orderCount : finiteNumber(latest?.orders ?? video?.orders);
    const videoItems = live ? live.itemsSold : finiteNumber(latest?.items_sold ?? video?.items_sold);
    const rawViews = latest?.views ?? video?.views ?? latest?.raw_metrics?.views ?? latest?.raw_metrics?.video?.list?.views ?? latest?.raw_metrics?.social_metrics?.views;
    const videoViews = finiteNumber(rawViews);
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
    hasCompleteViews = hasCompleteViews && rawViews !== null && rawViews !== undefined;
    hasAnyViews = hasAnyViews || (rawViews !== null && rawViews !== undefined);
    hasAnyRefunds = hasAnyRefunds || (rawRefunded !== null && rawRefunded !== undefined);
    hasAnyRefundedItems = hasAnyRefundedItems || (rawItemsRefunded !== null && rawItemsRefunded !== undefined);
    hasAnyCommission = hasAnyCommission || (rawCommission !== null && rawCommission !== undefined);
    const videoCurrency = latest?.currency || video?.currency || null;
    if (videoCurrency) {
      observedCurrency ||= videoCurrency;
      if (videoGmv !== 0) revenueCurrency ||= videoCurrency;
      if (videoOrders !== 0 || videoItems !== 0 || videoRefunded !== 0 || videoCommission !== 0) {
        activityCurrency ||= videoCurrency;
      }
    }
  }
  return {
    gross_gmv: grossGmv,
    views: (hasCompleteViews || hasAnyViews || views > 0) ? views : (videos.length ? 0 : null),
    orders,
    items_sold: itemsSold,
    refunded_gmv: hasAnyRefunds ? refundedGmv : null,
    items_refunded: hasAnyRefundedItems ? itemsRefunded : null,
    currency: revenueCurrency || activityCurrency || observedCurrency || basePerformance?.currency || 'MYR',
    video_count: videos.length,
    samples_shipped: basePerformance?.samples_shipped ?? 0,
    estimated_commission: hasAnyCommission ? estimatedCommission : null,
  };
};

export const bookingVideoSocialMetrics = (snapshot) => {
  if (snapshot?.social_metrics) {
    const shared = snapshot.social_metrics;
    return {
      views: optionalNumber(shared.views) ?? optionalNumber(snapshot?.views),
      likes: shared.available === false ? null : optionalNumber(shared.likes),
      comments: shared.available === false ? null : optionalNumber(shared.comments),
      shares: shared.available === false ? null : optionalNumber(shared.shares),
      available: Boolean(shared.available),
      metricWindow: shared.metric_window || null,
      syncedAt: shared.synced_at || snapshot?.synced_at || null,
    };
  }
  const rawVideo = snapshot?.raw_metrics?.video || snapshot?.raw_metrics || {};
  const listVideo = rawVideo?.list || rawVideo;
  const traffic = rawVideo?.detail?.performance?.intervals?.[0]?.traffic || {};
  const shared = snapshot?.raw_metrics?.social_metrics;
  if (shared) {
    const isAvailable = Boolean(
      shared.available
      || (shared.available !== false && (shared.likes !== null || shared.comments !== null || shared.shares !== null))
      || shared.likes > 0
      || shared.comments > 0
      || shared.shares > 0
    );
    return {
      views: optionalNumber(shared.views) ?? optionalNumber(snapshot?.views) ?? optionalNumber(listVideo?.views),
      likes: isAvailable ? optionalNumber(shared.likes) : null,
      comments: isAvailable ? optionalNumber(shared.comments) : null,
      shares: isAvailable ? optionalNumber(shared.shares) : null,
      available: isAvailable,
      metricWindow: shared.metric_window || 'PAST_30_DAYS',
      syncedAt: shared.synced_at || null,
    };
  }
  const available = ['likes', 'comments', 'shares'].some((key) => traffic[key] !== null && traffic[key] !== undefined)
    || ['likes', 'comments', 'shares'].some((key) => snapshot?.[key] !== null && snapshot?.[key] !== undefined && Number(snapshot[key]) >= 0);
  return {
    views: optionalNumber(snapshot?.views ?? listVideo?.views ?? traffic.views ?? snapshot?.video_views),
    likes: available ? optionalNumber(traffic.likes ?? listVideo?.likes ?? rawVideo?.likes ?? snapshot?.likes) : null,
    comments: available ? optionalNumber(traffic.comments ?? listVideo?.comments ?? rawVideo?.comments ?? snapshot?.comments) : null,
    shares: available ? optionalNumber(traffic.shares ?? listVideo?.shares ?? rawVideo?.shares ?? snapshot?.shares) : null,
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
      const normalizedOrderStatus = String(orderStatus || '').trim().toUpperCase();
      const normalizedItemStatus = String(sku?.item_status || '').trim().toUpperCase();
      const normalizedStatus = normalizedItemStatus || normalizedOrderStatus || 'COMPLETED';
      const combinedStatus = `${normalizedOrderStatus} ${normalizedItemStatus}`;
      const isCancelled = /CANCEL/.test(combinedStatus);
      const hasRefundStatus = /REFUND|RETURN/.test(combinedStatus);
      const isFullyRefunded = quantity > 0 && (refundedQuantity >= quantity || hasRefundStatus);
      const isPartiallyRefunded = !isFullyRefunded && refundedQuantity > 0;
      const effectiveQuantity = isCancelled || isFullyRefunded
        ? 0
        : Math.max(quantity - refundedQuantity, 0);
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
        orderStatus: normalizedStatus,
        isCancelled,
        isFullyRefunded,
        isPartiallyRefunded,
        effectiveQuantity,
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
        videoPostedAt: sku?.video_post_time || sku?.post_date || sku?.posted_at || null,
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
  const directCtr = optionalNumber(snapshot?.ctr);
  if (directCtr !== null) return directCtr;
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

export const extractTikTokVideoId = (video) => {
  const directId = String(video?.video_id || video?.platform_video_id || video?.id || '').trim();
  if (/^\d{10,25}$/.test(directId)) return directId;
  if (video?.video_url) {
    const match = String(video.video_url).match(/\/video\/(\d{10,25})/);
    if (match) return match[1];
  }
  return null;
};

export const extractTikTokUsername = (video, explicitUsername) => {
  const raw = explicitUsername || video?.creator_username || video?.creator?.user_name || video?.username || '';
  const cleaned = String(raw).trim().replace(/^@+/, '');
  if (cleaned) return cleaned;
  if (video?.video_url) {
    const match = String(video.video_url).match(/@([^/?#]+)/);
    if (match) return match[1];
  }
  return '';
};
