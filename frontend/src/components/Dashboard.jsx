import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AreaChart as AreaChartIcon,
  BarChart2,
  CircleDollarSign,
  Eye,
  Heart,
  MessageCircle,
  Minus,
  Share2,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  UserRound,
  UsersRound,
  Video,
} from 'lucide-react';
import { fetchDashboard, fetchDashboardVideos } from '../lib/api';
import {
  getCachedDashboard,
  getCachedVideos,
  setCachedDashboard,
  setCachedVideos,
} from '../lib/dashboardCache';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import VideoTable, { ChannelPicker } from './VideoTable';
import DatePickerInput from './DatePickerInput';
import {
  getStoredSelectedChannelId,
  resolveSelectedChannelId,
  setStoredSelectedChannelId,
  subscribeSelectedChannel,
} from '../lib/channelSelection';

const chartTick = { fill: 'var(--color-muted)', fontSize: 12 };
const compactVideoTitle = (value, maxLength = 40) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};
const dateInputValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const dashboardPeriodRange = (preset) => {
  const end = new Date();
  const start = new Date(end);
  if (preset === 'today') return { startDate: dateInputValue(end), endDate: dateInputValue(end) };
  if (preset === 'yesterday') {
    start.setDate(end.getDate() - 1);
    return { startDate: dateInputValue(start), endDate: dateInputValue(start) };
  }
  if (preset === 'this_week') {
    const day = end.getDay() || 7;
    start.setDate(end.getDate() - day + 1);
  } else if (preset === 'this_month') {
    start.setDate(1);
  } else if (preset === 'last_month') {
    start.setMonth(end.getMonth() - 1, 1);
    end.setDate(0);
  } else {
    const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30;
    start.setDate(end.getDate() - (days - 1));
  }
  return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
};

const dashboardInitialFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const allowedPeriods = new Set(['today', 'yesterday', 'this_week', 'this_month', 'last_month', '7d', '30d', '90d', 'custom']);
  const period = allowedPeriods.has(params.get('period')) ? params.get('period') : '30d';
  const fallback = dashboardPeriodRange(period === 'custom' ? '30d' : period);
  return {
    channelId: params.get('channel') || '',
    userId: params.get('user') || 'all',
    period,
    startDate: params.get('start_date') || fallback.startDate,
    endDate: params.get('end_date') || fallback.endDate,
    metric: dailyMetricOptions.some((item) => item.value === params.get('metric')) ? params.get('metric') : 'gmv',
  };
};

const UserAvatar = ({ user, className, fallbackClassName }) => {
  const avatarSeed = String(user?.id || user?.email || user?.name || 'user');
  const generatedAvatarUrl = `https://api.dicebear.com/10.x/pixel-art/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=e6f7f5`;
  const sources = [...new Set([user?.avatar_url, generatedAvatarUrl].filter(Boolean))];
  const sourceKey = sources.join('|');
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => setSourceIndex(0), [sourceKey]);

  if (!sources[sourceIndex]) {
    return <span className={`${className} ${fallbackClassName}`} aria-hidden="true"><UserRound size={16} /></span>;
  }

  return (
    <img
      className={className}
      src={sources[sourceIndex]}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSourceIndex((current) => current + 1)}
    />
  );
};

const UserPicker = ({ id, users, value, onChange, allLabel, disabled }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedUser = users.find((user) => String(user.id) === String(value)) || null;
  const isAll = value === 'all';

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="channel-picker dashboard-user-picker" ref={rootRef}>
      <button
        id={id}
        className="channel-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-picker__current">
          {isAll ? (
            <span className="channel-picker__avatar channel-picker__avatar--empty" aria-hidden="true"><UsersRound size={16} /></span>
          ) : (
            <UserAvatar
              user={selectedUser}
              className="channel-picker__avatar"
              fallbackClassName="channel-picker__avatar--empty"
            />
          )}
          <span className="channel-picker__label">{isAll ? allLabel : selectedUser?.name || selectedUser?.email}</span>
        </span>
        <span className={`sidebar__chevron channel-picker__chevron ${open ? 'sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="channel-picker__menu" role="listbox">
          <button
            className={`channel-picker__option ${isAll ? 'channel-picker__option--active' : ''}`}
            type="button"
            role="option"
            aria-selected={isAll}
            onClick={() => { onChange('all'); setOpen(false); }}
          >
            <span className="channel-picker__option-avatar channel-picker__option-avatar--empty" aria-hidden="true"><UsersRound size={16} /></span>
            <span className="channel-picker__option-meta"><span className="channel-picker__option-title">{allLabel}</span></span>
          </button>
          {users.map((user) => {
            const active = String(user.id) === String(value);
            return (
              <button
                className={`channel-picker__option ${active ? 'channel-picker__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={active}
                key={user.id}
                onClick={() => { onChange(String(user.id)); setOpen(false); }}
              >
                <UserAvatar
                  user={user}
                  className="channel-picker__option-avatar"
                  fallbackClassName="channel-picker__option-avatar--empty"
                />
                <span className="channel-picker__option-meta">
                  <span className="channel-picker__option-title">{user.name || user.email}</span>
                  {user.email ? <span className="channel-picker__option-subtitle">{user.email}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const dailyMetricOptions = [
  { value: 'gmv', labelKey: 'dashboard.metric_gmv_daily', Icon: CircleDollarSign },
  { value: 'views', labelKey: 'dashboard.metric_views_daily', Icon: Eye },
  { value: 'orders', labelKey: 'dashboard.totalOrders', Icon: ShoppingBag },
  { value: 'likes', labelKey: 'dashboard.metric_likes', Icon: Heart },
  { value: 'shares', labelKey: 'dashboard.metric_shares', Icon: Share2 },
  { value: 'comments', labelKey: 'dashboard.metric_comments', Icon: MessageCircle },
  { value: 'video_count', labelKey: 'dashboard.metric_videos_daily', Icon: Video },
];

const MetricPicker = ({ id, value, onChange, t }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption = dailyMetricOptions.find((option) => option.value === value) || dailyMetricOptions[0];
  const SelectedIcon = selectedOption.Icon;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="channel-picker dashboard-metric-picker" ref={rootRef}>
      <button
        id={id}
        className="channel-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-picker__current">
          <SelectedIcon className="dashboard-metric-picker__icon" size={18} aria-hidden="true" />
          <span className="channel-picker__label">{t(selectedOption.labelKey)}</span>
        </span>
        <span className={`sidebar__chevron channel-picker__chevron ${open ? 'sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="channel-picker__menu" role="listbox">
          {dailyMetricOptions.map(({ value: optionValue, labelKey, Icon }) => {
            const active = optionValue === value;
            return (
              <button
                className={`channel-picker__option ${active ? 'channel-picker__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={active}
                key={optionValue}
                onClick={() => { onChange(optionValue); setOpen(false); }}
              >
                <Icon className="dashboard-metric-picker__icon" size={18} aria-hidden="true" />
                <span className="channel-picker__option-meta">
                  <span className="channel-picker__option-title">{t(labelKey)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const GrowthBadge = ({ value, label }) => {
  if (value === null || value === undefined) return null;
  const isPositive = value > 0;
  const isNegative = value < 0;
  const formatted = `${isPositive ? '+' : ''}${value.toFixed(1)}%`;

  return (
    <div
      className={`stat-card__growth ${
        isPositive
          ? 'stat-card__growth--positive'
          : isNegative
            ? 'stat-card__growth--negative'
            : 'stat-card__growth--neutral'
      }`}
      title={`${formatted} ${label}`}
    >
      {isPositive ? (
        <TrendingUp size={11} aria-hidden="true" />
      ) : isNegative ? (
        <TrendingDown size={11} aria-hidden="true" />
      ) : (
        <Minus size={11} aria-hidden="true" />
      )}
      <span>{formatted}</span>
      <span className="stat-card__growth-label">{label}</span>
    </div>
  );
};

const DashboardBarLabel = ({ x, y, width, value, index, total, formatter }) => {
  const numericValue = Number(value || 0);
  if (!numericValue) return null;
  const step = total > 60 ? 7 : total > 40 ? 5 : total > 28 ? 4 : total > 18 ? 3 : total > 10 ? 2 : 1;
  if (Number(index || 0) % step !== 0) return null;
  return (
    <text
      className="dashboard-chart-label"
      x={Number(x || 0) + Number(width || 0) / 2}
      y={Number(y || 0) - 7}
      textAnchor="middle"
    >
      {formatter(numericValue)}
    </text>
  );
};

const DashboardChartTooltip = ({ active, payload, formatNumber, formatGmvAmount, metric, currency, t }) => {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="dashboard-chart-tooltip">
      <strong>{item.fullName}</strong>
      {metric === 'date' ? (
        <div>
          <span>{t('dashboard.totalVideos')}</span>
          <b>{formatNumber(item.videoCount)}</b>
        </div>
      ) : null}
      <div>
        <span>{t('dashboard.views')}</span>
        <b>{formatNumber(item.views)}</b>
      </div>
      <div>
        <span>{t('dashboard.totalGmv')}</span>
        <b>{formatGmvAmount(item.gross_gmv || 0, currency)}</b>
      </div>
      <div>
        <span>{t('dashboard.totalOrders')}</span>
        <b>{formatNumber(item.orders || 0)}</b>
      </div>
      <div>
        <span>{t('dashboard.totalLikes')}</span>
        <b>{formatNumber(item.likes)}</b>
      </div>
      <div>
        <span>{t('dashboard.totalShares')}</span>
        <b>{formatNumber(item.shares)}</b>
      </div>
      <div>
        <span>{t('dashboard.totalComments')}</span>
        <b>{formatNumber(item.comments)}</b>
      </div>
    </div>
  );
};

const Dashboard = () => {
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

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero__summary" aria-live="polite">
        <article className="stat-card stat-card--soft">
          <p className="stat-card__label">{t('dashboard.totalGmv')}</p>
          <p className="stat-card__value" title={loading ? undefined : formatGmvAmount(totals.gross_gmv, totals.sales_currency)}>
            {loading ? '—' : formatGmvAmount(totals.gross_gmv, totals.sales_currency)}
          </p>
          <GrowthBadge value={totals.growth?.gross_gmv} label={t('dashboard.vsPreviousPeriod')} />
        </article>
        <article className="stat-card stat-card--soft">
          <p className="stat-card__label">{t('dashboard.totalOrders')}</p>
          <p className="stat-card__value" title={loading ? undefined : formatNumber(totals.orders)}>
            {loading ? '—' : formatNumber(totals.orders)}
          </p>
          <GrowthBadge value={totals.growth?.orders} label={t('dashboard.vsPreviousPeriod')} />
        </article>
        <article className="stat-card stat-card--soft">
          <p className="stat-card__label" title={t('dashboard.aovFormula')}>{t('dashboard.aov')}</p>
          <p className="stat-card__value" title={loading ? undefined : formatGmvAmount(totals.aov, totals.sales_currency)}>
            {loading ? '—' : formatGmvAmount(totals.aov, totals.sales_currency)}
          </p>
          <GrowthBadge value={totals.growth?.aov} label={t('dashboard.vsPreviousPeriod')} />
        </article>
        <article className="stat-card stat-card--soft">
          <p className="stat-card__label" title={t('dashboard.rpmFormula')}>{t('dashboard.rpm')}</p>
          <p className="stat-card__value" title={loading ? undefined : formatGmvAmount(totals.rpm, totals.sales_currency)}>
            {loading ? '—' : formatGmvAmount(totals.rpm, totals.sales_currency)}
          </p>
          <GrowthBadge value={totals.growth?.rpm} label={t('dashboard.vsPreviousPeriod')} />
        </article>
        <article className="stat-card stat-card--soft">
          <p className="stat-card__label">{t('dashboard.totalViews')}</p>
          <p className="stat-card__value" title={loading ? undefined : formatNumber(totals.views)}>
            {loading ? '—' : formatNumber(totals.views)}
          </p>
          <GrowthBadge value={totals.growth?.views} label={t('dashboard.vsPreviousPeriod')} />
        </article>
        <article className="stat-card stat-card--soft">
          <p className="stat-card__label" title={t('dashboard.engagementFormula')}>{t('dashboard.engagementRate')}</p>
          <p className="stat-card__value" title={loading ? undefined : `${Number(totals.engagement_rate || 0).toFixed(2)}%`}>
            {loading ? '—' : `${Number(totals.engagement_rate || 0).toFixed(2)}%`}
          </p>
          <GrowthBadge value={totals.growth?.engagement_rate} label={t('dashboard.vsPreviousPeriod')} />
        </article>
        <article className="stat-card stat-card--soft">
          <p className="stat-card__label">{t('dashboard.totalVideos')}</p>
          <p className="stat-card__value">{loading ? '—' : formatNumber(totals.video_count)}</p>
          <GrowthBadge value={totals.growth?.video_count} label={t('dashboard.vsPreviousPeriod')} />
        </article>
        <article className="stat-card stat-card--soft">
          <p className="stat-card__label">{t('dashboard.totalLikes')}</p>
          <p className="stat-card__value">{loading ? '—' : formatNumber(totals.likes)}</p>
          <GrowthBadge value={totals.growth?.likes} label={t('dashboard.vsPreviousPeriod')} />
        </article>
      </section>

      {error ? (
        <section className="section-card dashboard-alert">
          <div className="dashboard-alert__title">{t('dashboard.errorLoad') || 'Không tải được dashboard.'}</div>
          <div className="dashboard-alert__body">{error}</div>
        </section>
      ) : null}

      <section className="section-card dashboard-chart-card">
        <div className="section-card__header dashboard-chart-card__header">
          <div className={`dashboard-chart-filters${chartMetric === 'date' ? ` dashboard-chart-filters--date${periodPreset === 'custom' ? ' dashboard-chart-filters--custom' : ''}` : ''}`}>
            <div className="field dashboard-channel-filter">
              <label htmlFor="dashboard-channel">{t('dashboard.channel')}</label>
              <ChannelPicker
                id="dashboard-channel"
                channels={channels}
                value={selectedChannelId}
                onChange={handleChannelChange}
                disabled={loading}
              />
            </div>
            <div className="field dashboard-user-filter">
              <label htmlFor="dashboard-user">{t('dashboard.user')}</label>
              <UserPicker
                id="dashboard-user"
                users={users}
                value={selectedUserId}
                onChange={setSelectedUserId}
                allLabel={t('dashboard.allUsers')}
                disabled={loading && !users.length}
              />
            </div>
            <div className="field dashboard-metric-filter">
              <label htmlFor="dashboard-daily-metric">{t('dashboard.metric')}</label>
              <MetricPicker
                id="dashboard-daily-metric"
                value={dailyMetric}
                onChange={handleMetricChange}
                t={t}
              />
            </div>
            {chartMetric === 'date' ? (
              <div className="field dashboard-period-filter">
                <label htmlFor="dashboard-period">{t('dashboard.period')}</label>
                <select id="dashboard-period" value={periodPreset} onChange={(event) => setPeriodPreset(event.target.value)}>
                  <option value="7d">{t('dashboard.period_7d')}</option>
                  <option value="30d">{t('dashboard.period_30d')}</option>
                  <option value="90d">{t('dashboard.period_90d')}</option>
                  <option value="today">{t('dashboard.period_today')}</option>
                  <option value="yesterday">{t('dashboard.period_yesterday')}</option>
                  <option value="this_week">{t('dashboard.period_this_week')}</option>
                  <option value="this_month">{t('dashboard.period_this_month')}</option>
                  <option value="last_month">{t('dashboard.period_last_month')}</option>
                  <option value="custom">{t('dashboard.period_custom')}</option>
                </select>
              </div>
            ) : null}
            {chartMetric === 'date' && periodPreset === 'custom' ? (
              <>
                <div className="field dashboard-date-filter">
                  <label htmlFor="dashboard-start-date">{t('dashboard.startDate')}</label>
                  <DatePickerInput
                    id="dashboard-start-date"
                    label={t('dashboard.startDate')}
                    value={startDate}
                    max={endDate || dateInputValue(new Date())}
                    onChange={setStartDate}
                  />
                </div>
                <div className="field dashboard-date-filter">
                  <label htmlFor="dashboard-end-date">{t('dashboard.endDate')}</label>
                  <DatePickerInput
                    id="dashboard-end-date"
                    label={t('dashboard.endDate')}
                    value={endDate}
                    min={startDate || undefined}
                    max={dateInputValue(new Date())}
                    onChange={setEndDate}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        {chartMetric === 'date' ? (
          <div className="dashboard-chart-header-actions dashboard-chart-header-actions--end">
            <div className="dashboard-sync-status">
              {totals.last_synced_at ? t('dashboard.lastSynced', { time: new Date(totals.last_synced_at).toLocaleString(locale) }) : t('dashboard.notSynced')}
            </div>
            <div className="dashboard-chart-toggle-group" role="group" aria-label={t('dashboard.chartType')}>
              <button
                type="button"
                className={`dashboard-toggle-btn ${chartType === 'area' ? 'dashboard-toggle-btn--active' : ''}`}
                onClick={() => setChartType('area')}
                title={t('dashboard.chartType_area')}
              >
                <AreaChartIcon size={15} />
                <span>{t('dashboard.chartType_area')}</span>
              </button>
              <button
                type="button"
                className={`dashboard-toggle-btn ${chartType === 'bar' ? 'dashboard-toggle-btn--active' : ''}`}
                onClick={() => setChartType('bar')}
                title={t('dashboard.chartType_bar')}
              >
                <BarChart2 size={15} />
                <span>{t('dashboard.chartType_bar')}</span>
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="empty-state"><div className="loading-dot" />{t('dashboard.loading')}</div>
        ) : chartData.length ? (
          <div className="dashboard-analytics-grid">
          <div className="dashboard-chart-shell">
            <div className="dashboard-chart-summary" aria-hidden="true">
              <span><i className="dashboard-chart-summary__dot" />{t('dashboard.resultsShown')} <strong>{chartData.length}</strong></span>
              <span>
                {chartType === 'area' ? (
                  <>
                    <span>{t('dashboard.totalGmv')} <strong>{formatGmvAmount(Math.round(averageGmv), totals.sales_currency)}</strong></span>
                    {' · '}
                    <span>{t('dashboard.totalViews')} <strong>{formatNumber(Math.round(averageViews))}</strong></span>
                  </>
                ) : (
                  <>
                    {t('dashboard.averageMetric', { metric: metricLabel })}
                    {' '}
                    <strong>
                      {dailyMetric === 'gmv'
                        ? formatGmvAmount(Math.round(averageChartValue), totals.sales_currency)
                        : formatNumber(Math.round(averageChartValue))}
                    </strong>
                  </>
                )}
              </span>
            </div>
            <div className="dashboard-chart" role="img" aria-label={t('dashboard.videoPerformance')}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 26, right: chartType === 'area' ? 12 : 16, bottom: 4, left: 4 }} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                  <defs>
                    <linearGradient id="dashboardAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary, #0ea5e9)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-primary, #0ea5e9)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="name" height={40} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={false} tick={chartTick} />
                  {chartType === 'area' ? (
                    <>
                      <YAxis
                        yAxisId="gmv"
                        width={72}
                        tickLine={false}
                        axisLine={false}
                        tick={chartTick}
                        tickFormatter={(value) => formatGmvAmount(value, totals.sales_currency, { compact: true })}
                      />
                      <YAxis
                        yAxisId="views"
                        orientation="right"
                        width={58}
                        tickLine={false}
                        axisLine={false}
                        tick={chartTick}
                        tickFormatter={(value) => Intl.NumberFormat(locale, { notation: 'compact' }).format(value)}
                      />
                    </>
                  ) : (
                    <YAxis width={68} tickLine={false} axisLine={false} tick={chartTick} tickFormatter={yAxisFormatter} />
                  )}
                  <Tooltip cursor={{ stroke: 'var(--color-primary)', strokeWidth: 1.5, strokeDasharray: '4 4' }} content={<DashboardChartTooltip formatNumber={formatNumber} formatGmvAmount={formatGmvAmount} metric={chartMetric} dailyMetric={dailyMetric} currency={totals.sales_currency} t={t} />} />
                  <Legend
                    verticalAlign="top"
                    align="center"
                    height={34}
                    iconType="circle"
                    iconSize={8}
                  />
                  {chartType === 'area' ? (
                    <>
                      <Line
                        yAxisId="gmv"
                        name={t('dashboard.totalGmv')}
                        type="monotone"
                        dataKey="gross_gmv"
                        stroke="#f97316"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        yAxisId="views"
                        name={t('dashboard.totalViews')}
                        type="monotone"
                        dataKey="views"
                        stroke="var(--color-primary, #0ea5e9)"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                    </>
                  ) : (
                    <Bar name={metricLabel} dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]} barSize={26}>
                      {chartData.map((entry) => <Cell key={`bar-cell-${entry.rawDate}`} fillOpacity={selectedChartDate && selectedChartDate !== entry.rawDate ? 0.45 : 1} />)}
                      <LabelList
                        dataKey="value"
                        content={<DashboardBarLabel total={chartData.length} formatter={yAxisFormatter} />}
                      />
                    </Bar>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <aside className="dashboard-insights">
            <section className="dashboard-insight-card">
              <h3>{t('dashboard.topVideosByMetric', { metric: metricLabel })}</h3>
              <div className="dashboard-top-videos">
                {topVideos.map((video, index) => (
                  <a className="dashboard-top-video" href={video.video_url || '#videos'} target={video.video_url ? '_blank' : undefined} rel="noreferrer" key={video.id}>
                    <span className="dashboard-top-video__rank">{index + 1}</span>
                    {video.thumbnail_url ? <img src={video.thumbnail_url} alt="" loading="lazy" /> : <span className="dashboard-top-video__placeholder"><Video size={15} /></span>}
                    <span className="dashboard-top-video__meta">
                      <strong>{compactVideoTitle(video.title, 32) || t('dashboard.video')}</strong>
                      <small>{formatTopVideoMetric(video)}</small>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          </aside>
          </div>
        ) : (
          <div className="empty-state">{t('dashboard.noVideoData')}</div>
        )}
      </section>



      <VideoTable
        embedded
        data={{
          videos,
          channels,
          loading: videosLoading || (loading && !videos.length),
          error,
        }}
        selectedChannelId={selectedChannelId}
        onSelectedChannelChange={handleChannelChange}
        pagination={videoPagination}
        currentPage={videoPage}
        onPageChange={handlePageChange}
        searchValue={videoSearch}
        onSearchChange={setVideoSearch}
        sortBy={videoSortBy}
        sortDirection={videoSortDirection}
        onSortChange={(nextSortBy, nextDirection) => {
          setVideoSortBy(nextSortBy);
          setVideoSortDirection(nextDirection);
        }}
      />
    </div>
  );
};

export default Dashboard;
