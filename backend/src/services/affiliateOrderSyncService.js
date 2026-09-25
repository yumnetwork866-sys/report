const { Op } = require('sequelize');
const {
  TikTokAffiliateOrder,
  TikTokAffiliateOrderSku,
  TikTokAffiliateOrderSyncDay,
  ShopVideo,
  sequelize,
} = require('../models');
const {
  searchAffiliateOrders,
  searchShopOrders,
  searchSellerProducts,
  SELLER_PRODUCT_BASIC_SCOPE,
  SELLER_ORDER_SCOPE,
} = require('./tiktokShopService');
const { upsertShopProducts } = require('./shopProductCatalogService');
const { scheduledAnalyticsRange } = require('./tiktokShopAnalyticsSyncService');
const { isDemoAuthorization, sellerAffiliateFixture } = require('../lib/tiktokDemoFixtures');

const SHOP_TIMEZONES = {
  MY: 'Asia/Kuala_Lumpur', VN: 'Asia/Ho_Chi_Minh', SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok', PH: 'Asia/Manila', ID: 'Asia/Jakarta',
};

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const config = () => ({
  historyDays: positiveInteger(process.env.AFFILIATE_ORDER_HISTORY_DAYS, 90),
  refreshDays: positiveInteger(process.env.AFFILIATE_ORDER_REFRESH_DAYS, 7),
  initialBackfillDays: positiveInteger(process.env.AFFILIATE_ORDER_INITIAL_BACKFILL_DAYS, 30),
  backfillDays: positiveInteger(process.env.AFFILIATE_ORDER_BACKFILL_DAYS, 7),
  maxPages: positiveInteger(process.env.AFFILIATE_ORDER_MAX_PAGES, 100),
});

const throwIfAborted = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error('Job was stopped by the user.');
  error.name = 'AbortError';
  throw error;
};

const shiftDate = (date, days) => {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

const localParts = (date, timezone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
}).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));

const localMidnightUnix = (date, timezone) => {
  const desired = Date.parse(`${date}T00:00:00.000Z`);
  let candidate = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = localParts(new Date(candidate), timezone);
    const actualUtc = Date.parse(`${actual.year}-${actual.month}-${actual.day}T${actual.hour}:${actual.minute}:${actual.second}.000Z`);
    candidate += desired - actualUtc;
  }
  return Math.floor(candidate / 1000);
};

const orderId = (order) => String(order?.id || order?.order_id || '').trim();
const skuId = (sku, index) => String(sku?.sku_id || sku?.id || [
  sku?.product_id || 'product', sku?.content_type || 'content', sku?.content_id || 'unknown', index,
].join(':')).slice(0, 128);

const loadProductNames = async (shopId) => {
  const rows = await ShopVideo.findAll({ where: { shop_id: shopId }, attributes: ['raw_data'] });
  const names = new Map();
  rows.forEach((row) => {
    const rawData = row?.raw_data || row?.get?.('raw_data') || {};
    (Array.isArray(rawData.products) ? rawData.products : []).forEach((product) => {
      const id = String(product?.id || '').trim();
      const name = product?.name || product?.title;
      if (id && name) names.set(id, String(name));
    });
  });
  return names;
};

const fetchOrderPage = (shop, options) => {
  if (isDemoAuthorization(shop.authorization)) {
    return sellerAffiliateFixture('orders', shop, {
      create_time_ge: options.startTime,
      create_time_lt: options.endTime,
      page_token: options.pageToken,
      page_size: options.pageSize,
    });
  }
  return searchAffiliateOrders({
    authorization: shop.authorization,
    shopCipher: shop.cipher,
    ...options,
  });
};

const resolveShopOrderAuthorization = (shop) => {
  if (shop?.orderAuthorization) {
    const scopes = Array.isArray(shop.orderAuthorization.granted_scopes) ? shop.orderAuthorization.granted_scopes : [];
    if (!scopes.length || scopes.includes(SELLER_ORDER_SCOPE)) return shop.orderAuthorization;
  }
  const scopes = Array.isArray(shop?.authorization?.granted_scopes) ? shop.authorization.granted_scopes : [];
  if (scopes.includes(SELLER_ORDER_SCOPE)) return shop.authorization;
  return null;
};

const hasShopOrderScope = (shop) => Boolean(resolveShopOrderAuthorization(shop));

const normalizeShopOrderToAffiliateOrder = (order) => {
  const rawItems = Array.isArray(order?.line_items)
    ? order.line_items
    : (Array.isArray(order?.item_list) ? order.item_list : (Array.isArray(order?.skus) ? order.skus : []));
  const id = orderId(order);
  const orderCurrency = order?.payment?.currency || order?.currency || 'MYR';
  const directSettlementStatus = /CANCEL/i.test(String(order?.order_status || order?.status || ''))
    ? 'CANCELLED'
    : /COMPLETED/i.test(String(order?.order_status || order?.status || '')) ? 'COMPLETED' : 'PENDING';
  const skusById = new Map();
  rawItems.forEach((item, index) => {
    const rawPrice = item?.sale_price ?? item?.sku_sale_price ?? item?.original_price ?? item?.price;
    const amount = typeof rawPrice === 'object' && rawPrice !== null ? rawPrice.amount : rawPrice;
    const currency = (typeof rawPrice === 'object' && rawPrice !== null ? rawPrice.currency : null)
      || item?.currency || orderCurrency;
    const normalizedSkuId = String(item?.sku_id || item?.id || `${id}-sku-${index}`);
    const quantity = Math.max(0, Number(item?.quantity) || 1);
    const refundedQuantity = Math.max(0, Number(item?.refunded_quantity || item?.cancel_quantity || 0) || 0);
    const current = skusById.get(normalizedSkuId);
    if (current) {
      current.quantity += quantity;
      current.refunded_quantity += refundedQuantity;
      return;
    }
    const productImage = item?.sku_image?.url || item?.product_image?.url
      || item?.sku_image || item?.product_image || item?.image_url || null;
    skusById.set(normalizedSkuId, {
      sku_id: normalizedSkuId,
      product_id: item?.product_id ? String(item.product_id) : null,
      product_name: item?.product_name || item?.sku_name || null,
      sku_name: item?.sku_name || item?.seller_sku || null,
      sku_image: typeof productImage === 'string' ? productImage : null,
      quantity,
      refunded_quantity: refundedQuantity,
      price: { amount: String(amount ?? 0), currency },
      currency,
      creator_username: null,
      content_type: 'DIRECT',
      settlement_status: directSettlementStatus,
      raw_data: item,
    });
  });
  const skus = [...skusById.values()];
  return {
    ...order,
    id,
    order_id: id,
    create_time: order.create_time,
    delivery_time: order.delivery_time || null,
    currency: orderCurrency,
    skus,
    is_direct: true,
  };
};

const mergeShopAndAffiliateOrder = (shopOrder, affiliateOrder) => {
  const normalizedShopOrder = normalizeShopOrderToAffiliateOrder(shopOrder);
  if (!affiliateOrder) return normalizedShopOrder;
  return {
    ...normalizedShopOrder,
    ...affiliateOrder,
    id: normalizedShopOrder.id,
    order_id: normalizedShopOrder.order_id,
    order_status: normalizedShopOrder.order_status || normalizedShopOrder.status || affiliateOrder.order_status,
    status: normalizedShopOrder.status || normalizedShopOrder.order_status || affiliateOrder.status,
    create_time: normalizedShopOrder.create_time || affiliateOrder.create_time,
    delivery_time: normalizedShopOrder.delivery_time || affiliateOrder.delivery_time || null,
    currency: normalizedShopOrder.currency || affiliateOrder.currency,
    skus: Array.isArray(affiliateOrder.skus) && affiliateOrder.skus.length
      ? affiliateOrder.skus
      : normalizedShopOrder.skus,
    is_direct: false,
  };
};

const loadOrderDay = async (shop, metricDate, { signal, maxPages = 100 } = {}) => {
  const timezone = SHOP_TIMEZONES[String(shop.region || '').toUpperCase()] || 'UTC';
  const startTime = localMidnightUnix(metricDate, timezone);
  const endTime = localMidnightUnix(shiftDate(metricDate, 1), timezone);
  const orders = new Map();
  const seenTokens = new Set();
  let pageToken;
  let affiliateExceeded = false;
  for (let page = 0; page < maxPages; page += 1) {
    throwIfAborted(signal);
    const payload = await fetchOrderPage(shop, { pageToken, pageSize: 100, startTime, endTime });
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
      throw new Error('TikTok returned an invalid Affiliate Orders response.');
    }
    const rawOrders = payload.data.orders;
    if (rawOrders !== undefined && rawOrders !== null && !Array.isArray(rawOrders)) {
      throw new Error('TikTok returned an invalid Affiliate Orders response.');
    }
    const ordersList = Array.isArray(rawOrders) ? rawOrders : [];
    ordersList.forEach((order) => {
      const id = orderId(order);
      if (id) orders.set(id, order);
    });
    const nextToken = String(payload.data.next_page_token || '').trim();
    if (!nextToken) break;
    if (seenTokens.has(nextToken)) throw new Error('TikTok returned a repeated Affiliate Orders page token.');
    seenTokens.add(nextToken);
    pageToken = nextToken;
    if (page === maxPages - 1) affiliateExceeded = true;
  }
  if (affiliateExceeded) throw new Error(`TikTok Affiliate Orders pagination exceeded ${maxPages} pages.`);
  const affiliateOrderCount = orders.size;

  const orderAuth = resolveShopOrderAuthorization(shop);
  const shopOrderIds = new Set();
  const shopOrders = new Map();
  if (orderAuth) {
    const seenShopTokens = new Set();
    let shopPageToken;
    let shopExceeded = false;
    for (let page = 0; page < maxPages; page += 1) {
      throwIfAborted(signal);
      const payload = await searchShopOrders({
        authorization: orderAuth,
        shopCipher: shop.cipher,
        pageToken: shopPageToken,
        pageSize: 100,
        startTime,
        endTime,
      });
      if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
        throw new Error('TikTok returned an invalid Shop Orders response.');
      }
      const rawShopOrders = payload.data.orders ?? payload.data.order_list;
      if (rawShopOrders !== undefined && rawShopOrders !== null && !Array.isArray(rawShopOrders)) {
        throw new Error('TikTok returned an invalid Shop Orders response.');
      }
      (Array.isArray(rawShopOrders) ? rawShopOrders : []).forEach((shopOrder) => {
        const id = orderId(shopOrder);
        if (id) shopOrderIds.add(id);
        if (id) shopOrders.set(id, mergeShopAndAffiliateOrder(shopOrder, orders.get(id)));
      });
      const nextToken = String(payload?.data?.next_page_token || '').trim();
      if (!nextToken) break;
      if (seenShopTokens.has(nextToken)) throw new Error('TikTok returned a repeated Shop Orders page token.');
      seenShopTokens.add(nextToken);
      shopPageToken = nextToken;
      if (page === maxPages - 1) shopExceeded = true;
    }
    if (shopExceeded) throw new Error(`TikTok Shop Orders pagination exceeded ${maxPages} pages.`);
  }

  return {
    orders: [...(orderAuth ? shopOrders : orders).values()],
    startTime,
    endTime,
    sources: { affiliate: true, shop_order: Boolean(orderAuth) },
    sourceCounts: { affiliate: affiliateOrderCount, shop_order: shopOrderIds.size },
  };
};

const persistOrderDay = async (shop, metricDate, {
  orders, startTime, endTime, sources, sourceCounts,
}, { productNames = new Map() } = {}) => {
  const syncedAt = new Date();
  const completedSources = sources || { affiliate: true, shop_order: false };
  const completedSourceCounts = sourceCounts || {};
  const existingOrders = typeof TikTokAffiliateOrder.findAll === 'function' ? await TikTokAffiliateOrder.findAll({
    where: {
      shop_id: shop.id,
      create_time: { [Op.gte]: new Date(startTime * 1000), [Op.lt]: new Date(endTime * 1000) },
    },
    attributes: ['order_id', 'raw_data'],
  }) : [];
  const financeByOrderId = new Map(existingOrders
    .filter((order) => order.raw_data?.finance)
    .map((order) => [String(order.order_id), order.raw_data.finance]));
  const normalizedOrders = orders.flatMap((order) => {
    const id = orderId(order);
    const created = Number(order.create_time);
    if (!id || !Number.isFinite(created)) return [];
    const finance = financeByOrderId.get(id);
    return [{
      shop_id: shop.id,
      order_id: id,
      create_time: new Date(created * 1000),
      delivery_time: Number(order.delivery_time) ? new Date(Number(order.delivery_time) * 1000) : null,
      raw_data: finance ? { ...order, finance } : order,
      synced_at: syncedAt,
      source: order,
    }];
  });
  let skuCount = 0;
  await sequelize.transaction(async (transaction) => {
    await TikTokAffiliateOrder.destroy({
      where: {
        shop_id: shop.id,
        create_time: { [Op.gte]: new Date(startTime * 1000), [Op.lt]: new Date(endTime * 1000) },
      },
      transaction,
    });
    const createdOrders = normalizedOrders.length ? await TikTokAffiliateOrder.bulkCreate(
      normalizedOrders.map(({ source: _source, ...row }) => row),
      { transaction, returning: true },
    ) : [];
    const databaseOrderById = new Map(createdOrders.map((order) => [String(order.order_id), order]));
    const skuRows = [];
    normalizedOrders.forEach(({ source, order_id: normalizedOrderId }) => {
      const databaseOrder = databaseOrderById.get(normalizedOrderId);
      if (!databaseOrder) return;
      const seenSkuIds = new Set();
      (Array.isArray(source.skus) ? source.skus : []).forEach((sku, index) => {
        const normalizedSkuId = skuId(sku, index);
        if (seenSkuIds.has(normalizedSkuId)) return;
        seenSkuIds.add(normalizedSkuId);
        const price = Number(sku?.price?.amount ?? sku?.price);
        skuRows.push({
          affiliate_order_id: databaseOrder.id,
          shop_id: shop.id,
          order_id: normalizedOrderId,
          sku_id: normalizedSkuId,
          product_id: sku?.product_id ? String(sku.product_id) : null,
          product_name: sku?.product_name || productNames.get(String(sku?.product_id || '')) || null,
          quantity: Math.max(0, Number(sku?.quantity) || 0),
          refunded_quantity: Math.max(0, Number(sku?.refunded_quantity) || 0),
          content_type: sku?.content_type ? String(sku.content_type).toUpperCase() : null,
          content_id: sku?.content_id ? String(sku.content_id) : null,
          creator_username: sku?.creator_username || null,
          price: Number.isFinite(price) ? price : null,
          currency: sku?.price?.currency || sku?.currency || null,
          settlement_status: sku?.settlement_status || null,
          fully_return: sku?.fully_return === true || String(sku?.fully_return).toLowerCase() === 'true',
          raw_data: sku,
          synced_at: syncedAt,
        });
      });
    });
    if (skuRows.length) await TikTokAffiliateOrderSku.bulkCreate(skuRows, { transaction });
    skuCount = skuRows.length;
    const coverage = {
      shop_id: shop.id,
      metric_date: metricDate,
      order_count: normalizedOrders.length,
      sku_count: skuCount,
      synced_at: syncedAt,
    };
    if (completedSources.affiliate) {
      coverage.affiliate_synced_at = syncedAt;
      coverage.affiliate_order_count = Number(completedSourceCounts.affiliate) || 0;
    }
    if (completedSources.shop_order) {
      coverage.shop_order_synced_at = syncedAt;
      coverage.shop_order_count = Number(completedSourceCounts.shop_order) || 0;
    }
    await TikTokAffiliateOrderSyncDay.upsert(coverage, { transaction });
  });
  return { order_count: normalizedOrders.length, sku_count: skuCount };
};

const selectSyncDates = ({
  endDate,
  existingDates = [],
  coverage = [],
  includeShopOrders = false,
  ...overrides
}) => {
  const settings = { ...config(), ...overrides };
  const allDates = Array.from({ length: settings.historyDays }, (_, index) => shiftDate(endDate, -index));
  const rows = coverage.length
    ? coverage
    : existingDates.map((metricDate) => ({ metric_date: metricDate, affiliate_synced_at: true }));
  const affiliateCoverage = new Set(rows
    .filter((row) => row.affiliate_synced_at || (!('affiliate_synced_at' in row) && row.synced_at))
    .map((row) => String(row.metric_date)));
  const shopOrderCoverage = new Set(rows
    .filter((row) => row.shop_order_synced_at)
    .map((row) => String(row.metric_date)));
  const refresh = allDates.slice(0, settings.refreshDays);
  const affiliateBudget = affiliateCoverage.size ? settings.backfillDays : settings.initialBackfillDays;
  const affiliateMissing = allDates
    .filter((date) => !affiliateCoverage.has(date))
    .slice(0, affiliateBudget);
  const shopOrderBudget = shopOrderCoverage.size ? settings.backfillDays : settings.initialBackfillDays;
  const shopOrderMissing = includeShopOrders
    ? allDates.filter((date) => !shopOrderCoverage.has(date)).slice(0, shopOrderBudget)
    : [];
  const protectedRefresh = includeShopOrders
    ? refresh
    : refresh.filter((date) => !shopOrderCoverage.has(date));
  return [...new Set([...protectedRefresh, ...affiliateMissing, ...shopOrderMissing])];
};

const syncProductCatalog = async (shop, { signal, maxPages = 100 } = {}) => {
  const authorization = [shop?.authorization, shop?.orderAuthorization].find((candidate) => (
    Array.isArray(candidate?.granted_scopes)
    && candidate.granted_scopes.includes(SELLER_PRODUCT_BASIC_SCOPE)
  ));
  if (!authorization || typeof searchSellerProducts !== 'function') return 0;
  const seenTokens = new Set();
  let pageToken;
  let synced = 0;
  for (let page = 0; page < maxPages; page += 1) {
    throwIfAborted(signal);
    const payload = await searchSellerProducts({
      authorization,
      shopCipher: shop.cipher,
      pageToken,
      pageSize: 100,
    });
    const products = Array.isArray(payload?.data?.products) ? payload.data.products : [];
    synced += await upsertShopProducts(shop.id, products);
    const nextToken = String(payload?.data?.next_page_token || '').trim();
    if (!nextToken) return synced;
    if (seenTokens.has(nextToken)) throw new Error('TikTok Product Basic pagination repeated a page token.');
    seenTokens.add(nextToken);
    pageToken = nextToken;
  }
  throw new Error(`TikTok Product Basic pagination exceeded ${maxPages} pages.`);
};

const syncAffiliateOrders = async (shop, { signal, now = new Date() } = {}) => {
  const settings = config();
  const { endDate } = scheduledAnalyticsRange(shop, now);
  const historyStart = shiftDate(endDate, -(settings.historyDays - 1));
  const coverage = await TikTokAffiliateOrderSyncDay.findAll({
    where: { shop_id: shop.id, metric_date: { [Op.gte]: historyStart, [Op.lte]: endDate } },
    attributes: ['metric_date', 'synced_at', 'affiliate_synced_at', 'shop_order_synced_at'], raw: true,
  });
  const includeShopOrders = hasShopOrderScope(shop);
  const dates = selectSyncDates({ endDate, coverage, includeShopOrders, ...settings });
  const productsSynced = await syncProductCatalog(shop, { signal, maxPages: settings.maxPages });
  const productNames = await loadProductNames(shop.id);
  const results = [];
  for (const metricDate of dates) {
    throwIfAborted(signal);
    const page = await loadOrderDay(shop, metricDate, { signal, maxPages: settings.maxPages });
    results.push({ metric_date: metricDate, ...await persistOrderDay(shop, metricDate, page, { productNames }) });
  }
  return {
    days_synced: results.length,
    products_synced: productsSynced,
    orders_synced: results.reduce((sum, row) => sum + row.order_count, 0),
    skus_synced: results.reduce((sum, row) => sum + row.sku_count, 0),
    results,
  };
};

module.exports = {
  syncAffiliateOrders,
  __test: { loadOrderDay, loadProductNames, persistOrderDay, selectSyncDates, localMidnightUnix, orderId, skuId, shiftDate, syncProductCatalog },
};
