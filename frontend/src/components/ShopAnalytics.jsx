import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  disconnectTikTokShop,
  fetchTikTokShopAnalytics,
  fetchTikTokShopConnections,
  fetchTikTokShopVideoAnalytics,
  fetchTikTokShopVideoPerformance,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokShops,
  startTikTokShopOauth,
  syncTikTokShopAnalytics,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { formatDateOnly } from '../lib/date';
import { useMoneyFormatter } from '../lib/currency';
import { ArrowUpDown, CalendarDays } from 'lucide-react';
import ShopDropdown from './ShopDropdown';
import SelectDropdown from './SelectDropdown';
import {
  getStoredSelectedShopId,
  resolveSelectedShopId,
  setStoredSelectedShopId,
  subscribeSelectedShop,
} from '../lib/shopSelection';
import DatePickerInput from './DatePickerInput';
import AnalyticsIcon from './shop-analytics/AnalyticsIcon';
import AnalyticsCharts from './shop-analytics/AnalyticsCharts';
import ConnectionsPanel from './shop-analytics/ConnectionsPanel';
import DailyAnalyticsTable from './shop-analytics/DailyAnalyticsTable';
import ShopVideoList from './shop-analytics/ShopVideoList';
import CreatorDropdown from './shop-analytics/CreatorDropdown';
import {
  REQUIRED_SCOPE,
  VIDEO_EXPORT_PAGE_SIZE,
  creatorForVideo,
  formatDisplayDateTime,
  moneyValue,
  numericValue,
  percentage,
  rangeForDays,
  scopesOf,
  shiftDate,
  totalsFor,
} from './shop-analytics/shopAnalyticsUtils';


const ShopAnalytics = ({
  managementOnly = false,
  videoOnly = false,
  videoExportOnly: videoExportOnlyProp = false,
  combinedVideoTabs = false,
}) => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const { formatMoney: formatPreferredMoney } = useMoneyFormatter(locale);
  const initialRange = useMemo(() => rangeForDays(7), []);
  const [shops, setShops] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(getStoredSelectedShopId);
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
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [combinedVideoView, setCombinedVideoView] = useState(() => (
    new URLSearchParams(window.location.search).get('view') === 'performance'
      ? 'performance'
      : 'library'
  ));
  const videoExportOnly = combinedVideoTabs
    ? combinedVideoView === 'library'
    : videoExportOnlyProp;

  const changeCombinedVideoView = (nextView) => {
    if (nextView === combinedVideoView) return;
    setCombinedVideoView(nextView);
    setVideoAnalytics(null);
    setVideoAnalyticsLoading(true);
    setVideoPage(1);
    const params = new URLSearchParams(window.location.search);
    if (nextView === 'performance') params.set('view', 'performance');
    else params.delete('view');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  };

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
    if (!shops.length) return;
    setSelectedShopId((current) => {
      const preferred = current || getStoredSelectedShopId();
      const resolved = resolveSelectedShopId(shops, preferred);
      if (resolved && resolved !== getStoredSelectedShopId()) {
        setStoredSelectedShopId(resolved);
      }
      return resolved;
    });
  }, [shops]);

  useEffect(() => {
    return subscribeSelectedShop((event) => {
      const nextId = event?.detail ?? getStoredSelectedShopId();
      if (!nextId) return;
      setSelectedShopId((current) => {
        if (String(nextId) === String(current)) return current;
        if (shops.length && !shops.some((shop) => String(shop.id) === String(nextId))) return current;
        setSnapshot(null);
        setVideoCreator('');
        setVideoPage(1);
        return String(nextId);
      });
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
        const syncedAt = Date.parse(nextSnapshot?.synced_at || '');
        const snapshotIsStale = !Number.isFinite(syncedAt)
          || Date.now() - syncedAt > 12 * 60 * 60 * 1000;
        if (!nextSnapshot || !Array.isArray(nextSnapshot?.metrics?.comparison_intervals) || snapshotIsStale) {
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

  const startConnect = async () => {
    if (disconnectingId !== null) return;
    try {
      setConnecting(true);
      setError('');
      const { authorizeUrl } = await startTikTokShopOauth(
        managementOnly
          ? '/manage/shops'
          : videoOnly
            ? videoExportOnly ? '/shop/videos' : '/shop/videos?view=performance'
            : '/shop/analytics',
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

  const changeCustomDate = (setter, currentValue) => (nextValue) => {
    if (nextValue === currentValue) return;
    setter(nextValue);
  };

  const changeCustomEndDate = (selectedDate) => {
    const nextEndDate = shiftDate(selectedDate, 1);
    if (nextEndDate !== endDate) setEndDate(nextEndDate);
  };

  const changeSelectedShop = (nextShopId) => {
    if (nextShopId === selectedShopId) return;
    setSnapshot(null);
    setVideoCreator('');
    setVideoPage(1);
    setSelectedShopId(nextShopId);
    setStoredSelectedShopId(nextShopId);
  };

  const changePeriodPreset = (eventOrValue) => {
    const nextPreset = typeof eventOrValue === 'string' ? eventOrValue : eventOrValue?.target?.value;
    setPeriodPreset(nextPreset);
    if (nextPreset === 'custom') return;
    const days = Number(nextPreset.replace(/d$/, ''));
    if (!Number.isFinite(days) || days <= 0) return;
    const nextRange = rangeForDays(days);
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
  };

  const periodOptions = useMemo(() => [
    { value: '7d', label: t('shopAnalytics.period7d') },
    { value: '30d', label: t('shopAnalytics.period30d') },
    ...(!videoExportOnly ? [
      { value: '90d', label: t('shopAnalytics.period90d') },
      { value: 'custom', label: t('shopAnalytics.periodCustom') },
    ] : []),
  ], [t, videoExportOnly]);

  const sortOptions = useMemo(() => [
    { value: 'gmv', label: t('shopAnalytics.videoRevenue') },
    { value: 'views', label: t('shopAnalytics.videoViews') },
    { value: 'sku_orders', label: t('shopAnalytics.orders') },
    { value: 'items_sold', label: t('shopAnalytics.unitsSold') },
    { value: 'click_through_rate', label: t('shopAnalytics.videoCtr') },
  ], [t]);

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
      {managementOnly || videoOnly ? (
        <section className={`page__hero shop-analytics__hero${managementOnly ? ' admin-page__hero' : ''}`}>
          <div className="shop-analytics__hero-row">
            <div className="shop-analytics__hero-copy">
              <h1 className="page__title">
                {t(managementOnly
                  ? 'shopAnalytics.manageHeroTitle'
                  : combinedVideoTabs
                    ? 'shopAnalytics.videoExportHeroTitle'
                    : videoExportOnly
                      ? 'navigation.videos'
                      : 'navigation.videoAnalytics')}
              </h1>
            </div>
          </div>
        </section>
      ) : null}

      {videoOnly && combinedVideoTabs ? (
        <div className="shop-video-analytics__view-tabs" role="tablist" aria-label={t('navigation.videos')}>
          <button
            className={combinedVideoView === 'library' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={combinedVideoView === 'library'}
            onClick={() => changeCombinedVideoView('library')}
          >
            {t('navigation.videos')}
          </button>
          <button
            className={combinedVideoView === 'performance' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={combinedVideoView === 'performance'}
            onClick={() => changeCombinedVideoView('performance')}
          >
            {t('navigation.videoAnalytics')}
          </button>
        </div>
      ) : null}

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
          <section className="shop-analytics__filters" aria-label={t('shopAnalytics.filtersTitle')}>
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
                <SelectDropdown
                  id="analytics-period"
                  value={periodPreset}
                  onChange={changePeriodPreset}
                  icon={<CalendarDays size={16} />}
                  options={periodOptions}
                />
              </div>
              {!videoExportOnly && periodPreset === 'custom' ? (
                <>
                  <div className="field">
                    <label htmlFor="analytics-start-date">{t('shopAnalytics.startDate')}</label>
                    <DatePickerInput
                      id="analytics-start-date"
                      label={t('shopAnalytics.startDate')}
                      value={startDate}
                      max={dateOnly(new Date())}
                      onChange={changeCustomDate(setStartDate, startDate)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="analytics-end-date">{t('shopAnalytics.endDate')}</label>
                    <DatePickerInput
                      id="analytics-end-date"
                      label={t('shopAnalytics.endDate')}
                      value={shiftDate(endDate, -1)}
                      max={dateOnly(new Date())}
                      invalid={invalidRange}
                      onChange={changeCustomEndDate}
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

<AnalyticsCharts
                analyticsLoading={analyticsLoading}
                breakdownTotal={breakdownTotal}
                breakdowns={breakdowns}
                chartData={chartData}
                chartLabel={chartLabel}
                chartMetric={chartMetric}
                formatDate={formatDate}
                formatMoney={formatMoney}
                formatNumber={formatNumber}
                formatOptionalNumber={formatOptionalNumber}
                formatPercent={formatPercent}
                funnel={funnel}
                hasData={hasData}
                locale={locale}
                onMetricChange={setChartMetric}
                sourceLabel={sourceLabel}
                t={t}
                totals={totals}
              />

<DailyAnalyticsTable
                analyticsLoading={analyticsLoading}
                formatDate={formatDate}
                formatDateTime={formatDateTime}
                formatMoney={formatMoney}
                formatNumber={formatNumber}
                formatOptionalNumber={formatOptionalNumber}
                intervals={intervals}
                snapshot={snapshot}
                t={t}
              />
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
                  <SelectDropdown
                    id="video-sort-field"
                    value={videoSortField}
                    onChange={setVideoSortField}
                    icon={<ArrowUpDown size={16} />}
                    options={sortOptions}
                  />
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
                <SelectDropdown
                  id="video-analytics-period"
                  value={periodPreset}
                  onChange={changePeriodPreset}
                  icon={<CalendarDays size={16} />}
                  options={periodOptions}
                />
              </div>
              {periodPreset === 'custom' ? (
                <>
                  <div className="field">
                    <label htmlFor="video-start-date">{t('shopAnalytics.startDate')}</label>
                    <DatePickerInput id="video-start-date" label={t('shopAnalytics.startDate')} value={startDate} max={dateOnly(new Date())} onChange={changeCustomDate(setStartDate, startDate)} />
                  </div>
                  <div className="field">
                    <label htmlFor="video-end-date">{t('shopAnalytics.endDate')}</label>
                    <DatePickerInput id="video-end-date" label={t('shopAnalytics.endDate')} value={shiftDate(endDate, -1)} max={dateOnly(new Date())} invalid={invalidRange} onChange={changeCustomEndDate} />
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
<ShopVideoList
                filteredVideoRows={filteredVideoRows}
                formatNumber={formatNumber}
                formatRate={formatRate}
                formatVideoMoney={formatVideoMoney}
                paginatedVideoRows={paginatedVideoRows}
                selectedShopId={selectedShopId}
                setVideoPage={setVideoPage}
                setVideoSearch={setVideoSearch}
                t={t}
                videoAnalyticsLoading={videoAnalyticsLoading}
                videoExportOnly={videoExportOnly}
                videoPage={videoPage}
                videoPageCount={videoPageCount}
                videoProductMetadata={videoProductMetadata}
                videoRows={videoRows}
                videoSearch={videoSearch}
                videoUrl={videoUrl}
              />
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
<ConnectionsPanel
          connecting={connecting}
          connections={connections}
          disconnectingId={disconnectingId}
          formatDateTime={formatDateTime}
          loading={loading}
          onConnect={startConnect}
          onDisconnect={disconnectShop}
          t={t}
        />
      )}
    </div>
  );
};

export default ShopAnalytics;
