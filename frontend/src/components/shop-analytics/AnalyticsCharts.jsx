import React, { useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronDown } from 'lucide-react';
import { parseDateOnly } from '../../lib/date';
import { boundedPercentage, percentage } from './shopAnalyticsUtils';

const SOURCE_COLORS = [
  'var(--color-social-cyan-strong)',
  'var(--color-social-magenta)',
  'var(--color-primary)',
  'var(--color-warning)',
  'var(--color-success)',
];

const SHOP_PALETTE = [
  '#0284c7', // Sky Blue
  '#f97316', // Orange
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#eab308', // Amber
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.24)',
  color: '#0f172a',
  background: '#ffffff',
};
const CHART_TICK = { fill: '#64748b', fontSize: 12 };

const MultiShopTooltip = ({
  active,
  payload,
  label,
  formatDate,
  chartMetric,
  formatMoney,
  formatNumber,
}) => {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => {
    if (a.dataKey === chartMetric) return -1;
    if (b.dataKey === chartMetric) return 1;
    return (Number(b.value) || 0) - (Number(a.value) || 0);
  });
  return (
    <div
      style={{
        ...CHART_TOOLTIP_STYLE,
        padding: '10px 14px',
        minWidth: '220px',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
        {formatDate ? formatDate(label) : label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {sorted.map((item) => {
          const isTotal = item.dataKey === chartMetric;
          return (
            <div
              key={item.dataKey || item.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '12px',
                paddingBottom: isTotal && sorted.length > 1 ? '5px' : undefined,
                borderBottom: isTotal && sorted.length > 1 ? '1px dashed #e2e8f0' : undefined,
                marginBottom: isTotal && sorted.length > 1 ? '2px' : undefined,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: isTotal ? '#0f172a' : '#334155' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: item.color || item.stroke,
                    flexShrink: 0,
                  }}
                />
                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isTotal ? 700 : 500 }}>
                  {item.name}
                </span>
              </span>
              <strong style={{ fontWeight: isTotal ? 700 : 600, color: '#0f172a' }}>
                {chartMetric === 'gmv' ? formatMoney(item.value) : formatNumber(item.value)}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TOTAL_SERIES_ID = '__total__';
const TOTAL_LINE_COLOR = '#0f172a';

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
  shopSeries = [],
  sourceLabel,
  t,
  totals,
}) => {
  const isMultiShop = Array.isArray(shopSeries) && shopSeries.length > 1;
  const [toggledOffShopIds, setToggledOffShopIds] = useState(() => new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const compareWrapperRef = useRef(null);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const handleClickOutside = (event) => {
      if (
        event.key === 'Escape'
        || (event.type === 'pointerdown' && !compareWrapperRef.current?.contains(event.target))
      ) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('keydown', handleClickOutside);
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('keydown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const isVisible = (shopId) => !toggledOffShopIds.has(shopId);
  const isTotalVisible = !toggledOffShopIds.has(TOTAL_SERIES_ID);

  const toggleShop = (shopId) => {
    setToggledOffShopIds((prev) => {
      const next = new Set(prev);
      if (next.has(shopId)) {
        next.delete(shopId);
      } else {
        next.add(shopId);
      }
      return next;
    });
  };

  const toggleTotal = () => {
    setToggledOffShopIds((prev) => {
      const next = new Set(prev);
      if (next.has(TOTAL_SERIES_ID)) {
        next.delete(TOTAL_SERIES_ID);
      } else {
        next.add(TOTAL_SERIES_ID);
      }
      return next;
    });
  };

  const selectAllShops = () => {
    setToggledOffShopIds(new Set());
  };

  const deselectAllShops = () => {
    setToggledOffShopIds(new Set([TOTAL_SERIES_ID, ...shopSeries.map((s) => s.shopId)]));
  };

  const totalCount = shopSeries.length;
  const visibleCount = shopSeries.filter((s) => isVisible(s.shopId)).length;

  return (
    <section className="shop-analytics__chart-grid">
      <article className="section-card shop-analytics__chart-card">
        <div className="section-card__header shop-analytics__chart-header">
          <div className="shop-analytics__chart-title-group">
            {isMultiShop ? (
              <div className="shop-analytics__compare-wrapper" ref={compareWrapperRef}>
                <button
                  type="button"
                  className={`shop-analytics__compare-btn ${dropdownOpen ? 'is-open' : ''}`}
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  aria-expanded={dropdownOpen}
                >
                  <span>{t('shopAnalytics.shopDropdownBtn', 'Shop')}</span>
                  <ChevronDown size={14} className={`shop-analytics__compare-chevron ${dropdownOpen ? 'is-open' : ''}`} />
                </button>
                {dropdownOpen ? (
                  <div className="shop-analytics__compare-popover">
                    <div className="shop-analytics__compare-popover-header">
                      <span className="shop-analytics__compare-popover-title">
                        {visibleCount}/{totalCount}
                      </span>
                      <div className="shop-analytics__compare-popover-actions">
                        <button type="button" onClick={selectAllShops} className="shop-analytics__legend-action-btn">
                          {t('common.selectAll', 'Chọn tất cả')}
                        </button>
                        <span className="shop-analytics__legend-action-divider">·</span>
                        <button type="button" onClick={deselectAllShops} className="shop-analytics__legend-action-btn">
                          {t('common.deselectAll', 'Bỏ chọn')}
                        </button>
                      </div>
                    </div>
                    <div className="shop-analytics__compare-popover-list">
                      <label
                        className={`shop-analytics__compare-popover-item ${isTotalVisible ? 'is-active' : ''}`}
                        title={t('shopAnalytics.totalAllShops', 'Tổng')}
                      >
                        <input
                          type="checkbox"
                          checked={isTotalVisible}
                          onChange={toggleTotal}
                        />
                        <span className="shop-analytics__legend-indicator" style={{ backgroundColor: TOTAL_LINE_COLOR }} />
                        <span className="shop-analytics__compare-popover-name" style={{ fontWeight: 600 }}>
                          {t('shopAnalytics.totalAllShops', 'Tổng')}
                        </span>
                      </label>
                      <div className="shop-analytics__compare-popover-divider" />
                      {shopSeries.map((shop, idx) => {
                        const color = SHOP_PALETTE[idx % SHOP_PALETTE.length];
                        const shopVisible = isVisible(shop.shopId);
                        return (
                          <label
                            key={shop.shopId}
                            className={`shop-analytics__compare-popover-item ${shopVisible ? 'is-active' : ''}`}
                            title={shop.shopName}
                          >
                            <input
                              type="checkbox"
                              checked={shopVisible}
                              onChange={() => toggleShop(shop.shopId)}
                            />
                            <span className="shop-analytics__legend-indicator" style={{ backgroundColor: color }} />
                            <span className="shop-analytics__compare-popover-name">{shop.shopName}</span>
                            {shop.region ? (
                              <span className="shop-analytics__legend-badge">{shop.region}</span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
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
          <div className="shop-analytics__chart-wrapper">
            <div className="shop-analytics__chart" role="img" aria-label={chartLabel}>
              <ResponsiveContainer width="100%" height="100%">
                {isMultiShop ? (
                  <ComposedChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
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
                      content={(
                        <MultiShopTooltip
                          formatDate={formatDate}
                          chartMetric={chartMetric}
                          formatMoney={formatMoney}
                          formatNumber={formatNumber}
                        />
                      )}
                    />
                    {isTotalVisible ? (
                      <Line
                        type="monotone"
                        dataKey={chartMetric}
                        name={t('shopAnalytics.totalAllShops', 'Tổng')}
                        stroke={TOTAL_LINE_COLOR}
                        strokeWidth={2.5}
                        dot={chartData.length <= 14 ? { r: 3, fill: '#ffffff', stroke: TOTAL_LINE_COLOR, strokeWidth: 2 } : false}
                        activeDot={{ r: 5, strokeWidth: 2, fill: TOTAL_LINE_COLOR }}
                      />
                    ) : null}
                    {shopSeries.map((shop, idx) => {
                      if (!isVisible(shop.shopId)) return null;
                      const color = SHOP_PALETTE[idx % SHOP_PALETTE.length];
                      return (
                        <Line
                          key={shop.shopId}
                          type="monotone"
                          dataKey={`shop_${shop.shopId}_${chartMetric}`}
                          name={shop.shopName}
                          stroke={color}
                          strokeWidth={2.5}
                          dot={chartData.length <= 14 ? { r: 3, fill: '#ffffff', stroke: color, strokeWidth: 2 } : false}
                          activeDot={{ r: 5, strokeWidth: 2, fill: color }}
                        />
                      );
                    })}
                  </ComposedChart>
                ) : (
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
                )}
              </ResponsiveContainer>
            </div>
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
};

export default AnalyticsCharts;
