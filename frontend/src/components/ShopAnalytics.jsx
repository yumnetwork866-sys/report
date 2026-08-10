import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  disconnectTikTokShop,
  fetchTikTokShopAnalytics,
  fetchTikTokShopConnections,
  fetchTikTokShopVideoAnalytics,
  fetchTikTokShopVideoPerformance,
  fetchTikTokShopVideoThumbnail,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokShops,
  startTikTokShopOauth,
  syncTikTokShopAnalytics,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { formatDateOnly, parseDateOnly } from '../lib/date';
import { useMoneyFormatter } from '../lib/currency';
import ShopDropdown from './ShopDropdown';
import Pagination from './Pagination';
import AppAvatar from './AppAvatar';
import DatePickerInput from './DatePickerInput';

const REQUIRED_SCOPE = 'data.shop_analytics.public.read';
const SOURCE_COLORS = [
  'var(--color-social-cyan-strong)',
  'var(--color-social-magenta)',
  'var(--color-primary)',
  'var(--color-warning)',
  'var(--color-success)',
];
const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.24)',
  color: '#0f172a',
};
const CHART_TICK = { fill: '#64748b', fontSize: 12 };
const VIDEO_EXPORT_PAGE_SIZE = 25;

const ICON_PATHS = {
  shop: ['M4 9h16', 'M5 9l1-5h12l1 5', 'M6 9v11h12V9', 'M9 20v-6h6v6'],
  gmv: ['M12 3v18', 'M17 7.5C17 5.6 15.2 4 12.5 4S8 5.4 8 7.5s1.8 3 4.5 3 4.5 1.4 4.5 3S15.2 17 12.5 17 8 15.4 8 13.5'],
  orders: ['M5 7h14l-1 13H6L5 7Z', 'M9 9V6a3 3 0 0 1 6 0v3'],
  unitsSold: ['M4 8l8-4 8 4-8 4-8-4Z', 'M4 8v8l8 4 8-4V8', 'M12 12v8'],
  buyers: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M5 21a7 7 0 0 1 14 0'],
  avgOrderValue: ['M4 6h16v12H4z', 'M8 12h8', 'M12 9v6'],
  refunds: ['M8 7H4v-4', 'M4 7a8 8 0 1 1-1 7', 'M4 7l4-4'],
  sync: ['M20 7h-5V2', 'M4 17h5v5', 'M19 12a7 7 0 0 0-12-5l-2 2', 'M5 12a7 7 0 0 0 12 5l2-2'],
  connect: ['M12 5v14', 'M5 12h14'],
  analytics: ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M3 19h18'],
  connections: ['M8 12h8', 'M9 8H7a4 4 0 0 0 0 8h2', 'M15 8h2a4 4 0 0 1 0 8h-2'],
  likes: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6a5.5 5.5 0 0 0 1-8.8Z'],
  comments: ['M21 12a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 21l1.4-3.5A8 8 0 1 1 21 12Z'],
  shares: [
    'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'M8.6 10.5l6.8-4',
    'M8.6 13.5l6.8 4',
  ],
  views: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
};

const AnalyticsIcon = ({ name, className = '' }) => (
  <svg
    className={`shop-analytics__icon ${className}`.trim()}
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    {(ICON_PATHS[name] || ICON_PATHS.analytics).map((path) => (
      <path key={path} d={path} />
    ))}
  </svg>
);

const VideoThumbnail = ({ shopId, video, href }) => {
  const containerRef = useRef(null);
  const videoId = video?.video_id || video?.id;
  const sourceVideo = video?.raw_metrics?.list || {};
  const directThumbnail = video?.thumbnail_url
    || sourceVideo.thumbnail_url
    || sourceVideo.cover_image_url
    || sourceVideo.cover_url
    || null;
  const [thumbnail, setThumbnail] = useState(directThumbnail);
  const [failed, setFailed] = useState(false);
  const username = video?.creator?.user_name
    || video?.username
    || sourceVideo?.creator?.user_name
    || sourceVideo?.username;
  const title = video?.video_title || video?.title || '';

  useEffect(() => {
    setThumbnail(directThumbnail);
    setFailed(false);
    if (directThumbnail || !shopId || !videoId || !username) return undefined;
    const controller = new AbortController();
    fetchTikTokShopVideoThumbnail(shopId, videoId, username, controller.signal)
      .then((payload) => setThumbnail(payload?.thumbnail_url || null))
      .catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [directThumbnail, shopId, username, videoId]);

  const content = thumbnail && !failed
    ? <img src={thumbnail} alt={title} loading="lazy" onError={() => setFailed(true)} />
    : <span className="shop-video-analytics__thumbnail-placeholder" aria-hidden="true">▶</span>;
  return <span className="shop-video-analytics__thumbnail" ref={containerRef}>{href ? <a href={href} target="_blank" rel="noreferrer">{content}</a> : content}</span>;
};

const CreatorAvatar = ({ src, name }) => <AppAvatar src={src} name={name || 'Creator'} />;

const CreatorDropdownAvatar = ({ creator, fallbackLabel }) => {
  const [failed, setFailed] = useState(false);
  const src = creator?.avatarUrl;
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={`shop-dropdown__avatar${src && !failed ? '' : ' shop-dropdown__avatar--fallback'}`} aria-hidden="true">
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : String(creator?.name || creator?.username || fallbackLabel || 'C').trim().charAt(0).toUpperCase()}
    </span>
  );
};

const CreatorDropdown = ({
  id, options, value, onChange, disabled, allLabel, searchPlaceholder, noResultsLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const selectedCreator = options.find((creator) => creator.value === value) || null;
  const normalizedQuery = query.trim().replace(/^@+/, '').toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((creator) => [creator.name, creator.username]
      .filter(Boolean)
      .some((text) => String(text).toLocaleLowerCase().includes(normalizedQuery)))
    : options;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const focusOption = (direction) => {
    window.requestAnimationFrame(() => {
      const menuOptions = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
      if (!menuOptions.length) return;
      const focusedIndex = menuOptions.indexOf(document.activeElement);
      const selectedIndex = menuOptions.findIndex((option) => option.getAttribute('aria-selected') === 'true');
      const targetIndex = focusedIndex >= 0
        ? (focusedIndex + direction + menuOptions.length) % menuOptions.length
        : selectedIndex >= 0 ? selectedIndex : direction < 0 ? menuOptions.length - 1 : 0;
      menuOptions[targetIndex]?.focus();
    });
  };

  const handleKeyDown = (event) => {
    const fromSearch = event.target === searchRef.current;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
      || (fromSearch && ['Home', 'End'].includes(event.key))) return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      focusOption(0);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      window.requestAnimationFrame(() => {
        const menuOptions = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
        menuOptions[event.key === 'Home' ? 0 : menuOptions.length - 1]?.focus();
      });
      return;
    }
    focusOption(event.key === 'ArrowDown' ? 1 : -1);
  };

  const choose = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  const renderCopy = (creator) => (
    <span className="shop-dropdown__copy">
      <strong>{creator?.name || (creator?.username ? `@${creator.username}` : allLabel)}</strong>
      {creator?.name && creator?.username ? <small>@{creator.username}</small> : null}
    </span>
  );

  return (
    <div className="shop-dropdown creator-filter-dropdown" ref={rootRef}>
      <button
        id={id}
        className="shop-dropdown__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setQuery('');
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="shop-dropdown__current">
          <CreatorDropdownAvatar creator={selectedCreator} fallbackLabel={allLabel} />
          {renderCopy(selectedCreator)}
        </span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="shop-dropdown__menu creator-filter-dropdown__menu" ref={menuRef} onKeyDown={handleKeyDown}>
          <div className="creator-filter-dropdown__search">
            <input
              ref={searchRef}
              type="search"
              value={query}
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div role="listbox">
            {!normalizedQuery ? (
              <button
                className={`shop-dropdown__option${value ? '' : ' shop-dropdown__option--active'}`}
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => choose('')}
              >
                <CreatorDropdownAvatar fallbackLabel={allLabel} />
                {renderCopy(null)}
              </button>
            ) : null}
            {filteredOptions.map((creator) => (
              <button
                className={`shop-dropdown__option${creator.value === value ? ' shop-dropdown__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={creator.value === value}
                key={creator.value}
                onClick={() => choose(creator.value)}
              >
                <CreatorDropdownAvatar creator={creator} />
                {renderCopy(creator)}
              </button>
            ))}
            {normalizedQuery && !filteredOptions.length ? (
              <div className="creator-filter-dropdown__empty">{noResultsLabel}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const ProductThumbnail = ({ src }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <span className="video-export-product__thumbnail video-export-product__thumbnail--fallback" aria-hidden="true">P</span>;
  }
  return <img className="video-export-product__thumbnail" src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
};

const VideoProduct = ({ product }) => {
  const tooltipId = useId();
  const itemRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const showTooltip = () => {
    if (!product.name) return;
    const rect = itemRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 24);
    const showAbove = rect.bottom + 110 > window.innerHeight;
    setTooltip({
      left: Math.min(window.innerWidth - width - 12, Math.max(12, rect.left)),
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      width,
      showAbove,
    });
  };
  const hideTooltip = () => setTooltip(null);
  return (
    <div
      className="video-export-product"
      ref={itemRef}
      tabIndex={product.name ? 0 : undefined}
      aria-label={product.name || product.id}
      aria-describedby={tooltip ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      <span className="video-export-product__summary">
        <ProductThumbnail src={product.thumbnailUrl} />
      </span>
      {tooltip ? createPortal(
        <span
          className={`video-export-product__tooltip${tooltip.showAbove ? ' video-export-product__tooltip--above' : ''}`}
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
        >
          {product.name}
        </span>,
        document.body,
      ) : null}
    </div>
  );
};

const productsForVideo = (video, metadata = {}) => {
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

const creatorForVideo = (video) => {
  const source = video?.raw_metrics?.list || {};
  const creator = video?.creator || source.creator || {};
  const username = String(
    video?.creator_username
      || creator.user_name
      || source.username
      || video?.username
      || '',
  ).trim().replace(/^@+/, '');
  const name = String(
    video?.creator_name
      || creator.nick_name
      || creator.nickname
      || '',
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

const dateOnly = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const shiftDate = (value, days) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return dateOnly(date);
};

const rangeForDays = (days) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { startDate: dateOnly(start), endDate: dateOnly(end) };
};

const numericValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const moneyValue = (value) => numericValue(value?.amount ?? value);
const padDatePart = (value) => String(value).padStart(2, '0');

const formatDisplayDateTime = (value, fallback) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())} ${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const formatVideoPostDate = (value, fallback = '—') => {
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

const scopesOf = (authorization) => {
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

const totalsFor = (rows) => {
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

const percentage = (value, total) => (total > 0 ? value / total * 100 : 0);
const boundedPercentage = (value) => Math.min(100, Math.max(0, value));

const ShopAnalytics = ({ managementOnly = false, videoOnly = false, videoExportOnly = false }) => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const { formatMoney: formatPreferredMoney } = useMoneyFormatter(locale);
  const initialRange = useMemo(() => rangeForDays(7), []);
  const [shops, setShops] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [periodPreset, setPeriodPreset] = useState('7d');
  const currency = 'LOCAL';
  const [chartMetric, setChartMetric] = useState('gmv');
  const [snapshot, setSnapshot] = useState(null);
  const [videoAnalytics, setVideoAnalytics] = useState(null);
  const [videoAnalyticsLoading, setVideoAnalyticsLoading] = useState(false);
  const [videoReloadKey, setVideoReloadKey] = useState(0);
  const [videoPage, setVideoPage] = useState(1);
  const [videoSearch, setVideoSearch] = useState('');
  const [videoCreator, setVideoCreator] = useState('');
  const [videoProductMetadata, setVideoProductMetadata] = useState({});
  const videoProductRequestsRef = useRef(new Set());
  const [videoAccountType, setVideoAccountType] = useState('LINKED_ACCOUNTS');
  const [videoSortField, setVideoSortField] = useState('gmv');
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const formatNumber = (value) => numericValue(value).toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
  const formatOptionalNumber = (value) => value === null || value === undefined ? '—' : formatNumber(value);
  const formatPercent = (value) => `${numericValue(value).toLocaleString(locale, {
    maximumFractionDigits: 1,
  })}%`;
  const formatDate = (value) => formatDateOnly(value, t('common.noData'));
  const formatDateTime = (value) => formatDisplayDateTime(value, t('common.noData'));

  const loadInventory = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const [loadedShops, loadedConnections] = await Promise.all([
        fetchTikTokShops(signal),
        fetchTikTokShopConnections(signal),
      ]);
      setShops(Array.isArray(loadedShops) ? loadedShops : []);
      setConnections(Array.isArray(loadedConnections) ? loadedConnections : []);
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message || t('shopAnalytics.loadError'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    loadInventory(controller.signal);
    return () => controller.abort();
  }, [loadInventory]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('shop_oauth_status');
    if (!status) return;
    setToast({
      type: status === 'success' ? 'success' : status === 'warning' ? 'info' : 'error',
      message: params.get('shop_oauth_message') || t(
        status === 'success'
          ? 'shopAnalytics.oauthSuccess'
          : status === 'warning'
            ? 'shopAnalytics.oauthWarning'
            : 'shopAnalytics.oauthError',
      ),
    });
    params.delete('shop_oauth_status');
    params.delete('shop_oauth_message');
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, [t]);

  useEffect(() => {
    setSelectedShopId((current) => {
      if (shops.some((shop) => String(shop.id) === String(current))) return current;
      return shops[0]?.id ? String(shops[0].id) : '';
    });
  }, [shops]);

  const invalidRange = !startDate || !endDate || startDate >= endDate;

  useEffect(() => {
    if (managementOnly || videoOnly) {
      setSnapshot(null);
      setAnalyticsLoading(false);
      return undefined;
    }
    if (!selectedShopId || invalidRange) {
      setSnapshot(null);
      setAnalyticsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setAnalyticsLoading(true);
    setError('');
    const loadRange = async () => {
      try {
        const payload = await fetchTikTokShopAnalytics(selectedShopId, {
          signal: controller.signal,
          startDate,
          endDate,
          currency,
        });
        let nextSnapshot = payload?.snapshots?.[0] || null;
        if (!nextSnapshot || !Array.isArray(nextSnapshot?.metrics?.comparison_intervals)) {
          setSyncing(true);
          const syncPayload = await syncTikTokShopAnalytics(selectedShopId, {
            start_date: startDate,
            end_date: endDate,
            currency,
          }, controller.signal);
          nextSnapshot = syncPayload?.snapshot || null;
        }
        if (!controller.signal.aborted) setSnapshot(nextSnapshot);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setSnapshot(null);
          setError(requestError.message || t('shopAnalytics.loadError'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setAnalyticsLoading(false);
          setSyncing(false);
        }
      }
    };
    loadRange();
    return () => controller.abort();
  }, [currency, endDate, invalidRange, managementOnly, selectedShopId, startDate, t, videoOnly]);

  const selectedShop = useMemo(
    () => shops.find((shop) => String(shop.id) === String(selectedShopId)) || null,
    [selectedShopId, shops],
  );
  const selectedAuthorization = useMemo(() => connections.find(
    (authorization) => String(authorization.id) === String(selectedShop?.authorization?.id),
  ) || selectedShop?.authorization || null, [connections, selectedShop]);
  const selectedScopes = useMemo(() => scopesOf(selectedAuthorization), [selectedAuthorization]);
  const missingAnalyticsScope = Boolean(selectedShop) && !selectedScopes.includes(REQUIRED_SCOPE);
  const tokenExpired = Boolean(
    selectedAuthorization?.refresh_token_expires_at
      && new Date(selectedAuthorization.refresh_token_expires_at).getTime() <= Date.now(),
  );

  useEffect(() => {
    if (managementOnly || !videoOnly || !selectedShopId
      || invalidRange || missingAnalyticsScope || tokenExpired) {
      if (!selectedShopId) setVideoAnalytics(null);
      setVideoAnalyticsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    if (!videoExportOnly) {
      setVideoAnalyticsLoading(true);
      setError('');
      fetchTikTokShopVideoAnalytics(selectedShopId, {
        signal: controller.signal,
        startDate,
        endDate,
        currency,
        accountType: videoAccountType,
        sortField: videoSortField,
        sortOrder: 'DESC',
        pageSize: 100,
      }).then((payload) => {
        if (!controller.signal.aborted) setVideoAnalytics(payload);
      }).catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setVideoAnalytics(null);
          setError(requestError.message || t('shopAnalytics.videoLoadError'));
        }
      }).finally(() => {
        if (!controller.signal.aborted) setVideoAnalyticsLoading(false);
      });
      return () => controller.abort();
    }
    setVideoAnalyticsLoading(true);
    setError('');
    const mapApiPayload = (payload) => ({
      ...payload,
      videos: (payload.videos || []).map((row) => ({
        ...row,
        id: row.video_id,
        title: row.video_title,
        creator: {
          ...(row.raw_metrics?.list?.creator || {}),
          ...(row.creator_username ? { user_name: row.creator_username } : {}),
          ...(row.creator_avatar_url ? { avatar_url: row.creator_avatar_url } : {}),
        },
        username: row.creator_username || row.raw_metrics?.list?.username || row.creator_name,
        video_post_time: row.post_date,
        video_url: row.video_link,
        gmv: {
          amount: row.creator_attributed_gmv,
          currency: row.raw_metrics?.list?.gmv?.currency
            || row.raw_metrics?.detail?.performance?.intervals?.[0]?.sales?.overall?.gmv?.currency,
        },
        views: row.video_views,
        sku_orders: row.attributed_orders,
        items_sold: row.attributed_items_sold,
        click_through_rate: row.ctr,
      })),
    });
    const loadApiReport = async () => {
      let exportId;
      let payload;
      for (let poll = 0; poll < 300; poll += 1) {
        payload = await fetchTikTokShopVideoPerformance(selectedShopId, {
          signal: controller.signal,
          startDate,
          endDate,
          currency,
          exportId,
          pageSize: 100,
        });
        if (controller.signal.aborted) return;
        if (!payload.export) {
          setVideoAnalytics({ videos: [], total_count: 0, export: null });
          setVideoPage(1);
          setVideoAnalyticsLoading(false);
          return;
        }
        exportId = payload.export.id;
        if (payload.export.status === 'FAILED') {
          throw new Error(payload.export.error || t('shopAnalytics.videoLoadError'));
        }
        if (payload.export.status === 'SUCCEEDED') break;
        setVideoAnalytics({ ...payload, videos: [] });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (controller.signal.aborted) return;
      if (payload?.export?.status !== 'SUCCEEDED') {
        throw new Error(t('shopAnalytics.videoSyncTimeout'));
      }
      const totalPages = Math.ceil(Number(payload.total_count || 0) / 100);
      const remainingPages = totalPages > 1
        ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => (
          fetchTikTokShopVideoPerformance(selectedShopId, {
            signal: controller.signal,
            startDate,
            endDate,
            currency,
            exportId,
            page: index + 2,
            pageSize: 100,
          })
        )))
        : [];
      if (controller.signal.aborted) return;
      setVideoAnalytics(mapApiPayload({
        ...payload,
        videos: [
          ...(payload.videos || []),
          ...remainingPages.flatMap((pagePayload) => pagePayload.videos || []),
        ],
      }));
      setVideoPage(1);
      setVideoAnalyticsLoading(false);
    };
    loadApiReport().catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setVideoAnalytics(null);
          setVideoAnalyticsLoading(false);
          setError(requestError.message || t('shopAnalytics.videoLoadError'));
        }
      });
    return () => controller.abort();
  }, [
    currency, endDate, invalidRange, managementOnly, missingAnalyticsScope,
    selectedShopId, startDate, t, tokenExpired, videoReloadKey,
    videoAccountType, videoExportOnly, videoOnly, videoSortField,
  ]);
  const attentionCount = useMemo(() => connections.filter((authorization) => {
    const expired = Boolean(
      authorization.refresh_token_expires_at
        && new Date(authorization.refresh_token_expires_at).getTime() <= Date.now(),
    );
    return expired || !scopesOf(authorization).includes(REQUIRED_SCOPE);
  }).length, [connections]);

  const intervals = useMemo(() => (
    Array.isArray(snapshot?.metrics?.intervals) ? snapshot.metrics.intervals : []
  ), [snapshot]);
  const comparisonIntervals = useMemo(() => (
    Array.isArray(snapshot?.metrics?.comparison_intervals)
      ? snapshot.metrics.comparison_intervals
      : []
  ), [snapshot]);
  const totals = useMemo(() => totalsFor(intervals), [intervals]);
  const comparisonTotals = useMemo(() => totalsFor(comparisonIntervals), [comparisonIntervals]);
  const hasData = intervals.length > 0;
  const hasComparison = comparisonIntervals.length > 0;
  const displayCurrency = intervals.find((row) => row?.gmv?.currency)?.gmv?.currency
    || videoAnalytics?.videos?.find((video) => video?.gmv?.currency)?.gmv?.currency
    || (currency === 'USD' ? 'USD' : 'VND');

  const formatMoney = (value, currencyCode = displayCurrency) => formatPreferredMoney(value, currencyCode);

  const changeFrom = (current, previous) => {
    if (!hasComparison || previous === 0) return null;
    return (current - previous) / Math.abs(previous) * 100;
  };

  const chartData = useMemo(() => intervals.map((row) => ({
    date: row.start_date,
    gmv: moneyValue(row.gmv),
    orders: numericValue(row.orders),
    unitsSold: numericValue(row.units_sold),
    buyers: numericValue(row.buyers),
  })), [intervals]);
  const videoRows = useMemo(
    () => Array.isArray(videoAnalytics?.videos) ? videoAnalytics.videos : [],
    [videoAnalytics],
  );
  const videoCreatorOptions = useMemo(() => {
    const creators = new Map();
    videoRows.forEach((video) => {
      const creator = creatorForVideo(video);
      if (!creator.key) return;
      const current = creators.get(creator.key);
      if (!current || (!current.avatarUrl && creator.avatarUrl)) {
        creators.set(creator.key, { ...creator, value: creator.key });
      }
    });
    return [...creators.values()]
      .sort((left, right) => left.label.localeCompare(right.label, locale));
  }, [locale, videoRows]);
  useEffect(() => {
    if (videoCreator && !videoCreatorOptions.some((option) => option.value === videoCreator)) {
      setVideoCreator('');
      setVideoPage(1);
    }
  }, [videoCreator, videoCreatorOptions]);
  useEffect(() => {
    videoProductRequestsRef.current.clear();
    setVideoProductMetadata({});
  }, [selectedShopId]);
  useEffect(() => {
    if (!videoExportOnly || !videoRows.length) return;
    const sourceMetadata = {};
    for (const video of videoRows) {
      const products = Array.isArray(video?.raw_metrics?.list?.products)
        ? video.raw_metrics.list.products
        : [];
      for (const product of products) {
        const id = String(product?.id || '').trim();
        if (!id) continue;
        sourceMetadata[id] = {
          id,
          name: product.name || product.title || null,
          main_image_url: product.main_image_url || product.thumbnail_url || null,
        };
      }
    }
    if (Object.keys(sourceMetadata).length) {
      setVideoProductMetadata((current) => ({ ...sourceMetadata, ...current }));
    }
  }, [selectedShopId, videoExportOnly, videoRows]);
  const creatorFilteredVideoRows = useMemo(() => (
    videoExportOnly && videoCreator
      ? videoRows.filter((video) => creatorForVideo(video).key === videoCreator)
      : videoRows
  ), [videoCreator, videoExportOnly, videoRows]);
  const videoTotals = useMemo(() => creatorFilteredVideoRows.reduce((total, video) => ({
    gmv: total.gmv + moneyValue(video.gmv),
    views: total.views + numericValue(video.views ?? video.video_views),
    orders: total.orders + numericValue(video.sku_orders ?? video.orders),
    itemsSold: total.itemsSold + numericValue(video.items_sold ?? video.units_sold),
  }), { gmv: 0, views: 0, orders: 0, itemsSold: 0 }), [creatorFilteredVideoRows]);
  const filteredVideoRows = useMemo(() => {
    const terms = videoSearch.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
    if (!videoExportOnly || !terms.length) return creatorFilteredVideoRows;
    return creatorFilteredVideoRows.filter((video) => {
      const source = video.raw_metrics?.list || {};
      const creator = source.creator || video.creator || {};
      const haystack = [
        video.video_title,
        video.title,
        video.video_id,
        video.creator_name,
        video.creator_username,
        video.username,
        creator.nick_name,
        creator.nickname,
        creator.user_name,
        video.product_id,
        ...(Array.isArray(source.products)
          ? source.products.flatMap((product) => [product?.name, product?.title])
          : []),
      ].filter(Boolean).join(' ').toLocaleLowerCase(locale);
      return terms.every((term) => haystack.includes(term));
    });
  }, [creatorFilteredVideoRows, locale, videoExportOnly, videoSearch]);
  const videoPageCount = Math.max(1, Math.ceil(filteredVideoRows.length / VIDEO_EXPORT_PAGE_SIZE));
  const paginatedVideoRows = useMemo(() => (videoExportOnly
    ? filteredVideoRows.slice((videoPage - 1) * VIDEO_EXPORT_PAGE_SIZE, videoPage * VIDEO_EXPORT_PAGE_SIZE)
    : videoRows), [filteredVideoRows, videoExportOnly, videoPage, videoRows]);
  useEffect(() => {
    if (!videoExportOnly || !selectedShopId || !paginatedVideoRows.length) return undefined;
    const requestedProductIds = videoProductRequestsRef.current;
    const productIds = [...new Set(paginatedVideoRows.flatMap((video) => [
      ...(Array.isArray(video?.raw_metrics?.list?.products)
        ? video.raw_metrics.list.products.map((product) => product?.id)
        : []),
      ...String(video?.product_id || '').split(','),
    ]).map((id) => String(id || '').trim()).filter(Boolean))]
      .filter((id) => !requestedProductIds.has(id));
    if (!productIds.length) return undefined;
    productIds.forEach((id) => requestedProductIds.add(id));
    const controller = new AbortController();
    const completedIds = new Set();
    let cursor = 0;
    const worker = async () => {
      while (cursor < productIds.length && !controller.signal.aborted) {
        const id = productIds[cursor];
        cursor += 1;
        try {
          const payload = await fetchTikTokSellerOpenCollaborations(selectedShopId, {
            signal: controller.signal,
            pageSize: 20,
            keyword: id,
          });
          const row = (payload?.open_collaborations || []).find((item) => String(item?.product?.id) === id);
          if (row?.product) {
            setVideoProductMetadata((current) => ({
              ...current,
              [id]: {
                id,
                name: row.product.title || current[id]?.name || null,
                main_image_url: row.product.main_image_url || current[id]?.main_image_url || null,
              },
            }));
          }
          completedIds.add(id);
        } catch (error) {
          requestedProductIds.delete(id);
          if (error.name === 'AbortError') return;
        }
      }
    };
    Promise.all(Array.from({ length: Math.min(6, productIds.length) }, worker));
    return () => {
      controller.abort();
      productIds.forEach((id) => {
        if (!completedIds.has(id)) requestedProductIds.delete(id);
      });
    };
  }, [paginatedVideoRows, selectedShopId, videoExportOnly]);
  const formatVideoMoney = (value) => formatMoney(
    moneyValue(value),
    value?.currency || displayCurrency,
  );
  const formatRate = (value) => {
    const rate = numericValue(value);
    return formatPercent(rate <= 1 ? rate * 100 : rate);
  };
  const videoUrl = (video) => {
    if (video?.video_link) return video.video_link;
    const sourceVideo = video?.raw_metrics?.list || {};
    const username = video?.creator?.user_name
      || video?.username
      || sourceVideo?.creator?.user_name
      || sourceVideo?.username;
    const videoId = video?.video_id || video?.id;
    return username && videoId
      ? `https://www.tiktok.com/@${String(username).replace(/^@/, '')}/video/${videoId}`
      : null;
  };

  const breakdowns = useMemo(() => {
    const values = new Map();
    intervals.forEach((row) => (Array.isArray(row.gmv_breakdowns) ? row.gmv_breakdowns : [])
      .forEach((item) => {
        const type = item.type || t('common.unknown');
        values.set(type, (values.get(type) || 0) + moneyValue(item));
      }));
    return [...values.entries()]
      .map(([type, amount]) => ({ type, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [intervals, t]);
  const breakdownTotal = useMemo(
    () => breakdowns.reduce((total, item) => total + item.amount, 0),
    [breakdowns],
  );

  const sourceLabel = (type) => {
    const translationKeys = {
      LIVE: 'shopAnalytics.sourceLive',
      VIDEO: 'shopAnalytics.sourceVideo',
      PRODUCT_CARD: 'shopAnalytics.sourceProductCard',
    };
    return translationKeys[type] ? t(translationKeys[type]) : type;
  };

  const syncAnalytics = async () => {
    if (!selectedShopId || invalidRange || missingAnalyticsScope || tokenExpired || syncing) return;
    try {
      setSyncing(true);
      setError('');
      const payload = await syncTikTokShopAnalytics(selectedShopId, {
        start_date: startDate,
        end_date: endDate,
        currency,
      });
      setSnapshot(payload?.snapshot || null);
      if (payload?.shop) {
        setShops((current) => current.map((shop) => (
          String(shop.id) === String(payload.shop.id)
            ? { ...shop, ...payload.shop, authorization: shop.authorization }
            : shop
        )));
      }
      setToast({ type: 'success', message: t('shopAnalytics.syncSuccess') });
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.message || t('shopAnalytics.syncError') });
    } finally {
      setSyncing(false);
    }
  };

  const startConnect = async () => {
    if (disconnectingId !== null) return;
    try {
      setConnecting(true);
      setError('');
      const { authorizeUrl } = await startTikTokShopOauth(
        managementOnly
          ? '/manage/shops'
          : videoOnly
            ? videoExportOnly ? '/videos' : '/manage/video-analytics'
            : '/manage/shop-analytics',
      );
      if (!authorizeUrl) throw new Error(t('shopAnalytics.oauthError'));
      window.location.assign(authorizeUrl);
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.message || t('shopAnalytics.oauthError') });
      setConnecting(false);
    }
  };

  const disconnectShop = async (shop) => {
    if (!window.confirm(t('shopAnalytics.disconnectShopConfirm', { name: shop.name || t('common.unknown') }))) return;
    try {
      setDisconnectingId(shop.id);
      await disconnectTikTokShop(shop.id);
      if (String(selectedShop?.id) === String(shop.id)) {
        setSnapshot(null);
      }
      await loadInventory();
      setToast({ type: 'success', message: t('shopAnalytics.disconnectShopSuccess', { name: shop.name || t('common.unknown') }) });
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.message || t('shopAnalytics.disconnectShopError') });
    } finally {
      setDisconnectingId(null);
    }
  };

  const changeCustomDate = (setter, currentValue) => (event) => {
    const nextValue = event.target.value;
    if (nextValue === currentValue) return;
    setter(nextValue);
  };

  const changeSelectedShop = (nextShopId) => {
    if (nextShopId === selectedShopId) return;
    setSnapshot(null);
    setVideoCreator('');
    setVideoPage(1);
    setSelectedShopId(nextShopId);
  };

  const changePeriodPreset = (event) => {
    const nextPreset = event.target.value;
    setPeriodPreset(nextPreset);
    if (nextPreset === 'custom') return;
    const days = Number(nextPreset.replace(/d$/, ''));
    if (!Number.isFinite(days) || days <= 0) return;
    const nextRange = rangeForDays(days);
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
  };

  const kpis = [
    { key: 'gmv', value: formatMoney(totals.gmv), change: changeFrom(totals.gmv, comparisonTotals.gmv) },
    { key: 'orders', value: formatNumber(totals.orders), change: changeFrom(totals.orders, comparisonTotals.orders) },
    { key: 'unitsSold', value: formatNumber(totals.unitsSold), change: changeFrom(totals.unitsSold, comparisonTotals.unitsSold) },
    { key: 'buyers', value: formatNumber(totals.buyers), change: changeFrom(totals.buyers, comparisonTotals.buyers) },
    { key: 'avgOrderValue', value: formatMoney(totals.avgOrderValue), change: changeFrom(totals.avgOrderValue, comparisonTotals.avgOrderValue) },
    { key: 'refunds', value: formatMoney(totals.refunds), change: changeFrom(totals.refunds, comparisonTotals.refunds), inverse: true },
  ];
  const chartLabel = t(`shopAnalytics.${chartMetric}`);
  const funnel = [
    {
      key: 'impressions',
      value: totals.impressions,
      rate: 100,
      barRate: 100,
      rateLabel: t('shopAnalytics.funnelBaseline'),
    },
    {
      key: 'pageViews',
      value: totals.pageViews,
      rate: percentage(totals.pageViews, totals.impressions),
      barRate: percentage(totals.pageViews, totals.impressions),
      rateLabel: t('shopAnalytics.fromImpressions'),
    },
    {
      key: 'buyers',
      value: totals.buyers,
      rate: percentage(totals.buyers, totals.pageViews),
      barRate: percentage(totals.buyers, totals.impressions),
      rateLabel: t('shopAnalytics.fromPageViews'),
    },
  ];

  const renderDelta = (kpi) => {
    if (analyticsLoading) {
      return <span className="shop-analytics__change is-muted">{t('common.loading')}</span>;
    }
    if (!hasData) return <span className="shop-analytics__change is-muted">{t('shopAnalytics.awaitingData')}</span>;
    if (kpi.change === null) {
      return <span className="shop-analytics__change is-muted">{t('shopAnalytics.noComparison')}</span>;
    }
    const favorable = kpi.change === 0 || (kpi.inverse ? kpi.change < 0 : kpi.change > 0);
    const tone = kpi.change === 0 ? 'is-neutral' : favorable ? 'is-positive' : 'is-negative';
    const direction = kpi.change > 0
      ? t('shopAnalytics.increased')
      : kpi.change < 0
        ? t('shopAnalytics.decreased')
        : t('shopAnalytics.unchanged');
    return (
      <span className={`shop-analytics__change ${tone}`}>
        <span aria-hidden="true">{kpi.change > 0 ? '↑' : kpi.change < 0 ? '↓' : '→'}</span>
        {' '}{direction}{' '}
        {Math.abs(kpi.change).toLocaleString(locale, { maximumFractionDigits: 1 })}%{' '}
        {t('shopAnalytics.vsPrevious')}
      </span>
    );
  };

  return (
    <div className={`page shop-analytics${managementOnly ? ' shop-analytics--management' : ''}`}>
      <section className={`page__hero shop-analytics__hero${managementOnly ? ' admin-page__hero' : ''}`}>
        <div className="shop-analytics__hero-row">
          <div className="shop-analytics__hero-copy">
            <h1 className="page__title">
              {t(managementOnly
                ? 'shopAnalytics.manageHeroTitle'
                : videoOnly
                  ? videoExportOnly
                    ? 'shopAnalytics.videoExportHeroTitle'
                    : 'shopAnalytics.videoHeroTitle'
                  : 'shopAnalytics.heroTitle')}
            </h1>
          </div>
        </div>

      </section>

      {toast ? (
        <div
          className={`koc-toast koc-toast--${toast.type}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span>{toast.message}</span>
          <button
            className="koc-toast__close"
            type="button"
            aria-label={t('common.close')}
            onClick={() => setToast(null)}
          >×</button>
        </div>
      ) : null}
      {error ? <section className="section-card shop-analytics__error" role="alert">{error}</section> : null}

      {managementOnly ? (
        <section className="shop-management__stats" aria-label={t('shopAnalytics.manageSummary')}>
          <article className="shop-management__stat">
            <span className="shop-management__stat-icon" aria-hidden="true">
              <AnalyticsIcon name="connections" />
            </span>
            <div>
              <span>{t('shopAnalytics.sellerAccounts')}</span>
              <strong>{loading ? '—' : formatNumber(connections.length)}</strong>
            </div>
          </article>
          <article className="shop-management__stat">
            <span className="shop-management__stat-icon" aria-hidden="true">
              <AnalyticsIcon name="shop" />
            </span>
            <div>
              <span>{t('shopAnalytics.connectedShops')}</span>
              <strong>{loading ? '—' : formatNumber(shops.length)}</strong>
            </div>
          </article>
          <article className={`shop-management__stat${attentionCount ? ' is-warning' : ''}`}>
            <span className="shop-management__stat-icon" aria-hidden="true">
              <AnalyticsIcon name="sync" />
            </span>
            <div>
              <span>{t('shopAnalytics.needsAttention')}</span>
              <strong>{loading ? '—' : formatNumber(attentionCount)}</strong>
            </div>
          </article>
        </section>
      ) : null}

      {!managementOnly ? (
        <>
        <div
          id="shop-analytics-panel"
          className="shop-analytics__tab-panel"
          hidden={videoOnly}
        >
          <section className="section-card shop-analytics__filters" aria-labelledby="shop-analytics-filters-title">
            <div className="shop-analytics__filter-heading">
              <div>
                <h2 className="section-card__title" id="shop-analytics-filters-title">
                  {t('shopAnalytics.filtersTitle')}
                </h2>
              </div>
              <button
                className="button shop-analytics__sync-button"
                type="button"
                onClick={syncAnalytics}
                disabled={!selectedShopId || invalidRange || missingAnalyticsScope || tokenExpired || syncing}
              >
                <AnalyticsIcon name="sync" />
                {syncing ? t('shopAnalytics.syncing') : t('shopAnalytics.syncNow')}
              </button>
            </div>
            <div className="shop-analytics__filter-grid">
              <div className="field">
                <label htmlFor="analytics-shop">{t('shopAnalytics.shop')}</label>
                <ShopDropdown
                  id="analytics-shop"
                  value={selectedShopId}
                  shops={shops}
                  disabled={loading || !shops.length}
                  onChange={changeSelectedShop}
                  placeholder={loading ? t('common.loading') : t('shopAnalytics.selectShop')}
                  unknownLabel={t('common.unknown')}
                />
              </div>
              <div className="field">
                <label htmlFor="analytics-period">{t('shopAnalytics.period')}</label>
                <select id="analytics-period" value={periodPreset} onChange={changePeriodPreset}>
                  <option value="7d">{t('shopAnalytics.period7d')}</option>
                  <option value="30d">{t('shopAnalytics.period30d')}</option>
                  {!videoExportOnly ? <option value="90d">{t('shopAnalytics.period90d')}</option> : null}
                  {!videoExportOnly ? <option value="custom">{t('shopAnalytics.periodCustom')}</option> : null}
                </select>
              </div>
              {!videoExportOnly && periodPreset === 'custom' ? (
                <>
                  <div className="field">
                    <label htmlFor="analytics-start-date">{t('shopAnalytics.startDate')}</label>
                    <DatePickerInput
                      id="analytics-start-date"
                      label={t('shopAnalytics.startDate')}
                      value={startDate}
                      max={endDate ? shiftDate(endDate, -1) : undefined}
                      onChange={changeCustomDate(setStartDate, startDate)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="analytics-end-date">{t('shopAnalytics.endDate')}</label>
                    <DatePickerInput
                      id="analytics-end-date"
                      label={t('shopAnalytics.endDate')}
                      value={endDate}
                      min={startDate ? shiftDate(startDate, 1) : undefined}
                      max={dateOnly(new Date())}
                      invalid={invalidRange}
                      onChange={changeCustomDate(setEndDate, endDate)}
                    />
                  </div>
                </>
              ) : null}
            </div>
            {invalidRange ? (
              <p className="shop-analytics__validation" role="alert">{t('shopAnalytics.invalidRange')}</p>
            ) : null}
          </section>

          {selectedShop && (missingAnalyticsScope || tokenExpired) ? (
            <section className="shop-analytics__permission-banner" role="status">
              <div>
                <strong>{t(tokenExpired ? 'shopAnalytics.tokenExpired' : 'shopAnalytics.missingScope')}</strong>
                <span>{t(tokenExpired ? 'shopAnalytics.tokenExpiredAction' : 'shopAnalytics.missingScopeAction')}</span>
              </div>
            </section>
          ) : null}

          {!loading && !shops.length ? (
            <section className="section-card shop-analytics__empty">
              <div className="shop-analytics__empty-icon" aria-hidden="true">
                <AnalyticsIcon name="shop" />
              </div>
              <h2>{t('shopAnalytics.noShops')}</h2>
              <p>{t('shopAnalytics.noShopsMeta')}</p>
            </section>
          ) : null}

          {loading ? (
            <section className="section-card empty-state">
              <span className="loading-dot" />
              {t('shopAnalytics.loadingShops')}
            </section>
          ) : null}

          {selectedShop ? (
            <>
              <section className="page__stats shop-analytics__stats" aria-label={t('shopAnalytics.kpiTitle')}>
                {kpis.map((kpi) => (
                  <article className={`stat-card shop-analytics__stat shop-analytics__stat--${kpi.key}`} key={kpi.key}>
                    <div className="shop-analytics__stat-heading">
                      <p className="stat-card__label">{t(`shopAnalytics.${kpi.key}`)}</p>
                      <span className="shop-analytics__stat-icon" aria-hidden="true">
                        <AnalyticsIcon name={kpi.key} />
                      </span>
                    </div>
                    <p className="stat-card__value">
                      {analyticsLoading && !hasData ? <span className="shop-analytics__value-skeleton" /> : hasData ? kpi.value : '—'}
                    </p>
                    {renderDelta(kpi)}
                  </article>
                ))}
              </section>

              <section className="shop-analytics__chart-grid">
                <article className="section-card shop-analytics__chart-card">
                  <div className="section-card__header shop-analytics__chart-header">
                    <div>
                      <h2 className="section-card__title">{t('shopAnalytics.trend')}</h2>
                    </div>
                    <div className="shop-analytics__metric-switcher" role="group" aria-label={t('shopAnalytics.metric')}>
                      {['gmv', 'orders', 'unitsSold', 'buyers'].map((metric) => (
                        <button
                          className={chartMetric === metric ? 'is-active' : ''}
                          type="button"
                          key={metric}
                          aria-pressed={chartMetric === metric}
                          onClick={() => setChartMetric(metric)}
                        >
                          {t(`shopAnalytics.${metric}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {analyticsLoading && !hasData ? (
                    <div className="empty-state">
                      <span className="loading-dot" />
                      {t('shopAnalytics.loadingAnalytics')}
                    </div>
                  ) : chartData.length ? (
                    <div className="shop-analytics__chart" role="img" aria-label={`${t('shopAnalytics.trend')}: ${chartLabel}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
                          <defs>
                            <linearGradient id="shopAnalyticsArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-social-cyan-strong)" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="var(--color-social-cyan-strong)" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            minTickGap={26}
                            tick={CHART_TICK}
                            tickFormatter={(value) => {
                              const parts = parseDateOnly(value);
                              return parts ? `${parts.day}/${parts.month}` : value;
                            }}
                          />
                          <YAxis
                            width={64}
                            axisLine={false}
                            tickLine={false}
                            tick={CHART_TICK}
                            tickFormatter={(value) => Intl.NumberFormat(locale, { notation: 'compact' }).format(value)}
                          />
                          <Tooltip
                            labelFormatter={formatDate}
                            formatter={(value) => [
                              chartMetric === 'gmv' ? formatMoney(value) : formatNumber(value),
                              chartLabel,
                            ]}
                            contentStyle={CHART_TOOLTIP_STYLE}
                          />
                          <Area
                            type="monotone"
                            dataKey={chartMetric}
                            stroke="var(--color-social-cyan-strong)"
                            strokeWidth={3}
                            fill="url(#shopAnalyticsArea)"
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="empty-state shop-analytics__chart-empty">
                      <p>{t('shopAnalytics.noData')}</p>
                    </div>
                  )}
                </article>

                <div className="shop-analytics__insight-stack">
                  <article className="section-card shop-analytics__breakdown-card">
                    <div className="section-card__header">
                      <div>
                        <h2 className="section-card__title">{t('shopAnalytics.gmvBreakdown')}</h2>
                        <p className="section-card__meta">{t('shopAnalytics.gmvBreakdownMeta')}</p>
                      </div>
                    </div>
                    {analyticsLoading && !hasData ? (
                      <div className="empty-state empty-state--compact">
                        <span className="loading-dot" />
                        {t('shopAnalytics.loadingAnalytics')}
                      </div>
                    ) : breakdowns.length ? (
                      <div className="shop-analytics__breakdowns">
                        {breakdowns.map((item, index) => {
                          const share = percentage(item.amount, breakdownTotal);
                          return (
                            <div className="shop-analytics__breakdown" key={item.type}>
                              <div className="shop-analytics__breakdown-heading">
                                <span>
                                  <i style={{ background: SOURCE_COLORS[index % SOURCE_COLORS.length] }} aria-hidden="true" />
                                  {sourceLabel(item.type)}
                                </span>
                                <strong>{formatPercent(share)}</strong>
                              </div>
                              <div className="shop-analytics__breakdown-track" aria-hidden="true">
                                <span
                                  style={{
                                    width: `${boundedPercentage(share)}%`,
                                    background: SOURCE_COLORS[index % SOURCE_COLORS.length],
                                  }}
                                />
                              </div>
                              <small>{formatMoney(item.amount)}</small>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty-state empty-state--compact">{t('shopAnalytics.noBreakdown')}</div>
                    )}
                  </article>

                  <article className="section-card shop-analytics__funnel-card">
                    <div className="section-card__header">
                      <div>
                        <h2 className="section-card__title">{t('shopAnalytics.commerceFunnel')}</h2>
                        <p className="section-card__meta">{t('shopAnalytics.commerceFunnelMeta')}</p>
                      </div>
                    </div>
                    {analyticsLoading && !hasData ? (
                      <div className="empty-state empty-state--compact">
                        <span className="loading-dot" />
                        {t('shopAnalytics.loadingAnalytics')}
                      </div>
                    ) : hasData ? (
                      <div className="shop-analytics__funnel">
                        {funnel.map((step, index) => (
                          <div className="shop-analytics__funnel-step" key={step.key}>
                            <div>
                              <span>{index + 1}</span>
                              <strong>{t(`shopAnalytics.${step.key}`)}</strong>
                            </div>
                            <strong>{formatNumber(step.value)}</strong>
                            <div className="shop-analytics__funnel-track" aria-hidden="true">
                              <span style={{ width: `${boundedPercentage(step.barRate)}%` }} />
                            </div>
                            <small>{formatPercent(step.rate)} {step.rateLabel}</small>
                          </div>
                        ))}
                        <div className="shop-analytics__funnel-footer">
                          <span>{t('shopAnalytics.cancellationsReturns')}</span>
                          <strong>{formatOptionalNumber(totals.cancellations)}</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state empty-state--compact">{t('shopAnalytics.noData')}</div>
                    )}
                  </article>
                </div>
              </section>

              <section className="section-card shop-analytics__daily-card">
                <div className="section-card__header">
                  <div>
                    <h2 className="section-card__title">{t('shopAnalytics.dailyValues')}</h2>
                    <p className="section-card__meta">
                      {snapshot
                        ? `${t('shopAnalytics.lastSync')}: ${formatDateTime(snapshot.synced_at)} · ${t('shopAnalytics.latestDate')}: ${formatDate(snapshot.latest_available_date)}`
                        : t('shopAnalytics.noData')}
                    </p>
                  </div>
                </div>
                <div className="table-wrap shop-analytics__table-wrap">
                  <table className="data-table shop-analytics__table">
                    <thead>
                      <tr>
                        <th>{t('shopAnalytics.date')}</th>
                        <th className="cell-number">{t('shopAnalytics.gmv')}</th>
                        <th className="cell-number">{t('shopAnalytics.orders')}</th>
                        <th className="cell-number">{t('shopAnalytics.unitsSold')}</th>
                        <th className="cell-number">{t('shopAnalytics.buyers')}</th>
                        <th className="cell-number">{t('shopAnalytics.impressions')}</th>
                        <th className="cell-number">{t('shopAnalytics.pageViews')}</th>
                        <th className="cell-number">{t('shopAnalytics.refunds')}</th>
                        <th className="cell-number">{t('shopAnalytics.cancellationsReturns')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsLoading && !intervals.length ? (
                        <tr>
                          <td colSpan={9}>
                            <div className="empty-state empty-state--compact table-empty-state">
                              <span className="loading-dot" />
                              {t('shopAnalytics.loadingAnalytics')}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {intervals.map((row, index) => (
                        <tr key={`${row.start_date}-${index}`}>
                          <td>{formatDate(row.start_date)}</td>
                          <td className="cell-number">{formatMoney(moneyValue(row.gmv))}</td>
                          <td className="cell-number">{formatNumber(row.orders)}</td>
                          <td className="cell-number">{formatNumber(row.units_sold)}</td>
                          <td className="cell-number">{formatNumber(row.buyers)}</td>
                          <td className="cell-number">{formatNumber(row.product_impressions)}</td>
                          <td className="cell-number">{formatNumber(row.product_page_views)}</td>
                          <td className="cell-number">{formatMoney(moneyValue(row.refunds))}</td>
                          <td className="cell-number">{formatOptionalNumber(row.cancellations_and_returns)}</td>
                        </tr>
                      ))}
                      {!analyticsLoading && !intervals.length ? (
                        <tr>
                          <td colSpan={9}>
                            <div className="empty-state empty-state--compact table-empty-state">
                              {t('shopAnalytics.noData')}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <div className="shop-analytics__daily-cards">
                  {analyticsLoading && !intervals.length ? (
                    <div className="empty-state empty-state--compact">
                      <span className="loading-dot" />
                      {t('shopAnalytics.loadingAnalytics')}
                    </div>
                  ) : null}
                  {intervals.map((row, index) => (
                    <article key={`mobile-${row.start_date}-${index}`}>
                      <div>
                        <strong>{formatDate(row.start_date)}</strong>
                        <span>{formatMoney(moneyValue(row.gmv))}</span>
                      </div>
                      <dl>
                        <div><dt>{t('shopAnalytics.orders')}</dt><dd>{formatNumber(row.orders)}</dd></div>
                        <div><dt>{t('shopAnalytics.unitsSold')}</dt><dd>{formatNumber(row.units_sold)}</dd></div>
                        <div><dt>{t('shopAnalytics.buyers')}</dt><dd>{formatNumber(row.buyers)}</dd></div>
                        <div><dt>{t('shopAnalytics.pageViews')}</dt><dd>{formatNumber(row.product_page_views)}</dd></div>
                        <div><dt>{t('shopAnalytics.impressions')}</dt><dd>{formatNumber(row.product_impressions)}</dd></div>
                        <div><dt>{t('shopAnalytics.refunds')}</dt><dd>{formatMoney(moneyValue(row.refunds))}</dd></div>
                        <div><dt>{t('shopAnalytics.cancellationsReturns')}</dt><dd>{formatOptionalNumber(row.cancellations_and_returns)}</dd></div>
                      </dl>
                    </article>
                  ))}
                  {!analyticsLoading && !intervals.length ? (
                    <div className="empty-state empty-state--compact">{t('shopAnalytics.noData')}</div>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
        </div>
        {videoOnly ? <div
          id="shop-video-analytics-panel"
          className="shop-analytics__tab-panel"
        >
          <section className="section-card shop-analytics__filters" aria-labelledby="shop-video-filters-title">
            <div className="shop-analytics__filter-heading">
              <div>
                <h2 className="section-card__title" id="shop-video-filters-title">
                  {t(videoExportOnly ? 'shopAnalytics.videoExportFiltersTitle' : 'shopAnalytics.videoFiltersTitle')}
                </h2>
              </div>
              {!videoExportOnly ? (
                <button
                  className="button shop-analytics__sync-button"
                  type="button"
                  disabled={!selectedShopId || videoAnalyticsLoading
                    || invalidRange || missingAnalyticsScope || tokenExpired}
                  onClick={() => setVideoReloadKey((value) => value + 1)}
                >
                  <AnalyticsIcon name="sync" />
                  {videoAnalyticsLoading ? t('common.loading') : t('shopAnalytics.refreshVideos')}
                </button>
              ) : null}
            </div>
            {!videoExportOnly ? (
              <div className="shop-video-analytics__account-tabs" role="tablist" aria-label={t('shopAnalytics.videoAccountType')}>
                <button
                  className={videoAccountType === 'LINKED_ACCOUNTS' ? 'is-active' : ''}
                  type="button"
                  role="tab"
                  aria-selected={videoAccountType === 'LINKED_ACCOUNTS'}
                  onClick={() => setVideoAccountType('LINKED_ACCOUNTS')}
                >
                  {t('shopAnalytics.linkedAccounts')}
                </button>
                <button
                  className={videoAccountType === 'AFFILIATE_ACCOUNTS' ? 'is-active' : ''}
                  type="button"
                  role="tab"
                  aria-selected={videoAccountType === 'AFFILIATE_ACCOUNTS'}
                  onClick={() => setVideoAccountType('AFFILIATE_ACCOUNTS')}
                >
                  {t('shopAnalytics.affiliateAccounts')}
                </button>
              </div>
            ) : null}
            <div className="shop-analytics__filter-grid shop-video-analytics__filters">
              <div className="field">
                <label htmlFor="video-analytics-shop">{t('shopAnalytics.shop')}</label>
                <ShopDropdown
                  id="video-analytics-shop"
                  value={selectedShopId}
                  shops={shops}
                  disabled={loading || !shops.length}
                  onChange={changeSelectedShop}
                  placeholder={loading ? t('common.loading') : t('shopAnalytics.selectShop')}
                  unknownLabel={t('common.unknown')}
                />
              </div>
              {!videoExportOnly ? (
                <div className="field">
                  <label htmlFor="video-sort-field">{t('shopAnalytics.sortBy')}</label>
                  <select id="video-sort-field" value={videoSortField} onChange={(event) => setVideoSortField(event.target.value)}>
                    <option value="gmv">{t('shopAnalytics.videoRevenue')}</option>
                    <option value="views">{t('shopAnalytics.videoViews')}</option>
                    <option value="sku_orders">{t('shopAnalytics.orders')}</option>
                    <option value="items_sold">{t('shopAnalytics.unitsSold')}</option>
                    <option value="click_through_rate">{t('shopAnalytics.videoCtr')}</option>
                  </select>
                </div>
              ) : null}
              {videoExportOnly ? (
                <div className="field">
                  <label htmlFor="video-creator-filter">{t('shopAnalytics.creator')}</label>
                  <CreatorDropdown
                    id="video-creator-filter"
                    options={videoCreatorOptions}
                    value={videoCreator}
                    disabled={videoAnalyticsLoading && !videoRows.length}
                    allLabel={t('shopAnalytics.allCreators')}
                    searchPlaceholder={t('shopAnalytics.searchCreators')}
                    noResultsLabel={t('shopAnalytics.creatorSearchNoResults')}
                    onChange={(nextCreator) => {
                      setVideoCreator(nextCreator);
                      setVideoPage(1);
                    }}
                  />
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="video-analytics-period">{t('shopAnalytics.period')}</label>
                <select id="video-analytics-period" value={periodPreset} onChange={changePeriodPreset}>
                  <option value="7d">{t('shopAnalytics.period7d')}</option>
                  <option value="30d">{t('shopAnalytics.period30d')}</option>
                  <option value="90d">{t('shopAnalytics.period90d')}</option>
                  <option value="custom">{t('shopAnalytics.periodCustom')}</option>
                </select>
              </div>
              {periodPreset === 'custom' ? (
                <>
                  <div className="field">
                    <label htmlFor="video-start-date">{t('shopAnalytics.startDate')}</label>
                    <DatePickerInput id="video-start-date" label={t('shopAnalytics.startDate')} value={startDate} max={endDate ? shiftDate(endDate, -1) : undefined} onChange={changeCustomDate(setStartDate, startDate)} />
                  </div>
                  <div className="field">
                    <label htmlFor="video-end-date">{t('shopAnalytics.endDate')}</label>
                    <DatePickerInput id="video-end-date" label={t('shopAnalytics.endDate')} value={endDate} min={startDate ? shiftDate(startDate, 1) : undefined} max={dateOnly(new Date())} onChange={changeCustomDate(setEndDate, endDate)} />
                  </div>
                </>
              ) : null}
            </div>
          </section>

          {selectedShop && (missingAnalyticsScope || tokenExpired) ? (
            <section className="shop-analytics__permission-banner" role="status">
              <div>
                <strong>{t(tokenExpired ? 'shopAnalytics.tokenExpired' : 'shopAnalytics.missingScope')}</strong>
                <span>{t(tokenExpired ? 'shopAnalytics.tokenExpiredAction' : 'shopAnalytics.missingScopeAction')}</span>
              </div>
            </section>
          ) : null}

          {selectedShop ? (
            <>
              <section className="page__stats shop-analytics__stats shop-video-analytics__stats" aria-label={t('shopAnalytics.videoSummary')}>
                <article className="stat-card shop-analytics__stat shop-analytics__stat--gmv">
                  <p className="stat-card__label">{t('shopAnalytics.videoRevenue')}</p>
                  <p className="stat-card__value">{videoAnalyticsLoading && !videoRows.length ? '—' : formatMoney(videoTotals.gmv)}</p>
                </article>
                <article className="stat-card shop-analytics__stat">
                  <p className="stat-card__label">{t('shopAnalytics.videos')}</p>
                  <p className="stat-card__value">{videoAnalyticsLoading && !videoRows.length ? '—' : formatNumber(videoCreator ? creatorFilteredVideoRows.length : videoAnalytics?.total_count ?? videoRows.length)}</p>
                </article>
                <article className="stat-card shop-analytics__stat">
                  <p className="stat-card__label">{t('shopAnalytics.videoViews')}</p>
                  <p className="stat-card__value">{videoAnalyticsLoading && !videoRows.length ? '—' : formatNumber(videoTotals.views)}</p>
                </article>
                <article className="stat-card shop-analytics__stat">
                  <p className="stat-card__label">{t(videoExportOnly ? 'shopAnalytics.videoAttributedOrders' : 'shopAnalytics.orders')}</p>
                  <p className="stat-card__value">{videoAnalyticsLoading && !videoRows.length ? '—' : formatNumber(videoTotals.orders)}</p>
                </article>
              </section>

              {videoExportOnly ? (
                <section className="section-card shop-video-analytics__table-card">
                <div className="section-card__header">
                  <div>
                    <h2 className="section-card__title">{t('shopAnalytics.videoExportTableTitle')}</h2>
                    <p className="section-card__meta">{t('shopAnalytics.videoExportTableMeta', { count: filteredVideoRows.length })}</p>
                  </div>
                  <label className="video-export-search">
                    <span className="sr-only">{t('common.search')}</span>
                    <input
                      type="search"
                      value={videoSearch}
                      placeholder={t('shopAnalytics.videoSearchPlaceholder')}
                      onChange={(event) => {
                        setVideoSearch(event.target.value);
                        setVideoPage(1);
                      }}
                    />
                  </label>
                </div>
                <div className="table-wrap shop-analytics__table-wrap video-export-table-wrap">
                  <table className="data-table shop-analytics__table shop-video-analytics__table video-export-table">
                    <thead>
                      <tr>
                        <th>{t('shopAnalytics.video')}</th>
                        <th>{t('shopAnalytics.postDate')}</th>
                        <th>{t('shopAnalytics.creator')}</th>
                        <th>{t('shopAnalytics.productId')}</th>
                        <th className="cell-number">{t('shopAnalytics.videoRevenue')}</th>
                        <th className="cell-number">AOV</th>
                        <th className="cell-number">{t('shopAnalytics.unitsSold')}</th>
                        <th className="cell-number">{t('shopAnalytics.videoImpressions')}</th>
                        <th className="cell-number">{t('shopAnalytics.videoClicks')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {videoAnalyticsLoading && !videoRows.length ? (
                        <tr><td colSpan={9}><div className="empty-state"><span className="loading-dot" />{t('shopAnalytics.loadingVideos')}</div></td></tr>
                      ) : null}
                      {paginatedVideoRows.map((video, index) => {
                        const url = videoUrl(video);
                        const creatorName = video.creator?.nick_name || video.creator?.user_name || video.username || '—';
                        const creatorUsername = video.creator_username || video.creator?.user_name || video.username || '';
                        const title = video.video_title || video.title || video.video_id || t('common.unknown');
                        const products = productsForVideo(video, videoProductMetadata);
                        return (
                          <tr key={video.id || index}>
                            <td>
                              <div className="shop-video-analytics__video">
                                <VideoThumbnail shopId={selectedShopId} video={video} href={url} />
                                <span>
                                  {url ? (
                                    <a className="shop-video-analytics__title-link" href={url} target="_blank" rel="noreferrer" title={title}>
                                      <strong>{title}</strong>
                                    </a>
                                  ) : <strong title={title}>{title}</strong>}
                                  <span className="shop-video-analytics__creator video-export-table__video-id">ID: {video.video_id || '—'}</span>
                                  <span className="video-export-table__engagement">
                                    <span title={`${t('shopAnalytics.videoViews')}: ${formatNumber(video.video_views ?? video.views)}`}>
                                      <AnalyticsIcon name="views" />
                                      {formatNumber(video.video_views ?? video.views)}
                                    </span>
                                    <span title={`${t('videoLibrary.likes')}: ${formatNumber(video.likes)}`}>
                                      <AnalyticsIcon name="likes" />
                                      {formatNumber(video.likes)}
                                    </span>
                                    <span title={`${t('videoLibrary.comments')}: ${formatNumber(video.comments)}`}>
                                      <AnalyticsIcon name="comments" />
                                      {formatNumber(video.comments)}
                                    </span>
                                    <span title={`${t('videoLibrary.shares')}: ${formatNumber(video.shares)}`}>
                                      <AnalyticsIcon name="shares" />
                                      {formatNumber(video.shares)}
                                    </span>
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td>{formatVideoPostDate(video.post_date)}</td>
                            <td>
                              <div className="creator-identity video-export-table__creator">
                                <CreatorAvatar src={video.creator_avatar_url || video.creator?.avatar_url} name={video.creator_name || creatorName} />
                                <span>
                                  <strong>{video.creator_name || creatorName || '—'}</strong>
                                  {creatorUsername ? <span className="row-subtitle">@{String(creatorUsername).replace(/^@+/, '')}</span> : null}
                                </span>
                              </div>
                            </td>
                            <td>
                              {products.length ? (
                                <div className="video-export-products">
                                  {products.map((product) => (
                                    <VideoProduct product={product} key={product.id} />
                                  ))}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="cell-number"><strong>{formatVideoMoney(video.creator_attributed_gmv ?? video.gmv)}</strong></td>
                            <td className="cell-number">{formatVideoMoney(video.aov)}</td>
                            <td className="cell-number">{formatNumber(video.attributed_items_sold ?? video.items_sold ?? video.units_sold)}</td>
                            <td className="cell-number">{formatNumber(video.product_impressions)}</td>
                            <td className="cell-number">{formatNumber(video.product_clicks)}</td>
                          </tr>
                        );
                      })}
                      {!videoAnalyticsLoading && !videoRows.length ? (
                        <tr><td colSpan={9}><div className="empty-state">{t('shopAnalytics.videoApiNoData')}</div></td></tr>
                      ) : null}
                      {!videoAnalyticsLoading && videoRows.length > 0 && !filteredVideoRows.length ? (
                        <tr><td colSpan={9}><div className="empty-state">{t('shopAnalytics.videoSearchNoResults')}</div></td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {filteredVideoRows.length ? (
                  <Pagination
                    currentPage={videoPage}
                    totalPages={videoPageCount}
                    onPageChange={setVideoPage}
                    disabled={videoAnalyticsLoading}
                    previousLabel={t('common.previous')}
                    nextLabel={t('common.next')}
                    ariaLabel={t('shopAnalytics.videoExportPagination')}
                    className="video-export-pagination"
                  />
                ) : null}
                </section>
              ) : (
                <section className="section-card shop-video-analytics__table-card">
                  <div className="section-card__header">
                    <div><h2 className="section-card__title">{t('shopAnalytics.videoPerformance')}</h2></div>
                  </div>
                  <div className="table-wrap shop-analytics__table-wrap">
                    <table className="data-table shop-analytics__table shop-video-analytics__table">
                      <colgroup>
                        <col className="shop-video-analytics__col-video" />
                        <col className="shop-video-analytics__col-hashtags" />
                        <col className="shop-video-analytics__col-gmv" />
                        <col className="shop-video-analytics__col-views" />
                        <col className="shop-video-analytics__col-orders" />
                        <col className="shop-video-analytics__col-sold" />
                        <col className="shop-video-analytics__col-ctr" />
                        <col className="shop-video-analytics__col-date" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>{t('shopAnalytics.video')}</th>
                          <th>{t('videoLibrary.hashtags')}</th>
                          <th className="cell-number">{t('shopAnalytics.videoRevenue')}</th>
                          <th className="cell-number">{t('shopAnalytics.videoViews')}</th>
                          <th className="cell-number">{t('shopAnalytics.orders')}</th>
                          <th className="cell-number">{t('shopAnalytics.unitsSold')}</th>
                          <th className="cell-number">{t('shopAnalytics.videoCtr')}</th>
                          <th>{t('shopAnalytics.postedAt')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {videoAnalyticsLoading && !videoRows.length ? (
                          <tr><td colSpan={8}><div className="empty-state"><span className="loading-dot" />{t('shopAnalytics.loadingVideos')}</div></td></tr>
                        ) : null}
                        {videoRows.map((video, index) => {
                          const url = videoUrl(video);
                          const hashtags = (video.hash_tags || video.hashtags || [])
                            .map((hashtag) => String(hashtag || '').trim())
                            .filter(Boolean)
                            .map((hashtag) => hashtag.startsWith('#') ? hashtag : `#${hashtag}`);
                          return (
                            <tr key={video.id || index}>
                              <td>
                                <div className="shop-video-analytics__video">
                                  <VideoThumbnail shopId={selectedShopId} video={video} href={url} />
                                  <span>
                                    <strong>{video.title || video.id || t('common.unknown')}</strong>
                                    <span className="shop-video-analytics__creator" title={video.creator?.nick_name || video.creator?.user_name || video.username || ''}>
                                      {video.creator?.nick_name || video.creator?.user_name || video.username || '—'}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              <td>{hashtags.length ? hashtags.slice(0, 3).join(' ') : '—'}</td>
                              <td className="cell-number"><strong>{formatVideoMoney(video.gmv)}</strong></td>
                              <td className="cell-number">{formatNumber(video.views ?? video.video_views)}</td>
                              <td className="cell-number">{formatNumber(video.sku_orders ?? video.orders)}</td>
                              <td className="cell-number">{formatNumber(video.items_sold ?? video.units_sold)}</td>
                              <td className="cell-number">{formatRate(video.click_through_rate ?? video.ctr)}</td>
                              <td>{video.video_post_time || video.post_time || (url ? <a href={url} target="_blank" rel="noreferrer">Open</a> : '—')}</td>
                            </tr>
                          );
                        })}
                        {!videoAnalyticsLoading && !videoRows.length ? (
                          <tr><td colSpan={8}><div className="empty-state">{t('shopAnalytics.noVideoData')}</div></td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          ) : (
            <section className="section-card shop-analytics__empty">
              <h2>{t('shopAnalytics.noShops')}</h2>
              <p>{t('shopAnalytics.noShopsMeta')}</p>
            </section>
          )}
        </div> : null}
        </>
      ) : (
        <div
          id="shop-connections-panel"
          className="shop-analytics__tab-panel"
        >
          <section className="section-card shop-analytics__connections-card" aria-labelledby="shop-connections-title">
            <div className="section-card__header">
              <div>
                <h2 className="section-card__title" id="shop-connections-title">{t('shopAnalytics.connections')}</h2>
              </div>
            </div>
            {loading ? (
              <div className="empty-state">
                <span className="loading-dot" />
                {t('shopAnalytics.loadingConnections')}
              </div>
            ) : (
              <div className="shop-analytics__connections">
                {connections.map((authorization) => {
                  const scopes = scopesOf(authorization);
                  const expired = Boolean(
                    authorization.refresh_token_expires_at
                      && new Date(authorization.refresh_token_expires_at).getTime() <= Date.now(),
                  );
                  const missingScope = !scopes.includes(REQUIRED_SCOPE);
                  const authorizationShops = Array.isArray(authorization.shops) ? authorization.shops : [];
                  return (
                    <article className="shop-analytics__connection" key={authorization.id}>
                      <div className="shop-analytics__connection-head">
                        <div className="shop-analytics__connection-identity">
                          <span className="shop-analytics__shop-mark" aria-hidden="true">
                            <AnalyticsIcon name="shop" />
                          </span>
                          <div>
                            <strong>{authorizationShops.map((shop) => shop.name).join(', ') || t('shopAnalytics.shopConnection')}</strong>
                            <span>{t('shopAnalytics.connectedAt')}: {formatDateTime(authorization.connected_at)}</span>
                          </div>
                        </div>
                        <span className={`chip ${expired || missingScope ? 'chip--amber' : 'chip--positive'}`}>
                          {expired
                            ? t('shopAnalytics.tokenExpired')
                            : missingScope
                              ? t('shopAnalytics.missingScope')
                              : t('shopAnalytics.connected')}
                        </span>
                      </div>
                      <div className="shop-management__permissions-block">
                        <span className="shop-management__permissions-label">{t('shopAnalytics.permissions')}</span>
                        <div className="shop-management__permissions">
                          {scopes.length ? scopes.map((scope) => (
                            <span className={`chip ${scope === REQUIRED_SCOPE ? 'chip--positive' : ''}`} key={scope}>
                              {scope}
                            </span>
                          )) : <span className="shop-management__permissions-empty">{t('shopAnalytics.noPermissions')}</span>}
                        </div>
                      </div>
                      {authorizationShops.length ? (
                        <div className="shop-management__shop-list" aria-label={t('shopAnalytics.shopInventory')}>
                          {authorizationShops.map((shop) => (
                            <div className="shop-management__shop-row" key={shop.id || shop.platform_shop_id || shop.name}>
                              <span className="shop-management__shop-avatar" aria-hidden="true">
                                <AnalyticsIcon name="shop" />
                              </span>
                              <div>
                                <strong>{shop.name || t('common.unknown')}</strong>
                                <span>{[shop.code, shop.region].filter(Boolean).join(' · ') || t('shopAnalytics.connected')}</span>
                              </div>
                              <button
                                className="button button--small button--danger shop-management__disconnect"
                                type="button"
                                disabled={connecting || disconnectingId !== null}
                                onClick={() => disconnectShop(shop)}
                              >
                                {String(disconnectingId) === String(shop.id)
                                  ? t('common.loading')
                                  : t('shopAnalytics.disconnect')}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {missingScope ? (
                        <div className="shop-analytics__scope-list">
                          <span className="chip chip--amber">{t('shopAnalytics.missing')}: {REQUIRED_SCOPE}</span>
                        </div>
                      ) : null}
                      {authorization.last_sync_error ? (
                        <p className="shop-analytics__connection-error">{authorization.last_sync_error}</p>
                      ) : null}
                      {expired || missingScope ? (
                        <div className="shop-analytics__connection-actions">
                          <button
                            className="button button--small button--ghost"
                            type="button"
                            disabled={connecting || disconnectingId !== null}
                            onClick={startConnect}
                          >
                            {t('shopAnalytics.reconnect')}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {!connections.length ? (
                  <div className="shop-analytics__connections-empty">
                    <div className="shop-analytics__empty-icon" aria-hidden="true">
                      <AnalyticsIcon name="connections" />
                    </div>
                    <strong>{t('shopAnalytics.noConnections')}</strong>
                    <span>{t('shopAnalytics.noConnectionsMeta')}</span>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ShopAnalytics;
