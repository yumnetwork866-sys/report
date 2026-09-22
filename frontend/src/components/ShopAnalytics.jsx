import React, { useMemo, useState } from 'react';
import { useI18n } from '../lib/language';
import { formatDateOnly } from '../lib/date';
import { useMoneyFormatter } from '../lib/currency';
import AnalyticsIcon from './shop-analytics/AnalyticsIcon';
import AnalyticsCharts from './shop-analytics/AnalyticsCharts';
import ConnectionsPanel from './shop-analytics/ConnectionsPanel';
import DailyAnalyticsTable from './shop-analytics/DailyAnalyticsTable';
import ShopVideoList from './shop-analytics/ShopVideoList';
import ShopAnalyticsFilters from './shop-analytics/ShopAnalyticsFilters';
import ShopAnalyticsKpis from './shop-analytics/ShopAnalyticsKpis';
import ShopVideoFilters from './shop-analytics/ShopVideoFilters';
import useShopAnalyticsData from './shop-analytics/hooks/useShopAnalyticsData';
import useShopInventory from './shop-analytics/hooks/useShopInventory';
import useShopOAuth from './shop-analytics/hooks/useShopOAuth';
import useShopVideoAnalytics from './shop-analytics/hooks/useShopVideoAnalytics';
import {
  formatDisplayDateTime,
  moneyValue,
  numericValue,
  percentage,
  percentageChange,
  rangeForDays,
  shiftDate,
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
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [periodPreset, setPeriodPreset] = useState('7d');
  const currency = 'LOCAL';
  const [chartMetric, setChartMetric] = useState('gmv');
  const [error, setError] = useState('');
  const [combinedVideoView, setCombinedVideoView] = useState(() => (
    new URLSearchParams(window.location.search).get('view') === 'performance'
      ? 'performance'
      : 'library'
  ));
  const videoExportOnly = combinedVideoTabs
    ? combinedVideoView === 'library'
    : videoExportOnlyProp;
  const invalidRange = !startDate || !endDate || startDate >= endDate;

  const inventory = useShopInventory({ onError: setError, t });
  const {
    attentionCount, changeSelectedShop, connections, loadInventory, loading,
    missingAnalyticsScope, selectedShop, selectedShopId, shops, tokenExpired,
  } = inventory;
  const analytics = useShopAnalyticsData({
    currency, endDate, invalidRange, managementOnly, missingAnalyticsScope,
    onError: setError, selectedShopId, startDate, t, tokenExpired, videoOnly,
  });
  const {
    analyticsLoading, chartData, comparisonTotals, hasComparison, hasData,
    intervals, setSnapshot, snapshot, totals,
  } = analytics;
  const video = useShopVideoAnalytics({
    currency, endDate, invalidRange, locale, managementOnly, missingAnalyticsScope,
    onError: setError, selectedShopId, startDate, t, tokenExpired,
    videoExportOnly, videoOnly,
  });
  const {
    creatorFilteredVideoRows, filteredVideoRows, paginatedVideoRows,
    setVideoAccountType, setVideoAnalytics, setVideoAnalyticsLoading, setVideoCreator,
    setVideoPage, setVideoReloadKey, setVideoSearch, setVideoSortField,
    videoAccountType, videoAnalytics, videoAnalyticsLoading, videoCreator,
    videoCreatorOptions, videoPage, videoPageCount, videoProductMetadata,
    videoRows, videoSearch, videoSortField, videoTotals,
  } = video;
  const {
    connecting, disconnectingId, disconnectShop, setToast, startConnect, startConnectCustom, toast,
  } = useShopOAuth({
    loadInventory, managementOnly, onError: setError, selectedShop, setSnapshot,
    t, videoExportOnly, videoOnly,
  });

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

  const displayCurrency = intervals.find((row) => row?.gmv?.currency)?.gmv?.currency
    || videoRows.find((row) => row?.gmv?.currency)?.gmv?.currency
    || 'VND';
  const formatMoney = (value, currencyCode = displayCurrency) => formatPreferredMoney(value, currencyCode);
  const formatVideoMoney = (value) => formatMoney(moneyValue(value), value?.currency || displayCurrency);
  const formatRate = (value) => {
    const rate = numericValue(value);
    return formatPercent(rate <= 1 ? rate * 100 : rate);
  };
  const videoUrl = (row) => {
    if (row?.video_link) return row.video_link;
    const source = row?.raw_metrics?.list || {};
    const username = row?.creator?.user_name || row?.username || source?.creator?.user_name || source?.username;
    const videoId = row?.video_id || row?.id;
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

  const changeCustomDate = (setter, currentValue) => (nextValue) => {
    if (nextValue === currentValue) return;
    setter(nextValue);
  };

  const changeCustomEndDate = (selectedDate) => {
    const nextEndDate = shiftDate(selectedDate, 1);
    if (nextEndDate !== endDate) setEndDate(nextEndDate);
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

  const changeFrom = (current, previous) => percentageChange(current, previous, hasComparison);

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
          <ShopAnalyticsFilters
                      endDate={endDate}
                      invalidRange={invalidRange}
                      loading={loading}
                      onEndDateChange={changeCustomEndDate}
                      onPeriodChange={changePeriodPreset}
                      onShopChange={changeSelectedShop}
                      onStartDateChange={changeCustomDate(setStartDate, startDate)}
                      periodOptions={periodOptions}
                      periodPreset={periodPreset}
                      selectedShopId={selectedShopId}
                      shops={shops}
                      startDate={startDate}
                      t={t}
                    />

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
              <ShopAnalyticsKpis
                analyticsLoading={analyticsLoading}
                hasData={hasData}
                kpis={kpis}
                locale={locale}
                t={t}
              />

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
          <ShopVideoFilters
                      endDate={endDate}
                      invalidRange={invalidRange}
                      loading={loading}
                      missingAnalyticsScope={missingAnalyticsScope}
                      onAccountTypeChange={setVideoAccountType}
                      onCreatorChange={(value) => { setVideoCreator(value); setVideoPage(1); }}
                      onEndDateChange={changeCustomEndDate}
                      onPeriodChange={changePeriodPreset}
                      onRefresh={() => setVideoReloadKey((value) => value + 1)}
                      onShopChange={changeSelectedShop}
                      onSortChange={setVideoSortField}
                      onStartDateChange={changeCustomDate(setStartDate, startDate)}
                      periodOptions={periodOptions}
                      periodPreset={periodPreset}
                      selectedShopId={selectedShopId}
                      shops={shops}
                      sortOptions={sortOptions}
                      startDate={startDate}
                      t={t}
                      tokenExpired={tokenExpired}
                      videoAccountType={videoAccountType}
                      videoAnalyticsLoading={videoAnalyticsLoading}
                      videoCreator={videoCreator}
                      videoCreatorOptions={videoCreatorOptions}
                      videoExportOnly={videoExportOnly}
                      videoRows={videoRows}
                      videoSortField={videoSortField}
                    />

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
          onConnectCustom={startConnectCustom}
          onDisconnect={disconnectShop}
          t={t}
        />
      )}
    </div>
  );
};

export default ShopAnalytics;
