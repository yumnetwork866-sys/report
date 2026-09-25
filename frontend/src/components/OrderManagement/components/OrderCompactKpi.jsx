import React, { useState } from 'react';
import { AlertTriangle, BarChart2, ChevronDown, ChevronUp, Eye, EyeOff, Package } from 'lucide-react';

export const OrderCompactKpi = ({
  orderOverview = {},
  orderOverviewLoading = false,
  formatNumber,
  formatMoneyValues,
  locale = 'vi-VN',
  applyOrderFilterPatch,
  t,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  const kpis = orderOverview.kpis || {};
  const topProducts = orderOverview.top_products || {};

  const totalOrders = kpis.sales_orders ?? kpis.orders;
  const grossRevenue = kpis.gross_revenue || kpis.affiliate_gmv;
  const netRevenue = kpis.net_revenue;
  const refundRevenue = kpis.refunded_revenue;
  const refundRate = Number(kpis.refund_return_rate || 0).toLocaleString(locale, { maximumFractionDigits: 1 });
  const attentionOrders = Number(kpis.attention_orders || 0);

  if (isHidden) {
    return (
      <div className="order-compact-kpi order-compact-kpi--minimized">
        <button
          type="button"
          className="button button--ghost order-compact-kpi__show-btn"
          onClick={() => setIsHidden(false)}
        >
          <BarChart2 size={15} />
          <span>{t('sellerAffiliate.kpiStripShow')}</span>
          <Eye size={14} />
        </button>
      </div>
    );
  }

  const hasTopProducts = ['revenue', 'settlement', 'refund'].some(
    (metric) => topProducts[metric]?.length
  );

  return (
    <div className="order-compact-kpi">
      <div className="order-compact-kpi__bar">
        <div className="order-compact-kpi__metrics">
          <div className="order-compact-kpi__item">
            <span className="order-compact-kpi__label">{t('sellerAffiliate.orderKpiOrders')}</span>
            <strong className="order-compact-kpi__value">
              {orderOverviewLoading ? '—' : formatNumber(totalOrders)}
            </strong>
          </div>

          <div className="order-compact-kpi__divider" />

          <div className="order-compact-kpi__item">
            <span className="order-compact-kpi__label">{t('sellerAffiliate.orderKpiGrossRevenue')}</span>
            <strong className="order-compact-kpi__value">
              {orderOverviewLoading ? '—' : formatMoneyValues(grossRevenue)}
            </strong>
          </div>

          <div className="order-compact-kpi__divider" />

          <div className="order-compact-kpi__item">
            <span className="order-compact-kpi__label">{t('sellerAffiliate.orderKpiNetRevenue')}</span>
            <strong className="order-compact-kpi__value text-positive">
              {orderOverviewLoading ? '—' : formatMoneyValues(netRevenue)}
            </strong>
          </div>

          <div className="order-compact-kpi__divider" />

          <button
            type="button"
            className="order-compact-kpi__item order-compact-kpi__item--button"
            onClick={() => applyOrderFilterPatch({ refundStatus: 'yes', attentionOnly: false })}
            title={t('sellerAffiliate.orderKpiRefundSummary', { rate: refundRate, count: formatNumber(kpis.refunded_returned_orders) })}
          >
            <span className="order-compact-kpi__label">{t('sellerAffiliate.refund')}</span>
            <span className="order-compact-kpi__value-group">
              <strong className="order-compact-kpi__value text-danger">
                {orderOverviewLoading ? '—' : `${refundRate}%`}
              </strong>
              {!orderOverviewLoading && refundRevenue ? (
                <small className="order-compact-kpi__sub">({formatMoneyValues(refundRevenue)})</small>
              ) : null}
            </span>
          </button>

          <div className="order-compact-kpi__divider" />

          <button
            type="button"
            className={`order-compact-kpi__item order-compact-kpi__item--button ${attentionOrders > 0 ? 'order-compact-kpi__item--alert' : ''}`}
            onClick={() => applyOrderFilterPatch({ attentionOnly: true, deliveryIssue: 'all' })}
            title={t('sellerAffiliate.orderNeedsAttention')}
          >
            <span className="order-compact-kpi__label">
              {attentionOrders > 0 ? <AlertTriangle size={12} className="text-danger" /> : null}
              {t('sellerAffiliate.orderNeedsAttention')}
            </span>
            <strong className={`order-compact-kpi__value ${attentionOrders > 0 ? 'text-danger' : ''}`}>
              {orderOverviewLoading ? '—' : formatNumber(attentionOrders)}
            </strong>
          </button>
        </div>

        <div className="order-compact-kpi__actions">
          <button
            type="button"
            className="button button--ghost order-compact-kpi__toggle-btn"
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={isExpanded}
          >
            <span>{isExpanded ? t('sellerAffiliate.kpiStripToggleCollapse') : t('sellerAffiliate.kpiStripToggleExpand')}</span>
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          <button
            type="button"
            className="button button--ghost order-compact-kpi__icon-btn"
            onClick={() => setIsHidden(true)}
            title={t('sellerAffiliate.kpiStripHide')}
            aria-label={t('sellerAffiliate.kpiStripHide')}
          >
            <EyeOff size={15} />
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="order-compact-kpi__drawer">
          <div className="order-compact-kpi__secondary-metrics">
            <div className="order-compact-kpi__sec-card">
              <span className="order-compact-kpi__sec-label">{t('sellerAffiliate.orderKpiAov')}</span>
              <strong className="order-compact-kpi__sec-value">
                {orderOverviewLoading ? '—' : formatMoneyValues(kpis.average_order_value)}
              </strong>
            </div>
            <div className="order-compact-kpi__sec-card">
              <span className="order-compact-kpi__sec-label">{t('sellerAffiliate.orderKpiItems')}</span>
              <strong className="order-compact-kpi__sec-value">
                {orderOverviewLoading ? '—' : formatNumber(kpis.items_sold)}
              </strong>
              {!orderOverviewLoading && kpis.items_refunded ? (
                <small className="row-subtitle">
                  {t('sellerAffiliate.orderKpiRefundedItems', { count: formatNumber(kpis.items_refunded) })}
                </small>
              ) : null}
            </div>
            <div className="order-compact-kpi__sec-card">
              <span className="order-compact-kpi__sec-label">{t('sellerAffiliate.orderKpiCommission')}</span>
              <strong className="order-compact-kpi__sec-value">
                {orderOverviewLoading ? '—' : formatMoneyValues(kpis.estimated_commission)}
              </strong>
            </div>
          </div>

          {hasTopProducts ? (
            <div className="order-compact-kpi__top-products">
              <h4 className="order-compact-kpi__section-title">{t('sellerAffiliate.topProductsTitle')}</h4>
              <div className="order-compact-kpi__products-grid">
                {['revenue', 'settlement', 'refund'].map((metric) => {
                  const items = topProducts[metric] || [];
                  if (!items.length) return null;
                  const valueField = metric === 'revenue' ? 'gross_revenue' : metric === 'refund' ? 'refunded_revenue' : 'settlement';
                  return (
                    <div key={metric} className="order-compact-kpi__metric-col">
                      <h5>{t(`sellerAffiliate.topProducts_${metric}`)}</h5>
                      <ol className="order-compact-kpi__product-list">
                        {items.slice(0, 5).map((product) => (
                          <li key={product.product_id} className="order-compact-kpi__product-row">
                            {product.image_url ? (
                              <img src={product.image_url} alt="" className="order-compact-kpi__product-img" loading="lazy" />
                            ) : (
                              <span className="order-compact-kpi__product-placeholder" aria-hidden="true">
                                <Package size={14} />
                              </span>
                            )}
                            <div className="order-compact-kpi__product-meta">
                              {product.product_url ? (
                                <a href={product.product_url} target="_blank" rel="noreferrer" className="order-compact-kpi__product-link">
                                  {product.title}
                                </a>
                              ) : (
                                <span className="order-compact-kpi__product-link">{product.title}</span>
                              )}
                            </div>
                            <strong className="order-compact-kpi__product-val">
                              {formatMoneyValues(product[valueField])}
                            </strong>
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default OrderCompactKpi;
