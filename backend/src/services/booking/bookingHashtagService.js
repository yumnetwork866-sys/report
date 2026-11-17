const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../models');
const { dateOnlyInTimezone } = require('../../lib/dateTimeUtils');
const { IS_NOT_CANCELLED_SQL, videoMatchesStaffHashtags } = require('../bookingVideoPerformanceService');

const periodOf = (query) => {
  let startDate = query.start_date || query.startDate || null;
  let endDate = query.end_date || query.endDate || null;
  if (!startDate && /^\d{4}-\d{2}$/.test(query.month || '')) {
    startDate = `${query.month}-01`;
    const [year, month] = query.month.split('-').map(Number);
    endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  }
  return { startDate, endDate };
};

const metricFields = ['orders', 'gross_gmv', 'refunded_gmv', 'items_sold', 'items_refunded', 'estimated_commission'];
const emptyMetrics = () => Object.fromEntries(metricFields.map((field) => [field, 0]));
const rowKey = (row) => `${row.staff_id}:${row.shop_id}:${String(row.creator_username).replace(/^@+/, '').toLowerCase()}`;

const buildHashtagRows = (candidates, metrics, costs, startDate) => {
  const rows = new Map();
  const ensure = (item) => {
    const key = rowKey(item);
    if (!rows.has(key)) rows.set(key, {
      id: `hashtag:${key}`, is_hashtag_report: true, _detail_loaded: true,
      staff_id: item.staff_id, staff_name: item.staff_name,
      staff: { id: item.staff_id, name: item.staff_name, email: item.staff_email },
      creator_username: item.creator_username, creator_name: item.creator_name || item.creator_username,
      creator_avatar_url: item.creator_avatar_url || null,
      target_shop_id: item.shop_id,
      target_shop: { id: item.shop_id, name: item.shop_name, code: item.shop_code, region: item.region },
      start_date: startDate, total_cost: 0, currency: item.currency || (item.region === 'VN' ? 'VND' : 'MYR'),
      products: [], product_ids: [], booking_videos: [],
      actual_performance: { ...emptyMetrics(), video_count: 0, views: 0 },
      product_performance: { source: 'AFFILIATE_ORDERS', affiliate_video_ids: [], affiliate_video_views: [], breakdown: [] },
    });
    const row = rows.get(key);
    if (item.creator_avatar_url) row.creator_avatar_url = item.creator_avatar_url;
    return row;
  };
  const metricsByVideo = new Map();
  for (const metric of metrics) {
    const key = `${metric.shop_id}:${metric.content_id}`;
    if (!metricsByVideo.has(key)) metricsByVideo.set(key, []);
    metricsByVideo.get(key).push(metric);
  }
  for (const cost of costs) {
    const row = ensure(cost);
    row.total_cost += Number(cost.total_cost) || 0;
    const products = (cost.booked_products || []).flat().filter((product) => product?.id || product?.product_id);
    const productIds = (cost.booked_product_ids || []).flat().filter(Boolean).map(String);
    for (const product of [...products, ...productIds.map((id) => ({ id }))]) {
      const id = String(product.id || product.product_id);
      if (row.product_ids.includes(id)) continue;
      row.products.push({ ...product, id });
      row.product_ids.push(id);
    }
  }
  for (const video of candidates) {
    const row = ensure(video);
    if (row.booking_videos.some((item) => item.platform_video_id === video.platform_video_id)) continue;
    const entries = metricsByVideo.get(`${video.shop_id}:${video.platform_video_id}`) || [];
    const total = entries.find((item) => Number(item.is_total) === 1);
    const products = entries.filter((item) => Number(item.is_total) === 0 && item.product_id);
    const snapshot = {
      ...Object.fromEntries(metricFields.map((field) => [field, Number(total?.[field]) || 0])),
      views: Number(video.views) || 0, currency: total?.currency || row.currency,
      raw_metrics: { products: products.map((product) => ({ id: product.product_id, name: product.product_name, items_sold: Number(product.items_sold) || 0 })) },
    };
    row.booking_videos.push({
      id: video.platform_video_id, platform_video_id: video.platform_video_id,
      title: video.title, hashtags: video.hashtags, posted_at: video.posted_at,
      post_date: dateOnlyInTimezone(video.posted_at, video.region), region: video.region,
      attributed_product_ids: products.map((product) => product.product_id),
      latest_performance: snapshot,
    });
    for (const field of metricFields) row.actual_performance[field] += snapshot[field];
    row.actual_performance.views += snapshot.views;
    row.actual_performance.video_count += 1;
    row.actual_performance.currency = snapshot.currency;
    if (total) {
      row.product_performance.affiliate_video_ids.push(video.platform_video_id);
      row.product_performance.affiliate_video_views.push({ id: video.platform_video_id, views: snapshot.views });
    }
    for (const product of products) {
      let breakdown = row.product_performance.breakdown.find((item) => item.id === product.product_id);
      if (!breakdown) {
        breakdown = { id: product.product_id, name: product.product_name || product.product_id, orderCount: 0, quantity: 0 };
        row.product_performance.breakdown.push(breakdown);
        if (!row.product_ids.includes(product.product_id)) {
          row.products.push({ id: product.product_id, name: breakdown.name });
          row.product_ids.push(product.product_id);
        }
      }
      breakdown.orderCount += Number(product.orders) || 0;
      breakdown.quantity += Number(product.items_sold) || 0;
    }
  }
  for (const row of rows.values()) Object.assign(row.product_performance, row.actual_performance, {
    affiliate_gmv: row.actual_performance.gross_gmv, affiliate_orders: row.actual_performance.orders,
    affiliate_videos: row.product_performance.affiliate_video_ids.length,
    video_views: row.actual_performance.views, has_products: row.products.length > 0,
  });
  return [...rows.values()];
};

const getHashtagRows = async (query = {}, session = {}, database = sequelize) => {
  const { startDate, endDate } = periodOf(query);
  const canViewStaff = session.role === 'admin' || (session.permissions || []).some((permission) => [
    'admin.users.view', 'admin.users.manage', 'users.view', 'users.manage',
  ].includes(permission));
  const staffIds = query.staffIds || query.staff_ids;
  const replacements = {
    startDate, endDate, bookingRoles: ['member', 'koc'],
    staffId: canViewStaff ? Number(query.staff_id || query.staffId) || null : Number(session.sub) || -1,
    staffIds: Array.isArray(staffIds) ? JSON.stringify(staffIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)) : null,
    shopId: Number(query.shop_id || query.shopId) || null,
    startTime: Number(query.start_time || query.startTime) || null,
    endTime: Number(query.end_time || query.endTime) || null,
  };
  const staffFilter = `u.is_active = true AND u.role IN (:bookingRoles)
    AND (:staffId IS NULL OR u.id = :staffId)
    AND (CAST(:staffIds AS jsonb) IS NULL OR u.id IN (SELECT value::int FROM jsonb_array_elements_text(CAST(:staffIds AS jsonb))))`;
  const staff = await database.query(`SELECT u.id AS staff_id, u.name AS staff_name, u.email AS staff_email, a.hashtags
    FROM users u JOIN user_content_attributions a ON a.user_id = u.id WHERE ${staffFilter}
  `, { replacements, type: QueryTypes.SELECT });
  if (!staff.length) return [];
  const timezone = `CASE WHEN shop.region IN ('MY','SG','PH') THEN 'Asia/Kuala_Lumpur' ELSE 'Asia/Ho_Chi_Minh' END`;
  const videos = await database.query(`
    SELECT v.shop_id, shop.name AS shop_name, shop.code AS shop_code, shop.region,
      v.platform_video_id, v.title, v.posted_at, v.creator_username,
      COALESCE(profile.avatar_url, identity.creator_avatar_url) AS creator_avatar_url,
      COALESCE(profile.nickname, identity.creator_name, v.creator_username) AS creator_name,
      COALESCE((SELECT snapshot.views FROM shop_video_performance_snapshots snapshot
        WHERE snapshot.shop_video_id = v.id ORDER BY snapshot.snapshot_date DESC, snapshot.id DESC LIMIT 1), 0) AS views
    FROM shop_videos v JOIN tiktok_shops shop ON shop.id = v.shop_id
    LEFT JOIN LATERAL (SELECT p.avatar_url, p.nickname FROM tiktok_creator_profiles p
      WHERE p.username = LOWER(TRIM(LEADING '@' FROM v.creator_username)) AND NULLIF(p.avatar_url, '') IS NOT NULL
      ORDER BY (p.shop_id = v.shop_id) DESC, p.refreshed_at DESC LIMIT 1) profile ON true
    LEFT JOIN LATERAL (SELECT b.creator_name, b.creator_avatar_url FROM bookings b
      WHERE LOWER(TRIM(LEADING '@' FROM b.creator_username)) = LOWER(TRIM(LEADING '@' FROM v.creator_username))
      ORDER BY (NULLIF(b.creator_avatar_url, '') IS NOT NULL) DESC,
        (b.target_shop_id = v.shop_id) DESC, b.created_at DESC, b.id DESC LIMIT 1) identity ON true
    WHERE (:shopId IS NULL OR v.shop_id = :shopId)
      AND (CAST(:startDate AS date) IS NULL OR (v.posted_at AT TIME ZONE ${timezone})::date >= CAST(:startDate AS date))
      AND (CAST(:endDate AS date) IS NULL OR (v.posted_at AT TIME ZONE ${timezone})::date <= CAST(:endDate AS date))
  `, { replacements, type: QueryTypes.SELECT });
  const candidates = videos.flatMap((video) => {
    const postDate = dateOnlyInTimezone(video.posted_at, video.region);
    if ((startDate && (!postDate || postDate < startDate)) || (endDate && (!postDate || postDate > endDate))) return [];
    const hashtags = [...new Set((video.title?.match(/#[\p{L}\p{N}_]+/gu) || [])
      .map((tag) => tag.replace(/^#+/, '').toLowerCase()))];
    return staff.filter((user) => videoMatchesStaffHashtags(hashtags.map((tag) => `#${tag}`).join(' '), user.hashtags))
      .map((user) => ({ ...video, ...user, hashtags }));
  });
  const pairs = [...new Map(candidates.map((video) => [`${video.shop_id}:${video.platform_video_id}`,
    { shop_id: video.shop_id, video_id: video.platform_video_id },
  ])).values()];
  const metrics = pairs.length ? await database.query(`
    SELECT s.shop_id, s.content_id, s.product_id, GROUPING(s.product_id) AS is_total,
      MAX(s.product_name) AS product_name, MAX(s.currency) AS currency,
      COUNT(DISTINCT s.order_id) AS orders, SUM(s.quantity) AS items_sold,
      SUM(s.refunded_quantity) AS items_refunded, SUM(s.quantity * COALESCE(s.price, 0)) AS gross_gmv,
      SUM(s.refunded_quantity * COALESCE(s.price, 0)) AS refunded_gmv,
      SUM(COALESCE(s.price, 0) * GREATEST(s.quantity - s.refunded_quantity, 0) *
        CASE WHEN COALESCE(s.raw_data->>'creator_commission_rate', s.raw_data->>'commission_rate', '') ~ '^[0-9]+([.][0-9]+)?$'
          THEN COALESCE(s.raw_data->>'creator_commission_rate', s.raw_data->>'commission_rate')::numeric /
            CASE WHEN COALESCE(s.raw_data->>'creator_commission_rate', s.raw_data->>'commission_rate')::numeric > 100 THEN 10000 ELSE 100 END
          ELSE 0 END) AS estimated_commission
    FROM tiktok_affiliate_order_skus s JOIN tiktok_affiliate_orders o ON o.id = s.affiliate_order_id
    JOIN tiktok_shops shop ON shop.id = s.shop_id
    JOIN jsonb_to_recordset(CAST(:pairs AS jsonb)) pair(shop_id int, video_id text)
      ON pair.shop_id = s.shop_id AND pair.video_id = s.content_id
    WHERE UPPER(s.content_type) = 'VIDEO' AND ${IS_NOT_CANCELLED_SQL}
      AND (:startTime IS NULL OR o.create_time >= to_timestamp(:startTime))
      AND (:endTime IS NULL OR o.create_time < to_timestamp(:endTime))
      AND (:startTime IS NOT NULL OR CAST(:startDate AS date) IS NULL OR o.create_time >= (CAST(:startDate AS date)::timestamp AT TIME ZONE ${timezone}))
      AND (:endTime IS NOT NULL OR CAST(:endDate AS date) IS NULL OR o.create_time < ((CAST(:endDate AS date) + 1)::timestamp AT TIME ZONE ${timezone}))
    GROUP BY GROUPING SETS ((s.shop_id, s.content_id), (s.shop_id, s.content_id, s.product_id))
  `, { replacements: { ...replacements, pairs: JSON.stringify(pairs) }, type: QueryTypes.SELECT }) : [];
  const costs = await database.query(`
    SELECT b.staff_id, u.name AS staff_name, u.email AS staff_email, b.target_shop_id AS shop_id,
      shop.name AS shop_name, shop.code AS shop_code, shop.region, b.creator_username,
      MAX(b.creator_name) AS creator_name,
      COALESCE(MAX(NULLIF(profile.avatar_url, '')), MAX(NULLIF(b.creator_avatar_url, ''))) AS creator_avatar_url,
      jsonb_agg(b.evaluation_snapshot->'products') AS booked_products,
      jsonb_agg(b.evaluation_snapshot->'product_ids') AS booked_product_ids,
      MAX(b.currency) AS currency, SUM(b.total_cost) AS total_cost
    FROM bookings b JOIN users u ON u.id = b.staff_id JOIN tiktok_shops shop ON shop.id = b.target_shop_id
    LEFT JOIN LATERAL (SELECT p.avatar_url FROM tiktok_creator_profiles p
      WHERE p.shop_id = b.target_shop_id AND (p.username = LOWER(TRIM(LEADING '@' FROM b.creator_username))
        OR p.creator_open_id = b.creator_open_id) AND NULLIF(p.avatar_url, '') IS NOT NULL
      ORDER BY p.refreshed_at DESC LIMIT 1) profile ON true
    WHERE ${staffFilter} AND (:shopId IS NULL OR b.target_shop_id = :shopId)
      AND (CAST(:startDate AS date) IS NULL OR COALESCE(b.start_date, b.created_at::date) >= CAST(:startDate AS date))
      AND (CAST(:endDate AS date) IS NULL OR COALESCE(b.start_date, b.created_at::date) <= CAST(:endDate AS date))
    GROUP BY b.staff_id, u.name, u.email, b.target_shop_id, shop.name, shop.code, shop.region, b.creator_username
  `, { replacements, type: QueryTypes.SELECT });
  return buildHashtagRows(candidates, metrics, costs, startDate);
};

module.exports = { getHashtagRows, buildHashtagRows };
