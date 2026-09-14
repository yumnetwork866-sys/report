const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { getOrSetCache, delByPattern } = require('../lib/redis');

const DASHBOARD_CACHE_TTL_SECONDS = 180; // 3 minutes

const clearDashboardCache = () => delByPattern('dashboard:*');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DASHBOARD_METRICS = new Set(['views', 'likes', 'shares', 'date', 'gmv']);
const number = (value) => Number(value || 0);
const dateOnly = (value) => {
  const text = String(value || '');
  if (!DATE_PATTERN.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
};

const dashboardFilters = (query = {}) => {
  const channelIdValue = Number(query.channel_id);
  const channelId = Number.isInteger(channelIdValue) && channelIdValue > 0
    ? channelIdValue
    : null;
  const startDate = dateOnly(query.start_date);
  const endDate = dateOnly(query.end_date);
  const metric = DASHBOARD_METRICS.has(String(query.metric || ''))
    ? String(query.metric)
    : 'views';
  const pageValue = Number(query.page);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSizeValue = Number(query.page_size);
  const pageSize = Number.isInteger(pageSizeValue) && pageSizeValue > 0
    ? Math.min(pageSizeValue, 100)
    : 20;
  const userIdValue = Number(query.user_id);
  const userId = Number.isInteger(userIdValue) && userIdValue > 0
    ? userIdValue
    : null;
  return {
    channelId,
    startDate,
    endDate,
    userId,
    metric,
    page,
    pageSize,
  };
};

const calculateGrowthRate = (current, previous) => {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev === 0) {
    return cur > 0 ? 100 : 0;
  }
  return Number((((cur - prev) / prev) * 100).toFixed(1));
};

const fillDailyDateSeries = (startDate, endDate, rows, topVideoMap) => {
  if (!startDate || !endDate) {
    return rows.map((r) => ({
      ...r,
      top_video: topVideoMap.get(String(r.date)) || null,
    }));
  }
  const startMs = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) {
    return rows.map((r) => ({
      ...r,
      top_video: topVideoMap.get(String(r.date)) || null,
    }));
  }

  const rowsByDate = new Map(rows.map((r) => [String(r.date), r]));
  const result = [];
  const oneDayMs = 86400000;

  for (let currentMs = startMs; currentMs <= endMs; currentMs += oneDayMs) {
    const dateStr = new Date(currentMs).toISOString().slice(0, 10);
    const existing = rowsByDate.get(dateStr);
    if (existing) {
      result.push({
        ...existing,
        top_video: topVideoMap.get(dateStr) || null,
      });
    } else {
      result.push({
        date: dateStr,
        video_count: 0,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        gross_gmv: 0,
        top_video: null,
      });
    }
  }
  return result;
};

const getDashboard = async (req, res) => {
  try {
    const filters = dashboardFilters(req.query);
    const {
      channelId,
      startDate,
      endDate,
      userId,
      metric,
      page,
      pageSize,
    } = filters;

    const cacheKey = `dashboard:${channelId || 'all'}:${startDate || 'all'}:${endDate || 'all'}:${userId || 'all'}:${metric}:${page}:${pageSize}`;

    const { data: payload, hit } = await getOrSetCache(cacheKey, DASHBOARD_CACHE_TTL_SECONDS, async () => {
      const filterSql = `
      WHERE (:channelId::int IS NULL OR v.channel_id = :channelId)
        AND (:startDate::date IS NULL OR v.published_at::date >= :startDate)
        AND (:endDate::date IS NULL OR v.published_at::date <= :endDate)
        AND (
          :userId::int IS NULL
          OR EXISTS (
            SELECT 1
            FROM user_content_attributions attribution
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(attribution.hashtags) = 'array' THEN attribution.hashtags
                ELSE '[]'::jsonb
              END
            ) configured_hashtag(value)
            WHERE attribution.user_id = :userId
              AND LOWER(configured_hashtag.value) = ANY(
                regexp_split_to_array(LOWER(COALESCE(v.title, '')), '[^[:alnum:]_#]+')
              )
          )
        )
    `;
    const replacements = { channelId, startDate, endDate, userId };

    const prevPeriodInfo = (() => {
      if (!startDate || !endDate) return null;
      const startMs = new Date(`${startDate}T00:00:00.000Z`).getTime();
      const endMs = new Date(`${endDate}T00:00:00.000Z`).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) return null;
      const durationMs = endMs - startMs;
      const prevEndMs = startMs - 86400000;
      const prevStartMs = prevEndMs - durationMs;
      return {
        prevStartDate: new Date(prevStartMs).toISOString().slice(0, 10),
        prevEndDate: new Date(prevEndMs).toISOString().slice(0, 10),
      };
    })();

    const [channels, users, totalsRows, previousTotalsRows, chartRows, topVideoRows, videos] = await Promise.all([
      sequelize.query(`
        SELECT
          channel.id,
          channel.username,
          channel.display_name,
          channel.avatar_url,
          channel.avatar_large_url,
          COUNT(video.id)::int AS video_count
        FROM tiktok_channels channel
        LEFT JOIN videos video ON video.channel_id = channel.id
        GROUP BY channel.id
        ORDER BY channel.id ASC
      `, { type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT
          app_user.id,
          app_user.name,
          app_user.email,
          app_user.avatar_url
        FROM user_content_attributions attribution
        JOIN users app_user ON app_user.id = attribution.user_id
        WHERE jsonb_typeof(attribution.hashtags) = 'array'
          AND jsonb_array_length(attribution.hashtags) > 0
        ORDER BY LOWER(app_user.name), app_user.id
      `, { type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT
          COUNT(*)::int AS video_count,
          COALESCE(SUM(v.views), 0)::bigint AS views,
          COALESCE(SUM(v.likes), 0)::bigint AS likes,
          COALESCE(SUM(v.comments), 0)::bigint AS comments,
          COALESCE(SUM(v.shares), 0)::bigint AS shares,
          COALESCE(SUM(sales.gross_gmv), 0)::numeric AS gross_gmv,
          COALESCE(MAX(sales.currency), 'MYR') AS sales_currency
        FROM videos v
        LEFT JOIN LATERAL (
          SELECT
            snapshot.gross_gmv,
            snapshot.currency
          FROM shop_videos shop_video
          JOIN shop_video_performance_snapshots snapshot
            ON snapshot.shop_video_id = shop_video.id
          WHERE shop_video.platform_video_id = v.platform_video_id
          ORDER BY snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
          LIMIT 1
        ) sales ON TRUE
        ${filterSql}
      `, { type: QueryTypes.SELECT, replacements }),
      prevPeriodInfo
        ? sequelize.query(`
          SELECT
            COUNT(*)::int AS video_count,
            COALESCE(SUM(v.views), 0)::bigint AS views,
            COALESCE(SUM(v.likes), 0)::bigint AS likes,
            COALESCE(SUM(v.comments), 0)::bigint AS comments,
            COALESCE(SUM(v.shares), 0)::bigint AS shares,
            COALESCE(SUM(sales.gross_gmv), 0)::numeric AS gross_gmv
          FROM videos v
          LEFT JOIN LATERAL (
            SELECT
              snapshot.gross_gmv
            FROM shop_videos shop_video
            JOIN shop_video_performance_snapshots snapshot
              ON snapshot.shop_video_id = shop_video.id
            WHERE shop_video.platform_video_id = v.platform_video_id
            ORDER BY snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
            LIMIT 1
          ) sales ON TRUE
          ${filterSql}
        `, {
          type: QueryTypes.SELECT,
          replacements: {
            channelId,
            startDate: prevPeriodInfo.prevStartDate,
            endDate: prevPeriodInfo.prevEndDate,
            userId,
          },
        })
        : Promise.resolve([]),
      metric === 'date'
        ? sequelize.query(`
          SELECT
            v.published_at::date AS date,
            COUNT(*)::int AS video_count,
            COALESCE(SUM(v.views), 0)::bigint AS views,
            COALESCE(SUM(v.likes), 0)::bigint AS likes,
            COALESCE(SUM(v.comments), 0)::bigint AS comments,
            COALESCE(SUM(v.shares), 0)::bigint AS shares,
            COALESCE(SUM(sales.gross_gmv), 0)::numeric AS gross_gmv
          FROM videos v
          LEFT JOIN LATERAL (
            SELECT
              snapshot.gross_gmv
            FROM shop_videos shop_video
            JOIN shop_video_performance_snapshots snapshot
              ON snapshot.shop_video_id = shop_video.id
            WHERE shop_video.platform_video_id = v.platform_video_id
            ORDER BY snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
            LIMIT 1
          ) sales ON TRUE
          ${filterSql}
          AND v.published_at IS NOT NULL
          GROUP BY v.published_at::date
          ORDER BY date ASC
        `, { type: QueryTypes.SELECT, replacements })
        : metric === 'gmv'
          ? sequelize.query(`
            SELECT
              v.id,
              v.title,
              v.views,
              v.likes,
              v.comments,
              v.shares,
              COALESCE(sales.gross_gmv, 0)::numeric AS gross_gmv
            FROM videos v
            LEFT JOIN LATERAL (
              SELECT
                snapshot.gross_gmv
              FROM shop_videos shop_video
              JOIN shop_video_performance_snapshots snapshot
                ON snapshot.shop_video_id = shop_video.id
              WHERE shop_video.platform_video_id = v.platform_video_id
              ORDER BY snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
              LIMIT 1
            ) sales ON TRUE
            ${filterSql}
            ORDER BY gross_gmv DESC, v.id DESC
            LIMIT 10
          `, { type: QueryTypes.SELECT, replacements })
          : sequelize.query(`
            SELECT
              v.id,
              v.title,
              v.views,
              v.likes,
              v.comments,
              v.shares,
              COALESCE(sales.gross_gmv, 0)::numeric AS gross_gmv
            FROM videos v
            LEFT JOIN LATERAL (
              SELECT
                snapshot.gross_gmv
              FROM shop_videos shop_video
              JOIN shop_video_performance_snapshots snapshot
                ON snapshot.shop_video_id = shop_video.id
              WHERE shop_video.platform_video_id = v.platform_video_id
              ORDER BY snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
              LIMIT 1
            ) sales ON TRUE
            ${filterSql}
            ORDER BY v.${metric} DESC, v.id DESC
            LIMIT 10
          `, { type: QueryTypes.SELECT, replacements }),
      metric === 'date'
        ? sequelize.query(`
          SELECT DISTINCT ON (v.published_at::date)
            v.published_at::date AS date,
            v.id,
            v.title,
            v.views,
            v.thumbnail_url,
            COALESCE(sales.gross_gmv, 0)::numeric AS gross_gmv
          FROM videos v
          LEFT JOIN LATERAL (
            SELECT
              snapshot.gross_gmv
            FROM shop_videos shop_video
            JOIN shop_video_performance_snapshots snapshot
              ON snapshot.shop_video_id = shop_video.id
            WHERE shop_video.platform_video_id = v.platform_video_id
            ORDER BY snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
            LIMIT 1
          ) sales ON TRUE
          ${filterSql}
          AND v.published_at IS NOT NULL
          ORDER BY v.published_at::date, v.views DESC, v.id DESC
        `, { type: QueryTypes.SELECT, replacements })
        : Promise.resolve([]),
      sequelize.query(`
        SELECT
          v.id,
          v.platform,
          v.platform_video_id,
          v.channel_id,
          v.title,
          v.video_url,
          v.thumbnail_url,
          v.published_at,
          v.views,
          v.likes,
          v.comments,
          v.shares,
          v.duration,
          v.campaign,
          v.content_type,
          sales.gross_gmv,
          sales.currency AS sales_currency,
          sales.synced_at AS sales_synced_at
        FROM videos v
        LEFT JOIN LATERAL (
          SELECT
            snapshot.gross_gmv,
            snapshot.currency,
            snapshot.synced_at
          FROM shop_videos shop_video
          JOIN shop_video_performance_snapshots snapshot
            ON snapshot.shop_video_id = shop_video.id
          WHERE shop_video.platform_video_id = v.platform_video_id
          ORDER BY snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
          LIMIT 1
        ) sales ON TRUE
        ${filterSql}
        ORDER BY v.published_at DESC NULLS LAST, v.id DESC
        LIMIT :pageSize
        OFFSET :offset
      `, {
        type: QueryTypes.SELECT,
        replacements: {
          ...replacements,
          pageSize,
          offset: (page - 1) * pageSize,
        },
      }),
    ]);

    const numericFields = ['video_count', 'views', 'likes', 'comments', 'shares', 'gross_gmv', 'engagement_rate'];
    const withNumbers = (row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, numericFields.includes(key) ? number(value) : value]),
    );

    const totals = withNumbers(totalsRows[0] || {});
    totals.sales_currency = totalsRows[0]?.sales_currency || 'MYR';
    const engagementRate = totals.views > 0
      ? ((totals.likes + totals.comments + totals.shares) / totals.views) * 100
      : 0;
    totals.engagement_rate = Number(engagementRate.toFixed(2));

    if (prevPeriodInfo && previousTotalsRows.length) {
      const prevTotals = withNumbers(previousTotalsRows[0] || {});
      const prevEngagementRate = prevTotals.views > 0
        ? ((prevTotals.likes + prevTotals.comments + prevTotals.shares) / prevTotals.views) * 100
        : 0;

      totals.previous_period = {
        ...prevTotals,
        engagement_rate: Number(prevEngagementRate.toFixed(2)),
        start_date: prevPeriodInfo.prevStartDate,
        end_date: prevPeriodInfo.prevEndDate,
      };
      totals.growth = {
        views: calculateGrowthRate(totals.views, prevTotals.views),
        video_count: calculateGrowthRate(totals.video_count, prevTotals.video_count),
        likes: calculateGrowthRate(totals.likes, prevTotals.likes),
        comments: calculateGrowthRate(totals.comments, prevTotals.comments),
        shares: calculateGrowthRate(totals.shares, prevTotals.shares),
        gross_gmv: calculateGrowthRate(totals.gross_gmv, prevTotals.gross_gmv),
        engagement_rate: calculateGrowthRate(totals.engagement_rate, prevEngagementRate),
      };
    } else {
      totals.previous_period = null;
      totals.growth = null;
    }

    const topVideoMap = new Map((topVideoRows || []).map((row) => [
      String(row.date),
      {
        id: row.id,
        title: row.title,
        views: number(row.views),
        thumbnail_url: row.thumbnail_url,
        gross_gmv: number(row.gross_gmv),
      },
    ]));

    const chart = metric === 'date'
      ? fillDailyDateSeries(startDate, endDate, chartRows.map(withNumbers), topVideoMap)
      : chartRows.map(withNumbers);

    return {
      channels: channels.map(withNumbers),
      users,
      totals,
      chart,
      videos: videos.map(withNumbers),
      video_pagination: {
        page,
        page_size: pageSize,
        total: totals.video_count,
        total_pages: Math.max(1, Math.ceil(totals.video_count / pageSize)),
      },
      filters: {
        channel_id: channelId,
        start_date: startDate,
        end_date: endDate,
        user_id: userId,
        metric,
      },
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

const getDashboardVideos = async (req, res) => {
  try {
    const filters = dashboardFilters(req.query);
    const {
      channelId,
      startDate,
      endDate,
      userId,
      page,
      pageSize,
    } = filters;
    const publishedDate = dateOnly(req.query.date);

    const cacheKey = `dashboard:videos:${channelId || 'all'}:${startDate || 'all'}:${endDate || 'all'}:${publishedDate || 'all'}:${userId || 'all'}:${page}:${pageSize}`;

    const { data: payload, hit } = await getOrSetCache(cacheKey, DASHBOARD_CACHE_TTL_SECONDS, async () => {
      const filterSql = `
        WHERE (:channelId::int IS NULL OR v.channel_id = :channelId)
          AND (:startDate::date IS NULL OR v.published_at::date >= :startDate)
          AND (:endDate::date IS NULL OR v.published_at::date <= :endDate)
          AND (:publishedDate::date IS NULL OR v.published_at::date = :publishedDate)
          AND (
            :userId::int IS NULL
            OR EXISTS (
              SELECT 1
              FROM user_content_attributions attribution
              CROSS JOIN LATERAL jsonb_array_elements_text(
                CASE
                  WHEN jsonb_typeof(attribution.hashtags) = 'array' THEN attribution.hashtags
                  ELSE '[]'::jsonb
                END
              ) configured_hashtag(value)
              WHERE attribution.user_id = :userId
                AND LOWER(configured_hashtag.value) = ANY(
                  regexp_split_to_array(LOWER(COALESCE(v.title, '')), '[^[:alnum:]_#]+')
                )
            )
          )
      `;
      const replacements = { channelId, startDate, endDate, publishedDate, userId };

      const [countRows, videos] = await Promise.all([
        sequelize.query(`
          SELECT COUNT(*)::int AS total
          FROM videos v
          ${filterSql}
        `, { type: QueryTypes.SELECT, replacements }),
        sequelize.query(`
          SELECT
            v.id,
            v.platform,
            v.platform_video_id,
            v.channel_id,
            v.title,
            v.video_url,
            v.thumbnail_url,
            v.published_at,
            v.views,
            v.likes,
            v.comments,
            v.shares,
            v.duration,
            v.campaign,
            v.content_type,
            sales.gross_gmv,
            sales.currency AS sales_currency,
            sales.synced_at AS sales_synced_at
          FROM videos v
          LEFT JOIN LATERAL (
            SELECT
              snapshot.gross_gmv,
              snapshot.currency,
              snapshot.synced_at
            FROM shop_videos shop_video
            JOIN shop_video_performance_snapshots snapshot
              ON snapshot.shop_video_id = shop_video.id
            WHERE shop_video.platform_video_id = v.platform_video_id
            ORDER BY snapshot.synced_at DESC NULLS LAST, snapshot.id DESC
            LIMIT 1
          ) sales ON TRUE
          ${filterSql}
          ORDER BY v.published_at DESC NULLS LAST, v.id DESC
          LIMIT :pageSize
          OFFSET :offset
        `, {
          type: QueryTypes.SELECT,
          replacements: {
            ...replacements,
            pageSize,
            offset: (page - 1) * pageSize,
          },
        }),
      ]);

      const numericFields = ['video_count', 'views', 'likes', 'comments', 'shares', 'gross_gmv'];
      const withNumbers = (row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, numericFields.includes(key) ? number(value) : value]),
      );

      const total = Number(countRows[0]?.total || 0);
      return {
        videos: videos.map(withNumbers),
        video_pagination: {
          page,
          page_size: pageSize,
          total,
          total_pages: Math.max(1, Math.ceil(total / pageSize)),
        },
        filter_date: publishedDate,
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

module.exports = {
  dashboardFilters,
  getDashboard,
  getDashboardVideos,
  clearDashboardCache,
};
