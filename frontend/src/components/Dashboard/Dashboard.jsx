import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Video,
} from 'lucide-react';
import VideoTable, { ChannelPicker } from '../VideoTable';
import DatePickerInput from '../DatePickerInput';

import {
  ActiveDotGlow,
  DashboardChartTooltip,
  GrowthBadge,
  MetricPicker,
  UserPicker,
} from './components/DashboardPresentation';
import { CHART_TICK as chartTick } from './constants';
import { useDashboardData } from './hooks/useDashboardData';
import { compactVideoTitle, dateInputValue } from './utils/dashboardUtils';
const Dashboard = () => {
  const {
    averageChartValue,
    averageGmv,
    averageViews,
    channels,
    chartData,
    chartMetric,
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
    selectedUserId,
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
  } = useDashboardData();
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
                {dailyMetric === 'gmv' ? (
                  <>
                    <span>{t('dashboard.metric_gmv')} <strong>{formatGmvAmount(Math.round(averageGmv), totals.sales_currency)}</strong></span>
                    {' · '}
                    <span>{t('dashboard.totalViews')} <strong>{formatNumber(Math.round(averageViews))}</strong></span>
                  </>
                ) : (
                  <>
                    <span>{metricLabel} <strong>{formatNumber(Math.round(averageChartValue))}</strong></span>
                    {' · '}
                    <span>{t('dashboard.metric_gmv')} <strong>{formatGmvAmount(Math.round(averageGmv), totals.sales_currency)}</strong></span>
                  </>
                )}
              </span>
            </div>
            <div className="dashboard-chart" role="img" aria-label={t('dashboard.videoPerformance')}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 26, right: 16, bottom: 4, left: 4 }} onClick={handleChartClick} style={{ cursor: 'pointer' }}>
                  <defs>
                    <linearGradient id="dashboardGmvGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dashboardViewsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary, #0ea5e9)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--color-primary, #0ea5e9)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="name" height={40} interval="preserveStartEnd" minTickGap={24} tickLine={false} axisLine={false} tick={chartTick} />
                  <YAxis
                    yAxisId="gmv"
                    width={72}
                    tickLine={false}
                    axisLine={false}
                    tick={chartTick}
                    tickFormatter={(value) => formatGmvAmount(value, totals.sales_currency, { compact: true })}
                  />
                  <YAxis
                    yAxisId="metric"
                    orientation="right"
                    width={58}
                    tickLine={false}
                    axisLine={false}
                    tick={chartTick}
                    tickFormatter={(value) => Intl.NumberFormat(locale, { notation: 'compact' }).format(value)}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(148, 163, 184, 0.45)', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                    content={<DashboardChartTooltip formatNumber={formatNumber} formatGmvAmount={formatGmvAmount} currency={totals.sales_currency} t={t} dailyMetric={dailyMetric} metricLabel={metricLabel} />}
                  />
                  <Legend
                    verticalAlign="top"
                    align="center"
                    height={34}
                    iconType="circle"
                    iconSize={8}
                  />
                  {dailyMetric === 'gmv' ? (
                    <>
                      <Area
                        yAxisId="gmv"
                        name={t('dashboard.metric_gmv')}
                        type="monotone"
                        dataKey="gross_gmv"
                        stroke="#f97316"
                        strokeWidth={2.5}
                        fill="url(#dashboardGmvGradient)"
                        fillOpacity={1}
                        dot={chartData.length <= 14 ? { r: 3, fill: '#ffffff', stroke: '#f97316', strokeWidth: 2 } : false}
                        activeDot={<ActiveDotGlow stroke="#f97316" />}
                      />
                      <Line
                        yAxisId="metric"
                        name={t('dashboard.totalViews')}
                        type="monotone"
                        dataKey="views"
                        stroke="var(--color-primary, #0ea5e9)"
                        strokeWidth={2.5}
                        dot={chartData.length <= 14 ? { r: 3, fill: '#ffffff', stroke: 'var(--color-primary, #0ea5e9)', strokeWidth: 2 } : false}
                        activeDot={<ActiveDotGlow stroke="var(--color-primary, #0ea5e9)" />}
                      />
                    </>
                  ) : (
                    <>
                      <Area
                        yAxisId="metric"
                        name={metricLabel}
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-primary, #0ea5e9)"
                        strokeWidth={2.5}
                        fill="url(#dashboardViewsGradient)"
                        fillOpacity={1}
                        dot={chartData.length <= 14 ? { r: 3, fill: '#ffffff', stroke: 'var(--color-primary, #0ea5e9)', strokeWidth: 2 } : false}
                        activeDot={<ActiveDotGlow stroke="var(--color-primary, #0ea5e9)" />}
                      />
                      <Line
                        yAxisId="gmv"
                        name={t('dashboard.metric_gmv')}
                        type="monotone"
                        dataKey="gross_gmv"
                        stroke="#f97316"
                        strokeWidth={2.5}
                        dot={chartData.length <= 14 ? { r: 3, fill: '#ffffff', stroke: '#f97316', strokeWidth: 2 } : false}
                        activeDot={<ActiveDotGlow stroke="#f97316" />}
                      />
                    </>
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
