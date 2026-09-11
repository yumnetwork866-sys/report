const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const {
  Booking,
  BookingVideo,
  BookingVideoPerformanceSnapshot,
  User,
  WeeklyReport,
  sequelize,
} = require('../models');
const { serializeBookingWithActual } = require('../services/bookingVideoPerformanceService');
const {
  loadMonthlyShopVideoRevenue,
  loadVideoDailyRevenue,
} = require('../services/channelReportRevenueService');
const { getOrSetCache, delByPattern } = require('../lib/redis');

const REPORT_CACHE_TTL_SECONDS = 300; // 5 minutes
const clearReportCache = () => delByPattern('report:*');

const toDateOnly = (date) => date.toISOString().slice(0, 10);
const REPORT_OLLAMA_HOST = String(
  process.env.REPORT_OLLAMA_HOST
    || process.env.AI_CHAT_OLLAMA_HOST
    || process.env.OLLAMA_HOST
    || 'http://127.0.0.1:11434',
).trim().replace(/\/+$/, '');
const REPORT_OLLAMA_MODEL = String(
  process.env.REPORT_OLLAMA_MODEL
    || process.env.AI_CHAT_MODEL
    || 'llama3.1:8b',
).trim().replace(/^ollama:/i, '');
const REPORT_OLLAMA_TIMEOUT_MS = Math.max(1000, Number(process.env.REPORT_OLLAMA_TIMEOUT_MS) || 90000);
const toNumbers = (row, fields) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, fields.includes(key) ? Number(value) : value]),
);
const number = (value) => Number(value || 0);
const formatNumber = (value) => number(value).toLocaleString('vi-VN');
const normalizeAiContent = (value) => String(value || '')
  .trim()
  .replace(/^```(?:markdown|md)?\s*/i, '')
  .replace(/\s*```$/, '')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .trim();

const positiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

const validDateOnly = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000
    && year <= 2100
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const addUtcDays = (value, days) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const channelReportOptions = (query = {}) => {
  const rawStartDate = String(query.start_date || '').trim();
  const rawEndDate = String(query.end_date || '').trim();
  const customRange = Boolean(rawStartDate || rawEndDate);
  let mode = 'month';
  let reportMonth = null;
  let startDate;
  let endDate;

  if (customRange) {
    if (!validDateOnly(rawStartDate) || !validDateOnly(rawEndDate)) {
      const error = new Error('Khoảng ngày báo cáo không hợp lệ.');
      error.status = 400;
      throw error;
    }
    if (rawStartDate > rawEndDate) {
      const error = new Error('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      error.status = 400;
      throw error;
    }
    mode = 'custom';
    startDate = rawStartDate;
    endDate = rawEndDate;
  } else {
    const match = String(query.month || '').match(/^(\d{4})-(\d{2})$/);
    const year = Number(match?.[1]);
    const month = Number(match?.[2]);
    if (!match || year < 2000 || year > 2100 || month < 1 || month > 12) {
      const error = new Error('Tháng báo cáo không hợp lệ.');
      error.status = 400;
      throw error;
    }
    reportMonth = `${year}-${String(month).padStart(2, '0')}`;
    startDate = `${reportMonth}-01`;
    endDate = addUtcDays(new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10), -1);
  }
  const endDateExclusive = addUtcDays(endDate, 1);
  const rawTeamIds = String(query.team_ids || query.team_id || '').trim();
  let teamIds = null;
  if (rawTeamIds && rawTeamIds !== 'all') {
    if (rawTeamIds === 'none') {
      teamIds = [];
    } else {
      const parts = rawTeamIds.split(',').map((value) => value.trim());
      const parsed = parts.map(Number);
      if (parts.some((value) => !value)
        || parsed.some((value) => !Number.isInteger(value) || value <= 0)) {
        const error = new Error('Team báo cáo không hợp lệ.');
        error.status = 400;
        throw error;
      }
      teamIds = [...new Set(parsed)];
    }
  }
  const teamId = teamIds && teamIds.length === 1 ? teamIds[0] : null;
  const rawUserId = String(query.user_id || '').trim();
  const userId = rawUserId && rawUserId !== 'all' ? Number(rawUserId) : null;
  if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) {
    const error = new Error('User báo cáo không hợp lệ.');
    error.status = 400;
    throw error;
  }
  const metric = query.metric === 'revenue' ? 'revenue' : 'content';
  const rawChannelIds = String(query.channel_ids || '').trim();
  let channelIds = null;
  if (rawChannelIds && rawChannelIds !== 'all') {
    const parts = rawChannelIds.split(',').map((value) => value.trim());
    const parsed = parts.map(Number);
    if (parts.some((value) => !value)
      || parsed.some((value) => !Number.isInteger(value) || value <= 0)) {
      const error = new Error('Danh sách kênh báo cáo không hợp lệ.');
      error.status = 400;
      throw error;
    }
    channelIds = [...new Set(parsed)];
  }
  return {
    mode,
    month: reportMonth,
    startDate,
    endDate,
    endDateExclusive,
    teamId,
    teamIds,
    userId,
    channelIds,
    metric,
    page: positiveInteger(query.page, 1),
    pageSize: positiveInteger(query.page_size, 20, 100),
  };
};

const channelReportBaseSql = `
  WITH platform_revenue AS (
    SELECT
      platform_video_id,
      SUM(gross_gmv) AS revenue,
      MIN(currency) AS currency,
      SUM(orders) AS orders
    FROM jsonb_to_recordset(CAST(:revenueRows AS jsonb)) AS source(
      platform_video_id text,
      gross_gmv numeric,
      currency text,
      orders bigint
    )
    GROUP BY platform_video_id
  ),
  attribution_rules AS (
    SELECT DISTINCT
      attribution.user_id,
      attribution.team_id,
      app_user.name AS member_name,
      LOWER(BTRIM(hashtag.value)) AS hashtag
    FROM user_content_attributions attribution
    JOIN users app_user ON app_user.id = attribution.user_id
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(attribution.hashtags) = 'array' THEN attribution.hashtags
        ELSE '[]'::jsonb
      END
    ) hashtag(value)
    WHERE attribution.team_id IS NOT NULL
      AND NULLIF(BTRIM(hashtag.value), '') IS NOT NULL
  ),
  revenue_catalog_videos AS MATERIALIZED (
    SELECT DISTINCT ON (shop_video.platform_video_id)
      -shop_video.id AS id,
      'tiktok'::text AS platform,
      shop_video.platform_video_id,
      channel.id AS channel_id,
      shop_video.title,
      shop_video.video_url,
      COALESCE(
        NULLIF(shop_video.raw_data ->> 'cover_image_url', ''),
        NULLIF(shop_video.raw_data ->> 'thumbnail_url', '')
      ) AS thumbnail_url,
      shop_video.posted_at AS published_at,
      COALESCE(performance.views, 0) AS views,
      0::bigint AS likes,
      0::bigint AS comments,
      0::bigint AS shares,
      channel.username AS channel_username,
      channel.display_name AS channel_name,
      channel.avatar_url AS channel_avatar_url,
      revenue.revenue,
      revenue.currency,
      COALESCE(revenue.orders, 0)::bigint AS orders
    FROM shop_videos shop_video
    JOIN platform_revenue revenue
      ON revenue.platform_video_id = shop_video.platform_video_id
      AND revenue.revenue > 0
    JOIN tiktok_channels channel
      ON LOWER(LTRIM(BTRIM(channel.username), '@'))
        = LOWER(LTRIM(BTRIM(shop_video.creator_username), '@'))
    LEFT JOIN LATERAL (
      SELECT snapshot.views
      FROM shop_video_performance_snapshots snapshot
      WHERE snapshot.shop_video_id = shop_video.id
      ORDER BY snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
      LIMIT 1
    ) performance ON TRUE
    WHERE :metric = 'revenue'
      AND shop_video.account_type IN ('OFFICIAL_ACCOUNTS', 'MARKETING_ACCOUNTS')
      AND NOT EXISTS (
        SELECT 1
        FROM videos stored_video
        WHERE stored_video.platform_video_id = shop_video.platform_video_id
      )
    ORDER BY
      shop_video.platform_video_id,
      shop_video.last_seen_at DESC NULLS LAST,
      shop_video.id DESC
  ),
  report_videos AS MATERIALIZED (
    SELECT
      video.id,
      video.platform,
      video.platform_video_id,
      video.channel_id,
      video.title,
      video.video_url,
      video.thumbnail_url,
      video.published_at,
      video.views,
      video.likes,
      video.comments,
      video.shares,
      channel.username AS channel_username,
      channel.display_name AS channel_name,
      channel.avatar_url AS channel_avatar_url,
      revenue.revenue,
      revenue.currency,
      COALESCE(revenue.orders, 0)::bigint AS orders
    FROM videos video
    LEFT JOIN tiktok_channels channel ON channel.id = video.channel_id
    LEFT JOIN platform_revenue revenue
      ON revenue.platform_video_id = video.platform_video_id
    WHERE (:metric = 'revenue' AND revenue.revenue > 0)
      OR (:metric <> 'revenue' AND (
        video.published_at >= (
          CAST(:startDate AS date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
        )
        AND video.published_at < (
          CAST(:endDateExclusive AS date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
        )
      ))
    UNION ALL
    SELECT *
    FROM revenue_catalog_videos
  ),
  video_hashtags AS MATERIALIZED (
    SELECT DISTINCT
      video.id AS video_id,
      LOWER((matched.value)[1]) AS hashtag
    FROM report_videos video
    CROSS JOIN LATERAL regexp_matches(
      COALESCE(video.title, ''),
      '(#[[:alnum:]_]+)',
      'gi'
    ) matched(value)
  ),
  video_attributions AS MATERIALIZED (
    SELECT DISTINCT
      hashtag.video_id,
      rule.user_id,
      rule.team_id,
      rule.member_name
    FROM video_hashtags hashtag
    JOIN attribution_rules rule ON rule.hashtag = hashtag.hashtag
  ),
  audience_videos AS MATERIALIZED (
    SELECT
      video.*,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'user_id', attribution.user_id,
            'team_id', attribution.team_id,
            'member_name', attribution.member_name
          )
          ORDER BY attribution.user_id
        )
        FROM video_attributions attribution
        WHERE attribution.video_id = video.id
      ), '[]'::jsonb) AS attributions
    FROM report_videos video
    WHERE (
      (CAST(:filterTeams AS boolean) = false AND CAST(:userId AS integer) IS NULL)
      OR EXISTS (
        SELECT 1
        FROM video_attributions attribution
        WHERE attribution.video_id = video.id
          AND (
            CAST(:filterTeams AS boolean) = false
            OR attribution.team_id IN (
              SELECT value::integer
              FROM jsonb_array_elements_text(CAST(:teamIds AS jsonb)) selected(value)
            )
          )
          AND (CAST(:userId AS integer) IS NULL OR attribution.user_id = CAST(:userId AS integer))
      )
    )
  ),
  filtered_videos AS MATERIALIZED (
    SELECT *
    FROM audience_videos
    WHERE CAST(:filterChannels AS boolean) = false
      OR channel_id IN (
        SELECT value::integer
        FROM jsonb_array_elements_text(CAST(:channelIds AS jsonb)) selected(value)
      )
  )
`;

const getChannelReport = async (req, res) => {
  try {
    const options = channelReportOptions(req.query);
    const {
      mode,
      month,
      startDate,
      endDate,
      endDateExclusive,
      teamId,
      teamIds,
      userId,
      channelIds,
      metric,
      page,
      pageSize,
    } = options;

    const teamKey = teamIds ? [...teamIds].sort().join(',') : 'all';
    const channelKey = channelIds ? [...channelIds].sort().join(',') : 'all';
    const cacheKey = `report:channel:${mode}:${month || 'custom'}:${startDate}:${endDate}:${teamKey}:${userId || 'all'}:${channelKey}:${metric}:${page}:${pageSize}`;

    const { data: payload, hit } = await getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
      const monthlyRevenue = await loadMonthlyShopVideoRevenue({
        startDate,
        endDate: endDateExclusive,
      });
    const replacements = {
      startDate,
      endDateExclusive,
      filterTeams: teamIds !== null,
      teamIds: JSON.stringify(teamIds || []),
      teamId,
      userId,
      filterChannels: channelIds !== null,
      channelIds: JSON.stringify(channelIds || []),
      revenueRows: JSON.stringify(monthlyRevenue.rows.map((row) => ({
        platform_video_id: row.platform_video_id,
        gross_gmv: row.revenue,
        currency: row.currency,
        orders: Number(row.orders) || 0,
      }))),
    };
    replacements.metric = metric;
    const [aggregateRows, teamRows, videoRows, productRows] = await Promise.all([
      sequelize.query(`${channelReportBaseSql}
        /* channel-report-summary */
        SELECT
          'summary' AS row_type,
          NULL::text AS bucket,
          NULL::text AS label,
          NULL::text AS avatar_url,
          COUNT(*)::bigint AS videos,
          COALESCE(SUM(views), 0)::bigint AS views,
          COALESCE(SUM(likes), 0)::bigint AS likes,
          COALESCE(SUM(comments), 0)::bigint AS comments,
          COALESCE(SUM(shares), 0)::bigint AS shares,
          COUNT(DISTINCT channel_id)::bigint AS channels,
          COUNT(*) FILTER (WHERE jsonb_array_length(attributions) > 0)::bigint AS attributed_videos,
          COUNT(*) FILTER (WHERE jsonb_array_length(attributions) = 0)::bigint AS unclassified_videos,
          COALESCE(SUM(revenue), 0) AS revenue,
          COUNT(revenue) > 0 AS revenue_available,
          MIN(currency) AS currency,
          COALESCE(SUM(orders), 0)::bigint AS orders
        FROM filtered_videos
        UNION ALL
        SELECT
          'chart' AS row_type,
          TO_CHAR((published_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS bucket,
          NULL::text AS label,
          NULL::text AS avatar_url,
          COUNT(*)::bigint AS videos,
          COALESCE(SUM(views), 0)::bigint AS views,
          COALESCE(SUM(likes), 0)::bigint AS likes,
          COALESCE(SUM(comments), 0)::bigint AS comments,
          COALESCE(SUM(shares), 0)::bigint AS shares,
          COUNT(DISTINCT channel_id)::bigint AS channels,
          COUNT(*) FILTER (WHERE jsonb_array_length(attributions) > 0)::bigint AS attributed_videos,
          COUNT(*) FILTER (WHERE jsonb_array_length(attributions) = 0)::bigint AS unclassified_videos,
          COALESCE(SUM(revenue), 0) AS revenue,
          COUNT(revenue) > 0 AS revenue_available,
          MIN(currency) AS currency,
          COALESCE(SUM(orders), 0)::bigint AS orders
        FROM filtered_videos
        GROUP BY (published_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        UNION ALL
        SELECT
          'channel' AS row_type,
          channel_id::text AS bucket,
          MIN(COALESCE(channel_name, channel_username)) AS label,
          MIN(channel_avatar_url) AS avatar_url,
          COUNT(*)::bigint AS videos,
          COALESCE(SUM(views), 0)::bigint AS views,
          COALESCE(SUM(likes), 0)::bigint AS likes,
          COALESCE(SUM(comments), 0)::bigint AS comments,
          COALESCE(SUM(shares), 0)::bigint AS shares,
          1::bigint AS channels,
          COUNT(*) FILTER (WHERE jsonb_array_length(attributions) > 0)::bigint AS attributed_videos,
          COUNT(*) FILTER (WHERE jsonb_array_length(attributions) = 0)::bigint AS unclassified_videos,
          COALESCE(SUM(revenue), 0) AS revenue,
          COUNT(revenue) > 0 AS revenue_available,
          MIN(currency) AS currency,
          COALESCE(SUM(orders), 0)::bigint AS orders
        FROM filtered_videos
        GROUP BY channel_id
        UNION ALL
        SELECT
          'channel-option' AS row_type,
          channel.id::text AS bucket,
          COALESCE(channel.display_name, channel.username) AS label,
          channel.avatar_url AS avatar_url,
          0::bigint AS videos,
          0::bigint AS views,
          0::bigint AS likes,
          0::bigint AS comments,
          0::bigint AS shares,
          1::bigint AS channels,
          0::bigint AS attributed_videos,
          0::bigint AS unclassified_videos,
          0::numeric AS revenue,
          false AS revenue_available,
          NULL::text AS currency,
          0::bigint AS orders
        FROM tiktok_channels channel
        ORDER BY row_type, bucket
      `, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(`${channelReportBaseSql}
        /* channel-report-teams */
        , member_metrics AS (
          SELECT
            team.id AS team_id,
            team.name AS team_name,
            app_user.id AS user_id,
            app_user.name AS member_name,
            COUNT(video.id)::bigint AS videos,
            COALESCE(SUM(video.views), 0)::bigint AS views,
            COALESCE(SUM(video.revenue), 0) AS revenue,
            COUNT(video.revenue) > 0 AS revenue_available,
            MIN(video.currency) AS currency,
            COALESCE(SUM(video.orders), 0)::bigint AS orders
          FROM content_teams team
          LEFT JOIN user_content_attributions attribution ON attribution.team_id = team.id
          LEFT JOIN users app_user ON app_user.id = attribution.user_id
          LEFT JOIN filtered_videos video ON EXISTS (
            SELECT 1
            FROM video_attributions attribution_match
            WHERE attribution_match.video_id = video.id
              AND attribution_match.user_id = app_user.id
              AND (
                CAST(:filterTeams AS boolean) = false
                OR attribution_match.team_id IN (
                  SELECT value::integer
                  FROM jsonb_array_elements_text(CAST(:teamIds AS jsonb)) selected(value)
                )
              )
              AND (CAST(:userId AS integer) IS NULL OR attribution_match.user_id = CAST(:userId AS integer))
          )
          GROUP BY team.id, team.name, app_user.id, app_user.name
        )
        SELECT
          team_id,
          team_name,
          user_id,
          member_name,
          videos,
          views,
          revenue,
          revenue_available,
          currency,
          orders,
          SUM(videos) OVER (PARTITION BY team_id)::bigint AS team_videos,
          SUM(views) OVER (PARTITION BY team_id)::bigint AS team_views,
          SUM(revenue) OVER (PARTITION BY team_id) AS team_revenue,
          BOOL_OR(revenue_available) OVER (PARTITION BY team_id) AS team_revenue_available,
          MIN(currency) OVER (PARTITION BY team_id) AS team_currency,
          SUM(orders) OVER (PARTITION BY team_id)::bigint AS team_orders
        FROM member_metrics
        ORDER BY team_name ASC, views DESC, member_name ASC
      `, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(`${channelReportBaseSql}
        /* channel-report-videos */
        SELECT
          id,
          platform,
          platform_video_id,
          title,
          video_url,
          thumbnail_url,
          published_at,
          views,
          likes,
          comments,
          shares,
          channel_id,
          channel_username,
          channel_name,
          attributions,
          revenue,
          currency,
          orders
        FROM filtered_videos
        ORDER BY published_at DESC, id DESC
        LIMIT :limit OFFSET :offset
      `, {
        replacements: {
          ...replacements,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
        type: QueryTypes.SELECT,
      }),
      sequelize.query(`${channelReportBaseSql}
        /* channel-report-team-products */
        , attributed_video_teams AS (
          SELECT DISTINCT
            video.platform_video_id,
            (attr.value ->> 'team_id')::int AS team_id
          FROM filtered_videos video
          CROSS JOIN LATERAL jsonb_array_elements(video.attributions) attr(value)
          WHERE NULLIF(attr.value ->> 'team_id', '') IS NOT NULL
            AND (
              CAST(:filterTeams AS boolean) = false
              OR (attr.value ->> 'team_id')::int IN (
                SELECT value::integer
                FROM jsonb_array_elements_text(CAST(:teamIds AS jsonb)) selected(value)
              )
            )
        ),
        raw_product_rows AS (
          SELECT
            avt.team_id,
            COALESCE(NULLIF(p.value ->> 'id', ''), 'unknown') AS product_id,
            COALESCE(NULLIF(p.value ->> 'name', ''), NULLIF(p.value ->> 'title', ''), tsp.title, p.value ->> 'id') AS product_name,
            COALESCE(
              tsp.image_url,
              NULLIF(p.value ->> 'main_image_url', ''),
              NULLIF(p.value ->> 'thumbnail_url', ''),
              NULLIF(p.value ->> 'image_url', '')
            ) AS image_url,
            d.currency,
            COALESCE(NULLIF(d.raw_metrics ->> 'sku_orders', '')::numeric, NULLIF(d.raw_metrics ->> 'orders', '')::numeric, 0)::bigint AS sku_orders,
            COALESCE(NULLIF(d.raw_metrics ->> 'items_sold', '')::numeric, 0)::bigint AS items_sold,
            d.revenue
          FROM attributed_video_teams avt
          JOIN channel_report_video_revenue_daily d ON d.platform_video_id = avt.platform_video_id
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d.raw_metrics -> 'products') = 'array' THEN d.raw_metrics -> 'products' ELSE '[]'::jsonb END
          ) p(value)
          LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = p.value ->> 'id'
          WHERE d.metric_date >= CAST(:startDate AS DATE)
            AND d.metric_date < CAST(:endDateExclusive AS DATE)
            AND (
              COALESCE(NULLIF(d.raw_metrics ->> 'sku_orders', '')::numeric, NULLIF(d.raw_metrics ->> 'orders', '')::numeric, 0) > 0
              OR d.revenue > 0
            )
          UNION ALL
          SELECT
            avt.team_id,
            sku.product_id,
            COALESCE(NULLIF(sku.product_name, ''), tsp.title, sku.product_id) AS product_name,
            tsp.image_url,
            sku.currency,
            1::bigint AS sku_orders,
            sku.quantity::bigint AS items_sold,
            (sku.price * sku.quantity) AS revenue
          FROM attributed_video_teams avt
          JOIN tiktok_affiliate_order_skus sku ON sku.content_id = avt.platform_video_id AND UPPER(sku.content_type) = 'VIDEO'
          JOIN tiktok_affiliate_orders o ON o.id = sku.affiliate_order_id
          LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = sku.product_id
          WHERE o.create_time >= CAST(:startDate AS DATE)
            AND o.create_time < CAST(:endDateExclusive AS DATE)
        )
        SELECT
          r.team_id,
          t.name AS team_name,
          r.product_id,
          MIN(r.product_name) AS product_name,
          MIN(r.image_url) AS image_url,
          MIN(r.currency) AS currency,
          SUM(r.sku_orders)::bigint AS orders,
          SUM(r.items_sold)::bigint AS quantity,
          SUM(r.revenue) AS revenue
        FROM raw_product_rows r
        JOIN content_teams t ON t.id = r.team_id
        GROUP BY r.team_id, t.name, r.product_id
        ORDER BY r.team_id, orders DESC, revenue DESC
      `, { replacements, type: QueryTypes.SELECT }),
    ]);

    const summary = aggregateRows.find((row) => row.row_type === 'summary') || {};
    const aggregateMetrics = (row) => ({
      videos: number(row.videos),
      views: number(row.views),
      likes: number(row.likes),
      comments: number(row.comments),
      shares: number(row.shares),
      channels: number(row.channels),
      attributed_videos: number(row.attributed_videos),
      unclassified_videos: number(row.unclassified_videos),
      revenue: number(row.revenue),
      revenue_available: Boolean(row.revenue_available),
      currency: row.currency || null,
      orders: number(row.orders),
    });
    const availableTeamsById = new Map();
    const availableUsersById = new Map();
    for (const row of teamRows) {
      const teamKey = String(row.team_id);
      if (!availableTeamsById.has(teamKey)) {
        availableTeamsById.set(teamKey, {
          id: Number(row.team_id),
          name: row.team_name,
          member_count: 0,
        });
      }
      if (row.user_id) {
        availableTeamsById.get(teamKey).member_count += 1;
        availableUsersById.set(String(row.user_id), {
          id: Number(row.user_id),
          name: row.member_name,
          team_id: Number(row.team_id),
          team_name: row.team_name,
        });
      }
    }
    const productsByTeam = new Map();
    const allProductsMap = new Map();
    for (const row of (productRows || [])) {
      const teamKey = String(row.team_id);
      if (!productsByTeam.has(teamKey)) {
        productsByTeam.set(teamKey, []);
      }
      const item = {
        id: String(row.product_id),
        name: row.product_name,
        image_url: row.image_url || null,
        orders: number(row.orders),
        quantity: number(row.quantity),
        revenue: number(row.revenue),
        currency: row.currency || null,
      };
      productsByTeam.get(teamKey).push(item);

      const existing = allProductsMap.get(item.id);
      if (!existing) {
        allProductsMap.set(item.id, {
          ...item,
          teams: [{ team_id: Number(row.team_id), team_name: row.team_name, orders: item.orders, quantity: item.quantity, revenue: item.revenue }],
        });
      } else {
        existing.orders += item.orders;
        existing.quantity += item.quantity;
        existing.revenue += item.revenue;
        existing.teams.push({ team_id: Number(row.team_id), team_name: row.team_name, orders: item.orders, quantity: item.quantity, revenue: item.revenue });
      }
    }
    const teams = [];
    for (const row of teamRows) {
      if (teamIds !== null && !teamIds.includes(Number(row.team_id))) continue;
      if (userId !== null && Number(row.user_id) !== userId) continue;
      let team = teams.find((item) => item.key === String(row.team_id));
      if (!team) {
        team = {
          key: String(row.team_id),
          label: row.team_name,
          videos: number(row.team_videos),
          views: number(row.team_views),
          revenue: number(row.team_revenue),
          revenueAvailable: Boolean(row.team_revenue_available),
          currency: row.team_currency || null,
          orders: number(row.team_orders),
          members: [],
          products: productsByTeam.get(String(row.team_id)) || [],
        };
        teams.push(team);
      }
      if (row.user_id) {
        team.members.push({
          key: String(row.user_id),
          name: row.member_name,
          videos: number(row.videos),
          views: number(row.views),
          revenue: number(row.revenue),
          revenueAvailable: Boolean(row.revenue_available),
          currency: row.currency || null,
          orders: number(row.orders),
        });
      }
    }
    const total = number(summary.videos);
    return {
      period: { mode, month, start: startDate, end: endDate },
      kpis: aggregateMetrics(summary),
      chart: aggregateRows
        .filter((row) => row.row_type === 'chart')
        .map((row) => ({ date: row.bucket, ...aggregateMetrics(row) })),
      videos: {
        items: videoRows.map((row) => {
          const attributions = (Array.isArray(row.attributions) ? row.attributions : []).map((attribution) => ({
            user_id: Number(attribution.user_id),
            member_name: attribution.member_name,
            team_id: Number(attribution.team_id),
          }));
          return {
            id: Number(row.id),
            platform: row.platform,
            platform_video_id: row.platform_video_id,
            title: row.title,
            video_url: row.video_url,
            thumbnail_url: row.thumbnail_url,
            published_at: row.published_at,
            views: number(row.views),
            likes: number(row.likes),
            comments: number(row.comments),
            shares: number(row.shares),
            channel: {
              id: Number(row.channel_id),
              username: row.channel_username,
              display_name: row.channel_name,
            },
            // Keep the legacy singular field for API consumers while exposing every match.
            attribution: attributions[0] || null,
            attributions,
            revenue: row.revenue === null ? null : {
              amount: number(row.revenue),
              currency: row.currency || null,
            },
            orders: number(row.orders),
          };
        }),
        pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: Math.max(1, Math.ceil(total / pageSize)),
        },
      },
      revenue: {
        teams,
        products: [...allProductsMap.values()].sort((a, b) => b.orders - a.orders || b.revenue - a.revenue),
        channels: aggregateRows
          .filter((row) => row.row_type === 'channel')
          .map((row) => ({
            channel_id: Number(row.bucket),
            channel_name: row.label || null,
            ...aggregateMetrics(row),
          })),
      },
      filters: {
        team_id: teamId,
        team_ids: teamIds,
        user_id: userId,
        channel_ids: channelIds,
        teams: [...availableTeamsById.values()],
        users: [...availableUsersById.values()],
        channels: aggregateRows
          .filter((row) => row.row_type === 'channel-option')
          .map((row) => ({
            id: Number(row.bucket),
            name: row.label || null,
            avatar_url: row.avatar_url || null,
          })),
      },
      revenue_sync: {
        source: 'tiktok_shop_daily_sync',
        partial: monthlyRevenue.errors.length > 0,
        errors: monthlyRevenue.errors,
      },
    };
    });

    if (hit) {
      res.setHeader('X-Cache', 'HIT');
    }
    res.json(payload);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const getChannelReportMemberDetail = async (req, res) => {
  try {
    const options = channelReportOptions({ ...req.query, user_id: req.params.userId });
    const {
      mode,
      month,
      startDate,
      endDate,
      endDateExclusive,
      teamId,
      teamIds,
      userId,
      channelIds,
      metric,
      page,
      pageSize,
    } = options;

    const teamKey = teamIds ? [...teamIds].sort().join(',') : 'all';
    const channelKey = channelIds ? [...channelIds].sort().join(',') : 'all';
    const cacheKey = `report:member-detail:${userId}:${mode}:${month || 'custom'}:${startDate}:${endDate}:${teamKey}:${channelKey}:${metric}:${page}:${pageSize}`;

    const { data: payload, hit } = await getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
      const monthlyRevenue = await loadMonthlyShopVideoRevenue({
        startDate,
        endDate: endDateExclusive,
      });
      const replacements = {
        startDate,
        endDateExclusive,
        filterTeams: teamIds !== null,
        teamIds: JSON.stringify(teamIds || []),
        teamId,
        userId,
        filterChannels: channelIds !== null,
        channelIds: JSON.stringify(channelIds || []),
        revenueRows: JSON.stringify(monthlyRevenue.rows.map((row) => ({
          platform_video_id: row.platform_video_id,
          gross_gmv: row.revenue,
          currency: row.currency,
          orders: Number(row.orders) || 0,
        }))),
      };
      replacements.metric = metric;
      const [videoRows, productRows] = await Promise.all([
        sequelize.query(`${channelReportBaseSql}
        /* channel-report-member-videos */
        SELECT
          video.id,
          video.platform_video_id,
          video.title,
          video.video_url,
          video.thumbnail_url,
          video.published_at,
          video.views,
          video.likes,
          video.comments,
          video.shares,
          video.channel_id,
          video.channel_username,
          video.channel_name,
          video.revenue,
          video.currency,
          video.orders,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', mapped.product_id,
                'name', mapped.name,
                'image_url', mapped.image_url,
                'quantity', mapped.quantity
              ) ORDER BY mapped.quantity DESC, mapped.name
            )
            FROM (
              SELECT DISTINCT ON (raw_mapped.product_id)
                raw_mapped.product_id,
                raw_mapped.name,
                raw_mapped.image_url,
                COALESCE(
                  pq.quantity,
                  CASE
                    WHEN (
                      SELECT COUNT(DISTINCT sub_p.product_id)
                      FROM (
                        SELECT product.id::text AS product_id FROM video_products relation JOIN products product ON product.id = relation.product_id WHERE relation.video_id = video.id
                        UNION
                        SELECT NULLIF(sp.value ->> 'id', '') AS product_id FROM shop_videos sv CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(sv.raw_data -> 'products') = 'array' THEN sv.raw_data -> 'products' ELSE '[]'::jsonb END) sp(value) WHERE sv.platform_video_id = video.platform_video_id AND NULLIF(sp.value ->> 'id', '') IS NOT NULL
                        UNION
                        SELECT NULLIF(dp.value ->> 'id', '') AS product_id FROM channel_report_video_revenue_daily dr CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(dr.raw_metrics -> 'products') = 'array' THEN dr.raw_metrics -> 'products' ELSE '[]'::jsonb END) dp(value) WHERE dr.platform_video_id = video.platform_video_id AND NULLIF(dp.value ->> 'id', '') IS NOT NULL
                      ) sub_p
                    ) <= 1 THEN (
                      SELECT GREATEST(
                        COALESCE(SUM(COALESCE(NULLIF(d.raw_metrics ->> 'items_sold', '')::numeric, 0))::bigint, 0),
                        COALESCE(SUM(COALESCE(NULLIF(d.raw_metrics ->> 'sku_orders', '')::numeric, 0))::bigint, 0),
                        video.orders
                      )
                      FROM channel_report_video_revenue_daily d
                      WHERE d.platform_video_id = video.platform_video_id
                        AND d.metric_date >= CAST(:startDate AS DATE)
                        AND d.metric_date < CAST(:endDateExclusive AS DATE)
                    )
                    ELSE (
                      SELECT COALESCE(SUM(COALESCE(NULLIF(d.raw_metrics ->> 'items_sold', '')::numeric, 0))::bigint, 0)
                      FROM channel_report_video_revenue_daily d
                      WHERE d.platform_video_id = video.platform_video_id
                        AND d.metric_date >= CAST(:startDate AS DATE)
                        AND d.metric_date < CAST(:endDateExclusive AS DATE)
                        AND EXISTS (
                          SELECT 1
                          FROM jsonb_array_elements(
                            CASE WHEN jsonb_typeof(d.raw_metrics -> 'products') = 'array' THEN d.raw_metrics -> 'products' ELSE '[]'::jsonb END
                          ) p_item
                          WHERE p_item ->> 'id' = raw_mapped.product_id
                        )
                    )
                  END,
                  0
                )::bigint AS quantity
              FROM (
                SELECT
                  product.id::text AS product_id,
                  product.name,
                  tsp.image_url
                FROM video_products relation
                JOIN products product ON product.id = relation.product_id
                LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = product.id::text
                WHERE relation.video_id = video.id
                UNION ALL
                SELECT
                  NULLIF(shop_product.value ->> 'id', '') AS product_id,
                  COALESCE(NULLIF(shop_product.value ->> 'name', ''), NULLIF(shop_product.value ->> 'title', ''), tsp.title, shop_product.value ->> 'id') AS name,
                  COALESCE(
                    tsp.image_url,
                    NULLIF(shop_product.value ->> 'main_image_url', ''),
                    NULLIF(shop_product.value ->> 'thumbnail_url', ''),
                    NULLIF(shop_product.value ->> 'image_url', '')
                  ) AS image_url
                FROM shop_videos shop_video
                CROSS JOIN LATERAL jsonb_array_elements(
                  CASE
                    WHEN jsonb_typeof(shop_video.raw_data -> 'products') = 'array' THEN shop_video.raw_data -> 'products'
                    ELSE '[]'::jsonb
                  END
                ) shop_product(value)
                LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = NULLIF(shop_product.value ->> 'id', '')
                WHERE shop_video.platform_video_id = video.platform_video_id
                UNION ALL
                SELECT
                  NULLIF(daily_product.value ->> 'id', '') AS product_id,
                  COALESCE(NULLIF(daily_product.value ->> 'name', ''), NULLIF(daily_product.value ->> 'title', ''), tsp.title, daily_product.value ->> 'id') AS name,
                  tsp.image_url
                FROM channel_report_video_revenue_daily daily_row
                CROSS JOIN LATERAL jsonb_array_elements(
                  CASE
                    WHEN jsonb_typeof(daily_row.raw_metrics -> 'products') = 'array' THEN daily_row.raw_metrics -> 'products'
                    ELSE '[]'::jsonb
                  END
                ) daily_product(value)
                LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = NULLIF(daily_product.value ->> 'id', '')
                WHERE daily_row.platform_video_id = video.platform_video_id
                  AND NULLIF(daily_product.value ->> 'id', '') IS NOT NULL
                UNION ALL
                SELECT
                  sku.product_id,
                  COALESCE(NULLIF(sku.product_name, ''), tsp.title, sku.product_id) AS name,
                  tsp.image_url
                FROM tiktok_affiliate_order_skus sku
                LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = sku.product_id
                WHERE UPPER(COALESCE(sku.content_type, '')) = 'VIDEO'
                  AND sku.content_id = video.platform_video_id
              ) raw_mapped
              LEFT JOIN (
                SELECT
                  sku.product_id,
                  SUM(sku.quantity)::bigint AS quantity
                FROM tiktok_affiliate_order_skus sku
                JOIN tiktok_affiliate_orders o ON o.id = sku.affiliate_order_id
                WHERE UPPER(COALESCE(sku.content_type, '')) = 'VIDEO'
                  AND sku.content_id = video.platform_video_id
                  AND o.create_time >= CAST(:startDate AS DATE)
                  AND o.create_time < CAST(:endDateExclusive AS DATE)
                GROUP BY sku.product_id
              ) pq ON pq.product_id = raw_mapped.product_id
              WHERE raw_mapped.product_id IS NOT NULL
              ORDER BY raw_mapped.product_id, raw_mapped.image_url NULLS LAST
            ) mapped
          ), '[]'::jsonb) AS products,
          COUNT(*) OVER()::bigint AS total_count
        FROM filtered_videos video
        ORDER BY video.revenue DESC NULLS LAST, video.published_at DESC, video.id DESC
        LIMIT :limit OFFSET :offset
      `, {
          replacements: {
            ...replacements,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          },
          type: QueryTypes.SELECT,
        }),
        sequelize.query(`${channelReportBaseSql}
        /* channel-report-member-products */
        , member_video_products AS (
          SELECT
            video.id AS video_id,
            video.views,
            video.revenue,
            video.orders,
            video.currency,
            mapped.product_id,
            mapped.name,
            mapped.image_url
          FROM filtered_videos video
          LEFT JOIN LATERAL (
            SELECT
              product.id::text AS product_id,
              product.name,
              tsp.image_url
            FROM video_products relation
            JOIN products product ON product.id = relation.product_id
            LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = product.id::text
            WHERE relation.video_id = video.id
            UNION
            SELECT
              NULLIF(shop_product.value ->> 'id', '') AS product_id,
              COALESCE(NULLIF(shop_product.value ->> 'name', ''), NULLIF(shop_product.value ->> 'title', ''), tsp.title, shop_product.value ->> 'id') AS name,
              COALESCE(
                tsp.image_url,
                NULLIF(shop_product.value ->> 'main_image_url', ''),
                NULLIF(shop_product.value ->> 'thumbnail_url', ''),
                NULLIF(shop_product.value ->> 'image_url', '')
              ) AS image_url
            FROM shop_videos shop_video
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(shop_video.raw_data -> 'products') = 'array' THEN shop_video.raw_data -> 'products'
                ELSE '[]'::jsonb
              END
            ) shop_product(value)
            LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = NULLIF(shop_product.value ->> 'id', '')
            WHERE shop_video.platform_video_id = video.platform_video_id
            UNION
            SELECT
              NULLIF(daily_product.value ->> 'id', '') AS product_id,
              COALESCE(NULLIF(daily_product.value ->> 'name', ''), NULLIF(daily_product.value ->> 'title', ''), tsp.title, daily_product.value ->> 'id') AS name,
              tsp.image_url
            FROM channel_report_video_revenue_daily daily_row
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(daily_row.raw_metrics -> 'products') = 'array' THEN daily_row.raw_metrics -> 'products'
                ELSE '[]'::jsonb
              END
            ) daily_product(value)
            LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = NULLIF(daily_product.value ->> 'id', '')
            WHERE daily_row.platform_video_id = video.platform_video_id
              AND NULLIF(daily_product.value ->> 'id', '') IS NOT NULL
            UNION
            SELECT
              sku.product_id,
              COALESCE(NULLIF(sku.product_name, ''), tsp.title, sku.product_id) AS name,
              tsp.image_url
            FROM tiktok_affiliate_order_skus sku
            LEFT JOIN tiktok_shop_products tsp ON tsp.product_id = sku.product_id
            WHERE UPPER(COALESCE(sku.content_type, '')) = 'VIDEO'
              AND sku.content_id = video.platform_video_id
          ) mapped ON TRUE
        ),
        product_videos AS (
          SELECT
            *,
            GREATEST(COUNT(product_id) OVER (PARTITION BY video_id), 1) AS product_count
          FROM member_video_products
        )
        SELECT
          product_id,
          COALESCE(name, 'Không gắn giỏ hàng') AS name,
          COALESCE(MAX(image_url), NULL) AS image_url,
          COUNT(DISTINCT video_id)::bigint AS videos,
          COALESCE(SUM(views::numeric / product_count), 0) AS views,
          COALESCE(SUM(revenue / product_count), 0) AS revenue,
          COALESCE(ROUND(SUM(orders::numeric / product_count)), 0)::bigint AS orders,
          COUNT(revenue) > 0 AS revenue_available,
          MIN(currency) AS currency
        FROM product_videos
        GROUP BY product_id, name
        ORDER BY revenue_available DESC, revenue DESC, orders DESC, videos DESC, name ASC
      `, { replacements, type: QueryTypes.SELECT }),
      ]);

      const total = Number(videoRows[0]?.total_count || 0);
      return {
        videos: {
          items: videoRows.map((row) => ({
            id: Number(row.id),
            platform_video_id: row.platform_video_id,
            title: row.title || null,
            video_url: row.video_url || null,
            thumbnail_url: row.thumbnail_url || null,
            published_at: row.published_at,
            views: number(row.views),
            likes: number(row.likes),
            comments: number(row.comments),
            shares: number(row.shares),
            channel: {
              id: Number(row.channel_id),
              username: row.channel_username || null,
              display_name: row.channel_name || null,
            },
            products: Array.isArray(row.products) ? row.products : [],
            revenue: row.revenue === null ? null : {
              amount: number(row.revenue),
              currency: row.currency || null,
            },
            orders: number(row.orders),
          })),
          pagination: {
            page,
            page_size: pageSize,
            total,
            total_pages: Math.max(1, Math.ceil(total / pageSize)),
          },
        },
        products: productRows.map((row) => ({
          id: row.product_id === null ? null : String(row.product_id),
          name: row.name,
          image_url: row.image_url || null,
          videos: number(row.videos),
          views: Math.round(number(row.views)),
          orders: number(row.orders),
          revenue: number(row.revenue),
          revenue_available: Boolean(row.revenue_available),
          currency: row.currency || null,
        })),
        revenue_sync: {
          partial: monthlyRevenue.errors.length > 0,
          errors: monthlyRevenue.errors,
        },
      };
    });

    if (hit) {
      res.setHeader('X-Cache', 'HIT');
    }
    res.json(payload);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const getChannelReportVideoDailyRevenue = async (req, res) => {
  try {
    const platformVideoId = String(req.params.platformVideoId || '').trim();
    if (!platformVideoId || platformVideoId.length > 64) {
      return res.status(400).json({ message: 'Video báo cáo không hợp lệ.' });
    }
    const { startDate, endDate, endDateExclusive, metric } = channelReportOptions(req.query);
    const cacheKey = `report:video-daily-revenue:${platformVideoId}:${startDate || 'none'}:${endDate || 'none'}:${metric || 'revenue'}`;

    const { data: result, hit } = await getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
      const data = await loadVideoDailyRevenue({
        platformVideoId,
        startDate,
        endDate: endDateExclusive,
      });
      return { ...data, end_date: endDate };
    });

    if (hit) {
      res.setHeader('X-Cache', 'HIT');
    }
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const validateReportPeriod = (startValue, endValue) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const startText = String(startValue || '');
  const endText = String(endValue || '');
  if (!datePattern.test(startText) || !datePattern.test(endText)) {
    const error = new Error('Khoảng thời gian báo cáo không hợp lệ.');
    error.status = 400;
    throw error;
  }

  const start = new Date(`${startText}T00:00:00.000Z`);
  const end = new Date(`${endText}T23:59:59.999Z`);
  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || toDateOnly(start) !== startText
    || toDateOnly(end) !== endText
    || start > end
  ) {
    const error = new Error('Khoảng thời gian báo cáo không hợp lệ.');
    error.status = 400;
    throw error;
  }
  if ((end.getTime() - start.getTime()) / 86400000 > 366) {
    const error = new Error('Khoảng thời gian báo cáo không được vượt quá 366 ngày.');
    error.status = 400;
    throw error;
  }
  return { start, end, startText, endText };
};

const buildKocReportSnapshot = (bookings, startText, endText) => {
  const activeCollaborationStatuses = new Set(['ONGOING', 'VALID', 'EXPIRING']);
  const terminalBookingStatuses = new Set(['done', 'cancelled']);
  const endOfPeriod = new Date(`${endText}T23:59:59.999Z`);
  const kocStats = new Map();
  let activeCollaborations = 0;
  let performanceEvaluations = 0;

  bookings.forEach((booking) => {
    const evaluation = booking.evaluation_snapshot || {};
    const performance = evaluation.performance || null;
    const collaboration = evaluation.collaboration || null;
    const identity = String(
      booking.creator_open_id
        || (booking.creator_username ? `username:${booking.creator_username.toLowerCase()}` : '')
        || (booking.creator_id ? `user:${booking.creator_id}` : '')
        || `booking:${booking.id}`,
    );
    if (!kocStats.has(identity)) {
      kocStats.set(identity, {
        identity,
        name: booking.creator_name || booking.creator_username || 'KOC',
        username: booking.creator_username || null,
        bookings: 0,
        bookingCost: 0,
        activeBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        overdueBookings: 0,
        statuses: {},
        latestPerformance: null,
        actualGrossGmv: 0,
        actualNetGmv: 0,
        actualNetGmvAvailable: true,
        actualOrders: 0,
        actualViews: 0,
        attributedVideos: 0,
        evaluations: [],
      });
    }
    const current = kocStats.get(identity);
    const bookingCost = number(booking.total_cost ?? booking.booking_cost);
    const videoViews = number(performance?.video_views);
    const affiliateOrders = number(performance?.affiliate_orders);
    const affiliateGmv = number(performance?.affiliate_gmv);
    const benchmark = {
      costPerThousandViews: videoViews > 0 ? Number((bookingCost / videoViews * 1000).toFixed(2)) : null,
      costPerOrder: affiliateOrders > 0 ? Number((bookingCost / affiliateOrders).toFixed(2)) : null,
      costToHistoricalGmvRate: affiliateGmv > 0 ? Number((bookingCost / affiliateGmv * 100).toFixed(2)) : null,
    };
    const actual = booking.actual_performance || {};

    current.bookings += 1;
    current.bookingCost += bookingCost;
    current.statuses[booking.status] = (current.statuses[booking.status] || 0) + 1;
    if (!terminalBookingStatuses.has(booking.status)) current.activeBookings += 1;
    if (['video_posted', 'done'].includes(booking.status)) current.completedBookings += 1;
    if (booking.status === 'cancelled') current.cancelledBookings += 1;
    const overdue = Boolean(
      booking.deadline
      && !terminalBookingStatuses.has(booking.status)
      && new Date(`${booking.deadline}T23:59:59.999Z`) < endOfPeriod
    );
    if (overdue) current.overdueBookings += 1;
    if (activeCollaborationStatuses.has(String(collaboration?.status || '').toUpperCase())) {
      activeCollaborations += 1;
    }
    if (performance) performanceEvaluations += 1;
    current.actualGrossGmv += number(actual.gross_gmv);
    current.actualOrders += number(actual.orders);
    current.actualViews += number(actual.views);
    current.attributedVideos += number(actual.video_count);
    if (actual.net_gmv === null || actual.net_gmv === undefined) current.actualNetGmvAvailable = false;
    else current.actualNetGmv += number(actual.net_gmv);

    const normalizedPerformance = performance ? {
      startDate: performance.start_date || null,
      endDate: performance.end_date || null,
      currency: performance.currency || null,
      affiliateGmv,
      affiliateOrders,
      itemsSold: number(performance.items_sold),
      videoViews,
      shoppableVideos: number(performance.shoppable_videos),
      ctr: number(performance.ctr),
      ctor: number(performance.ctor),
      estimatedCommission: number(performance.estimated_commission),
      syncedAt: performance.synced_at || null,
    } : null;
    const latestEndDate = current.latestPerformance?.endDate || '';
    if (normalizedPerformance && String(normalizedPerformance.endDate || '') >= String(latestEndDate)) {
      current.latestPerformance = normalizedPerformance;
    }
    current.evaluations.push({
      bookingId: booking.id,
      bookingCost,
      status: booking.status,
      deadline: booking.deadline,
      overdue,
      collaboration: collaboration ? {
        name: collaboration.name || null,
        status: collaboration.status || null,
        endAt: collaboration.end_at || null,
      } : null,
      performance: normalizedPerformance,
      benchmark,
      actual: {
        status: actual.status || 'AWAITING_VIDEO',
        videoCount: number(actual.video_count),
        grossGmv: number(actual.gross_gmv),
        refundedGmv: actual.refunded_gmv ?? null,
        netGmv: actual.net_gmv ?? null,
        orders: number(actual.orders),
        views: number(actual.views),
        grossRoas: actual.gross_roas ?? null,
        netRoas: actual.net_roas ?? null,
        roi: null,
        roiStatus: 'MISSING_COST_DATA',
      },
    });
  });

  const rankings = Array.from(kocStats.values()).map((koc) => ({
      ...koc,
      bookingCompletionRate: koc.bookings
        ? Number(((koc.completedBookings / koc.bookings) * 100).toFixed(1))
        : 0,
      averageBookingCost: koc.bookings ? Math.round(koc.bookingCost / koc.bookings) : 0,
      actualGrossRoas: koc.bookingCost > 0 && koc.attributedVideos
        ? Number((koc.actualGrossGmv / koc.bookingCost).toFixed(2))
        : null,
      actualNetRoas: koc.bookingCost > 0 && koc.attributedVideos && koc.actualNetGmvAvailable
        ? Number((koc.actualNetGmv / koc.bookingCost).toFixed(2))
        : null,
    })).sort((a, b) => (
      b.actualGrossGmv - a.actualGrossGmv
      || number(b.latestPerformance?.affiliateGmv) - number(a.latestPerformance?.affiliateGmv)
      || b.bookingCost - a.bookingCost
      || a.name.localeCompare(b.name)
    ));
  const totalBookingCost = rankings.reduce((sum, koc) => sum + koc.bookingCost, 0);
  const completedBookings = rankings.reduce((sum, koc) => sum + koc.completedBookings, 0);
  const overdueBookings = rankings.reduce((sum, koc) => sum + koc.overdueBookings, 0);
  const actualGrossGmv = rankings.reduce((sum, koc) => sum + koc.actualGrossGmv, 0);
  const attributedVideos = rankings.reduce((sum, koc) => sum + koc.attributedVideos, 0);

  return {
    period: { start: startText, end: endText },
    bookingCurrency: 'MYR',
    overview: {
      evaluations: bookings.length,
      totalKocs: rankings.length,
      activeCollaborations,
      performanceCoverage: bookings.length
        ? Number(((performanceEvaluations / bookings.length) * 100).toFixed(1))
        : 0,
      bookings: bookings.length,
      bookingCost: totalBookingCost,
      completedBookings,
      overdueBookings,
      bookingCompletionRate: bookings.length
        ? Number(((completedBookings / bookings.length) * 100).toFixed(1))
        : 0,
      attributedVideos,
      actualGrossGmv,
      actualGrossRoas: totalBookingCost > 0 && attributedVideos
        ? Number((actualGrossGmv / totalBookingCost).toFixed(2))
        : null,
    },
    kocs: rankings,
  };
};

const buildKocFactualReport = (snapshot) => {
  const {
    period,
    overview,
    kocs,
  } = snapshot;
  const formatBenchmark = (benchmark) => {
    const values = [
      benchmark.costPerThousandViews == null
        ? '—/1K views'
        : `RM ${formatNumber(benchmark.costPerThousandViews)}/1K views`,
      benchmark.costPerOrder == null
        ? '—/đơn'
        : `RM ${formatNumber(benchmark.costPerOrder)}/đơn`,
      benchmark.costToHistoricalGmvRate == null
        ? '—% GMV lịch sử'
        : `${benchmark.costToHistoricalGmvRate.toLocaleString('vi-VN')}% GMV lịch sử`,
    ];
    return values.join(' · ');
  };
  return [
    'BÁO CÁO ĐÁNH GIÁ HIỆU QUẢ KOC',
    `Kỳ đánh giá: ${period.start} - ${period.end}`,
    '',
    'TỔNG QUAN',
    `- Đánh giá booking trong kỳ: ${formatNumber(overview.evaluations)}`,
    `- KOC được đánh giá: ${formatNumber(overview.totalKocs)}`,
    `- Hợp tác đang hoạt động: ${formatNumber(overview.activeCollaborations)}`,
    `- Độ phủ Creator Performance: ${overview.performanceCoverage.toLocaleString('vi-VN')}%`,
    `- Tổng chi phí booking: RM ${formatNumber(overview.bookingCost)}`,
    `- Booking quá hạn: ${formatNumber(overview.overdueBookings)}`,
    `- Video đã quy gán: ${formatNumber(overview.attributedVideos)}`,
    `- Gross GMV thực tế từ video: RM ${formatNumber(overview.actualGrossGmv)}`,
    `- Gross ROAS thực tế: ${overview.actualGrossRoas == null ? 'Chưa đủ dữ liệu' : `${overview.actualGrossRoas.toLocaleString('vi-VN')}x`}`,
    '',
    'ĐÁNH GIÁ THEO KOC',
    kocs.length ? kocs.map((koc, index) => {
      const performance = koc.latestPerformance;
      const latestEvaluation = koc.evaluations[0];
      return [
        `${index + 1}. ${koc.name}`,
        `   Booking: ${formatNumber(koc.bookings)} đánh giá · chi phí RM ${formatNumber(koc.bookingCost)} · quá hạn ${formatNumber(koc.overdueBookings)}`,
        performance
          ? `   Creator Performance (${performance.startDate || '—'} - ${performance.endDate || '—'}): GMV ${formatNumber(performance.affiliateGmv)} ${performance.currency || ''} · ${formatNumber(performance.affiliateOrders)} đơn · ${formatNumber(performance.videoViews)} video views · ${formatNumber(performance.shoppableVideos)} video có gắn sản phẩm`
          : '   Creator Performance: Chưa có dữ liệu.',
        !latestEvaluation || Object.values(latestEvaluation.benchmark).every((value) => value == null)
          ? '   Benchmark chi phí: Chưa đủ dữ liệu.'
          : `   Benchmark chi phí: ${formatBenchmark(latestEvaluation.benchmark)}`,
        koc.attributedVideos
          ? `   Kết quả thực tế (${formatNumber(koc.attributedVideos)} video): Gross GMV RM ${formatNumber(koc.actualGrossGmv)} · ${formatNumber(koc.actualOrders)} đơn · Gross ROAS ${koc.actualGrossRoas == null ? '—' : `${koc.actualGrossRoas.toLocaleString('vi-VN')}x`} · Net ROAS ${koc.actualNetRoas == null ? 'chờ dữ liệu hoàn trả' : `${koc.actualNetRoas.toLocaleString('vi-VN')}x`} · ROI chưa đủ dữ liệu giá vốn`
          : '   Kết quả thực tế: Chưa liên kết video booking.',
      ].join('\n');
    }).join('\n\n') : '- Chưa có đánh giá booking trong khoảng thời gian đã chọn.',
    '',
    'LƯU Ý DỮ LIỆU',
    '- Nguồn dữ liệu giống page Quản lý booking: booking có evaluation_snapshot, lọc theo ngày tạo trong kỳ.',
    '- Creator Performance là dữ liệu tổng của KOC được lưu tại lúc tạo đánh giá, không phải kết quả trực tiếp hay ROI của booking.',
    '- Kết quả thực tế chỉ lấy snapshot của video đã liên kết trong cửa sổ ghi nhận 30 ngày.',
    '- ROI không được tính khi chưa có giá vốn và các chi phí liên quan.',
  ].join('\n');
};

const generateOllamaAnalysis = async (snapshot) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REPORT_OLLAMA_TIMEOUT_MS);
  try {
    const response = await fetch(`${REPORT_OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: REPORT_OLLAMA_MODEL,
        stream: false,
        options: { temperature: 0.2 },
        messages: [
          {
            role: 'system',
            content: [
              'Bạn là chuyên gia đánh giá hiệu quả KOC cho YUM Network.',
              'Chỉ sử dụng đúng dữ liệu JSON được cung cấp, tuyệt đối không tự tạo số liệu hoặc suy đoán doanh thu.',
              'Viết tiếng Việt dạng văn bản thuần, ngắn gọn, gồm ba phần: "ĐIỂM NỔI BẬT", "ĐIỂM CẦN CẢI THIỆN", "ĐỀ XUẤT HÀNH ĐỘNG".',
              'Tách rõ benchmark trước booking và kết quả thực tế sau booking.',
              'Benchmark dùng Creator Performance lịch sử. Kết quả thực tế chỉ dùng actual của video đã liên kết: Gross/Net GMV, đơn hàng, views và Gross/Net ROAS.',
              'Không được xem Creator Performance tổng là kết quả trực tiếp hay ROI của booking.',
              'Không gọi ROAS là ROI. Nếu ROI có trạng thái MISSING_COST_DATA thì phải nói chưa đủ giá vốn và chi phí để tính ROI.',
              'Nếu thiếu Creator Performance, benchmark, refund hoặc actual thì nói rõ giới hạn, không đưa kết luận vô căn cứ.',
              'Không lặp lại toàn bộ bảng KPI và không thêm lời chào.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `Đánh giá hiệu quả KOC từ snapshot sau:\n${JSON.stringify(snapshot)}`,
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `Ollama trả về HTTP ${response.status}`);
    }
    const content = normalizeAiContent(payload.message?.content || payload.response);
    if (!content) throw new Error('Ollama không trả về nội dung phân tích.');
    return content;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Ollama không phản hồi sau ${REPORT_OLLAMA_TIMEOUT_MS / 1000} giây.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const getReports = async (req, res) => {
  try {
    const reports = await WeeklyReport.findAll({
      order: [['week_start', 'DESC'], ['id', 'DESC']],
    });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReportById = async (req, res) => {
  try {
    const report = await WeeklyReport.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ message: 'Weekly report not found' });
    }
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const shareReport = async (req, res) => {
  try {
    const report = await WeeklyReport.findByPk(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    if (!report.public_share_token) {
      report.public_share_token = crypto.randomBytes(24).toString('hex');
      await report.save();
    }
    res.json({ share_token: report.public_share_token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getPublicReport = async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!/^[a-f0-9]{48}$/i.test(token)) {
      return res.status(404).json({ message: 'Shared report not found' });
    }
    const cacheKey = `report:public:${token}`;
    const { data: report, hit } = await getOrSetCache(cacheKey, 600, async () => {
      const row = await WeeklyReport.findOne({
        where: { public_share_token: token },
        attributes: ['id', 'week_start', 'week_end', 'generated_content'],
      });
      return row ? (row.toJSON ? row.toJSON() : row) : null;
    });
    if (!report) return res.status(404).json({ message: 'Shared report not found' });
    if (hit) {
      res.setHeader('X-Cache', 'HIT');
    }
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createReport = async (req, res) => {
  try {
    const report = await WeeklyReport.create(req.body);
    await delByPattern('report:*');
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateReport = async (req, res) => {
  try {
    const [updated] = await WeeklyReport.update(req.body, {
      where: { id: req.params.id },
    });
    if (!updated) {
      return res.status(404).json({ message: 'Weekly report not found' });
    }

    await delByPattern('report:*');
    const report = await WeeklyReport.findByPk(req.params.id);
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteReport = async (req, res) => {
  try {
    const deleted = await WeeklyReport.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Weekly report not found' });
    }

    await delByPattern('report:*');
    res.json({ message: 'Weekly report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getKpis = async (req, res) => {
  try {
    const role = req.query.role ? String(req.query.role).trim().toLowerCase() : '';
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.start_date || '')) ? req.query.start_date : null;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.end_date || '')) ? req.query.end_date : null;

    const cacheKey = `report:kpis:${role || 'all'}:${startDate || 'none'}:${endDate || 'none'}`;

    const { data: payload, hit } = await getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
      const roleFilterSql = role === 'koc' ? 'WHERE role = :role' : '';
      const userFilterSql = role === 'koc' ? 'WHERE u.role = :role' : '';
      const videoDateSql = `${startDate ? ' AND v.published_at::date >= :startDate' : ''}${endDate ? ' AND v.published_at::date <= :endDate' : ''}`;
      const topVideoDateSql = `${startDate ? ' AND v_top.published_at::date >= :startDate' : ''}${endDate ? ' AND v_top.published_at::date <= :endDate' : ''}`;
      const statsDateSql = `${startDate ? ' AND vds.date >= :startDate' : ''}${endDate ? ' AND vds.date <= :endDate' : ''}`;
      const replacements = { ...(role === 'koc' ? { role } : {}), ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) };

      const [overviewRows, userKpis, productKpis, weeklyViews, topVideos] = await Promise.all([
        sequelize.query(`
        SELECT
          (SELECT COUNT(*) FROM users ${roleFilterSql})::int AS "totalUsers",
          COUNT(*)::int AS "totalVideos",
          COALESCE(SUM(views), 0)::bigint AS "totalViews",
          COALESCE(SUM(likes), 0)::bigint AS "totalLikes",
          COALESCE(SUM(comments), 0)::bigint AS "totalComments",
          COALESCE(SUM(shares), 0)::bigint AS "totalShares"
        FROM videos
      `, { type: QueryTypes.SELECT, replacements }),
        sequelize.query(`
        WITH user_videos AS (
          SELECT DISTINCT user_id, video_id
          FROM video_assignments
          UNION
          SELECT tc.creator_id AS user_id, v.id AS video_id
          FROM tiktok_channels tc
          JOIN videos v ON v.channel_id = tc.id
          WHERE tc.creator_id IS NOT NULL
        ),
        video_product_counts AS (
          SELECT video_id, COUNT(*)::int AS product_count
          FROM video_products
          GROUP BY video_id
        ),
        period_bounds AS (
          SELECT MAX(published_at::date) AS max_date
          FROM videos
          WHERE published_at IS NOT NULL
        ),
        periods AS (
          SELECT
            max_date AS current_end,
            (max_date - INTERVAL '6 days')::date AS current_start,
            (max_date - INTERVAL '13 days')::date AS previous_start,
            (max_date - INTERVAL '7 days')::date AS previous_end
          FROM period_bounds
          WHERE max_date IS NOT NULL
        )
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          COUNT(v.id)::int AS "videoCount",
          COUNT(DISTINCT v.id) FILTER (WHERE COALESCE(vpc.product_count, 0) > 0)::int AS "productVideoCount",
          COALESCE(SUM(v.views), 0)::bigint AS "totalViews",
          COALESCE(SUM(v.likes), 0)::bigint AS "totalLikes",
          COALESCE(SUM(v.comments), 0)::bigint AS "totalComments",
          COALESCE(SUM(v.shares), 0)::bigint AS "totalShares",
          COALESCE(ROUND(AVG(v.views)), 0)::bigint AS "avgViewsPerVideo",
          COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE v.views >= 10000) / NULLIF(COUNT(v.id), 0)), 0)::int AS "over10kRate",
          COALESCE(SUM(CASE WHEN p.current_start IS NOT NULL AND v.published_at::date BETWEEN p.current_start AND p.current_end THEN v.views ELSE 0 END), 0)::bigint AS "currentPeriodViews",
          COALESCE(SUM(CASE WHEN p.previous_start IS NOT NULL AND v.published_at::date BETWEEN p.previous_start AND p.previous_end THEN v.views ELSE 0 END), 0)::bigint AS "previousPeriodViews",
          CASE WHEN top_video.id IS NULL THEN NULL ELSE json_build_object(
            'id', top_video.id,
            'title', top_video.title,
            'views', top_video.views
          ) END AS "topVideo"
        FROM users u
        LEFT JOIN user_videos uv ON uv.user_id = u.id
        LEFT JOIN videos v ON v.id = uv.video_id${videoDateSql}
        LEFT JOIN video_product_counts vpc ON vpc.video_id = uv.video_id
        LEFT JOIN periods p ON true
        LEFT JOIN LATERAL (
          SELECT v_top.id, v_top.title, v_top.views
          FROM user_videos uv_top
          JOIN videos v_top ON v_top.id = uv_top.video_id
          WHERE uv_top.user_id = u.id
          ${topVideoDateSql}
          ORDER BY v_top.views DESC, v_top.id ASC
          LIMIT 1
        ) top_video ON true
        ${userFilterSql}
        GROUP BY u.id, u.name, u.email, u.role, top_video.id, top_video.title, top_video.views
        ORDER BY u.id ASC
      `, { type: QueryTypes.SELECT, replacements }),
        sequelize.query(`
        SELECT
          p.id,
          p.name,
          COUNT(vp.video_id)::int AS "totalVideos",
          COALESCE(SUM(v.views), 0)::bigint AS "totalViews",
          COALESCE(ROUND(AVG(v.views)), 0)::bigint AS "avgViewsPerVideo"
        FROM products p
        LEFT JOIN video_products vp ON vp.product_id = p.id
        LEFT JOIN videos v ON v.id = vp.video_id
        GROUP BY p.id, p.name
        ORDER BY p.id ASC
      `, { type: QueryTypes.SELECT }),
        sequelize.query(`
        WITH koc_videos AS (
          SELECT DISTINCT va.video_id
          FROM video_assignments va
          JOIN users u ON u.id = va.user_id
          WHERE u.role = 'koc'
          UNION
          SELECT v.id
          FROM tiktok_channels tc
          JOIN users u ON u.id = tc.creator_id AND u.role = 'koc'
          JOIN videos v ON v.channel_id = tc.id
        ), snapshots AS (
          SELECT vds.video_id, vds.date, MAX(vds.views)::bigint AS views
          FROM koc_videos kv
          JOIN video_daily_stats vds ON vds.video_id = kv.video_id
          GROUP BY vds.video_id, vds.date
        ), gains AS (
          SELECT video_id, date, GREATEST(views - COALESCE(LAG(views) OVER (PARTITION BY video_id ORDER BY date), views), 0) AS views
          FROM snapshots
        )
        SELECT date_trunc('week', date)::date AS week, COALESCE(SUM(views), 0)::bigint AS views
        FROM gains
        WHERE 1 = 1${statsDateSql.replaceAll('vds.', '')}
        GROUP BY date_trunc('week', date)
        ORDER BY week ASC
      `, { type: QueryTypes.SELECT, replacements }),
        sequelize.query(`
        WITH koc_videos AS (
          SELECT DISTINCT va.video_id
          FROM video_assignments va
          JOIN users u ON u.id = va.user_id
          WHERE u.role = 'koc'
          UNION
          SELECT v.id
          FROM tiktok_channels tc
          JOIN users u ON u.id = tc.creator_id AND u.role = 'koc'
          JOIN videos v ON v.channel_id = tc.id
        )
        SELECT v.id, v.title, v.views, v.likes, v.comments, v.shares, v.thumbnail_url AS "thumbnailUrl",
               COALESCE(v.video_url, 'https://www.tiktok.com/@' || tc.username || '/video/' || v.platform_video_id) AS "videoUrl",
               v.published_at AS "publishedAt", v.platform_video_id AS "platformVideoId",
               STRING_AGG(DISTINCT u.name, ', ') AS "creatorNames"
        FROM koc_videos kv
        JOIN videos v ON v.id = kv.video_id${videoDateSql}
        LEFT JOIN tiktok_channels tc ON tc.id = v.channel_id
        LEFT JOIN video_assignments va ON va.video_id = v.id
        LEFT JOIN users u ON u.id = va.user_id AND u.role = 'koc'
        GROUP BY v.id, tc.username
        ORDER BY v.views DESC, v.id DESC
        LIMIT 10
      `, { type: QueryTypes.SELECT, replacements }),
      ]);

      return {
        overview: toNumbers(overviewRows[0], ['totalUsers', 'totalViews', 'totalLikes', 'totalComments', 'totalShares']),
        users: userKpis.map((user) => toNumbers(user, [
          'totalViews',
          'totalLikes',
          'totalComments',
          'totalShares',
          'avgViewsPerVideo',
          'currentPeriodViews',
          'previousPeriodViews',
        ])),
        products: productKpis.map((product) => toNumbers(product, ['totalViews', 'avgViewsPerVideo'])),
        weeklyViews: weeklyViews.map((row) => ({ week: row.week, views: Number(row.views || 0) })),
        topVideos: topVideos.map((video) => ({
          ...video,
          views: Number(video.views || 0),
          likes: Number(video.likes || 0),
          comments: Number(video.comments || 0),
          shares: Number(video.shares || 0),
        })),
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

const getKocDetail = async (req, res) => {
  try {
    const creatorId = Number(req.params.creatorId);
    if (!Number.isInteger(creatorId)) return res.status(400).json({ message: 'Invalid KOC id.' });
    const creator = await User.findOne({ where: { id: creatorId, role: 'koc' }, attributes: ['id', 'name', 'email', 'role'], raw: true });
    if (!creator) return res.status(404).json({ message: 'KOC not found.' });

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.start_date || '')) ? req.query.start_date : null;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.end_date || '')) ? req.query.end_date : null;
    const cacheKey = `report:koc-detail:${creatorId}:${startDate || 'none'}:${endDate || 'none'}`;

    const { data: payload, hit } = await getOrSetCache(cacheKey, REPORT_CACHE_TTL_SECONDS, async () => {
      const dateSql = `${startDate ? ' AND vds.date >= :startDate' : ''}${endDate ? ' AND vds.date <= :endDate' : ''}`;
      const videoDateSql = `${startDate ? ' AND v.published_at::date >= :startDate' : ''}${endDate ? ' AND v.published_at::date <= :endDate' : ''}`;
      const replacements = { creatorId, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) };
      const [dailyViews, videos, bookings, syncHistory] = await Promise.all([
        sequelize.query(`
        WITH creator_videos AS (
          SELECT DISTINCT video_id FROM video_assignments WHERE user_id = :creatorId
          UNION
          SELECT v.id
          FROM tiktok_channels tc
          JOIN videos v ON v.channel_id = tc.id
          WHERE tc.creator_id = :creatorId
        )
        SELECT vds.date, COALESCE(SUM(vds.views), 0)::bigint AS views
        FROM creator_videos cv
        JOIN video_daily_stats vds ON vds.video_id = cv.video_id${dateSql}
        GROUP BY vds.date
        ORDER BY vds.date ASC
      `, { type: QueryTypes.SELECT, replacements }),
        sequelize.query(`
        WITH creator_videos AS (
          SELECT DISTINCT video_id FROM video_assignments WHERE user_id = :creatorId
          UNION
          SELECT v.id
          FROM tiktok_channels tc
          JOIN videos v ON v.channel_id = tc.id
          WHERE tc.creator_id = :creatorId
        )
        SELECT DISTINCT v.id, v.title, v.views, v.likes, v.comments, v.shares,
          v.thumbnail_url AS "thumbnailUrl", v.video_url AS "videoUrl", v.published_at AS "publishedAt"
        FROM creator_videos cv
        JOIN videos v ON v.id = cv.video_id${videoDateSql}
        ORDER BY v.views DESC, v.id DESC
        LIMIT 20
      `, { type: QueryTypes.SELECT, replacements }),
        sequelize.query(`
        SELECT id, COALESCE(total_cost, booking_cost) AS "bookingCost", cost_note AS "costNote",
          currency, status, deadline, note, video_url AS "videoUrl", posted_at AS "postedAt"
        FROM bookings
        WHERE creator_id = :creatorId
        ORDER BY deadline DESC, id DESC
        LIMIT 20
      `, { type: QueryTypes.SELECT, replacements }),
        sequelize.query(`
        SELECT id, status, error, synced_at AS "syncedAt"
        FROM tiktok_partner_sync_logs
        WHERE creator_id = :creatorId
        ORDER BY synced_at DESC, id DESC
        LIMIT 10
      `, { type: QueryTypes.SELECT, replacements }),
      ]);
      return {
        creator,
        dailyViews: dailyViews.map((row) => ({ date: row.date, views: Number(row.views || 0) })),
        videos: videos.map((row) => ({ ...row, views: Number(row.views || 0), likes: Number(row.likes || 0), comments: Number(row.comments || 0), shares: Number(row.shares || 0) })),
        bookings,
        syncHistory,
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

const generateWeeklyReport = async (req, res) => {
  try {
    const today = toDateOnly(new Date());
    const requestedStart = req.body.week_start || today;
    const requestedEnd = req.body.week_end || requestedStart;
    const {
      start: weekStart,
      end: weekEnd,
      startText,
      endText,
    } = validateReportPeriod(requestedStart, requestedEnd);

    const bookingInstances = await Booking.findAll({
      where: {
        evaluation_snapshot: { [Op.not]: null },
        created_at: { [Op.between]: [weekStart, weekEnd] },
      },
      attributes: [
        'id',
        'creator_id',
        'creator_open_id',
        'creator_username',
        'creator_name',
        'booking_cost',
        'total_cost',
        'cost_note',
        'currency',
        'status',
        'deadline',
        'created_at',
        'evaluation_snapshot',
      ],
      include: [{
        model: BookingVideo,
        as: 'booking_videos',
        required: false,
        include: [{
          model: BookingVideoPerformanceSnapshot,
          as: 'performance_snapshots',
          required: false,
        }],
      }],
      order: [['created_at', 'DESC'], ['id', 'DESC']],
    });
    const bookings = bookingInstances.map(serializeBookingWithActual);

    const snapshot = buildKocReportSnapshot(bookings, startText, endText);
    const factualContent = buildKocFactualReport(snapshot);
    const aiAnalysis = await generateOllamaAnalysis(snapshot);
    const content = `${factualContent}\n\n${aiAnalysis}`;

    const report = await WeeklyReport.create({
      week_start: startText,
      week_end: endText,
      generated_content: content,
    });

    res.status(201).json(report);
  } catch (error) {
    const isOllamaError = /Ollama/i.test(error.message);
    res.status(error.status || (isOllamaError ? 502 : 500)).json({
      message: isOllamaError
        ? `Không thể tạo phân tích AI: ${error.message}`
        : error.message,
    });
  }
};

module.exports = {
  getReports,
  getReportById,
  getPublicReport,
  shareReport,
  createReport,
  updateReport,
  deleteReport,
  getKpis,
  getKocDetail,
  getChannelReport,
  getChannelReportMemberDetail,
  getChannelReportVideoDailyRevenue,
  generateWeeklyReport,
  clearReportCache,
  __test: {
    buildKocReportSnapshot,
    buildKocFactualReport,
    validateReportPeriod,
    generateOllamaAnalysis,
    channelReportOptions,
  },
};
