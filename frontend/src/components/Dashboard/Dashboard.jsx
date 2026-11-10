import { useState } from 'react';
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
import AppAvatar from '../AppAvatar';

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
  const [activeTab, setActiveTab] = useState('overview');
  const {
    averageGmv,
    averageViews,
    channels,
    channelComparison,
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
    handleDateClick,
    handleMetricChange,
    handlePageChange,
    loading,
    locale,
    metricLabel,
    periodPreset,
    selectedChannelId,
    selectedChartDate,
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
  const tabs = [
    { id: 'overview', label: t('dashboard.overviewTab') },
    { id: 'videos', label: t('dashboard.videosTab') },
  ];
  const switchTab = (tab, focus = false) => {
    setActiveTab(tab);
    if (focus) document.getElementById(`dashboard-tab-${tab}`)?.focus();
  };
  const metricPicker = (
    <MetricPicker
      id="dashboard-daily-metric"
      value={dailyMetric}
      onChange={handleMetricChange}
      t={t}
    />
  );
  return (
    <div className="page dashboard-page">
      <section className="section-card dashboard-global-filters" aria-label={t('dashboard.pageFilters')}>
        <div className={`dashboard-chart-filters${chartMetric === 'date' ? ` dashboard-chart-filters--date${periodPreset === 'custom' ? ' dashboard-chart-filters--custom' : ''}` : ''}`}>
          <div className="field dashboard-channel-filter">
            <label htmlFor="dashboard-channel">{t('dashboard.channel')}</label>
            <ChannelPicker
              id="dashboard-channel"
              channels={channels}
              value={selectedChannelId}
              onChange={handleChannelChange}
              includeAll
              allLabel={t('dashboard.allChannels')}
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
      </section>

      <div className="koc-tabs dashboard-tabs" role="tablist" aria-label={t('dashboard.viewTabs')}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`dashboard-tab-${tab.id}`}
            type="button"
            role="tab"
            className={activeTab === tab.id ? 'is-active' : ''}
            aria-selected={activeTab === tab.id}
            aria-controls={`dashboard-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => switchTab(tab.id)}
            onKeyDown={(event) => {
              const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
              if (nextIndex !== null) {
                event.preventDefault();
                switchTab(tabs[nextIndex].id, true);
              }
            }}
          >{tab.label}</button>
        ))}
      </div>

      <div className="dashboard-tab-panel" id="dashboard-panel-overview" role="tabpanel" aria-labelledby="dashboard-tab-overview" hidden={activeTab !== 'overview'}>
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
        {loading || !chartData.length ? (
          <div className="dashboard-chart-toolbar">{metricPicker}</div>
        ) : null}

        {loading ? (
          <div className="empty-state"><div className="loading-dot" />{t('dashboard.loading')}</div>
        ) : chartData.length ? (
          <div className="dashboard-analytics-grid">
          <div className="dashboard-chart-shell">
            <div className="dashboard-chart-toolbar">
              {metricPicker}
              <div className="dashboard-chart-summary">
                <span title={t('dashboard.dailyAverageHint')}>
                  {t('dashboard.averageRevenue')} <strong>{formatGmvAmount(Math.round(averageGmv), totals.sales_currency)}</strong>
                </span>
                <span title={t('dashboard.dailyAverageHint')}>
                  {t('dashboard.averageViews')} <strong>{formatNumber(Math.round(averageViews))}</strong>
                </span>
              </div>
            </div>
            <div className="dashboard-chart" role="img" aria-label={t('dashboard.videoPerformance')}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 26, right: 16, bottom: 4, left: 4 }} onClick={(state, index) => {
                  if (handleChartClick(state, index)) switchTab('videos', true);
                }} style={{ cursor: 'pointer' }}>
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
      {selectedChannelId === 'all' ? (
        <section className="section-card dashboard-channel-comparison" aria-busy={loading}>
          {loading ? (
            <div className="empty-state">{t('dashboard.loading')}</div>
          ) : error ? (
            <div className="empty-state">{t('dashboard.errorLoad')}</div>
          ) : channelComparison.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t('dashboard.channel')}</th>
                    <th scope="col">{t('dashboard.metric_gmv')}</th>
                    <th scope="col">{t('dashboard.totalOrders')}</th>
                    <th scope="col">{t('dashboard.totalViews')}</th>
                    <th scope="col" title={t('dashboard.rpmFormula')}>RPM</th>
                    <th scope="col">{t('dashboard.gmvGrowth')}</th>
                  </tr>
                </thead>
                <tbody>
                  {channelComparison.map((channel) => (
                    <tr key={channel.id} onClick={() => handleChannelChange(String(channel.id))}>
                      <th scope="row">
                        <button className="dashboard-channel-comparison__channel" type="button" onClick={(event) => {
                          event.stopPropagation();
                          handleChannelChange(String(channel.id));
                        }}>
                          <AppAvatar
                            sources={[channel.avatar_url, channel.avatar_large_url]}
                            name={channel.display_name || channel.username || String(channel.id)}
                            seed={channel.id}
                            className="dashboard-channel-comparison__avatar"
                            fallbackClassName="dashboard-channel-comparison__avatar--fallback"
                            generated={false}
                          />
                          <span className="dashboard-channel-comparison__identity">
                            {channel.display_name || channel.username || channel.id}
                            {channel.username ? <small>@{channel.username}</small> : null}
                          </span>
                        </button>
                      </th>
                      <td>{formatGmvAmount(channel.gross_gmv, channel.sales_currency)}</td>
                      <td>{formatNumber(channel.orders)}</td>
                      <td>{formatNumber(channel.views)}</td>
                      <td>{formatGmvAmount(channel.rpm, channel.sales_currency)}</td>
                      <td>
                        {channel.gmv_growth !== null ? (
                          <GrowthBadge value={channel.gmv_growth} label={t('dashboard.vsPreviousPeriod')} />
                        ) : channel.previous_gmv === 0 && channel.gross_gmv > 0 ? (
                          <span title={t('dashboard.noPreviousGmv')}>{t('dashboard.newGmv')}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state">{t('dashboard.noVideoData')}</div>}
        </section>
      ) : null}

      </div>

      <div className="dashboard-tab-panel" id="dashboard-panel-videos" role="tabpanel" aria-labelledby="dashboard-tab-videos" hidden={activeTab !== 'videos'}>
      {selectedChartDate ? (
        <button type="button" className="button button--ghost dashboard-date-chip" onClick={() => handleDateClick(selectedChartDate)}>
          {t('dashboard.dateFilter', { date: selectedChartDate })} · {t('dashboard.clearDateFilter')} ×
        </button>
      ) : null}
      {error ? <div className="section-card dashboard-alert" role="alert">{error}</div> : null}
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
    </div>
  );
};

export default Dashboard;
