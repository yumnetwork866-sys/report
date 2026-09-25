import React from 'react';
import { CalendarDays, Download, Filter, X } from 'lucide-react';
import ShopDropdown from '../ShopDropdown';
import SelectDropdown from '../SelectDropdown';
import DatePickerInput from '../DatePickerInput';
import Pagination from '../Pagination';
import { setStoredSelectedShopId } from '../../lib/shopSelection';
import { defaultStatisticsRange } from '../SellerAffiliatePanel/utils/sellerAffiliateUtils';
import {
  AffiliateOrderProducts,
  OrderDetailDrawer,
} from '../SellerAffiliatePanel/components/AffiliatePresentation';
import { PRODUCT_SCOPE, REQUIRED_SCOPE } from '../SellerAffiliatePanel/constants';
import useShopOrders from './hooks/useShopOrders';
import OrderQuickTabs from './components/OrderQuickTabs';
import OrderCompactKpi from './components/OrderCompactKpi';
import OrderIdentityCell from './components/cells/OrderIdentityCell';
import OrderAttributionCell from './components/OrderAttributionCell';
import OrderStatusFulfillmentCell from './components/cells/OrderStatusFulfillmentCell';
import OrderFinancialCell from './components/cells/OrderFinancialCell';
import OrderActionCell from './components/cells/OrderActionCell';

export const OrderManagement = () => {
  const {
    activeAdvancedFilterCount,
    activeQuickTab,
    applyOrderFilterPatch,
    applyOrderFilters,
    changePage,
    currentPage,
    data,
    error,
    exportOrders,
    formatMoneyValues,
    formatNumber,
    formatTime,
    handleQuickTabChange,
    hasActiveOrderFilters,
    hasProductScope,
    hasScope,
    hasShopOrderScope,
    keyword,
    loading,
    locale,
    orderFilterDraft,
    orderFilterError,
    orderFiltersDirty,
    orderOverview,
    orderOverviewError,
    orderOverviewLoading,
    orderPeriod,
    orderPeriodOptions,
    orderRange,
    resetOrderFilters,
    rows,
    selectedOrder,
    selectedShop,
    setKeyword,
    setOrderPeriod,
    setOrderRange,
    setPageTokens,
    setSelectedOrder,
    setShopId,
    shopId,
    shops,
    showAdvancedFilters,
    setShowAdvancedFilters,
    submitSearch,
    t,
    totalPages,
    updateOrderFilter,
  } = useShopOrders();

  const handleExport = (event) => {
    event.preventDefault();
    exportOrders();
  };

  const quickTabCounts = {
    refunded: orderOverview.kpis?.refunded_returned_orders,
    attention: orderOverview.kpis?.attention_orders,
  };

  const totalFilterCount = activeAdvancedFilterCount
    + (orderFilterDraft.shippingType !== 'all' ? 1 : 0)
    + (orderFilterDraft.dateField !== 'create_time' ? 1 : 0);

  return (
    <div className="page seller-affiliate order-management-page">
      <section className="section-card order-management__header-card">
        {/* Unified 1-Line Toolbar */}
        <div className="order-management__toolbar">
          <div className="order-management__shop-field">
            <ShopDropdown
              id="order-shop-select"
              shops={shops}
              value={shopId}
              onChange={(nextShopId) => {
                setShopId(nextShopId);
                setStoredSelectedShopId(nextShopId);
                setPageTokens([]);
              }}
              disabled={loading || !shops.length}
              placeholder={t('sellerAffiliate.selectShop')}
              unknownLabel={t('common.unknown')}
            />
          </div>

          <form className="order-management__search-field" onSubmit={submitSearch}>
            <input
              id="order-search-input"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t('sellerAffiliate.ordersSearch')}
            />
            <button className="seller-affiliate__search-button" type="submit" aria-label={t('common.search')} title={t('common.search')}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
            </button>
          </form>

          <div className="order-management__period-field">
            <SelectDropdown
              id="order-period-select"
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

          {orderPeriod === 'custom' ? (
            <div className="order-management__custom-dates">
              <DatePickerInput
                id="order-start-date"
                label={t('sellerAffiliate.startDate')}
                value={orderRange.start}
                max={orderRange.end}
                onChange={(value) => {
                  setOrderRange((current) => ({ ...current, start: value }));
                  setPageTokens([]);
                }}
              />
              <DatePickerInput
                id="order-end-date"
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
          ) : null}

          <div className="order-management__toolbar-actions">
            <button
              className={`button ${showAdvancedFilters || totalFilterCount > 0 ? 'button--primary' : 'button--ghost'} order-management__filter-btn`}
              type="button"
              aria-expanded={showAdvancedFilters}
              onClick={() => setShowAdvancedFilters((current) => !current)}
              title={t('sellerAffiliate.advancedFilters')}
            >
              <Filter size={15} />
              <span>{t('sellerAffiliate.advancedFilters')}</span>
              {totalFilterCount > 0 ? (
                <span className="order-management__filter-badge">{totalFilterCount}</span>
              ) : null}
            </button>

            <button
              className="button button--ghost order-management__export-btn"
              type="button"
              onClick={handleExport}
              disabled={!rows.length || loading}
              title={t('sellerAffiliate.exportOrders')}
            >
              <Download size={15} />
              <span>{t('sellerAffiliate.exportOrders')}</span>
            </button>
          </div>
        </div>

        {/* Quick Tabs Directly Under Toolbar */}
        <div className="order-management__quick-tabs-wrap">
          <OrderQuickTabs
            activeTab={activeQuickTab}
            onTabChange={handleQuickTabChange}
            counts={quickTabCounts}
            t={t}
          />
        </div>

        {/* Collapsible Advanced Filters Panel */}
        {showAdvancedFilters ? (
          <form className="order-management__filters-panel" onSubmit={applyOrderFilters}>
            <div className="order-management__filters-panel-header">
              <h3>{t('sellerAffiliate.advancedFilters')}</h3>
              <button
                type="button"
                className="button button--ghost button--icon"
                onClick={() => setShowAdvancedFilters(false)}
                title={t('common.close')}
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </div>

            <div className="seller-affiliate__order-filter-grid seller-affiliate__order-filter-grid--advanced">
              <div className="field">
                <label htmlFor="order-date-field">{t('sellerAffiliate.orderDateField')}</label>
                <SelectDropdown
                  id="order-date-field"
                  value={orderFilterDraft.dateField}
                  onChange={(value) => updateOrderFilter('dateField', value)}
                  icon={<CalendarDays size={16} />}
                  options={[
                    { value: 'create_time', label: t('sellerAffiliate.orderDateCreated') },
                    { value: 'update_time', label: t('sellerAffiliate.orderDateUpdated') },
                  ]}
                />
              </div>

              <div className="field">
                <label htmlFor="order-shipping-type">{t('sellerAffiliate.orderShippingTypeFilter')}</label>
                <SelectDropdown
                  id="order-shipping-type"
                  value={orderFilterDraft.shippingType}
                  onChange={(value) => updateOrderFilter('shippingType', value)}
                  options={[
                    { value: 'all', label: t('sellerAffiliate.orderFilterAll') },
                    { value: 'TIKTOK', label: 'TikTok Shipping' },
                    { value: 'SELLER', label: 'Seller Shipping' },
                    { value: 'PICKUP', label: t('sellerAffiliate.orderShippingPickup') },
                  ]}
                />
              </div>

              <div className="field">
                <label htmlFor="order-filter-source">{t('sellerAffiliate.salesSource')}</label>
                <SelectDropdown
                  id="order-filter-source"
                  value={orderFilterDraft.source}
                  onChange={(value) => updateOrderFilter('source', value)}
                  options={[
                    { value: 'all', label: t('sellerAffiliate.orderFilterAll') },
                    { value: 'VIDEO', label: t('sellerAffiliate.orderSource_VIDEO') },
                    { value: 'LIVE', label: t('sellerAffiliate.orderSource_LIVE') },
                    { value: 'SHOP', label: t('sellerAffiliate.orderSource_SHOP') },
                    { value: 'DIRECT', label: t('sellerAffiliate.orderSource_DIRECT') },
                  ]}
                />
              </div>

              <div className="field">
                <label htmlFor="order-filter-settlement">{t('sellerAffiliate.orderSettlementFilter')}</label>
                <SelectDropdown
                  id="order-filter-settlement"
                  value={orderFilterDraft.settlementStatus}
                  onChange={(value) => updateOrderFilter('settlementStatus', value)}
                  options={[
                    { value: 'all', label: t('sellerAffiliate.orderFilterAll') },
                    { value: 'SETTLED', label: t('sellerAffiliate.orderFilterCompleted') },
                    { value: 'UNSETTLED', label: t('sellerAffiliate.orderFilterUnsettled') },
                  ]}
                />
              </div>

              <div className="field">
                <label htmlFor="order-filter-settlement-min">{t('sellerAffiliate.orderSettlementMin')}</label>
                <input
                  id="order-filter-settlement-min"
                  type="number"
                  min="0"
                  step="0.01"
                  value={orderFilterDraft.settlementMin}
                  onChange={(event) => updateOrderFilter('settlementMin', event.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(orderFilterError)}
                />
              </div>

              <div className="field">
                <label htmlFor="order-filter-settlement-max">{t('sellerAffiliate.orderSettlementMax')}</label>
                <input
                  id="order-filter-settlement-max"
                  type="number"
                  min="0"
                  step="0.01"
                  value={orderFilterDraft.settlementMax}
                  onChange={(event) => updateOrderFilter('settlementMax', event.target.value)}
                  placeholder="500"
                  aria-invalid={Boolean(orderFilterError)}
                />
              </div>

              <div className="field">
                <label htmlFor="order-filter-carrier">{t('sellerAffiliate.orderCarrierFilter')}</label>
                <input
                  id="order-filter-carrier"
                  value={orderFilterDraft.carrier}
                  onChange={(event) => updateOrderFilter('carrier', event.target.value)}
                  placeholder="J&T Express, SPX..."
                />
              </div>

              <div className="field">
                <label htmlFor="order-filter-warehouse">{t('sellerAffiliate.orderWarehouse')}</label>
                <input
                  id="order-filter-warehouse"
                  value={orderFilterDraft.warehouse}
                  onChange={(event) => updateOrderFilter('warehouse', event.target.value)}
                  placeholder={t('sellerAffiliate.orderWarehousePlaceholder')}
                />
              </div>

              <div className="field">
                <label htmlFor="order-filter-product-sku">{t('sellerAffiliate.orderProductSkuFilter')}</label>
                <input
                  id="order-filter-product-sku"
                  value={orderFilterDraft.productSku}
                  onChange={(event) => updateOrderFilter('productSku', event.target.value)}
                  placeholder={t('sellerAffiliate.orderProductSkuPlaceholder')}
                />
              </div>

              <div className="field">
                <label htmlFor="order-filter-cancel">{t('sellerAffiliate.orderBuyerCancellation')}</label>
                <SelectDropdown
                  id="order-filter-cancel"
                  value={orderFilterDraft.buyerCancellation}
                  onChange={(value) => updateOrderFilter('buyerCancellation', value)}
                  options={[
                    { value: 'all', label: t('sellerAffiliate.orderFilterAll') },
                    { value: 'yes', label: t('common.yes') },
                    { value: 'no', label: t('common.no') },
                  ]}
                />
              </div>

              <div className="field">
                <label htmlFor="order-filter-delivery-issue">{t('sellerAffiliate.orderDeliveryIssue')}</label>
                <SelectDropdown
                  id="order-filter-delivery-issue"
                  value={orderFilterDraft.deliveryIssue}
                  onChange={(value) => updateOrderFilter('deliveryIssue', value)}
                  options={[
                    { value: 'all', label: t('sellerAffiliate.orderFilterAll') },
                    { value: 'yes', label: t('sellerAffiliate.orderDeliveryIssueOnly') },
                    { value: 'no', label: t('sellerAffiliate.orderDeliveryNoIssue') },
                  ]}
                />
              </div>
            </div>

            {orderFilterError ? (
              <p className="seller-affiliate__order-filter-error" role="alert">
                {t('sellerAffiliate.orderSettlementRangeError')}
              </p>
            ) : null}

            <div className="order-management__filters-panel-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={resetOrderFilters}
                disabled={!hasActiveOrderFilters && !orderFiltersDirty}
              >
                {t('sellerAffiliate.resetOrderFilters')}
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={!orderFiltersDirty || Boolean(orderFilterError) || loading}
              >
                {loading ? t('common.loading') : t('sellerAffiliate.applyOrderFilters')}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {!shops.length && !loading ? (
        <section className="section-card empty-state">
          <h2>{t('sellerAffiliate.noShop')}</h2>
          <p>{t('sellerAffiliate.noShopMeta')}</p>
        </section>
      ) : null}

      {selectedShop && !hasScope ? (
        <section className="section-card seller-affiliate__permission" role="alert">
          <div>
            <strong>{t('sellerAffiliate.missingScope')}</strong>
            <p>{t('sellerAffiliate.missingScopeMeta')}</p>
            <code>{REQUIRED_SCOPE}</code>
          </div>
        </section>
      ) : null}

      {selectedShop && hasScope && !hasProductScope ? (
        <section className="section-card seller-affiliate__permission" role="alert">
          <div>
            <strong>{t('sellerAffiliate.missingProductScope')}</strong>
            <p>{t('sellerAffiliate.missingProductScopeMeta')}</p>
            <code>{PRODUCT_SCOPE}</code>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="section-card empty-state empty-state--compact" role="alert">
          {error}
        </section>
      ) : null}

      {selectedShop && hasScope ? (
        <>
          {/* Compact 1-Line KPI Strip (with Collapsible Details & Top Products) */}
          <OrderCompactKpi
            orderOverview={orderOverview}
            orderOverviewLoading={orderOverviewLoading}
            formatNumber={formatNumber}
            formatMoneyValues={formatMoneyValues}
            locale={locale}
            applyOrderFilterPatch={applyOrderFilterPatch}
            t={t}
          />

          {orderOverviewError ? (
            <section className="section-card empty-state empty-state--compact" role="alert">
              {orderOverviewError}
            </section>
          ) : null}

          {/* Compact 5-Column Orders Table */}
          <section className="section-card order-management__table-card">
            <div className="section-card__header">
              <div>
                <h2 className="section-card__title">{t('sellerAffiliate.ordersTitle')}</h2>
              </div>
              <div className="section-card__actions">
                {selectedShop && hasShopOrderScope ? (
                  <span className="chip chip--positive">{t('sellerAffiliate.orderAppConnected')}</span>
                ) : null}
                <span className="chip">{formatNumber(data.total_count ?? rows.length)}</span>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table seller-affiliate__table order-management__table">
                <thead>
                  <tr>
                    <th>{t('sellerAffiliate.orderAndCreatedAt')}</th>
                    <th>{t('sellerAffiliate.kocAndSource')}</th>
                    <th>{t('sellerAffiliate.products')}</th>
                    <th>{t('sellerAffiliate.statusAndFulfillment')}</th>
                    <th>{t('sellerAffiliate.financesAndSettlement')}</th>
                    <th className="text-center">{t('sellerAffiliate.viewOrder')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">
                          <span className="loading-dot" />
                          {t('common.loading')}
                        </div>
                      </td>
                    </tr>
                  ) : rows.length ? (
                    rows.map((row, index) => (
                      <tr
                        className="seller-affiliate__order-row"
                        key={row.order_id || row.id || index}
                        tabIndex={0}
                        onClick={() => setSelectedOrder(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedOrder(row);
                          }
                        }}
                      >
                        <td>
                          <OrderIdentityCell row={row} formatTime={formatTime} t={t} />
                        </td>
                        <td>
                          <OrderAttributionCell row={row} t={t} />
                        </td>
                        <td>
                          <AffiliateOrderProducts row={row} t={t} />
                        </td>
                        <td>
                          <OrderStatusFulfillmentCell row={row} formatTime={formatTime} t={t} />
                        </td>
                        <td>
                          <OrderFinancialCell row={row} formatMoneyValues={formatMoneyValues} t={t} />
                        </td>
                        <td className="text-center">
                          <OrderActionCell row={row} onView={setSelectedOrder} t={t} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">{t('sellerAffiliate.noData')}</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={changePage}
              disabled={loading}
              previousLabel={t('common.previous')}
              nextLabel={t('common.next')}
              ariaLabel={t('sellerAffiliate.page', { page: currentPage })}
              alwaysVisible
            />
          </section>
        </>
      ) : null}

      <OrderDetailDrawer
        order={selectedOrder}
        shopId={shopId}
        onClose={() => setSelectedOrder(null)}
        formatTime={formatTime}
        formatMoneyValues={formatMoneyValues}
        t={t}
      />
    </div>
  );
};

export default OrderManagement;
