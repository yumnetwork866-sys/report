import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDashboard, fetchDashboardVideos } from '../../../lib/api';
import {
  getCachedDashboard,
  getCachedVideos,
  setCachedDashboard,
  setCachedVideos,
} from '../../../lib/dashboardCache';
import { useI18n } from '../../../lib/language';
import { useMoneyFormatter } from '../../../lib/currency';
import {
  getStoredSelectedChannelId,
  resolveSelectedChannelId,
  setStoredSelectedChannelId,
  subscribeSelectedChannel,
} from '../../../lib/channelSelection';
import { dashboardInitialFilters, dashboardPeriodRange } from '../utils/dashboardUtils';

export const useDashboardData = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const { formatMoney } = useMoneyFormatter(locale);
  const initialFiltersRef = useRef(null);
  if (!initialFiltersRef.current) initialFiltersRef.current = dashboardInitialFilters();
  const initialFilters = initialFiltersRef.current;
  
  const [videos, setVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [users, setUsers] = useState([]);
  const [totals, setTotals] = useState({
    video_count: 0,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    gross_gmv: 0,
    orders: 0,
    aov: 0,
    rpm: 0,
    unavailable_video_count: 0,
    unlinked_video_count: 0,
    sales_currency: 'MYR',
    engagement_rate: 0,
    previous_period: null,
    growth: null,
  });
  const [chartRows, setChartRows] = useState([]);
  const [topVideos, setTopVideos] = useState([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoPagination, setVideoPagination] = useState({
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 1,
  });
  const [selectedChannelId, setSelectedChannelId] = useState(() => initialFilters.channelId || getStoredSelectedChannelId() || '');
  const [selectedUserId, setSelectedUserId] = useState(initialFilters.userId);
  const chartMetric = 'date';
  const [dailyMetric, setDailyMetric] = useState(initialFilters.metric);
  const [chartType, setChartType] = useState('area');
  const [selectedChartDate, setSelectedChartDate] = useState(null);
  
  const [periodPreset, setPeriodPreset] = useState(initialFilters.period);
  const [startDate, setStartDate] = useState(initialFilters.startDate);
  const [endDate, setEndDate] = useState(initialFilters.endDate);
  
  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoSearch, setVideoSearch] = useState('');
  const [videoSortBy, setVideoSortBy] = useState('published_at');
  const [videoSortDirection, setVideoSortDirection] = useState('desc');
  const videoQueryReadyRef = useRef(false);
  const videoQueryRef = useRef({ search: '', sortBy: 'published_at', sortDirection: 'desc' });
  videoQueryRef.current = { search: videoSearch, sortBy: videoSortBy, sortDirection: videoSortDirection };
  
  const handleChannelChange = (nextChannelId) => {
    const id = String(nextChannelId || '');
    setStoredSelectedChannelId(id);
    setSelectedChannelId(id);
    setSelectedUserId('all');
  };
  
  const formatNumber = useCallback(
    (value) => Number(value || 0).toLocaleString(locale),
    [locale],
  );
  
  const formatGmvAmount = useCallback(
    (amount, currency = 'MYR', options = {}) => {
      if (amount === null || amount === undefined) return '—';
      return formatMoney(amount, currency, options);
    },
    [formatMoney],
  );
  
  const handlePageChange = useCallback(
    async (nextPage) => {
      setVideoPage(nextPage);
      const videoParams = {
        channelId: selectedChannelId || null,
        userId: selectedUserId === 'all' ? null : selectedUserId,
        startDate: chartMetric === 'date' ? startDate : null,
        endDate: chartMetric === 'date' ? endDate : null,
        date: selectedChartDate || null,
        page: nextPage,
        pageSize: 20,
        search: videoSearch,
        sortBy: videoSortBy,
        sortDirection: videoSortDirection,
      };
  
      const cached = getCachedVideos(videoParams);
      if (cached) {
        setVideos(cached.videos || []);
        setVideoPagination(cached.video_pagination || {
          page: nextPage,
          page_size: 20,
          total: 0,
          total_pages: 1,
        });
        return;
      }
  
      try {
        setVideosLoading(true);
        const payload = await fetchDashboardVideos(videoParams);
        setVideos(payload.videos || []);
        setVideoPagination(payload.video_pagination || {
          page: nextPage,
          page_size: 20,
          total: 0,
          total_pages: 1,
        });
        setCachedVideos(videoParams, payload);
      } catch (err) {
        console.error('Failed to paginate videos', err);
      } finally {
        setVideosLoading(false);
      }
    },
    [chartMetric, endDate, selectedChannelId, selectedChartDate, selectedUserId, startDate, videoSearch, videoSortBy, videoSortDirection],
  );
  
  const handleDateClick = useCallback(
    async (clickedDate) => {
      const nextDate = selectedChartDate === clickedDate ? null : clickedDate;
      setSelectedChartDate(nextDate);
      setVideoPage(1);
  
      const videoParams = {
        channelId: selectedChannelId || null,
        userId: selectedUserId === 'all' ? null : selectedUserId,
        startDate: chartMetric === 'date' ? startDate : null,
        endDate: chartMetric === 'date' ? endDate : null,
        date: nextDate,
        page: 1,
        pageSize: 20,
        search: videoSearch,
        sortBy: videoSortBy,
        sortDirection: videoSortDirection,
      };
  
      const cached = getCachedVideos(videoParams);
      if (cached) {
        setVideos(cached.videos || []);
        setVideoPagination(cached.video_pagination || {
          page: 1,
          page_size: 20,
          total: cached.video_pagination?.total || 0,
          total_pages: cached.video_pagination?.total_pages || 1,
        });
        return;
      }
  
      try {
        setVideosLoading(true);
        const payload = await fetchDashboardVideos(videoParams);
        setVideos(payload.videos || []);
        setVideoPagination(payload.video_pagination || {
          page: 1,
          page_size: 20,
          total: 0,
          total_pages: 1,
        });
        setCachedVideos(videoParams, payload);
      } catch (err) {
        console.error('Failed to filter videos by date', err);
      } finally {
        setVideosLoading(false);
      }
    },
    [chartMetric, endDate, selectedChannelId, selectedChartDate, selectedUserId, startDate, videoSearch, videoSortBy, videoSortDirection],
  );
  
  useEffect(() => {
    const controller = new AbortController();
  
    const load = async () => {
      if (chartMetric === 'date'
        && (!startDate || !endDate || startDate > endDate)) {
        setLoading(false);
        setError(t('dashboard.invalidPeriod'));
        return;
      }
  
      const params = {
        channelId: selectedChannelId || null,
        userId: selectedUserId === 'all' ? null : selectedUserId,
        startDate: chartMetric === 'date' ? startDate : null,
        endDate: chartMetric === 'date' ? endDate : null,
        metric: chartMetric,
        topMetric: dailyMetric,
        page: 1,
        pageSize: 20,
      };
  
      const cached = getCachedDashboard(params);
      const hasDefaultVideoQuery = () => {
        const current = videoQueryRef.current;
        return !current.search && current.sortBy === 'published_at' && current.sortDirection === 'desc';
      };
      if (cached) {
        if (hasDefaultVideoQuery()) {
          setVideos(cached.videos || []);
        }
        setChannels(cached.channels || []);
        const cachedUsers = cached.users || [];
        setUsers(cachedUsers);
        if (selectedUserId !== 'all' && !cachedUsers.some((u) => String(u.id) === String(selectedUserId))) {
          setSelectedUserId('all');
        }
        setTotals(cached.totals || {});
        setChartRows(cached.chart || []);
        setTopVideos(cached.top_videos || []);
        if (hasDefaultVideoQuery()) {
          setVideoPagination(cached.video_pagination || {
            page: 1,
            page_size: 20,
            total: 0,
            total_pages: 1,
          });
        }
        setLoading(false);
        setError('');
      } else {
        setLoading(true);
        setError('');
      }
  
      try {
        const payload = await fetchDashboard({
          signal: controller.signal,
          ...params,
        });
        const nextUsers = payload.users || [];
        if (hasDefaultVideoQuery()) {
          setVideos(payload.videos || []);
        }
        setChannels(payload.channels || []);
        setUsers(nextUsers);
        if (selectedUserId !== 'all' && !nextUsers.some((u) => String(u.id) === String(selectedUserId))) {
          setSelectedUserId('all');
        }
        setTotals(payload.totals || {});
        setChartRows(payload.chart || []);
        setTopVideos(payload.top_videos || []);
        if (hasDefaultVideoQuery()) {
          setVideoPagination(payload.video_pagination || {
            page: 1,
            page_size: 20,
            total: 0,
            total_pages: 1,
          });
        }
        setCachedDashboard(params, payload);
        setCachedVideos({
          channelId: params.channelId,
          userId: params.userId,
          startDate: params.startDate,
          endDate: params.endDate,
          date: null,
          page: 1,
          pageSize: 20,
        }, {
          videos: payload.videos || [],
          video_pagination: payload.video_pagination || {
            page: 1,
            page_size: 20,
            total: payload.totals?.video_count || 0,
            total_pages: Math.max(1, Math.ceil((payload.totals?.video_count || 0) / 20)),
          },
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || t('dashboard.errorLoad') || 'Failed to load dashboard data');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
  
    setSelectedChartDate(null);
    setVideoPage(1);
    load();
  
    return () => controller.abort();
  }, [chartMetric, dailyMetric, endDate, selectedChannelId, selectedUserId, startDate, t]);
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedChannelId) params.set('channel', selectedChannelId); else params.delete('channel');
    if (selectedUserId !== 'all') params.set('user', selectedUserId); else params.delete('user');
    params.set('period', periodPreset);
    params.set('start_date', startDate);
    params.set('end_date', endDate);
    params.set('metric', dailyMetric);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }, [dailyMetric, endDate, periodPreset, selectedChannelId, selectedUserId, startDate]);
  
  useEffect(() => {
    if (!videoQueryReadyRef.current) {
      videoQueryReadyRef.current = true;
      return;
    }
    handlePageChange(1);
  }, [handlePageChange, videoSearch, videoSortBy, videoSortDirection]);
  
  useEffect(() => {
    if (periodPreset === 'custom') return;
    const range = dashboardPeriodRange(periodPreset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  }, [periodPreset]);
  
  useEffect(() => {
    if (!channels.length) return;
    setSelectedChannelId((current) => {
      const preferred = current || getStoredSelectedChannelId();
      const resolved = resolveSelectedChannelId(channels, preferred);
      if (resolved && resolved !== getStoredSelectedChannelId()) {
        setStoredSelectedChannelId(resolved);
      }
      return resolved;
    });
  }, [channels]);
  
  useEffect(() => {
    return subscribeSelectedChannel((event) => {
      const nextId = event?.detail ?? getStoredSelectedChannelId();
      if (!nextId) return;
      setSelectedChannelId((current) => {
        if (String(nextId) === String(current)) return current;
        if (channels.length && !channels.some((channel) => String(channel.id) === String(nextId))) return current;
        return String(nextId);
      });
    });
  }, [channels]);
  
  const chartData = useMemo(() => {
    if (chartMetric === 'date') {
      return chartRows.map((item) => {
        const rawDate = String(item.date || '').slice(0, 10);
        const dateObj = new Date(`${rawDate}T00:00:00`);
        const dateLabel = Number.isNaN(dateObj.getTime())
          ? rawDate
          : dateObj.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
        const fullDateLabel = Number.isNaN(dateObj.getTime())
          ? rawDate
          : dateObj.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  
        const metricField = dailyMetric === 'gmv' ? 'gross_gmv' : dailyMetric;
        const value = Number(item[metricField] || 0);
  
        return {
          ...item,
          rawDate,
          videoCount: Number(item.video_count || 0),
          views: Number(item.views || 0),
          likes: Number(item.likes || 0),
          comments: Number(item.comments || 0),
          shares: Number(item.shares || 0),
          gross_gmv: Number(item.gross_gmv || 0),
          orders: Number(item.orders || 0),
          name: dateLabel,
          fullName: fullDateLabel,
          value,
          isSelected: selectedChartDate === rawDate,
        };
      });
    }
  
    return chartRows.map((row, index) => {
      const title = String(row.title || `${t('dashboard.video')} ${index + 1}`);
      return {
        ...row,
        name: title.length > 14 ? `${title.slice(0, 14)}…` : title,
        fullName: title,
        value: Number(row[chartMetric] || 0),
        views: Number(row.views || 0),
        likes: Number(row.likes || 0),
        shares: Number(row.shares || 0),
        gross_gmv: Number(row.gross_gmv || 0),
        orders: Number(row.orders || 0),
      };
    });
  }, [chartMetric, chartRows, dailyMetric, locale, selectedChartDate, t]);
  
  const averageGmv = chartData.length
    ? chartData.reduce((sum, item) => sum + (Number(item.gross_gmv) || 0), 0) / chartData.length
    : 0;
  
  const averageViews = chartData.length
    ? chartData.reduce((sum, item) => sum + (Number(item.views) || 0), 0) / chartData.length
    : 0;
  
  const averageChartValue = chartData.length
    ? chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length
    : 0;
  
  const handleMetricChange = useCallback(
    (nextMetric) => {
      setDailyMetric(nextMetric);
      if (nextMetric !== 'gmv' && chartType === 'area') {
        setChartType('bar');
      }
    },
    [chartType],
  );
  
  const metricLabel = useMemo(() => {
    if (chartMetric === 'date') {
      if (dailyMetric === 'gmv') return t('dashboard.metric_gmv_daily');
      if (dailyMetric === 'orders') return t('dashboard.totalOrders');
      if (dailyMetric === 'video_count') return t('dashboard.metric_videos_daily');
      if (dailyMetric === 'likes') return t('dashboard.metric_likes');
      if (dailyMetric === 'shares') return t('dashboard.metric_shares');
      if (dailyMetric === 'comments') return t('dashboard.metric_comments');
      return t('dashboard.metric_views_daily');
    }
    return t(`dashboard.metric_${chartMetric}`);
  }, [chartMetric, dailyMetric, t]);
  
  const formatTopVideoMetric = useCallback((video) => {
    if (dailyMetric === 'gmv') {
      return formatGmvAmount(video.gross_gmv, totals.sales_currency);
    }
    if (dailyMetric === 'video_count') {
      return `1 ${t('dashboard.video').toLocaleLowerCase(locale)}`;
    }
    return `${formatNumber(video[dailyMetric])} ${metricLabel.toLocaleLowerCase(locale)}`;
  }, [dailyMetric, formatGmvAmount, formatNumber, locale, metricLabel, t, totals.sales_currency]);
  
  const yAxisFormatter = useCallback(
    (value) => {
      if (chartMetric === 'date' && dailyMetric === 'gmv') {
        return formatGmvAmount(value, totals.sales_currency, { compact: true });
      }
      return Intl.NumberFormat(locale, { notation: 'compact' }).format(value);
    },
    [chartMetric, dailyMetric, formatGmvAmount, locale, totals.sales_currency],
  );
  
  const handleChartClick = useCallback(
    (state, indexArg) => {
      let rawDate = state?.rawDate || state?.payload?.rawDate;
  
      if (!rawDate && state?.activePayload?.[0]?.payload?.rawDate) {
        rawDate = state.activePayload[0].payload.rawDate;
      }
  
      if (!rawDate) {
        const rawIndex = typeof indexArg === 'number' && indexArg >= 0
          ? indexArg
          : (state?.activeTooltipIndex ?? state?.activeIndex);
        if (rawIndex !== undefined && rawIndex !== null) {
          const numIndex = Number(rawIndex);
          if (!Number.isNaN(numIndex) && numIndex >= 0 && numIndex < chartData.length) {
            rawDate = chartData[numIndex]?.rawDate;
          }
        }
      }
  
      if (!rawDate && state?.activeLabel) {
        const matched = chartData.find(
          (item) => item.name === state.activeLabel || item.fullName === state.activeLabel,
        );
        if (matched) {
          rawDate = matched.rawDate;
        }
      }
  
      if (rawDate) {
        handleDateClick(rawDate);
      }
    },
    [chartData, handleDateClick],
  );
  

  return {
    averageChartValue,
    averageGmv,
    averageViews,
    channels,
    chartData,
    chartMetric,
    chartType,
    dailyMetric,
    endDate,
    error,
    formatGmvAmount,
    formatNumber,
    formatTopVideoMetric,
    handleChannelChange,
    handleChartClick,
    handleMetricChange,
    handlePageChange,
    loading,
    locale,
    metricLabel,
    periodPreset,
    selectedChannelId,
    selectedChartDate,
    selectedUserId,
    setChartType,
    setEndDate,
    setPeriodPreset,
    setSelectedUserId,
    setStartDate,
    setVideoSearch,
    setVideoSortBy,
    setVideoSortDirection,
    startDate,
    t,
    topVideos,
    totals,
    users,
    videoPage,
    videoPagination,
    videoSearch,
    videoSortBy,
    videoSortDirection,
    videos,
    videosLoading,
    yAxisFormatter,
  };
};
