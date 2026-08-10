import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { UserRound, UsersRound } from 'lucide-react';
import { fetchDashboard } from '../lib/api';
import { useI18n } from '../lib/language';
import VideoTable, { ChannelPicker } from './VideoTable';
import DatePickerInput from './DatePickerInput';

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

const DashboardChartTooltip = ({ active, payload, formatNumber, metric, t }) => {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="dashboard-chart-tooltip">
      <strong>{item.fullName}</strong>
      {metric === 'date' ? <div><span>{t('dashboard.totalVideos')}</span><b>{formatNumber(item.videoCount)}</b></div> : null}
      <div><span>{t('dashboard.views')}</span><b>{formatNumber(item.views)}</b></div>
      <div><span>{t('dashboard.totalLikes')}</span><b>{formatNumber(item.likes)}</b></div>
      <div><span>{t('dashboard.totalShares')}</span><b>{formatNumber(item.shares)}</b></div>
    </div>
  );
};

const Dashboard = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const [videos, setVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [users, setUsers] = useState([]);
  const [totals, setTotals] = useState({
    video_count: 0,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
  });
  const [chartRows, setChartRows] = useState([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoPagination, setVideoPagination] = useState({
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 1,
  });
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [chartMetric, setChartMetric] = useState('views');
  const [periodPreset, setPeriodPreset] = useState('30d');
  const initialPeriod = dashboardPeriodRange('30d');
  const [startDate, setStartDate] = useState(initialPeriod.startDate);
  const [endDate, setEndDate] = useState(initialPeriod.endDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatNumber = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      if (chartMetric === 'date'
        && (!startDate || !endDate || startDate > endDate)) {
        setLoading(false);
        setError(t('dashboard.invalidPeriod'));
        return;
      }
      try {
        setLoading(true);
        setError('');
        const payload = await fetchDashboard({
          signal: controller.signal,
          channelId: selectedChannelId || null,
          userId: selectedUserId === 'all' ? null : selectedUserId,
          startDate: chartMetric === 'date' ? startDate : null,
          endDate: chartMetric === 'date' ? endDate : null,
          metric: chartMetric,
          page: videoPage,
          pageSize: 20,
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

    load();

    return () => controller.abort();
  }, [chartMetric, endDate, selectedChannelId, selectedUserId, startDate, t, videoPage]);

  useEffect(() => {
    if (periodPreset === 'custom') return;
    const range = dashboardPeriodRange(periodPreset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  }, [periodPreset]);

  useEffect(() => {
    setSelectedChannelId((current) => (
      channels.some((channel) => String(channel.id) === current)
        ? current
        : String(channels[0]?.id || '')
    ));
  }, [channels]);

  useEffect(() => {
    setVideoPage(1);
  }, [endDate, selectedChannelId, selectedUserId, startDate]);

  const chartData = useMemo(() => {
    if (chartMetric === 'date') {
      return chartRows
        .map((item) => {
          const date = String(item.date || '').slice(0, 10);
          const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US');
          return {
            ...item,
            videoCount: Number(item.video_count || 0),
            name: dateLabel,
            fullName: dateLabel,
            value: Number(item.video_count || 0),
          };
        });
    }

    return chartRows.map((row, index) => {
        const title = String(row.title || `${t('dashboard.video')} ${index + 1}`);
        return {
          name: title.length > 14 ? `${title.slice(0, 14)}…` : title,
          fullName: title,
          value: Number(row[chartMetric] || 0),
          views: Number(row.views || 0),
          likes: Number(row.likes || 0),
          shares: Number(row.shares || 0),
        };
      });
  }, [chartMetric, chartRows, language, t]);

  const averageChartValue = chartData.length
    ? chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length
    : 0;

  const metricLabel = chartMetric === 'date' ? t('dashboard.videosPerDay') : t(`dashboard.metric_${chartMetric}`);

  return (
    <div className="page dashboard-page">
      <section className="page__hero dashboard-hero">
        <div className="dashboard-hero__copy">
          <h1 className="page__title">{t('dashboard.heroTitle') || heroTitle}</h1>
        </div>

        <div className="dashboard-hero__summary" aria-live="polite">
          <article className="stat-card stat-card--soft">
            <p className="stat-card__label">{t('dashboard.totalViews')}</p>
            <p className="stat-card__value" title={loading ? undefined : formatNumber(totals.views)}>
              {loading ? '—' : formatNumber(totals.views)}
            </p>
          </article>
          <article className="stat-card stat-card--soft">
            <p className="stat-card__label">{t('dashboard.totalVideos')}</p>
            <p className="stat-card__value">{formatNumber(totals.video_count)}</p>
          </article>
          <article className="stat-card stat-card--soft">
            <p className="stat-card__label">{t('dashboard.totalLikes')}</p>
            <p className="stat-card__value">{formatNumber(totals.likes)}</p>
          </article>
          <article className="stat-card stat-card--soft">
            <p className="stat-card__label">{t('dashboard.totalShares')}</p>
            <p className="stat-card__value">{formatNumber(totals.shares)}</p>
          </article>
        </div>
      </section>

      {error ? (
        <section className="section-card dashboard-alert">
          <div className="dashboard-alert__title">{t('dashboard.errorLoad') || 'Không tải được dashboard.'}</div>
          <div className="dashboard-alert__body">{error}</div>
        </section>
      ) : null}

      <section className="section-card dashboard-chart-card">
        <div className="section-card__header dashboard-chart-card__header">
          <div>
            <h2 className="section-card__title">{t('dashboard.videoPerformance')}</h2>
          </div>
          <div className={`dashboard-chart-filters${chartMetric === 'date' ? ` dashboard-chart-filters--date${periodPreset === 'custom' ? ' dashboard-chart-filters--custom' : ''}` : ''}`}>
            <div className="field dashboard-channel-filter">
              <label htmlFor="dashboard-channel">{t('dashboard.channel')}</label>
              <ChannelPicker
                id="dashboard-channel"
                channels={channels}
                value={selectedChannelId}
                onChange={setSelectedChannelId}
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
                {['views', 'date', 'likes', 'shares'].map((metric) => (
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

        {loading ? (
          <div className="empty-state"><div className="loading-dot" />{t('dashboard.loading')}</div>
        ) : chartData.length ? (
          <div className="dashboard-chart-shell">
            <div className="dashboard-chart-summary" aria-hidden="true">
              <span><i className="dashboard-chart-summary__dot" />{t('dashboard.resultsShown')} <strong>{chartData.length}</strong></span>
              <span>{t('dashboard.averageMetric', { metric: metricLabel })} <strong>{formatNumber(Math.round(averageChartValue))}</strong></span>
            </div>
            <div className="dashboard-chart" role="img" aria-label={t('dashboard.videoPerformance')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barSize={26} margin={{ top: 26, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="name" height={40} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={false} tick={chartTick} />
                  <YAxis width={58} tickLine={false} axisLine={false} allowDecimals={false} tick={chartTick} tickFormatter={(value) => Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { notation: 'compact' }).format(value)} />
                  <Tooltip cursor={{ fill: 'var(--color-accent-soft)' }} content={<DashboardChartTooltip formatNumber={formatNumber} metric={chartMetric} t={t} />} />
                  <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="value" position="top" formatter={(value) => Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} className="dashboard-chart-label" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
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
          loading,
          error,
        }}
        selectedChannelId={selectedChannelId}
        onSelectedChannelChange={setSelectedChannelId}
        pagination={videoPagination}
        currentPage={videoPage}
        onPageChange={setVideoPage}
      />
    </div>
  );
};

export default Dashboard;
