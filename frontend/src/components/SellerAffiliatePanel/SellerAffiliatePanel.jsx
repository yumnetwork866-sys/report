import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import ShopDropdown from '../ShopDropdown';
import SelectDropdown from '../SelectDropdown';
import { BarChart3, CalendarDays, Filter } from 'lucide-react';
import { setStoredSelectedShopId } from '../../lib/shopSelection';
import Pagination from '../Pagination';
import DatePickerInput from '../DatePickerInput';
import { useSellerAffiliateData } from './hooks/useSellerAffiliateData';

import {
  AffiliateOrderProducts,
  CreatorAvatar,
  InviteCreatorModal,
  MarketplaceCreatorCell,
  MetricTooltip,
  OrderActions,
  OrderCarrier,
  OrderDetailDrawer,
  OrderFinanceValue,
  OrderIdentity,
  OrderPayment,
  OrderShippingStatus,
  OrderSla,
  OrderStatus,
} from './components/AffiliatePresentation';
import {
  BREAKDOWN_COLORS,
  MARKETPLACE_SCOPE,
  PRODUCT_SCOPE,
  REQUIRED_SCOPE,
} from './constants';
import {
  defaultStatisticsRange,
  formatReportDate,
  formatStatus,
} from './utils/sellerAffiliateUtils';

const SellerAffiliatePanel = ({ initialSection = 'open', ordersOnly = false }) => {
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showAdvancedOrderFilters, setShowAdvancedOrderFilters] = useState(false);
  const {
    baseMetrics,
    changePage,
    changeSection,
    closeCreatorDetail,
    contactNotice,
    creatorBreakdown,
    creatorBreakdownCurrency,
    creatorBreakdownMetric,
    creatorBreakdownMetricOptions,
    creatorBreakdownTotal,
    creatorContent,
    creatorDetailLoading,
    creatorStatusOptions,
    currentPage,
    data,
    error,
    formatCreatorCount,
    formatCreatorGmv,
    formatEngagementRate,
    formatMoney,
    formatMoneyValues,
    formatNumber,
    formatRate,
    formatTime,
    formatUnitsSold,
    hasMarketplaceScope,
    hasProductScope,
    hasScope,
    invitationSearch,
    inviteCreator,
    inviteForm,
    inviteLoading,
    inviteProducts,
    inviteTab,
    keyword,
    loading,
    locale,
    ongoingInvitations,
    openCollaborationSettings,
    openCreatorDetail,
    openInvite,
    orderOverview,
    orderOverviewError,
    orderOverviewLoading,
    orderPeriod,
    orderPeriodOptions,
    orderRange,
    orderFilterDraft,
    orderFilterError,
    orderFiltersDirty,
    orderFilters,
    performanceBreakdown,
    performanceBreakdownTotal,
    performanceColumns,
    performanceCreatorCell,
    performanceWindow,
    performanceWindowOptions,
    resetMarketplaceSearch,
    rows,
    section,
    selectedCreatorApplication,
    selectedInvitationId,
    selectedPerformanceExport,
    selectedShop,
    setContactNotice,
    setCreatorBreakdownMetric,
    setData,
    setInvitationSearch,
    setInviteCreator,
    setInviteForm,
    setInviteTab,
    setKeyword,
    setOrderPeriod,
    setOrderRange,
    setOrderFilterDraft,
    setPageTokens,
    setPerformanceWindow,
    setSelectedInvitationId,
    setShopId,
    setStatus,
    shopId,
    shops,
    status,
    submitExistingInvite,
    submitInvite,
    submitSearch,
    submittedKeyword,
    t,
    tableColumnCount,
    targetStatusOptions,
    toggleInviteProduct,
    totalPages,
    hasShopOrderScope,
    applyOrderFilters,
    applyOrderFilterPatch,
    resetOrderFilters,
  } = useSellerAffiliateData({ initialSection, ordersOnly });
  const updateOrderFilter = (key, value) => setOrderFilterDraft((current) => ({ ...current, [key]: value }));
  const advancedFilterKeys = ['warehouse', 'buyerCancellation', 'settlementStatus', 'carrier', 'productSku', 'settlementMin', 'settlementMax', 'deliveryIssue', 'source'];
  const activeAdvancedFilterCount = advancedFilterKeys.filter((key) => {
    const value = orderFilters[key];
    return value !== '' && value !== 'all' && value !== false;
  }).length;
  const hasActiveOrderFilters = orderFilters.attentionOnly
    || orderFilters.dateField !== 'create_time'
    || orderFilters.orderStatus !== 'all'
    || orderFilters.shippingType !== 'all'
    || orderFilters.refundStatus !== 'all'
    || activeAdvancedFilterCount > 0;
  return (
    <div className="page seller-affiliate">
      {selectedShop && hasScope && !ordersOnly ? (
        <div className="seller-affiliate__subtabs" role="tablist" aria-label={t('sellerAffiliate.sections')}>
          {['open', 'target', 'discover', 'performance', 'creators', 'orders'].map((value) => <button className={section === value ? 'is-active' : ''} type="button" role="tab" aria-selected={section === value} onClick={() => changeSection(value)} key={value}>{t(`sellerAffiliate.${value}Tab`)}</button>)}
        </div>
      ) : null}
      <section className={`section-card seller-affiliate__controls${ordersOnly ? ' seller-affiliate__controls--orders' : ''}${ordersOnly && orderPeriod === 'custom' ? ' seller-affiliate__controls--orders-custom' : ''}${(!ordersOnly && (section === 'open' || section === 'discover')) ? ' seller-affiliate__controls--two-columns' : ''}`}>
        <div className="seller-affiliate__filter-grid">
          <div className="field">
            <label htmlFor="affiliate-shop">{t('sellerAffiliate.shop')}</label>
            <ShopDropdown
              id="affiliate-shop"
              shops={shops}
              value={shopId}
              onChange={(nextShopId) => {
                resetMarketplaceSearch();
                setShopId(nextShopId);
                setStoredSelectedShopId(nextShopId);
                setPageTokens([]);
                setData({});
              }}
              disabled={loading || !shops.length}
              placeholder={t('sellerAffiliate.selectShop')}
              unknownLabel={t('common.unknown')}
            />
          </div>
          <form className="seller-affiliate__search" onSubmit={submitSearch}>
              <div className="field seller-affiliate__search-field">
                <label htmlFor="affiliate-search">{t(ordersOnly && section === 'orders' ? 'sellerAffiliate.orderSearchLabel' : section === 'orders' ? 'sellerAffiliate.orderId' : 'common.search')}</label>
                <input
                  id="affiliate-search"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={t(`sellerAffiliate.${section}Search`)}
                />
                <button className="seller-affiliate__search-button" type="submit" aria-label={t('common.search')} title={t('common.search')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="m16 16 4 4" />
                  </svg>
                </button>
              </div>
          </form>
          {ordersOnly ? (
            <div className="field">
              <label htmlFor="affiliate-orders-period">{t('shopAnalytics.period')}</label>
              <SelectDropdown
                id="affiliate-orders-period"
                value={orderPeriod}
                onChange={(nextPeriod) => {
                  setOrderPeriod(nextPeriod);
                  if (nextPeriod !== 'custom') {
                    setOrderRange(defaultStatisticsRange(Number.parseInt(nextPeriod, 10)));
                    setPageTokens([]);
                  }
                }}
                icon={<CalendarDays size={16} />}
                options={orderPeriodOptions}
              />
            </div>
          ) : null}
          {ordersOnly && orderPeriod === 'custom' ? (
            <>
              <div className="field">
                <label htmlFor="affiliate-orders-start">{t('sellerAffiliate.startDate')}</label>
                <DatePickerInput
                  id="affiliate-orders-start"
                  label={t('sellerAffiliate.startDate')}
                  value={orderRange.start}
                  max={orderRange.end}
                  onChange={(value) => {
                    setOrderRange((current) => ({ ...current, start: value }));
                    setPageTokens([]);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="affiliate-orders-end">{t('sellerAffiliate.endDate')}</label>
                <DatePickerInput
                  id="affiliate-orders-end"
                  label={t('sellerAffiliate.endDate')}
                  value={orderRange.end}
                  min={orderRange.start}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(value) => {
                    setOrderRange((current) => ({ ...current, end: value }));
                    setPageTokens([]);
                  }}
                />
              </div>
            </>
          ) : null}
          {section === 'target' || section === 'creators' ? (
            <div className="field">
              <label htmlFor="affiliate-status">{t('sellerAffiliate.status')}</label>
              <SelectDropdown
                id="affiliate-status"
                value={status}
                onChange={(nextStatus) => {
                  setStatus(nextStatus);
                  setPageTokens([]);
                }}
                icon={<Filter size={16} />}
                options={section === 'target' ? targetStatusOptions : creatorStatusOptions}
              />
            </div>
          ) : null}
          {section === 'performance' ? (
            <div className="field">
              <label htmlFor="creator-performance-window">{t('sellerAffiliate.performanceWindow')}</label>
              <SelectDropdown
                id="creator-performance-window"
                value={performanceWindow}
                onChange={(nextWindow) => {
                  setPerformanceWindow(nextWindow);
                  setPageTokens([]);
                }}
                icon={<CalendarDays size={16} />}
                options={performanceWindowOptions}
              />
            </div>
          ) : null}
        </div>
        {ordersOnly ? (
          <>
            <form className="seller-affiliate__order-filters" onSubmit={applyOrderFilters}>
              <div className="seller-affiliate__order-filter-grid seller-affiliate__order-filter-grid--quick">
                <div className="field"><label htmlFor="affiliate-orders-date-field">{t('sellerAffiliate.orderDateField')}</label><SelectDropdown id="affiliate-orders-date-field" value={orderFilterDraft.dateField} onChange={(value) => updateOrderFilter('dateField', value)} icon={<CalendarDays size={16} />} options={[{ value: 'create_time', label: t('sellerAffiliate.orderDateCreated') }, { value: 'update_time', label: t('sellerAffiliate.orderDateUpdated') }]} /></div>
                <div className="field"><label htmlFor="affiliate-orders-status">{t('sellerAffiliate.orderStatusFilter')}</label><SelectDropdown id="affiliate-orders-status" value={orderFilterDraft.orderStatus} onChange={(value) => updateOrderFilter('orderStatus', value)} icon={<Filter size={16} />} options={[{ value: 'all', label: t('sellerAffiliate.orderFilterAll') }, ...['UNPAID', 'ON_HOLD', 'AWAITING_SHIPMENT', 'PARTIALLY_SHIPPING', 'AWAITING_COLLECTION', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'].map((value) => ({ value, label: formatStatus(value, t) }))]} /></div>
                <div className="field"><label htmlFor="affiliate-orders-shipping-type">{t('sellerAffiliate.orderShippingTypeFilter')}</label><SelectDropdown id="affiliate-orders-shipping-type" value={orderFilterDraft.shippingType} onChange={(value) => updateOrderFilter('shippingType', value)} icon={<Filter size={16} />} options={[{ value: 'all', label: t('sellerAffiliate.orderFilterAll') }, { value: 'TIKTOK', label: 'TikTok Shipping' }, { value: 'SELLER', label: 'Seller Shipping' }, { value: 'PICKUP', label: t('sellerAffiliate.orderShippingPickup') }]} /></div>
                <div className="field"><label htmlFor="affiliate-orders-refund">{t('sellerAffiliate.orderRefundFilter')}</label><SelectDropdown id="affiliate-orders-refund" value={orderFilterDraft.refundStatus} onChange={(value) => updateOrderFilter('refundStatus', value)} options={[{ value: 'all', label: t('sellerAffiliate.orderFilterAll') }, { value: 'yes', label: t('sellerAffiliate.orderHasRefund') }, { value: 'no', label: t('sellerAffiliate.orderNoRefund') }]} /></div>
              </div>
              <div className="seller-affiliate__order-filter-toolbar">
                <button className="button button--ghost seller-affiliate__advanced-filter-toggle" type="button" aria-expanded={showAdvancedOrderFilters} onClick={() => setShowAdvancedOrderFilters((current) => !current)}><Filter size={15} />{t('sellerAffiliate.advancedFilters')}{activeAdvancedFilterCount ? <span>{activeAdvancedFilterCount}</span> : null}</button>
                <div className="seller-affiliate__order-filter-actions"><button className="button button--primary" type="submit" disabled={!orderFiltersDirty || Boolean(orderFilterError) || loading}>{loading ? t('common.loading') : t('sellerAffiliate.applyOrderFilters')}</button><button className="button button--ghost" type="button" onClick={resetOrderFilters} disabled={!hasActiveOrderFilters && !orderFiltersDirty}>{t('sellerAffiliate.resetOrderFilters')}</button></div>
              </div>
              {showAdvancedOrderFilters ? <div className="seller-affiliate__order-filter-grid seller-affiliate__order-filter-grid--advanced">
                <div className="field"><label htmlFor="affiliate-orders-warehouse">{t('sellerAffiliate.orderWarehouse')}</label><input id="affiliate-orders-warehouse" value={orderFilterDraft.warehouse} onChange={(event) => updateOrderFilter('warehouse', event.target.value)} placeholder={t('sellerAffiliate.orderWarehousePlaceholder')} /></div>
                <div className="field"><label htmlFor="affiliate-orders-cancel">{t('sellerAffiliate.orderBuyerCancellation')}</label><SelectDropdown id="affiliate-orders-cancel" value={orderFilterDraft.buyerCancellation} onChange={(value) => updateOrderFilter('buyerCancellation', value)} options={[{ value: 'all', label: t('sellerAffiliate.orderFilterAll') }, { value: 'yes', label: t('common.yes') }, { value: 'no', label: t('common.no') }]} /></div>
                <div className="field"><label htmlFor="affiliate-orders-settlement">{t('sellerAffiliate.orderSettlementFilter')}</label><SelectDropdown id="affiliate-orders-settlement" value={orderFilterDraft.settlementStatus} onChange={(value) => updateOrderFilter('settlementStatus', value)} options={[{ value: 'all', label: t('sellerAffiliate.orderFilterAll') }, { value: 'SETTLED', label: t('sellerAffiliate.orderFilterCompleted') }, { value: 'UNSETTLED', label: t('sellerAffiliate.orderFilterUnsettled') }]} /></div>
                <div className="field"><label htmlFor="affiliate-orders-carrier">{t('sellerAffiliate.orderCarrierFilter')}</label><input id="affiliate-orders-carrier" value={orderFilterDraft.carrier} onChange={(event) => updateOrderFilter('carrier', event.target.value)} placeholder="J&T Express" /></div>
                <div className="field"><label htmlFor="affiliate-orders-product-sku">{t('sellerAffiliate.orderProductSkuFilter')}</label><input id="affiliate-orders-product-sku" value={orderFilterDraft.productSku} onChange={(event) => updateOrderFilter('productSku', event.target.value)} placeholder={t('sellerAffiliate.orderProductSkuPlaceholder')} /></div>
                <div className="field"><label htmlFor="affiliate-orders-settlement-min">{t('sellerAffiliate.orderSettlementMin')}</label><input id="affiliate-orders-settlement-min" type="number" min="0" step="0.01" value={orderFilterDraft.settlementMin} onChange={(event) => updateOrderFilter('settlementMin', event.target.value)} placeholder="0" aria-invalid={Boolean(orderFilterError)} /></div>
                <div className="field"><label htmlFor="affiliate-orders-settlement-max">{t('sellerAffiliate.orderSettlementMax')}</label><input id="affiliate-orders-settlement-max" type="number" min="0" step="0.01" value={orderFilterDraft.settlementMax} onChange={(event) => updateOrderFilter('settlementMax', event.target.value)} placeholder="500" aria-invalid={Boolean(orderFilterError)} /></div>
                <div className="field"><label htmlFor="affiliate-orders-delivery-issue">{t('sellerAffiliate.orderDeliveryIssue')}</label><SelectDropdown id="affiliate-orders-delivery-issue" value={orderFilterDraft.deliveryIssue} onChange={(value) => updateOrderFilter('deliveryIssue', value)} options={[{ value: 'all', label: t('sellerAffiliate.orderFilterAll') }, { value: 'yes', label: t('sellerAffiliate.orderDeliveryIssueOnly') }, { value: 'no', label: t('sellerAffiliate.orderDeliveryNoIssue') }]} /></div>
                <div className="field"><label htmlFor="affiliate-orders-source">{t('sellerAffiliate.salesSource')}</label><SelectDropdown id="affiliate-orders-source" value={orderFilterDraft.source} onChange={(value) => updateOrderFilter('source', value)} options={[{ value: 'all', label: t('sellerAffiliate.orderFilterAll') }, { value: 'VIDEO', label: t('sellerAffiliate.orderSource_VIDEO') }, { value: 'LIVE', label: t('sellerAffiliate.orderSource_LIVE') }, { value: 'SHOP', label: t('sellerAffiliate.orderSource_SHOP') }, { value: 'DIRECT', label: t('sellerAffiliate.orderSource_DIRECT') }]} /></div>
              </div> : null}
              {orderFilterError ? <p className="seller-affiliate__order-filter-error" role="alert">{t('sellerAffiliate.orderSettlementRangeError')}</p> : null}
            </form>
          </>
        ) : null}
      </section>

      {!shops.length && !loading ? <section className="section-card empty-state"><h2>{t('sellerAffiliate.noShop')}</h2><p>{t('sellerAffiliate.noShopMeta')}</p></section> : null}
      {selectedShop && !hasScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingScope')}</strong><p>{t('sellerAffiliate.missingScopeMeta')}</p><code>{REQUIRED_SCOPE}</code></div></section> : null}
      {selectedShop && hasScope && ordersOnly && !hasProductScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingProductScope')}</strong><p>{t('sellerAffiliate.missingProductScopeMeta')}</p><code>{PRODUCT_SCOPE}</code></div></section> : null}
      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}
      {contactNotice ? <section className={`section-card seller-affiliate__contact-notice seller-affiliate__contact-notice--${contactNotice.type}`} role={contactNotice.type === 'error' ? 'alert' : 'status'}><span>{contactNotice.text}</span><button type="button" aria-label={t('common.close')} onClick={() => setContactNotice(null)}>×</button></section> : null}

      {selectedShop && hasScope && ordersOnly ? <>
        <section className="seller-affiliate__summary seller-affiliate__order-kpis" aria-label={t('sellerAffiliate.orderOverview')}>
          <article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.orderKpiOrders')}</p><p className="stat-card__value">{orderOverviewLoading ? '—' : formatNumber(orderOverview.kpis?.sales_orders ?? orderOverview.kpis?.orders)}</p>{!orderOverviewLoading && Number(orderOverview.kpis?.orders) !== Number(orderOverview.kpis?.sales_orders ?? orderOverview.kpis?.orders) ? <span className="row-subtitle">{t('sellerAffiliate.orderKpiRecordedOrders', { count: formatNumber(orderOverview.kpis?.orders) })}</span> : null}</article>
          <article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.orderKpiGrossRevenue')}</p><p className="stat-card__value">{orderOverviewLoading ? '—' : formatMoneyValues(orderOverview.kpis?.gross_revenue || orderOverview.kpis?.affiliate_gmv)}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.orderKpiNetRevenue')}</p><p className="stat-card__value">{orderOverviewLoading ? '—' : formatMoneyValues(orderOverview.kpis?.net_revenue)}</p></article>
          <button className="stat-card stat-card--interactive" type="button" onClick={() => applyOrderFilterPatch({ refundStatus: 'yes', attentionOnly: false })}><p className="stat-card__label">{t('sellerAffiliate.orderKpiRefundedRevenue')}</p><p className="stat-card__value">{orderOverviewLoading ? '—' : formatMoneyValues(orderOverview.kpis?.refunded_revenue)}</p><span className="row-subtitle">{t('sellerAffiliate.orderKpiRefundSummary', { rate: Number(orderOverview.kpis?.refund_return_rate || 0).toLocaleString(locale, { maximumFractionDigits: 2 }), count: formatNumber(orderOverview.kpis?.refunded_returned_orders) })}</span></button>
          <button className="stat-card stat-card--interactive stat-card--attention" type="button" onClick={() => applyOrderFilterPatch({ attentionOnly: true, deliveryIssue: 'all' })}><p className="stat-card__label">{t('sellerAffiliate.orderNeedsAttention')}</p><p className="stat-card__value">{orderOverviewLoading ? '—' : formatNumber(orderOverview.kpis?.attention_orders)}</p><span className="row-subtitle">{t('sellerAffiliate.orderAttentionSummary', { overdue: formatNumber(orderOverview.kpis?.overdue_orders), cancel: formatNumber(orderOverview.kpis?.buyer_cancel_requests) })}</span></button>
        </section>
        <details className="seller-affiliate__secondary-kpis"><summary>{t('sellerAffiliate.moreOrderMetrics')}</summary><section className="seller-affiliate__summary"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.orderKpiAov')}</p><p className="stat-card__value">{orderOverviewLoading ? '—' : formatMoneyValues(orderOverview.kpis?.average_order_value)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.orderKpiItems')}</p><p className="stat-card__value">{orderOverviewLoading ? '—' : formatNumber(orderOverview.kpis?.items_sold)}</p><span className="row-subtitle">{t('sellerAffiliate.orderKpiRefundedItems', { count: formatNumber(orderOverview.kpis?.items_refunded) })}</span></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.orderKpiCommission')}</p><p className="stat-card__value">{orderOverviewLoading ? '—' : formatMoneyValues(orderOverview.kpis?.estimated_commission)}</p></article></section></details>
        {['revenue', 'settlement', 'refund'].some((metric) => orderOverview.top_products?.[metric]?.length) ? <section className="section-card seller-affiliate__top-products">
          <div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.topProductsTitle')}</h2></div></div>
          <div className="seller-affiliate__top-products-grid">{['revenue', 'settlement', 'refund'].map((metric) => {
            const valueField = metric === 'revenue' ? 'gross_revenue' : metric === 'refund' ? 'refunded_revenue' : 'settlement';
            return <article key={metric}><h3>{t(`sellerAffiliate.topProducts_${metric}`)}</h3><ol>{(orderOverview.top_products?.[metric] || []).slice(0, 5).map((product) => <li key={product.product_id}>{product.image_url ? <img src={product.image_url} alt="" loading="lazy" /> : <span className="seller-affiliate__order-product-placeholder" aria-hidden="true">P</span>}<span>{product.product_url ? <a href={product.product_url} target="_blank" rel="noreferrer">{product.title}</a> : <strong>{product.title}</strong>}<small>{product.product_id}{product.status ? ` · ${product.status}` : ''}</small></span><strong>{formatMoneyValues(product[valueField])}</strong></li>)}</ol></article>;
          })}</div>
        </section> : null}
        {orderOverviewError ? <section className="section-card empty-state empty-state--compact" role="alert">{orderOverviewError}</section> : null}
      </> : null}

      {selectedShop && hasScope ? <>
        {section === 'performance' ? <section className="section-card"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceTitle')}</h2><p className="section-card__meta">{selectedPerformanceExport ? `${formatReportDate(selectedPerformanceExport.start_date)} – ${formatReportDate(selectedPerformanceExport.end_date)}` : t(`sellerAffiliate.performanceStatus_${data.export?.status || 'EMPTY'}`)}</p></div></div>{baseMetrics.length ? <section className="seller-affiliate__summary seller-affiliate__base-summary">{baseMetrics.map(([key, value]) => <article className="stat-card" key={key}><p className="stat-card__label">{t(`sellerAffiliate.${key}`)}</p><p className="stat-card__value seller-affiliate__setting-value">{value}</p></article>)}</section> : null}</section> : null}
        {section === 'performance' && !hasMarketplaceScope ? <section className="section-card empty-state empty-state--compact" role="alert"><strong>{t('sellerAffiliate.missingMarketplaceScope')}</strong><span>{t('sellerAffiliate.missingMarketplaceScopeMeta')}</span></section> : null}
        {section === 'discover' && !hasMarketplaceScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingMarketplaceScope')}</strong><p>{t('sellerAffiliate.missingMarketplaceScopeMeta')}</p><code>{MARKETPLACE_SCOPE}</code></div></section> : null}
        {section === 'discover' && hasMarketplaceScope && !hasProductScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingProductScope')}</strong><p>{t('sellerAffiliate.missingProductScopeMeta')}</p><code>{PRODUCT_SCOPE}</code></div></section> : null}
        {section === 'performance' && performanceBreakdown.length ? <section className="section-card seller-creator-breakdown"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceChartTitle')}</h2><p className="section-card__meta">{t('sellerAffiliate.performanceChartMeta')}</p></div></div><div className="seller-creator-breakdown__body"><div className="seller-creator-breakdown__chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={performanceBreakdown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{performanceBreakdown.map((item, index) => <Cell key={item.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatMoney({ amount: value, currency: rows[0]?.currency || 'MYR' })} /></PieChart></ResponsiveContainer><div className="seller-creator-breakdown__center"><strong>{formatMoney({ amount: performanceBreakdownTotal, currency: rows[0]?.currency || 'MYR' })}</strong><span>{t('sellerAffiliate.top10Gmv')}</span></div></div><div className="seller-creator-breakdown__legend">{performanceBreakdown.map((item, index) => <div key={item.name}><i style={{ background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} /><span>{item.name}</span><strong>{formatMoney({ amount: item.value, currency: rows[0]?.currency || 'MYR' })}</strong></div>)}</div></div></section> : null}
        {section === 'creators' ? <section className="section-card seller-creator-breakdown"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.breakdownTitle')}</h2></div><div className="field seller-creator-breakdown__select"><label htmlFor="creator-breakdown-metric">{t('sellerAffiliate.metric')}</label><SelectDropdown id="creator-breakdown-metric" value={creatorBreakdownMetric} onChange={setCreatorBreakdownMetric} icon={<BarChart3 size={16} />} options={creatorBreakdownMetricOptions} /></div></div>{creatorBreakdown.length ? <div className="seller-creator-breakdown__body"><div className="seller-creator-breakdown__chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={creatorBreakdown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{creatorBreakdown.map((item, index) => <Cell key={item.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: value, currency: creatorBreakdownCurrency }) : formatNumber(value)} /></PieChart></ResponsiveContainer><div className="seller-creator-breakdown__center"><strong>{creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: creatorBreakdownTotal, currency: creatorBreakdownCurrency }) : formatNumber(creatorBreakdownTotal)}</strong><span>{t(`sellerAffiliate.breakdown_${creatorBreakdownMetric}`)}</span></div></div><div className="seller-creator-breakdown__legend">{creatorBreakdown.slice(0, 8).map((item, index) => <div key={item.name}><i style={{ background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} /><span>{item.name}</span><strong>{creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: item.value, currency: creatorBreakdownCurrency }) : formatNumber(item.value)}</strong></div>)}</div></div> : <div className="empty-state">{t('sellerAffiliate.noData')}</div>}</section> : null}
        {section === 'open' && openCollaborationSettings ? <section className="seller-affiliate__summary"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.autoAdd')}</p><p className="stat-card__value seller-affiliate__setting-value">{openCollaborationSettings.auto_add_product?.enable ? t('common.yes') : t('common.no')}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.defaultCommission')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatRate(openCollaborationSettings.auto_add_product?.commission_rate)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.total')}</p><p className="stat-card__value seller-affiliate__setting-value">{formatNumber(data.total_count)}</p></article></section> : null}
        {section === 'performance' ? <section className="section-card">
          <div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceTitle')}</h2><p className="section-card__meta">{t('sellerAffiliate.performanceMeta')}</p></div><span className="chip">{formatNumber(data.total_count ?? rows.length)}</span></div>
          <div className="table-wrap seller-affiliate__performance-table-wrap"><table className="data-table seller-affiliate__table seller-affiliate__table--performance">
            <thead><tr>{performanceColumns.map((column) => <th className={column.numeric ? 'cell-number' : undefined} key={column.key}><span className="seller-affiliate__column-heading">{t(`sellerAffiliate.${column.key}`)}{column.tooltipKey ? <MetricTooltip text={t(`sellerAffiliate.${column.tooltipKey}`)} /> : null}</span></th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={tableColumnCount}><div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div></td></tr> : rows.length ? rows.map((row, index) => <tr key={row.id || index}>{performanceColumns.map((column) => <td className={column.numeric ? 'cell-number' : undefined} key={column.key}>{column.render(row)}</td>)}</tr>) : <tr><td colSpan={tableColumnCount}><div className="empty-state">{t('sellerAffiliate.noData')}</div></td></tr>}
            </tbody>
          </table></div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={changePage}
            disabled={loading}
            previousLabel={t('common.previous')}
            nextLabel={t('common.next')}
            ariaLabel={t('sellerAffiliate.page', { page: currentPage })}
          />
        </section> : null}
        {section !== 'performance' && (section !== 'discover' || hasMarketplaceScope) ? <section className="section-card">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">{t(`sellerAffiliate.${section}Title`)}</h2>
              {section !== 'target' && section !== 'discover' && section !== 'open' && !(ordersOnly && section === 'orders') ? <p className="section-card__meta">{t(`sellerAffiliate.${section}Meta`)}</p> : null}
            </div>
            <div className="section-card__actions">
              {ordersOnly && selectedShop && hasShopOrderScope ? <span className="chip chip--positive">{t('sellerAffiliate.orderAppConnected')}</span> : null}
              <span className="chip">{formatNumber(data.total_count ?? rows.length)}</span>
            </div>
          </div>
          <div className="table-wrap"><table className={`data-table seller-affiliate__table${section === 'orders' ? ' seller-affiliate__table--orders' : ''}`}><thead><tr>{section === 'open' ? <><th>{t('sellerAffiliate.product')}</th><th>{t('sellerAffiliate.commission')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.status')}</th></> : section === 'target' ? <><th>{t('sellerAffiliate.invitation')}</th><th>{t('sellerAffiliate.products')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.validity')}</th><th>{t('sellerAffiliate.status')}</th></> : section === 'discover' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.creatorGmv30')}</th><th>{t('sellerAffiliate.itemsSold')}</th><th>{t('sellerAffiliate.avgVideoViews')}</th><th>{t('sellerAffiliate.engagementRate')}</th><th>{t('sellerAffiliate.actions')}</th></> : section === 'performance' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.creatorGmv')}</th><th>{t('sellerAffiliate.affiliateOrders')}</th><th>{t('sellerAffiliate.itemsSold')}</th><th>{t('sellerAffiliate.productImpressions')}</th><th>{t('sellerAffiliate.refundedGmv')}</th><th>{t('sellerAffiliate.followers')}</th></> : section === 'creators' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.followers')}</th><th>{t('sellerAffiliate.creatorGmv30')}</th><th>{t('sellerAffiliate.content')}</th><th>{t('sellerAffiliate.fulfillment')}</th><th>{t('sellerAffiliate.status')}</th><th>{t('sellerAffiliate.actions')}</th></> : <><th>{t('sellerAffiliate.orderAndCreatedAt')}</th><th>{t('sellerAffiliate.products')}</th><th>{t('sellerAffiliate.totalPayment')}</th><th>{t('sellerAffiliate.orderStatus')}</th><th>{t('sellerAffiliate.deliveryStatus')}</th><th>{t('sellerAffiliate.shippingCarrier')}</th><th>{t('sellerAffiliate.refund')}</th><th>{t('sellerAffiliate.tiktokFees')}</th><th>{t('sellerAffiliate.actualSettlement')}</th><th>{t('sellerAffiliate.slaWarning')}</th><th>{t('sellerAffiliate.actions')}</th></>}</tr></thead><tbody>
            {loading ? <tr><td colSpan={section === 'orders' ? 11 : section === 'discover' ? 6 : 7}><div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div></td></tr> : section !== 'discover' && rows.length ? rows.map((row, index) => section === 'open' ? <tr key={row.id || index}><td><div className="seller-affiliate__product">{row.product?.main_image_url ? <img src={row.product.main_image_url} alt="" loading="lazy" /> : null}<div><strong>{row.product?.title || row.product?.id || row.id}</strong><span>{row.product?.id}</span></div></div></td><td>{formatRate(row.current_commission?.rate ?? row.commission_rate)}</td><td>{formatNumber(row.showcase_creator_count)} / {formatNumber(row.content_creator_count)}</td><td><span className="chip">{formatStatus(row.status, t)}</span></td></tr> : section === 'target' ? <tr key={row.id || index}><td><strong>{row.name || row.id}</strong><span className="row-subtitle">{row.id}</span><div className="target-collaboration__creators">{(row.creators || []).slice(0, 3).map((creator, creatorIndex) => <div className="creator-identity" key={creator.creator_open_id || creator.user_id || creator.username || creatorIndex}><CreatorAvatar src={creator.avatar?.url || creator.avatar_url} name={creator.nickname || creator.username} /><span><strong>{creator.nickname || creator.username || '—'}</strong><span className="row-subtitle">{creator.username ? `@${creator.username.replace(/^@/, '')}` : '—'}</span></span></div>)}{row.creators?.length > 3 ? <span className="target-collaboration__more">+{formatNumber(row.creators.length - 3)}</span> : null}</div></td><td>{formatNumber(row.products?.length ?? row.product_count)}</td><td>{formatNumber(row.showcase_creator_count)} / {formatNumber(row.content_creator_count)}</td><td>{formatTime(row.end_time)}</td><td><span className="chip">{formatStatus(row.status || row.collaboration_status, t)}</span></td></tr> : section === 'performance' ? <tr key={row.id || index}>{performanceCreatorCell(row)}<td>{formatMoney({ amount: row.affiliate_gmv, currency: row.currency })}</td><td>{formatNumber(row.affiliate_orders)}</td><td>{formatNumber(row.items_sold)}</td><td>{formatNumber(row.product_impressions)}</td><td>{formatMoney({ amount: row.refunded_gmv, currency: row.currency })}</td><td>{formatNumber(row.followers)}</td></tr> : section === 'creators' ? <tr key={row.id || index}><td><div className="creator-identity"><CreatorAvatar src={row.creator?.avatar_url} name={row.creator?.nickname || row.creator?.username} /><span><strong>{row.creator?.nickname || row.creator?.username || '—'}</strong><span className="row-subtitle">{row.creator?.username ? `@${row.creator.username.replace(/^@/, '')}` : row.creator?.user_id}</span></span></div></td><td>{formatNumber(row.creator?.follower_count)}</td><td>{formatMoney(row.creator?.gmv)}</td><td>{row.sample_content_status === 'UNAVAILABLE' ? t('common.noData') : row.sample_content_status === 'PENDING_SYNC' ? t('sellerAffiliate.loadContent') : row.sample_content_count ? <>{formatNumber(row.sample_content_count)}<span className="row-subtitle">{formatNumber(row.sample_content_views)} {t('common.views')}</span></> : t('sellerAffiliate.notPosted')}</td><td>{row.creator?.fulfillment_percentage ? `${row.creator.fulfillment_percentage}%` : formatStatus(row.fulfillment_status, t)}</td><td><span className="chip">{formatStatus(row.status, t)}</span></td><td><button className="button button--small button--ghost" type="button" onClick={() => openCreatorDetail(row)}>{t('sellerAffiliate.view')}</button></td></tr> : <tr className="seller-affiliate__order-row" key={row.order_id || row.id || index} tabIndex={0} onClick={() => setSelectedOrder(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedOrder(row); } }}><td><OrderIdentity row={row} formatTime={formatTime} /></td><td><AffiliateOrderProducts row={row} t={t} /></td><td><OrderPayment row={row} formatMoneyValues={formatMoneyValues} /></td><td><OrderStatus row={row} t={t} /></td><td><OrderShippingStatus row={row} t={t} /></td><td><OrderCarrier row={row} /></td><td><OrderFinanceValue row={row} field="refund" formatMoneyValues={formatMoneyValues} t={t} /></td><td><OrderFinanceValue row={row} field="fees" formatMoneyValues={formatMoneyValues} t={t} /></td><td><OrderFinanceValue row={row} field="settlement" formatMoneyValues={formatMoneyValues} t={t} /></td><td><OrderSla row={row} formatTime={formatTime} t={t} /></td><td><OrderActions row={row} onView={setSelectedOrder} t={t} /></td></tr>) : !rows.length ? <tr><td colSpan={section === 'orders' ? 11 : section === 'discover' ? 6 : 7}><div className="empty-state">{t(section === 'discover' && data.search_pending ? 'sellerAffiliate.discoverSearchPending' : section === 'discover' && !submittedKeyword ? 'sellerAffiliate.discoverSyncPending' : 'sellerAffiliate.noData')}</div></td></tr> : null}
            {section === 'discover' && !loading ? rows.map((row, index) => <tr className="marketplace-creator-row" key={`marketplace-${row.creator_open_id || row.username || index}`}><MarketplaceCreatorCell creator={row} followerCount={formatCreatorCount(row, ['follower_count', 'followers'])} t={t} /><td>{formatCreatorGmv(row)}</td><td>{formatUnitsSold(row)}</td><td>{formatCreatorCount(row, ['avg_video_views', 'avg_ec_video_play_count', 'avg_ec_video_view_count', 'avg_ec_video_views', 'avg_video_play_count', 'avg_video_view_count'])}</td><td>{formatEngagementRate(row)}</td><td><div className="actions actions--inline seller-affiliate__creator-actions"><button className="button button--small" type="button" onClick={() => openInvite(row)}>{t('sellerAffiliate.inviteCreator')}</button></div></td></tr>) : null}
          </tbody></table></div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={changePage}
            disabled={loading}
            previousLabel={t('common.previous')}
            nextLabel={t('common.next')}
            ariaLabel={t('sellerAffiliate.page', { page: currentPage })}
            alwaysVisible={ordersOnly}
          />
        </section> : null}
      </> : null}
      {inviteCreator ? createPortal(<InviteCreatorModal t={t} locale={locale} creator={inviteCreator} activeTab={inviteTab} onTabChange={setInviteTab} invitations={ongoingInvitations} selectedInvitationId={selectedInvitationId} onSelectInvitation={setSelectedInvitationId} search={invitationSearch} onSearchChange={setInvitationSearch} products={inviteProducts} form={inviteForm} setForm={setInviteForm} onToggleProduct={toggleInviteProduct} loading={inviteLoading} onClose={() => setInviteCreator(null)} onSubmit={inviteTab === 'ongoing' ? submitExistingInvite : submitInvite} />, document.body) : null}
      <OrderDetailDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} formatTime={formatTime} formatMoneyValues={formatMoneyValues} t={t} />
      {selectedCreatorApplication ? <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreatorDetail(); }}><aside className="koc-drawer" role="dialog" aria-modal="true" aria-labelledby="seller-creator-detail-title"><div className="koc-drawer__header"><div><h2 id="seller-creator-detail-title">{selectedCreatorApplication.creator?.nickname || selectedCreatorApplication.creator?.username}</h2><p>{selectedCreatorApplication.creator?.username ? `@${selectedCreatorApplication.creator.username.replace(/^@/, '')}` : selectedCreatorApplication.creator?.user_id}</p></div><button className="button button--ghost" type="button" onClick={closeCreatorDetail} aria-label={t('common.close')}>×</button></div><div className="koc-drawer__body"><section className="drawer-section"><div className="drawer-profile">{selectedCreatorApplication.creator?.avatar_url ? <img src={selectedCreatorApplication.creator.avatar_url} alt="" /> : null}<div><strong>{selectedCreatorApplication.creator?.nickname || selectedCreatorApplication.creator?.username}</strong><span>{formatNumber(selectedCreatorApplication.creator?.follower_count)} {t('sellerAffiliate.followers')}</span></div></div></section><section className="page__stats page__stats--four"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.creatorGmv')}</p><p className="stat-card__value">{formatMoney(selectedCreatorApplication.creator?.gmv)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.content')}</p><p className="stat-card__value">{selectedCreatorApplication.sample_content_count === null || selectedCreatorApplication.sample_content_count === undefined ? '—' : formatNumber(selectedCreatorApplication.sample_content_count)}</p></article><article className="stat-card"><p className="stat-card__label">{t('common.views')}</p><p className="stat-card__value">{selectedCreatorApplication.sample_content_views === null || selectedCreatorApplication.sample_content_views === undefined ? '—' : formatNumber(selectedCreatorApplication.sample_content_views)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.fulfillment')}</p><p className="stat-card__value">{selectedCreatorApplication.creator?.fulfillment_percentage ? `${selectedCreatorApplication.creator.fulfillment_percentage}%` : '—'}</p></article></section><section className="drawer-section"><h3>{t('sellerAffiliate.sampleDetail')}</h3><div className="drawer-meta"><span>{t('sellerAffiliate.status')}: <strong>{selectedCreatorApplication.status || '—'}</strong></span><span>{t('sellerAffiliate.fulfillmentStatus')}: <strong>{selectedCreatorApplication.fulfillment_status || '—'}</strong></span><span>{t('sellerAffiliate.sampleOrder')}: <strong>{selectedCreatorApplication.order_id || '—'}</strong></span><span>{t('sellerAffiliate.tracking')}: <strong>{selectedCreatorApplication.tracking_number || '—'}</strong></span><span>{t('sellerAffiliate.product')}: <strong>{selectedCreatorApplication.product?.title || selectedCreatorApplication.product?.id || '—'}</strong></span></div></section><section className="drawer-section"><h3>{t('sellerAffiliate.creatorContent')}</h3>{creatorDetailLoading ? <div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div> : <div className="drawer-meta"><span>{t('sellerAffiliate.videos')}: <strong>{creatorContent?.video_count ?? '—'}</strong></span><span>{t('sellerAffiliate.lives')}: <strong>{creatorContent?.live_count ?? '—'}</strong></span><span>{t('sellerAffiliate.promotionStatus')}: <strong>{creatorContent?.promotion_status || '—'}</strong></span><span>{t('sellerAffiliate.promotionEnd')}: <strong>{formatTime(creatorContent?.promotion_end_time)}</strong></span></div>}</section></div></aside></div> : null}
    </div>
  );
};

export default SellerAffiliatePanel;
