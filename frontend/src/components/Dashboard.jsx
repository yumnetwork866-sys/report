import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AreaChart as AreaChartIcon,
  BarChart2,
  Calendar,
  Minus,
  TrendingDown,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
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
const dateInputValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const dashboardPeriodRange = (preset) => {
  const end = new Date();
  const start = new Date(end);
  const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30;
  start.setDate(end.getDate() - (days - 1));
  return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
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
        <TrendingUp size={13} aria-hidden="true" />
      ) : isNegative ? (
        <TrendingDown size={13} aria-hidden="true" />
      ) : (
        <Minus size={13} aria-hidden="true" />
      )}
      <span>{formatted}</span>
      <span className="stat-card__growth-label">{label}</span>
    </div>
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
        <span>{t('dashboard.totalLikes')}</span>
        <b>{formatNumber(item.likes)}</b>
      </div>
      <div>
        <span>{t('dashboard.totalShares')}</span>
        <b>{formatNumber(item.shares)}</b>
      </div>
      {item.top_video ? (
        <div className="dashboard-chart-tooltip__peak">
          <span className="dashboard-chart-tooltip__peak-title">{t('dashboard.peakVideo')}:</span>
          <div className="dashboard-chart-tooltip__peak-name">{item.top_video.title}</div>
          <div className="dashboard-chart-tooltip__peak-stats">
            {formatNumber(item.top_video.views)} {t('dashboard.views')} • {formatGmvAmount(item.top_video.gross_gmv || 0, currency)}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const Dashboard = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const { formatMoney } = useMoneyFormatter(locale);

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
    sales_currency: 'MYR',
    engagement_rate: 0,
    previous_period: null,
    growth: null,
  });
  const [chartRows, setChartRows] = useState([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoPagination, setVideoPagination] = useState({
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 1,
  });
  const [selectedChannelId, setSelectedChannelId] = useState(() => getStoredSelectedChannelId() || '');
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [chartMetric, setChartMetric] = useState('date');
  const [dailyMetric, setDailyMetric] = useState('views');
  const [chartType, setChartType] = useState('area');
  const [selectedChartDate, setSelectedChartDate] = useState(null);

  const [periodPreset, setPeriodPreset] = useState('30d');
  const initialPeriod = dashboardPeriodRange('30d');
  const [startDate, setStartDate] = useState(initialPeriod.startDate);
  const [endDate, setEndDate] = useState(initialPeriod.endDate);

  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChannelChange = (nextChannelId) => {
    const id = String(nextChannelId || '');
    setStoredSelectedChannelId(id);
    setSelectedChannelId(id);
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
      };

      const cached = getCachedVideos(videoParams);
      if (cached) {
        setVideos(cached.videos || []);
        setVideoPagination(cached.video_pagination || {
          page: nextPage,
          page_size: 20,
          total: videoPagination.total,
          total_pages: videoPagination.total_pages,
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
    [chartMetric, endDate, selectedChannelId, selectedChartDate, selectedUserId, startDate, videoPagination.total, videoPagination.total_pages],
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
    [chartMetric, endDate, selectedChannelId, selectedChartDate, selectedUserId, startDate],
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
        page: 1,
        pageSize: 20,
      };

      const cached = getCachedDashboard(params);
      if (cached) {
        setVideos(cached.videos || []);
        setChannels(cached.channels || []);
        setUsers(cached.users || []);
        setTotals(cached.totals || {});
        setChartRows(cached.chart || []);
        setVideoPagination(cached.video_pagination || {
          page: 1,
          page_size: 20,
          total: 0,
          total_pages: 1,
        });
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
        setVideos(payload.videos || []);
        setChannels(payload.channels || []);
        setUsers(payload.users || []);
        setTotals(payload.totals || {});
        setChartRows(payload.chart || []);
        setVideoPagination(payload.video_pagination || {
          page: 1,
          page_size: 20,
          total: 0,
          total_pages: 1,
        });
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
  }, [chartMetric, endDate, selectedChannelId, selectedUserId, startDate, t]);

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

        let value = Number(item.views || 0);
        if (dailyMetric === 'gmv') {
          value = Number(item.gross_gmv || 0);
        } else if (dailyMetric === 'video_count') {
          value = Number(item.video_count || 0);
        }

        return {
          ...item,
          rawDate,
          videoCount: Number(item.video_count || 0),
          views: Number(item.views || 0),
          likes: Number(item.likes || 0),
          shares: Number(item.shares || 0),
          gross_gmv: Number(item.gross_gmv || 0),
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
      };
    });
  }, [chartMetric, chartRows, dailyMetric, locale, selectedChartDate, t]);

  const peakItem = useMemo(() => {
    if (!chartData.length || chartMetric !== 'date') return null;
    let max = chartData[0];
    for (let i = 1; i < chartData.length; i += 1) {
      if ((chartData[i]?.value || 0) > (max?.value || 0)) {
        max = chartData[i];
      }
    }
    return max && max.value > 0 ? max : null;
  }, [chartData, chartMetric]);

  const averageChartValue = chartData.length
    ? chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length
    : 0;

  const metricLabel = useMemo(() => {
    if (chartMetric === 'date') {
      if (dailyMetric === 'gmv') return t('dashboard.metric_gmv_daily');
      if (dailyMetric === 'video_count') return t('dashboard.metric_videos_daily');
      return t('dashboard.metric_views_daily');
    }
    return t(`dashboard.metric_${chartMetric}`);
  }, [chartMetric, dailyMetric, t]);

  const yAxisFormatter = useCallback(
    (value) => {
      if (chartMetric === 'date' && dailyMetric === 'gmv') {
        return formatGmvAmount(value, totals.sales_currency, { compact: true });
      }
      return Intl.NumberFormat(locale, { notation: 'compact' }).format(value);
    },
    [chartMetric, dailyMetric, formatGmvAmount, locale, totals.sales_currency],
  );

  const handleChartClick = (state) => {
    const rawDate = state?.activePayload?.[0]?.payload?.rawDate;
    if (rawDate) {
      handleDateClick(rawDate);
    }
  };

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
        <article className="stat-card stat-card--soft">
          <p className="stat-card__label">{t('dashboard.totalShares')}</p>
          <p className="stat-card__value">{loading ? '—' : formatNumber(totals.shares)}</p>
          <GrowthBadge value={totals.growth?.shares} label={t('dashboard.vsPreviousPeriod')} />
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
              <label htmlFor="dashboard-metric">{t('dashboard.metric')}</label>
              <select id="dashboard-metric" value={chartMetric} onChange={(event) => setChartMetric(event.target.value)}>
                {['date', 'views', 'gmv', 'likes', 'shares'].map((metric) => (
                  <option key={metric} value={metric}>{t(`dashboard.metric_${metric}`)}</option>
                ))}
              </select>
            </div>
            {chartMetric === 'date' ? (
              <div className="field dashboard-period-filter">
                <label htmlFor="dashboard-period">{t('dashboard.period')}</label>
                <select id="dashboard-period" value={periodPreset} onChange={(event) => setPeriodPreset(event.target.value)}>
                  <option value="7d">{t('dashboard.period_7d')}</option>
                  <option value="30d">{t('dashboard.period_30d')}</option>
                  <option value="90d">{t('dashboard.period_90d')}</option>
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
          <div className="dashboard-chart-header-actions" style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="dashboard-chart-toggle-group" role="group" aria-label={t('dashboard.metric')}>
              <button
                type="button"
                className={`dashboard-toggle-btn ${dailyMetric === 'views' ? 'dashboard-toggle-btn--active' : ''}`}
                onClick={() => setDailyMetric('views')}
              >
                {t('dashboard.metric_views_daily')}
              </button>
              <button
                type="button"
                className={`dashboard-toggle-btn ${dailyMetric === 'gmv' ? 'dashboard-toggle-btn--active' : ''}`}
                onClick={() => setDailyMetric('gmv')}
              >
                {t('dashboard.metric_gmv_daily')}
              </button>
              <button
                type="button"
                className={`dashboard-toggle-btn ${dailyMetric === 'video_count' ? 'dashboard-toggle-btn--active' : ''}`}
                onClick={() => setDailyMetric('video_count')}
              >
                {t('dashboard.metric_videos_daily')}
              </button>
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

        {peakItem ? (
          <div className="dashboard-peak-banner">
            <div className="dashboard-peak-banner__content">
              <span className="dashboard-peak-banner__badge">
                {t('dashboard.topPeakVideo')}: <strong>{peakItem.fullName}</strong>
              </span>
              <span className="dashboard-peak-banner__stat">
                {metricLabel}: <strong>{dailyMetric === 'gmv' ? formatGmvAmount(peakItem.value, totals.sales_currency) : formatNumber(peakItem.value)}</strong>
              </span>
              {peakItem.top_video?.title ? (
                <span className="dashboard-peak-banner__video" title={peakItem.top_video.title}>
                  🎬 {peakItem.top_video.title}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className={`dashboard-peak-banner__btn ${selectedChartDate === peakItem.rawDate ? 'dashboard-peak-banner__btn--active' : ''}`}
              onClick={() => handleDateClick(peakItem.rawDate)}
            >
              {selectedChartDate === peakItem.rawDate ? t('dashboard.filteringThisDate') : t('dashboard.viewPeakVideos')}
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="empty-state"><div className="loading-dot" />{t('dashboard.loading')}</div>
        ) : chartData.length ? (
          <div className="dashboard-chart-shell">
            <div className="dashboard-chart-summary" aria-hidden="true">
              <span><i className="dashboard-chart-summary__dot" />{t('dashboard.resultsShown')} <strong>{chartData.length}</strong></span>
              <span>{t('dashboard.averageMetric', { metric: metricLabel })} <strong>{dailyMetric === 'gmv' ? formatGmvAmount(Math.round(averageChartValue), totals.sales_currency) : formatNumber(Math.round(averageChartValue))}</strong></span>
            </div>
            <div className="dashboard-chart" role="img" aria-label={t('dashboard.videoPerformance')}>
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'area' && chartMetric === 'date' ? (
                  <AreaChart data={chartData} margin={{ top: 26, right: 16, bottom: 4, left: 4 }} onClick={handleChartClick}>
                    <defs>
                      <linearGradient id="dashboardAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary, #0ea5e9)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-primary, #0ea5e9)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--color-border)" />
                    <XAxis dataKey="name" height={40} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={false} tick={chartTick} />
                    <YAxis width={68} tickLine={false} axisLine={false} tick={chartTick} tickFormatter={yAxisFormatter} />
                    <Tooltip cursor={{ stroke: 'var(--color-primary)', strokeWidth: 1.5, strokeDasharray: '4 4' }} content={<DashboardChartTooltip formatNumber={formatNumber} formatGmvAmount={formatGmvAmount} metric={chartMetric} dailyMetric={dailyMetric} currency={totals.sales_currency} t={t} />} />
                    <Area type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2.5} fillOpacity={1} fill="url(#dashboardAreaGradient)" activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2, fill: 'var(--color-primary)' }} />
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} barSize={26} margin={{ top: 26, right: 12, bottom: 4, left: 4 }} onClick={handleChartClick}>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--color-border)" />
                    <XAxis dataKey="name" height={40} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={false} tick={chartTick} />
                    <YAxis width={68} tickLine={false} axisLine={false} tick={chartTick} tickFormatter={yAxisFormatter} />
                    <Tooltip cursor={{ fill: 'var(--color-accent-soft)' }} content={<DashboardChartTooltip formatNumber={formatNumber} formatGmvAmount={formatGmvAmount} metric={chartMetric} dailyMetric={dailyMetric} currency={totals.sales_currency} t={t} />} />
                    <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]}>
                      <LabelList dataKey="value" position="top" formatter={(val) => yAxisFormatter(val)} className="dashboard-chart-label" />
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="empty-state">{t('dashboard.noVideoData')}</div>
        )}
      </section>

      {selectedChartDate ? (
        <div className="dashboard-active-filter-bar">
          <div className="dashboard-active-filter-bar__content">
            <Calendar size={16} color="#0284c7" />
            <span className="dashboard-active-filter-bar__badge">
              {t('dashboard.filteringByDate', { date: selectedChartDate })}
            </span>
            <span className="dashboard-active-filter-bar__count">
              ({videoPagination.total} {t('dashboard.video')})
            </span>
          </div>
          <button
            type="button"
            className="dashboard-active-filter-bar__clear"
            onClick={() => handleDateClick(null)}
          >
            <X size={14} aria-hidden="true" /> {t('dashboard.clearDateFilter')}
          </button>
        </div>
      ) : null}

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
      />
    </div>
  );
};

export default Dashboard;
