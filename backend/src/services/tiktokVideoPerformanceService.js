const XLSX = require('xlsx');
const crypto = require('node:crypto');
const {
  sequelize,
  TikTokCreatorPerformanceExport,
  TikTokVideoPerformanceSnapshot,
} = require('../models');
const {
  getShopVideoPerformance,
  getShopVideoPerformanceDetails,
} = require('./tiktokShopService');
const { isDemoAuthorization, sellerAffiliateFixture } = require('../lib/tiktokDemoFixtures');
const { upsertShopProducts } = require('./shopProductCatalogService');

const VIDEO_API_MODULE_TYPE = 'VIDEO_API';
const VIDEO_API_PLAN_TYPE = 'AFFILIATE_ACCOUNTS';
const activeApiSyncs = new Map();

const numberValue = (value) => {
  if (value === null || value === undefined || value === '' || value === '--') return 0;
  const parsed = Number(String(value).replaceAll(',', '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullableNumber = (value) => (
  value === null || value === undefined || value === '' || value === '--' ? null : numberValue(value)
);
const productCtr = (clicks, impressions) => {
  const impressionCount = numberValue(impressions);
  return impressionCount > 0 ? numberValue(clicks) / impressionCount : null;
};

const moneyValue = (value) => numberValue(value && typeof value === 'object' ? value.amount : value);
const uniqueValues = (values) => [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const retryableTikTokError = (error) => [36009002, 36009003].includes(Number(error?.tiktokCode))
  || /too many requests|rate limit|timeout|network|fetch|internal error/i.test(String(error?.message || ''));

const requestWithRetry = async (operation, attempts = 4) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!retryableTikTokError(error) || attempt === attempts - 1) throw error;
      const delay = error?.retryAfterMs || (750 * (2 ** attempt));
      await wait(delay);
    }
  }
  throw lastError;
};

const DEFAULT_VIDEO_DETAIL_DELAY_MS = 150;
const DEFAULT_VIDEO_DETAIL_TOP_LIMIT = 50;
const DEFAULT_VIDEO_DETAIL_MAX_FETCH = 200;

const configuredVideoDetailDelayMs = () => {
  const configured = Number(process.env.TIKTOK_VIDEO_DETAIL_DELAY_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_VIDEO_DETAIL_DELAY_MS;
};

const configuredVideoDetailTopLimit = () => {
  const configured = Number(process.env.TIKTOK_VIDEO_DETAIL_TOP_LIMIT);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_VIDEO_DETAIL_TOP_LIMIT;
};

const configuredVideoDetailMaxFetch = () => {
  const configured = Number(process.env.TIKTOK_VIDEO_DETAIL_MAX_FETCH);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_VIDEO_DETAIL_MAX_FETCH;
};

const isVideoDetailEnabled = () => (
  String(process.env.TIKTOK_VIDEO_DETAIL_ENABLED || 'false').trim().toLowerCase() === 'true'
);

const isVideoDetailFetchAll = () => (
  String(process.env.TIKTOK_VIDEO_DETAIL_FETCH_ALL || '').trim().toLowerCase() === 'true'
);

const selectVideosForDetailFetch = (videos = []) => {
  if (!isVideoDetailEnabled()) return new Set();
  if (!Array.isArray(videos) || videos.length === 0) return new Set();
  if (isVideoDetailFetchAll()) {
    return new Set(videos.map((v) => String(v?.id || v?.video_id || '').trim()).filter(Boolean));
  }

  const topLimit = configuredVideoDetailTopLimit();
  const maxFetch = configuredVideoDetailMaxFetch();
  const selectedIds = new Set();

  // 1. Top videos by GMV rank (list is already sorted by GMV DESC)
  const topByRank = videos.slice(0, topLimit);
  for (const video of topByRank) {
    const id = String(video?.id || video?.video_id || '').trim();
    if (id) selectedIds.add(id);
  }

  // 2. Top videos by interactions / views
  if (topLimit > 0) {
    const topByViews = [...videos]
      .sort((a, b) => numberValue(b?.views) - numberValue(a?.views))
      .slice(0, topLimit);
    for (const video of topByViews) {
      const id = String(video?.id || video?.video_id || '').trim();
      if (id && numberValue(video?.views) > 0) selectedIds.add(id);
    }
  }

  // 3. Videos with revenue (GMV > 0), orders (> 0), or items sold (> 0)
  for (const video of videos) {
    const id = String(video?.id || video?.video_id || '').trim();
    if (!id) continue;
    const gmv = moneyValue(video?.gmv);
    const orders = numberValue(video?.sku_orders ?? video?.orders);
    const itemsSold = numberValue(video?.items_sold);
    if (gmv > 0 || orders > 0 || itemsSold > 0) {
      selectedIds.add(id);
    }
  }

  // If selected count exceeds maxFetch, prioritize by GMV, then orders, then views
  if (maxFetch > 0 && selectedIds.size > maxFetch) {
    const prioritized = videos
      .filter((v) => selectedIds.has(String(v?.id || v?.video_id || '').trim()))
      .sort((a, b) => {
        const gmvDiff = moneyValue(b?.gmv) - moneyValue(a?.gmv);
        if (gmvDiff !== 0) return gmvDiff;
        const ordersDiff = numberValue(b?.sku_orders ?? b?.orders) - numberValue(a?.sku_orders ?? a?.orders);
        if (ordersDiff !== 0) return ordersDiff;
        return numberValue(b?.views) - numberValue(a?.views);
      })
      .slice(0, maxFetch);
    return new Set(prioritized.map((v) => String(v?.id || v?.video_id || '').trim()));
  }

  return selectedIds;
};

const mapWithConcurrency = async (items, concurrency, mapper, delayMs = 0, signal = null) => {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      if (signal?.aborted) break;
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
      if (signal?.aborted) break;
      if (delayMs > 0 && cursor < items.length) {
        await wait(delayMs);
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    worker,
  ));
  if (signal?.aborted) {
    const error = new Error('Job was stopped by the user.');
    error.name = 'AbortError';
    throw error;
  }
  return results;
};

const apiVideoRow = ({ exportId, shopId, video, detail, detailError, syncedAt = new Date() }) => {
  const interval = detail?.data?.performance?.intervals?.[0] || {};
  const sales = interval?.sales?.overall || {};
  const traffic = interval?.traffic || {};
  const creator = video?.creator || {};
  const videoId = String(video?.id || video?.video_id || '').trim();
  const username = String(creator.user_name || creator.username || video?.username || '').trim().replace(/^@+/, '');
  const productIds = uniqueValues([
    ...(Array.isArray(video?.products) ? video.products.map((product) => product?.id) : []),
    ...(Array.isArray(interval?.sales?.breakdowns)
      ? interval.sales.breakdowns.map((product) => product?.product_id || product?.id)
      : []),
  ]);
  // Affiliate Center's All videos export follows the per-video detail metrics.
  // The list endpoint can return a different attribution value for individual
  // videos, so use it only when the detail request did not supply the metric.
  const gmv = moneyValue(sales.gmv ?? video?.gmv);
  const orders = Math.round(numberValue(sales.customers ?? video?.sku_orders ?? video?.orders));
  const customers = numberValue(sales.customers ?? video?.avg_customers);
  const views = Math.round(numberValue(video?.views ?? traffic.views));
  const likes = Math.round(numberValue(traffic.likes));
  const comments = Math.round(numberValue(traffic.comments));
  const shares = Math.round(numberValue(traffic.shares));
  const productImpressions = Math.round(numberValue(sales.product_impressions));
  const productClicks = Math.round(numberValue(sales.product_clicks));
  return {
    export_id: exportId,
    shop_id: shopId,
    video_title: String(video?.title || '').trim() || null,
    video_id: videoId,
    post_date: String(video?.video_post_time || video?.post_time || '').trim() || null,
    video_link: username && videoId
      ? `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${encodeURIComponent(videoId)}`
      : null,
    creator_name: String(creator.nick_name || creator.nickname || creator.user_name || video?.username || '').trim() || null,
    product_id: productIds.join(', ') || null,
    creator_attributed_gmv: gmv,
    attributed_orders: orders,
    aov: orders > 0 ? gmv / orders : 0,
    attributed_items_sold: Math.round(numberValue(sales.items_sold ?? video?.items_sold)),
    refunds: 0,
    items_refunded: 0,
    likes,
    comments,
    shares,
    product_impressions: productImpressions,
    product_clicks: productClicks,
    completion_rate: null,
    video_views: views,
    ctr: productCtr(productClicks, productImpressions),
    video_gpm: moneyValue(video?.gpm ?? sales.gpm),
    engagement: views > 0 ? (likes + comments + shares) / views : null,
    avg_gmv_per_customer: customers > 0 ? gmv / customers : 0,
    estimated_commission: 0,
    raw_metrics: {
      source: 'TIKTOK_SHOP_ANALYTICS_API',
      list: video,
      detail: detail?.data || null,
      ...(detailError ? { detail_error: String(detailError.message || detailError) } : {}),
    },
    synced_at: syncedAt,
  };
};

const listAllAffiliateVideos = async (shop, {
  startDate, endDate, currency, maxPages = 500, signal,
}) => {
  const videos = [];
  const seenIds = new Set();
  const seenTokens = new Set();
  const requestIds = [];
  let pageToken;
  let pages = 0;
  do {
    if (signal?.aborted) {
      const error = new Error('Job was stopped by the user.');
      error.name = 'AbortError';
      throw error;
    }
    const payload = await requestWithRetry(() => (
      isDemoAuthorization(shop.authorization)
        ? sellerAffiliateFixture('shop-video-performance', shop, {
          start_date: startDate,
          end_date: endDate,
          currency,
          account_type: VIDEO_API_PLAN_TYPE,
          page_token: pageToken,
        })
        : getShopVideoPerformance({
          authorization: shop.authorization,
          shopCipher: shop.cipher,
          startDate,
          endDate,
          currency,
          accountType: VIDEO_API_PLAN_TYPE,
          sortField: 'gmv',
          sortOrder: 'DESC',
          pageSize: 100,
          pageToken,
        })
    ));
    if (payload?.request_id) requestIds.push(payload.request_id);
    for (const video of payload?.data?.videos || []) {
      const id = String(video?.id || video?.video_id || '').trim();
      if (!/^\d{10,30}$/.test(id) || seenIds.has(id)) continue;
      seenIds.add(id);
      videos.push(video);
    }
    pages += 1;
    const nextToken = String(payload?.data?.next_page_token || '').trim();
    if (!nextToken || seenTokens.has(nextToken)) pageToken = undefined;
    else {
      seenTokens.add(nextToken);
      pageToken = nextToken;
    }
    if (pageToken && pages >= maxPages) {
      throw new Error(`TikTok video pagination exceeded the safety limit of ${maxPages} pages.`);
    }
  } while (pageToken);
  return { videos, requestIds, pages };
};

const loadVideoDetail = (shop, video, { startDate, endDate, currency, signal }) => requestWithRetry(() => (
  isDemoAuthorization(shop.authorization)
    ? sellerAffiliateFixture('shop-video-performance-detail', shop, {
      video,
      video_id: video?.id,
      start_date: startDate,
      end_date: endDate,
      currency,
    })
    : getShopVideoPerformanceDetails({
      authorization: shop.authorization,
      shopCipher: shop.cipher,
      videoId: video?.id,
      startDate,
      endDate,
      currency,
      granularity: 'ALL',
      signal,
    })
));

const processVideoPerformanceApiSync = async (shop, exportRecord, {
  startDate,
  endDate,
  currency = 'LOCAL',
  signal,
} = {}) => {
  try {
    if (signal?.aborted) {
      const error = new Error('Job was stopped by the user.');
      error.name = 'AbortError';
      throw error;
    }
    const { videos, requestIds } = await listAllAffiliateVideos(shop, {
      startDate, endDate, currency, signal,
    });
    await exportRecord.update({ row_count: videos.length });
    const configuredConcurrency = Number(process.env.TIKTOK_VIDEO_DETAIL_CONCURRENCY);
    const concurrency = Number.isInteger(configuredConcurrency)
      ? Math.min(8, Math.max(1, configuredConcurrency))
      : 4;
    const detailVideoIds = selectVideosForDetailFetch(videos);
    let failedDetails = 0;
    const syncedAt = new Date();
    const detailDelayMs = configuredVideoDetailDelayMs();
    const rows = detailVideoIds.size === 0
      ? videos.map((video) => apiVideoRow({
        exportId: exportRecord.id,
        shopId: shop.id,
        video,
        detail: null,
        detailError: null,
        syncedAt,
      }))
      : await mapWithConcurrency(videos, concurrency, async (video) => {
        if (signal?.aborted) {
          const error = new Error('Job was stopped by the user.');
          error.name = 'AbortError';
          throw error;
        }
        const videoId = String(video?.id || video?.video_id || '').trim();
        let detail = null;
        let detailError = null;
        if (detailVideoIds.has(videoId)) {
          try {
            detail = await loadVideoDetail(shop, video, { startDate, endDate, currency, signal });
            if (detail?.request_id) requestIds.push(detail.request_id);
          } catch (error) {
            if (signal?.aborted || error.name === 'AbortError') throw error;
            failedDetails += 1;
            detailError = error;
          }
        }
        return apiVideoRow({
          exportId: exportRecord.id,
          shopId: shop.id,
          video,
          detail,
          detailError,
          syncedAt,
        });
      }, detailDelayMs, signal);
    if (failedDetails > 0) {
      console.warn('[Video Performance API] Video detail requests failed; retaining list metrics', {
        shopId: shop.id,
        totalVideos: videos.length,
        selectedDetails: detailVideoIds.size,
        failedDetails,
      });
    }
    await sequelize.transaction(async (transaction) => {
      if (rows.length) await TikTokVideoPerformanceSnapshot.bulkCreate(rows, { transaction });
      await upsertShopProducts(shop.id, rows.flatMap((row) => {
        const raw = row.raw_metrics || {};
        const breakdowns = raw?.detail?.performance?.intervals?.flatMap((interval) => interval?.sales?.breakdowns || []) || [];
        return [...(raw?.list?.products || []), ...breakdowns];
      }), { transaction });
      await exportRecord.update({
        status: 'SUCCEEDED',
        row_count: rows.length,
        request_id: uniqueValues(requestIds).join(',').slice(0, 255) || null,
        error: failedDetails ? `${failedDetails}/${detailVideoIds.size} video detail request(s) failed; list metrics were retained.` : null,
        completed_at: new Date(),
      }, { transaction });
    });
    return exportRecord.reload();
  } catch (error) {
    const isCancelled = error.name === 'AbortError' || signal?.aborted || /stopped by user|abort/i.test(String(error.message || ''));
    await exportRecord.update({
      status: isCancelled ? 'CANCELLED' : 'FAILED',
      error: isCancelled ? 'Stopped by user.' : String(error.message || error).slice(0, 2000),
      completed_at: new Date(),
    });
    throw error;
  }
};

const startVideoPerformanceApiSync = async (shop, {
  startDate,
  endDate,
  currency = 'LOCAL',
  signal,
} = {}) => {
  const key = `${shop.id}:${startDate}:${endDate}:${currency}`;
  const active = activeApiSyncs.get(key);
  if (active) {
    const exportRecord = await active.startPromise;
    return { exportRecord, started: false };
  }
  const state = {};
  state.startPromise = TikTokCreatorPerformanceExport.create({
    shop_id: shop.id,
    task_id: `API:${crypto.randomUUID()}`,
    module_type: VIDEO_API_MODULE_TYPE,
    window_type: currency === 'USD' ? 'API_USD' : 'API_LOCAL',
    plan_type: VIDEO_API_PLAN_TYPE,
    start_date: startDate,
    end_date: endDate,
    status: 'PROCESSING',
  });
  activeApiSyncs.set(key, state);
  try {
    const exportRecord = await state.startPromise;
    state.processPromise = processVideoPerformanceApiSync(shop, exportRecord, {
      startDate, endDate, currency, signal,
    }).catch((error) => {
      console.error('[Video Performance] API sync failed', {
        shopId: shop.id,
        exportId: exportRecord.id,
        message: error.message,
      });
      throw error;
    }).finally(() => {
      if (activeApiSyncs.get(key) === state) activeApiSyncs.delete(key);
    });
    return { exportRecord, started: true };
  } catch (error) {
    if (activeApiSyncs.get(key) === state) activeApiSyncs.delete(key);
    throw error;
  }
};

const syncVideoPerformanceApi = async (shop, options = {}) => {
  const currency = options.currency === 'USD' ? 'USD' : 'LOCAL';
  const key = `${shop.id}:${options.startDate}:${options.endDate}:${currency}`;
  const { exportRecord } = await startVideoPerformanceApiSync(shop, { ...options, currency });
  const active = activeApiSyncs.get(key);
  if (active?.processPromise) await active.processPromise;
  await exportRecord.reload();
  if (exportRecord.status !== 'SUCCEEDED') {
    const isCancelled = exportRecord.status === 'CANCELLED' || options.signal?.aborted;
    const error = new Error(exportRecord.error || (isCancelled ? 'Stopped by user.' : 'TikTok video performance sync failed.'));
    if (isCancelled) error.name = 'AbortError';
    throw error;
  }
  return {
    export_id: exportRecord.id,
    row_count: exportRecord.row_count,
    start_date: exportRecord.start_date,
    end_date: exportRecord.end_date,
  };
};

const parseVideoPerformanceWorkbook = (buffer, { exportId, shopId }) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('TikTok video workbook does not contain a worksheet.');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows
    .filter((row) => String(row['Video ID'] || '').trim())
    .map((row) => ({
      export_id: exportId,
      shop_id: shopId,
      video_title: String(row['Video title'] || '').trim() || null,
      video_id: String(row['Video ID']).trim(),
      post_date: String(row['Post date'] || '').trim() || null,
      video_link: String(row['Video link'] || '').trim() || null,
      creator_name: String(row['Creator name'] || '').trim() || null,
      product_id: String(row['Product ID'] || '').trim() || null,
      creator_attributed_gmv: numberValue(row['Creator video-attributed GMV']),
      attributed_orders: Math.round(numberValue(row['Video-attributed orders'])),
      aov: numberValue(row.AOV),
      attributed_items_sold: Math.round(numberValue(row['Video-attributed items sold'])),
      refunds: numberValue(row.Refunds),
      items_refunded: Math.round(numberValue(row['Items refunded'])),
      likes: Math.round(numberValue(row.Likes)),
      comments: Math.round(numberValue(row.Comments)),
      shares: Math.round(numberValue(row.Shares)),
      product_impressions: Math.round(numberValue(row['Video product impressions'])),
      product_clicks: Math.round(numberValue(row['Video product clicks'])),
      completion_rate: nullableNumber(row['Completion rate']),
      video_views: Math.round(numberValue(row['Video views'])),
      ctr: productCtr(row['Video product clicks'], row['Video product impressions']),
      video_gpm: numberValue(row['Video GPM']),
      engagement: nullableNumber(row.Engagement),
      avg_gmv_per_customer: numberValue(row['Avg. GMV per customer']),
      estimated_commission: numberValue(row['Est. commission']),
      raw_metrics: row,
      synced_at: new Date(),
    }));
};

const importVideoPerformanceWorkbook = async (shop, buffer, {
  filename = 'video.xlsx', startDate, endDate,
} = {}) => {
  const today = new Date().toISOString().slice(0, 10);
  const exportRecord = await TikTokCreatorPerformanceExport.create({
    shop_id: shop.id,
    task_id: `UPLOAD:${crypto.randomUUID()}`,
    module_type: 'VIDEO',
    window_type: 'UPLOADED',
    plan_type: 'ALL',
    start_date: startDate || today,
    end_date: endDate || today,
    status: 'PROCESSING',
    request_id: String(filename || 'video.xlsx').slice(0, 255),
  });
  try {
    const rows = parseVideoPerformanceWorkbook(buffer, { exportId: exportRecord.id, shopId: shop.id });
    if (!rows.length) throw new Error('The workbook does not contain any rows with a Video ID.');
    await sequelize.transaction(async (transaction) => {
      await TikTokVideoPerformanceSnapshot.bulkCreate(rows, { transaction });
      await exportRecord.update({
        status: 'SUCCEEDED', row_count: rows.length, completed_at: new Date(), error: null,
      }, { transaction });
    });
    return exportRecord.reload();
  } catch (error) {
    await exportRecord.update({ status: 'FAILED', error: String(error.message).slice(0, 2000), completed_at: new Date() });
    throw error;
  }
};

module.exports = {
  VIDEO_API_MODULE_TYPE,
  DEFAULT_VIDEO_DETAIL_DELAY_MS,
  configuredVideoDetailDelayMs,
  importVideoPerformanceWorkbook,
  parseVideoPerformanceWorkbook,
  processVideoPerformanceApiSync,
  startVideoPerformanceApiSync,
  syncVideoPerformanceApi,
  __test: {
    apiVideoRow,
    mapWithConcurrency,
    productCtr,
    retryableTikTokError,
    selectVideosForDetailFetch,
    DEFAULT_VIDEO_DETAIL_DELAY_MS,
    DEFAULT_VIDEO_DETAIL_TOP_LIMIT,
    DEFAULT_VIDEO_DETAIL_MAX_FETCH,
    configuredVideoDetailDelayMs,
    configuredVideoDetailTopLimit,
    configuredVideoDetailMaxFetch,
    isVideoDetailEnabled,
  },
};
