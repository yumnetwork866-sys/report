export const REQUIRED_SCOPE = 'data.shop_analytics.public.read';

export const VIDEO_EXPORT_PAGE_SIZE = 25;

export const productsForVideo = (video, metadata = {}) => {
  const sourceProducts = Array.isArray(video?.raw_metrics?.list?.products)
    ? video.raw_metrics.list.products
    : [];
  const sourceById = new Map(sourceProducts
    .filter((product) => product?.id)
    .map((product) => [String(product.id), product]));
  const ids = [...new Set([
    ...sourceProducts.map((product) => product?.id),
    ...String(video?.product_id || '').split(','),
  ].map((id) => String(id || '').trim()).filter(Boolean))];
  return ids.map((id) => {
    const source = sourceById.get(id) || {};
    const mapped = metadata[id] || {};
    return {
      id,
      name: source.name || source.title || mapped.name || mapped.title || null,
      thumbnailUrl: source.main_image_url
        || source.thumbnail_url
        || mapped.main_image_url
        || mapped.thumbnail_url
        || null,
    };
  });
};

export const creatorForVideo = (video) => {
  const source = video?.raw_metrics?.list || {};
  const creator = video?.creator || source.creator || {};
  const username = String(
    video?.creator_username || creator.user_name || source.username || video?.username || '',
  ).trim().replace(/^@+/, '');
  const name = String(
    video?.creator_name || creator.nick_name || creator.nickname || '',
  ).trim();
  const avatarUrl = video?.creator_avatar_url
    || creator.avatar_url
    || creator.avatar
    || source.creator_avatar_url
    || '';
  const normalizedUsername = username.toLocaleLowerCase();
  const normalizedName = name.toLocaleLowerCase();
  const key = normalizedUsername
    ? `username:${normalizedUsername}`
    : normalizedName ? `name:${normalizedName}` : '';
  const label = name && normalizedName !== normalizedUsername
    ? `${name}${username ? ` (@${username})` : ''}`
    : username ? `@${username}` : name;
  return { key, label, name, username, avatarUrl };
};

export const dateOnly = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export const shiftDate = (value, days) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return dateOnly(date);
};

export const rangeForDays = (days) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { startDate: dateOnly(start), endDate: dateOnly(end) };
};

export const numericValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const moneyValue = (value) => numericValue(value?.amount ?? value);
const padDatePart = (value) => String(value).padStart(2, '0');

export const formatDisplayDateTime = (value, fallback) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())} ${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}/${date.getFullYear()}`;
};

export const formatVideoPostDate = (value, fallback = '—') => {
  const match = String(value || '').trim().match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (match) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}/${date.getFullYear()} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`;
};

export const scopesOf = (authorization) => {
  if (Array.isArray(authorization?.granted_scopes)) return authorization.granted_scopes;
  return String(authorization?.granted_scopes || '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
};

const sumBy = (rows, key, value = numericValue) => rows.reduce(
  (total, row) => total + value(row?.[key]),
  0,
);

export const totalsFor = (rows) => {
  const gmv = sumBy(rows, 'gmv', moneyValue);
  const orders = sumBy(rows, 'orders');
  const cancellationRows = rows.filter((row) => row?.cancellations_and_returns !== null
    && row?.cancellations_and_returns !== undefined);
  return {
    gmv,
    orders,
    unitsSold: sumBy(rows, 'units_sold'),
    buyers: sumBy(rows, 'buyers'),
    impressions: sumBy(rows, 'product_impressions'),
    pageViews: sumBy(rows, 'product_page_views'),
    refunds: sumBy(rows, 'refunds', moneyValue),
    cancellations: cancellationRows.length ? sumBy(cancellationRows, 'cancellations_and_returns') : null,
    avgOrderValue: orders ? gmv / orders : 0,
  };
};

const ANALYTICS_NUMBER_FIELDS = [
  'orders',
  'units_sold',
  'buyers',
  'product_impressions',
  'product_page_views',
];

const mergeAnalyticsIntervals = (intervalGroups = [], currency = 'USD') => {
  const byDate = new Map();
  for (const interval of intervalGroups.flat()) {
    const key = `${interval?.start_date || ''}:${interval?.end_date || ''}`;
    if (!interval?.start_date) continue;
    const current = byDate.get(key) || {
      start_date: interval.start_date,
      end_date: interval.end_date,
      gmv: { amount: 0, currency },
      refunds: { amount: 0, currency },
      cancellations_and_returns: null,
      gmv_breakdowns: [],
    };
    current.gmv.amount += moneyValue(interval.gmv);
    current.refunds.amount += moneyValue(interval.refunds);
    ANALYTICS_NUMBER_FIELDS.forEach((field) => {
      current[field] = numericValue(current[field]) + numericValue(interval?.[field]);
    });
    if (interval?.cancellations_and_returns !== null && interval?.cancellations_and_returns !== undefined) {
      current.cancellations_and_returns = numericValue(current.cancellations_and_returns)
        + numericValue(interval.cancellations_and_returns);
    }
    const breakdowns = new Map(current.gmv_breakdowns.map((item) => [item.type, item]));
    for (const item of Array.isArray(interval?.gmv_breakdowns) ? interval.gmv_breakdowns : []) {
      const type = item?.type || 'UNKNOWN';
      const existing = breakdowns.get(type) || { type, amount: 0, currency };
      existing.amount = numericValue(existing.amount) + moneyValue(item?.amount ?? item?.gmv);
      breakdowns.set(type, existing);
    }
    current.gmv_breakdowns = [...breakdowns.values()];
    byDate.set(key, current);
  }
  return [...byDate.values()].sort((left, right) => (
    String(left.start_date).localeCompare(String(right.start_date))
  ));
};

export const combineShopAnalyticsSnapshots = (snapshots = [], currency = 'USD') => {
  const valid = snapshots.filter((snapshot) => snapshot?.metrics);
  if (!valid.length) return null;
  const latestAvailableDate = valid
    .map((snapshot) => snapshot.latest_available_date)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const syncedAt = valid
    .map((snapshot) => snapshot.synced_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  return {
    id: 'all-shops',
    currency,
    latest_available_date: latestAvailableDate,
    synced_at: syncedAt,
    shop_count: valid.length,
    metrics: {
      intervals: mergeAnalyticsIntervals(valid.map((snapshot) => snapshot.metrics.intervals || []), currency),
      comparison_intervals: mergeAnalyticsIntervals(
        valid.map((snapshot) => snapshot.metrics.comparison_intervals || []),
        currency,
      ),
    },
  };
};

export const percentage = (value, total) => (total > 0 ? value / total * 100 : 0);
export const boundedPercentage = (value) => Math.min(100, Math.max(0, value));
export const percentageChange = (current, previous, hasComparison = true) => (
  !hasComparison || previous === 0 ? null : (current - previous) / Math.abs(previous) * 100
);
