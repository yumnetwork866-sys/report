import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { parseDateOnly } from '../../lib/date';
import { boundedPercentage, percentage } from './shopAnalyticsUtils';

const SOURCE_COLORS = [
  'var(--color-social-cyan-strong)',
  'var(--color-social-magenta)',
  'var(--color-primary)',
  'var(--color-warning)',
  'var(--color-success)',
];
const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.24)',
  color: '#0f172a',
};
const CHART_TICK = { fill: '#64748b', fontSize: 12 };

const AnalyticsCharts = ({
  analyticsLoading,
  breakdownTotal,
  breakdowns,
  chartData,
  chartLabel,
  chartMetric,
  formatDate,
  formatMoney,
  formatNumber,
  formatOptionalNumber,
  formatPercent,
  funnel,
  hasData,
  locale,
  onMetricChange,
  sourceLabel,
  t,
  totals,
}) => (
  <section className="shop-analytics__chart-grid">
    <article className="section-card shop-analytics__chart-card">
      <div className="section-card__header shop-analytics__chart-header">
        <div>
          <h2 className="section-card__title">{t('shopAnalytics.trend')}</h2>
        </div>
        <div className="shop-analytics__metric-switcher" role="group" aria-label={t('shopAnalytics.metric')}>
          {['gmv', 'orders', 'unitsSold', 'buyers'].map((metric) => (
            <button
              className={chartMetric === metric ? 'is-active' : ''}
              type="button"
              key={metric}
              aria-pressed={chartMetric === metric}
              onClick={() => onMetricChange(metric)}
            >
              {t(`shopAnalytics.${metric}`)}
            </button>
          ))}
        </div>
      </div>
      {analyticsLoading && !hasData ? (
        <div className="empty-state">
          <span className="loading-dot" />
          {t('shopAnalytics.loadingAnalytics')}
        </div>
      ) : chartData.length ? (
        <div className="shop-analytics__chart" role="img" aria-label={`${t('shopAnalytics.trend')}: ${chartLabel}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="shopAnalyticsArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-social-cyan-strong)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-social-cyan-strong)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                minTickGap={26}
                tick={CHART_TICK}
                tickFormatter={(value) => {
                  const parts = parseDateOnly(value);
                  return parts ? `${parts.day}/${parts.month}` : value;
                }}
              />
              <YAxis
                width={64}
                axisLine={false}
                tickLine={false}
                tick={CHART_TICK}
                tickFormatter={(value) => Intl.NumberFormat(locale, { notation: 'compact' }).format(value)}
              />
              <Tooltip
                labelFormatter={formatDate}
                formatter={(value) => [
                  chartMetric === 'gmv' ? formatMoney(value) : formatNumber(value),
                  chartLabel,
                ]}
                contentStyle={CHART_TOOLTIP_STYLE}
              />
              <Area
                type="monotone"
                dataKey={chartMetric}
                stroke="var(--color-social-cyan-strong)"
                strokeWidth={3}
                fill="url(#shopAnalyticsArea)"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-state shop-analytics__chart-empty">
          <p>{t('shopAnalytics.noData')}</p>
        </div>
      )}
    </article>

    <div className="shop-analytics__insight-stack">
      <article className="section-card shop-analytics__breakdown-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">{t('shopAnalytics.gmvBreakdown')}</h2>
          </div>
        </div>
        {analyticsLoading && !hasData ? (
          <div className="empty-state empty-state--compact">
            <span className="loading-dot" />
            {t('shopAnalytics.loadingAnalytics')}
          </div>
        ) : breakdowns.length ? (
          <div className="shop-analytics__breakdowns">
            {breakdowns.map((item, index) => {
              const share = percentage(item.amount, breakdownTotal);
              return (
                <div className="shop-analytics__breakdown" key={item.type}>
                  <div className="shop-analytics__breakdown-heading">
                    <span>
                      <i style={{ background: SOURCE_COLORS[index % SOURCE_COLORS.length] }} aria-hidden="true" />
                      {sourceLabel(item.type)}
                    </span>
                    <strong>{formatPercent(share)}</strong>
                  </div>
                  <div className="shop-analytics__breakdown-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${boundedPercentage(share)}%`,
                        background: SOURCE_COLORS[index % SOURCE_COLORS.length],
                      }}
                    />
                  </div>
                  <small>{formatMoney(item.amount)}</small>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state empty-state--compact">{t('shopAnalytics.noBreakdown')}</div>
        )}
      </article>

      <article className="section-card shop-analytics__funnel-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">{t('shopAnalytics.commerceFunnel')}</h2>
          </div>
        </div>
        {analyticsLoading && !hasData ? (
          <div className="empty-state empty-state--compact">
            <span className="loading-dot" />
            {t('shopAnalytics.loadingAnalytics')}
          </div>
        ) : hasData ? (
          <div className="shop-analytics__funnel">
            {funnel.map((step, index) => (
              <div className="shop-analytics__funnel-step" key={step.key}>
                <div>
                  <span>{index + 1}</span>
                  <strong>{t(`shopAnalytics.${step.key}`)}</strong>
                </div>
                <strong>{formatNumber(step.value)}</strong>
                <div className="shop-analytics__funnel-track" aria-hidden="true">
                  <span style={{ width: `${boundedPercentage(step.barRate)}%` }} />
                </div>
                <small>{formatPercent(step.rate)} {step.rateLabel}</small>
              </div>
            ))}
            <div className="shop-analytics__funnel-footer">
              <span>{t('shopAnalytics.cancellationsReturns')}</span>
              <strong>{formatOptionalNumber(totals.cancellations)}</strong>
            </div>
          </div>
        ) : (
          <div className="empty-state empty-state--compact">{t('shopAnalytics.noData')}</div>
        )}
      </article>
    </div>
  </section>
);

export default AnalyticsCharts;
