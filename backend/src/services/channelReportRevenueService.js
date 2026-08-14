const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

const loadMonthlyShopVideoRevenue = async ({ startDate, endDate }) => {
  const rows = await sequelize.query(`
    SELECT
      platform_video_id,
      SUM(revenue) AS revenue,
      MIN(currency) AS currency
    FROM channel_report_video_revenue_daily
    WHERE metric_date >= CAST(:startDate AS DATE)
      AND metric_date < CAST(:endDate AS DATE)
    GROUP BY platform_video_id
  `, {
    replacements: { startDate, endDate },
    type: QueryTypes.SELECT,
  });
  return {
    rows: rows.map((row) => ({
      platform_video_id: String(row.platform_video_id),
      revenue: Number(row.revenue) || 0,
      currency: row.currency || null,
    })),
    errors: [],
  };
};

const loadVideoDailyRevenue = async ({ platformVideoId, startDate, endDate }) => {
  const rows = await sequelize.query(`
    WITH requested_dates AS (
      SELECT day::date AS metric_date
      FROM generate_series(
        CAST(:startDate AS DATE),
        CAST(:endDate AS DATE) - INTERVAL '1 day',
        INTERVAL '1 day'
      ) day
    ),
    source_rows AS (
      SELECT metric_date, revenue, currency, raw_metrics
      FROM channel_report_video_revenue_daily
      WHERE platform_video_id = :platformVideoId
        AND metric_date >= CAST(:startDate AS DATE)
        AND metric_date < CAST(:endDate AS DATE)
    ),
    daily_revenue AS (
      SELECT
        metric_date,
        SUM(revenue) AS revenue,
        MIN(currency) AS currency,
        SUM(COALESCE(NULLIF(raw_metrics ->> 'items_sold', '')::numeric, 0))::bigint AS items_sold,
        SUM(COALESCE(NULLIF(raw_metrics ->> 'sku_orders', '')::numeric, 0))::bigint AS sku_orders
      FROM source_rows
      GROUP BY metric_date
    ),
    daily_products AS (
      SELECT
        source.metric_date,
        jsonb_agg(DISTINCT jsonb_build_object(
          'id', product.value ->> 'id',
          'name', COALESCE(product.value ->> 'name', product.value ->> 'title', product.value ->> 'id')
        )) AS products
      FROM source_rows source
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(source.raw_metrics -> 'products') = 'array' THEN source.raw_metrics -> 'products'
          ELSE '[]'::jsonb
        END
      ) product(value)
      WHERE NULLIF(product.value ->> 'id', '') IS NOT NULL
      GROUP BY source.metric_date
    ),
    catalog_products AS (
      SELECT DISTINCT
        product.value ->> 'id' AS product_id,
        COALESCE(product.value ->> 'name', product.value ->> 'title') AS product_name
      FROM source_rows source
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(source.raw_metrics -> 'products') = 'array' THEN source.raw_metrics -> 'products'
          ELSE '[]'::jsonb
        END
      ) product(value)
      WHERE NULLIF(product.value ->> 'id', '') IS NOT NULL
    ),
    affiliate_order_rows AS (
      SELECT
        (
          affiliate_order.create_time AT TIME ZONE CASE UPPER(COALESCE(shop.region, ''))
            WHEN 'MY' THEN 'Asia/Kuala_Lumpur'
            WHEN 'VN' THEN 'Asia/Ho_Chi_Minh'
            WHEN 'SG' THEN 'Asia/Singapore'
            WHEN 'TH' THEN 'Asia/Bangkok'
            WHEN 'PH' THEN 'Asia/Manila'
            WHEN 'ID' THEN 'Asia/Jakarta'
            ELSE 'UTC'
          END
        )::date AS metric_date,
        sku.shop_id,
        shop.name AS shop_name,
        sku.order_id,
        affiliate_order.create_time,
        COALESCE(affiliate_order.raw_data ->> 'status', affiliate_order.raw_data ->> 'order_status') AS order_status,
        sku.product_id,
        COALESCE(NULLIF(sku.product_name, ''), category_item.title, catalog.product_name, sku.product_id) AS product_name,
        sku.quantity,
        sku.refunded_quantity,
        sku.price,
        sku.currency
      FROM tiktok_affiliate_order_skus sku
      JOIN tiktok_affiliate_orders affiliate_order ON affiliate_order.id = sku.affiliate_order_id
      JOIN tiktok_shops shop ON shop.id = sku.shop_id
      LEFT JOIN order_product_category_items category_item
        ON category_item.shop_id = sku.shop_id AND category_item.product_id = sku.product_id
      LEFT JOIN catalog_products catalog ON catalog.product_id = sku.product_id
      WHERE UPPER(COALESCE(sku.content_type, '')) = 'VIDEO'
        AND sku.content_id = :platformVideoId
        AND affiliate_order.create_time >= CAST(:startDate AS DATE) - INTERVAL '1 day'
        AND affiliate_order.create_time < CAST(:endDate AS DATE) + INTERVAL '1 day'
    ),
    affiliate_product_totals AS (
      SELECT
        metric_date,
        product_id,
        MIN(product_name) AS product_name,
        SUM(quantity)::bigint AS quantity,
        SUM(refunded_quantity)::bigint AS refunded_quantity,
        COUNT(DISTINCT order_id)::bigint AS order_count,
        SUM(COALESCE(price, 0) * quantity) AS gross_amount,
        MIN(currency) AS currency
      FROM affiliate_order_rows
      WHERE metric_date >= CAST(:startDate AS DATE)
        AND metric_date < CAST(:endDate AS DATE)
      GROUP BY metric_date, product_id
    ),
    affiliate_order_product_totals AS (
      SELECT
        metric_date,
        shop_id,
        MIN(shop_name) AS shop_name,
        order_id,
        MIN(create_time) AS create_time,
        MIN(order_status) AS order_status,
        product_id,
        MIN(product_name) AS product_name,
        SUM(quantity)::bigint AS quantity,
        SUM(refunded_quantity)::bigint AS refunded_quantity,
        SUM(COALESCE(price, 0) * quantity) AS gross_amount,
        MIN(currency) AS currency
      FROM affiliate_order_rows
      WHERE metric_date >= CAST(:startDate AS DATE)
        AND metric_date < CAST(:endDate AS DATE)
      GROUP BY metric_date, shop_id, order_id, product_id
    ),
    affiliate_order_products AS (
      SELECT
        metric_date,
        shop_id,
        order_id,
        jsonb_agg(jsonb_build_object(
          'id', product_id,
          'name', product_name,
          'quantity', quantity,
          'refunded_quantity', refunded_quantity,
          'gross_amount', gross_amount,
          'currency', currency
        ) ORDER BY quantity DESC, product_name ASC) AS products
      FROM affiliate_order_product_totals
      GROUP BY metric_date, shop_id, order_id
    ),
    affiliate_order_totals AS (
      SELECT
        totals.metric_date,
        totals.shop_id,
        MIN(totals.shop_name) AS shop_name,
        totals.order_id,
        MIN(totals.create_time) AS create_time,
        MIN(totals.order_status) AS order_status,
        SUM(totals.quantity)::bigint AS quantity,
        SUM(totals.refunded_quantity)::bigint AS refunded_quantity,
        SUM(totals.gross_amount) AS gross_amount,
        MIN(totals.currency) AS currency,
        MIN(products.products::text)::jsonb AS products
      FROM affiliate_order_product_totals totals
      JOIN affiliate_order_products products
        ON products.metric_date = totals.metric_date
        AND products.shop_id = totals.shop_id
        AND products.order_id = totals.order_id
      GROUP BY totals.metric_date, totals.shop_id, totals.order_id
    ),
    affiliate_daily_orders AS (
      SELECT
        metric_date,
        jsonb_agg(jsonb_build_object(
          'id', order_id,
          'shop_id', shop_id,
          'shop_name', shop_name,
          'create_time', create_time,
          'status', order_status,
          'quantity', quantity,
          'refunded_quantity', refunded_quantity,
          'gross_amount', gross_amount,
          'currency', currency,
          'products', products
        ) ORDER BY create_time DESC, order_id ASC) AS orders
      FROM affiliate_order_totals
      GROUP BY metric_date
    ),
    affiliate_daily_totals AS (
      SELECT
        metric_date,
        SUM(quantity)::bigint AS items_sold,
        SUM(refunded_quantity)::bigint AS items_refunded,
        COUNT(DISTINCT order_id)::bigint AS order_count
      FROM affiliate_order_rows
      WHERE metric_date >= CAST(:startDate AS DATE)
        AND metric_date < CAST(:endDate AS DATE)
      GROUP BY metric_date
    ),
    affiliate_daily_products AS (
      SELECT
        metric_date,
        jsonb_agg(jsonb_build_object(
          'id', product_id,
          'name', product_name,
          'quantity', quantity,
          'refunded_quantity', refunded_quantity,
          'order_count', order_count,
          'gross_amount', gross_amount,
          'currency', currency
        ) ORDER BY quantity DESC, product_name ASC) AS products
      FROM affiliate_product_totals
      GROUP BY metric_date
    ),
    affiliate_daily AS (
      SELECT
        totals.metric_date,
        totals.items_sold,
        totals.items_refunded,
        totals.order_count,
        products.products,
        orders.orders
      FROM affiliate_daily_totals totals
      LEFT JOIN affiliate_daily_products products ON products.metric_date = totals.metric_date
      LEFT JOIN affiliate_daily_orders orders ON orders.metric_date = totals.metric_date
    ),
    affiliate_coverage AS (
      SELECT metric_date, TRUE AS available
      FROM tiktok_affiliate_order_sync_days
      WHERE metric_date >= CAST(:startDate AS DATE)
        AND metric_date < CAST(:endDate AS DATE)
      GROUP BY metric_date
    )
    SELECT
      TO_CHAR(requested.metric_date, 'YYYY-MM-DD') AS date,
      COALESCE(daily.revenue, 0) AS revenue,
      COALESCE(daily.currency, (SELECT MIN(currency) FROM daily_revenue)) AS currency,
      COALESCE(daily.items_sold, 0) AS items_sold,
      COALESCE(daily.sku_orders, 0) AS sku_orders,
      COALESCE(products.products, '[]'::jsonb) AS products,
      COALESCE(affiliate.items_sold, 0) AS affiliate_items_sold,
      COALESCE(affiliate.items_refunded, 0) AS affiliate_items_refunded,
      COALESCE(affiliate.order_count, 0) AS affiliate_orders,
      COALESCE(affiliate.products, '[]'::jsonb) AS affiliate_products,
      COALESCE(affiliate.orders, '[]'::jsonb) AS affiliate_order_details,
      COALESCE(coverage.available, FALSE) AS affiliate_orders_available,
      daily.metric_date IS NOT NULL AS revenue_available
    FROM requested_dates requested
    LEFT JOIN daily_revenue daily ON daily.metric_date = requested.metric_date
    LEFT JOIN daily_products products ON products.metric_date = requested.metric_date
    LEFT JOIN affiliate_daily affiliate ON affiliate.metric_date = requested.metric_date
    LEFT JOIN affiliate_coverage coverage ON coverage.metric_date = requested.metric_date
    ORDER BY requested.metric_date ASC
  `, {
    replacements: { platformVideoId, startDate, endDate },
    type: QueryTypes.SELECT,
  });
  const days = rows.map((row) => {
    const affiliateOrdersAvailable = Boolean(row.affiliate_orders_available);
    const analyticsProducts = Array.isArray(row.products) ? row.products : [];
    const affiliateProducts = Array.isArray(row.affiliate_products) ? row.affiliate_products : [];
    const affiliateOrders = Array.isArray(row.affiliate_order_details) ? row.affiliate_order_details : [];
    return {
      date: row.date,
      revenue: Number(row.revenue) || 0,
      currency: row.currency || null,
      items_sold: affiliateOrdersAvailable
        ? Number(row.affiliate_items_sold) || 0
        : Number(row.items_sold) || 0,
      sku_orders: affiliateOrdersAvailable
        ? Number(row.affiliate_orders) || 0
        : Number(row.sku_orders) || 0,
      items_refunded: affiliateOrdersAvailable ? Number(row.affiliate_items_refunded) || 0 : 0,
      products: affiliateOrdersAvailable ? affiliateProducts : analyticsProducts,
      affiliate_items_sold: Number(row.affiliate_items_sold) || 0,
      affiliate_items_refunded: Number(row.affiliate_items_refunded) || 0,
      affiliate_orders: Number(row.affiliate_orders) || 0,
      affiliate_products: affiliateProducts,
      orders: affiliateOrders.map((order) => ({
        id: String(order.id || ''),
        shop_id: order.shop_id ?? null,
        shop_name: order.shop_name || null,
        create_time: order.create_time || null,
        status: order.status || null,
        quantity: Number(order.quantity) || 0,
        refunded_quantity: Number(order.refunded_quantity) || 0,
        gross_amount: Number(order.gross_amount) || 0,
        currency: order.currency || null,
        products: (Array.isArray(order.products) ? order.products : []).map((product) => ({
          ...product,
          quantity: Number(product.quantity) || 0,
          refunded_quantity: Number(product.refunded_quantity) || 0,
          gross_amount: Number(product.gross_amount) || 0,
        })),
      })),
      affiliate_orders_available: affiliateOrdersAvailable,
      revenue_available: Boolean(row.revenue_available),
    };
  });
  return {
    platform_video_id: platformVideoId,
    start_date: startDate,
    end_date: endDate,
    revenue: days.reduce((sum, day) => sum + day.revenue, 0),
    currency: days.find((day) => day.currency)?.currency || null,
    revenue_days: days.filter((day) => day.revenue > 0).length,
    synced_days: days.filter((day) => day.revenue_available).length,
    items_sold: days.reduce((sum, day) => sum + day.items_sold, 0),
    sku_orders: days.reduce((sum, day) => sum + day.sku_orders, 0),
    affiliate_items_sold: days.reduce((sum, day) => sum + day.affiliate_items_sold, 0),
    affiliate_items_refunded: days.reduce((sum, day) => sum + day.affiliate_items_refunded, 0),
    affiliate_orders: days.reduce((sum, day) => sum + day.affiliate_orders, 0),
    affiliate_orders_synced_days: days.filter((day) => day.affiliate_orders_available).length,
    days,
  };
};

module.exports = { loadMonthlyShopVideoRevenue, loadVideoDailyRevenue };
