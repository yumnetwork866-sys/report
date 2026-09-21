import AnalyticsIcon from './AnalyticsIcon';

const ShopAnalyticsKpis = ({ analyticsLoading, hasData, kpis, locale, t }) => {
  const renderDelta = (kpi) => {
    if (analyticsLoading) return <span className="shop-analytics__change is-muted">{t('common.loading')}</span>;
    if (!hasData) return <span className="shop-analytics__change is-muted">{t('shopAnalytics.awaitingData')}</span>;
    if (kpi.change === null) return <span className="shop-analytics__change is-muted">{t('shopAnalytics.noComparison')}</span>;
    const favorable = kpi.change === 0 || (kpi.inverse ? kpi.change < 0 : kpi.change > 0);
    const tone = kpi.change === 0 ? 'is-neutral' : favorable ? 'is-positive' : 'is-negative';
    const direction = kpi.change > 0 ? t('shopAnalytics.increased') : kpi.change < 0 ? t('shopAnalytics.decreased') : t('shopAnalytics.unchanged');
    return (
      <span className={`shop-analytics__change ${tone}`}>
        <span aria-hidden="true">{kpi.change > 0 ? '↑' : kpi.change < 0 ? '↓' : '→'}</span>
        {' '}{direction}{' '}{Math.abs(kpi.change).toLocaleString(locale, { maximumFractionDigits: 1 })}%{' '}{t('shopAnalytics.vsPrevious')}
      </span>
    );
  };

  return (
    <section className="page__stats shop-analytics__stats" aria-label={t('shopAnalytics.kpiTitle')}>
      {kpis.map((kpi) => (
        <article className={`stat-card shop-analytics__stat shop-analytics__stat--${kpi.key}`} key={kpi.key}>
          <div className="shop-analytics__stat-heading">
            <p className="stat-card__label">{t(`shopAnalytics.${kpi.key}`)}</p>
            <span className="shop-analytics__stat-icon" aria-hidden="true"><AnalyticsIcon name={kpi.key} /></span>
          </div>
          <p className="stat-card__value">{analyticsLoading && !hasData ? <span className="shop-analytics__value-skeleton" /> : hasData ? kpi.value : '—'}</p>
          {renderDelta(kpi)}
        </article>
      ))}
    </section>
  );
};

export default ShopAnalyticsKpis;
