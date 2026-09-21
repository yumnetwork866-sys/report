import { moneyValue } from './shopAnalyticsUtils';

const DailyAnalyticsTable = ({
  analyticsLoading,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatOptionalNumber,
  intervals,
  snapshot,
  t,
}) => (
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
);

export default DailyAnalyticsTable;
