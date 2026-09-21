import React from 'react';
import { createPortal } from 'react-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import ShopDropdown from '../ShopDropdown';
import SelectDropdown from '../SelectDropdown';
import { BarChart3, CalendarDays, Filter, Users } from 'lucide-react';
import { setStoredSelectedShopId } from '../../lib/shopSelection';
import Pagination from '../Pagination';
import DatePickerInput from '../DatePickerInput';
import { useSellerAffiliateData } from './hooks/useSellerAffiliateData';

import {
  AffiliateOrderSummary,
  AffiliateOrderVideos,
  CreatorAvatar,
  InviteCreatorModal,
  MarketplaceCreatorCell,
  MetricTooltip,
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
  const {
    allVisibleProductsSelected,
    assignSelectedProducts,
    baseMetrics,
    bulkCategoryId,
    bulkCategoryOptions,
    catalogLoading,
    categoryError,
    categoryFilter,
    categoryLoading,
    categoryName,
    changePage,
    changeSection,
    clearProductDragState,
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
    dragOverCategoryId,
    draggedProductId,
    dropProductsOnCategory,
    error,
    expandedStatisticCategories,
    filteredOrderProducts,
    formatCreatorCount,
    formatCreatorGmv,
    formatEngagementRate,
    formatMoney,
    formatNumber,
    formatRate,
    formatTime,
    formatUnitsSold,
    groupedOrderStatistics,
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
    managementCategoryOptions,
    ongoingInvitations,
    openCollaborationSettings,
    openCreatorDetail,
    openInvite,
    orderCategories,
    orderCategoryNameMap,
    orderMode,
    orderPeriod,
    orderPeriodOptions,
    orderProductCategoryMap,
    orderProducts,
    orderRange,
    orderStatistics,
    performanceBreakdown,
    performanceBreakdownTotal,
    performanceColumns,
    performanceCreatorCell,
    performanceWindow,
    performanceWindowOptions,
    productSearch,
    removeOrderCategory,
    resetMarketplaceSearch,
    rows,
    section,
    selectedCreatorApplication,
    selectedInvitationId,
    selectedPerformanceExport,
    selectedProductIds,
    selectedShop,
    setBulkCategoryId,
    setCategoryFilter,
    setCategoryName,
    setContactNotice,
    setCreatorBreakdownMetric,
    setData,
    setDragOverCategoryId,
    setInvitationSearch,
    setInviteCreator,
    setInviteForm,
    setInviteTab,
    setKeyword,
    setOrderMode,
    setOrderPeriod,
    setOrderRange,
    setPageTokens,
    setPerformanceWindow,
    setProductSearch,
    setSelectedInvitationId,
    setSelectedProductIds,
    setShopId,
    setStatisticsCategory,
    setStatisticsCreator,
    setStatisticsPeriod,
    setStatisticsRange,
    setStatus,
    shopId,
    shops,
    startProductDrag,
    statisticsCategory,
    statisticsCategoryOptions,
    statisticsCreator,
    statisticsCreatorOptions,
    statisticsError,
    statisticsLoading,
    statisticsPeriod,
    statisticsPeriodOptions,
    statisticsRange,
    status,
    submitExistingInvite,
    submitInvite,
    submitOrderCategory,
    submitSearch,
    submittedKeyword,
    t,
    tableColumnCount,
    targetStatusOptions,
    toggleInviteProduct,
    toggleSelectedProduct,
    toggleStatisticCategory,
    totalPages,
    visibleProductIds,
  } = useSellerAffiliateData({ initialSection, ordersOnly });
  return (
    <div className="page seller-affiliate">
      <section className="page__hero">
        <div><h1 className="page__title">{t(ordersOnly ? 'navigation.orders' : 'sellerAffiliate.tab')}</h1></div>
      </section>
      {ordersOnly ? <div className="seller-affiliate__subtabs" role="tablist" aria-label={t('sellerAffiliate.orderSections')}>
        <button className={orderMode === 'orders' ? 'is-active' : ''} type="button" role="tab" aria-selected={orderMode === 'orders'} onClick={() => setOrderMode('orders')}>{t('sellerAffiliate.orderListTab')}</button>
        <button className={orderMode === 'management' ? 'is-active' : ''} type="button" role="tab" aria-selected={orderMode === 'management'} onClick={() => setOrderMode('management')}>{t('sellerAffiliate.orderManagementTab')}</button>
        <button className={orderMode === 'statistics' ? 'is-active' : ''} type="button" role="tab" aria-selected={orderMode === 'statistics'} onClick={() => setOrderMode('statistics')}>{t('sellerAffiliate.orderStatisticsTab')}</button>
      </div> : null}
      {selectedShop && hasScope && !ordersOnly ? (
        <div className="seller-affiliate__subtabs" role="tablist" aria-label={t('sellerAffiliate.sections')}>
          {['open', 'target', 'discover', 'performance', 'creators', 'orders'].map((value) => <button className={section === value ? 'is-active' : ''} type="button" role="tab" aria-selected={section === value} onClick={() => changeSection(value)} key={value}>{t(`sellerAffiliate.${value}Tab`)}</button>)}
        </div>
      ) : null}
      <section className={`section-card seller-affiliate__controls${ordersOnly && orderMode === 'management' ? ' seller-affiliate__controls--management' : ''}${ordersOnly && orderMode === 'orders' ? ' seller-affiliate__controls--orders' : ''}${ordersOnly && orderMode === 'orders' && orderPeriod === 'custom' ? ' seller-affiliate__controls--orders-custom' : ''}${(!ordersOnly && (section === 'open' || section === 'discover')) ? ' seller-affiliate__controls--two-columns' : ''}`}>
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
          {(!ordersOnly || orderMode === 'orders') ? (
            <form className="seller-affiliate__search" onSubmit={submitSearch}>
              <div className="field seller-affiliate__search-field">
                <label htmlFor="affiliate-search">{t(section === 'orders' ? 'sellerAffiliate.orderId' : 'common.search')}</label>
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
          ) : null}
          {ordersOnly && orderMode === 'orders' ? (
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
          {ordersOnly && orderMode === 'orders' && orderPeriod === 'custom' ? (
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
          {ordersOnly && orderMode === 'management' ? (
            <div className="seller-affiliate__management-filters">
              <div className="order-product-management__search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
                <input
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder={t('sellerAffiliate.searchProducts')}
                  aria-label={t('sellerAffiliate.searchProducts')}
                />
              </div>
              <SelectDropdown
                id="management-category-filter"
                value={categoryFilter}
                onChange={setCategoryFilter}
                icon={<Filter size={16} />}
                options={managementCategoryOptions}
              />
            </div>
          ) : null}
        </div>
      </section>

      {!shops.length && !loading ? <section className="section-card empty-state"><h2>{t('sellerAffiliate.noShop')}</h2><p>{t('sellerAffiliate.noShopMeta')}</p></section> : null}
      {selectedShop && !hasScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingScope')}</strong><p>{t('sellerAffiliate.missingScopeMeta')}</p><code>{REQUIRED_SCOPE}</code></div></section> : null}
      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}
      {contactNotice ? <section className={`section-card seller-affiliate__contact-notice seller-affiliate__contact-notice--${contactNotice.type}`} role={contactNotice.type === 'error' ? 'alert' : 'status'}><span>{contactNotice.text}</span><button type="button" aria-label={t('common.close')} onClick={() => setContactNotice(null)}>×</button></section> : null}

      {selectedShop && hasScope ? <>
        {section === 'performance' ? <section className="section-card"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceTitle')}</h2><p className="section-card__meta">{selectedPerformanceExport ? `${formatReportDate(selectedPerformanceExport.start_date)} – ${formatReportDate(selectedPerformanceExport.end_date)}` : t(`sellerAffiliate.performanceStatus_${data.export?.status || 'EMPTY'}`)}</p></div></div>{baseMetrics.length ? <section className="seller-affiliate__summary seller-affiliate__base-summary">{baseMetrics.map(([key, value]) => <article className="stat-card" key={key}><p className="stat-card__label">{t(`sellerAffiliate.${key}`)}</p><p className="stat-card__value seller-affiliate__setting-value">{value}</p></article>)}</section> : null}</section> : null}
        {section === 'performance' && !hasMarketplaceScope ? <section className="section-card empty-state empty-state--compact" role="alert"><strong>{t('sellerAffiliate.missingMarketplaceScope')}</strong><span>{t('sellerAffiliate.missingMarketplaceScopeMeta')}</span></section> : null}
        {section === 'discover' && !hasMarketplaceScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingMarketplaceScope')}</strong><p>{t('sellerAffiliate.missingMarketplaceScopeMeta')}</p><code>{MARKETPLACE_SCOPE}</code></div></section> : null}
        {section === 'discover' && hasMarketplaceScope && !hasProductScope ? <section className="section-card seller-affiliate__permission" role="alert"><div><strong>{t('sellerAffiliate.missingProductScope')}</strong><p>{t('sellerAffiliate.missingProductScopeMeta')}</p><code>{PRODUCT_SCOPE}</code></div></section> : null}
        {section === 'performance' && performanceBreakdown.length ? <section className="section-card seller-creator-breakdown"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.performanceChartTitle')}</h2><p className="section-card__meta">{t('sellerAffiliate.performanceChartMeta')}</p></div></div><div className="seller-creator-breakdown__body"><div className="seller-creator-breakdown__chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={performanceBreakdown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{performanceBreakdown.map((item, index) => <Cell key={item.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatMoney({ amount: value, currency: rows[0]?.currency || 'MYR' })} /></PieChart></ResponsiveContainer><div className="seller-creator-breakdown__center"><strong>{formatMoney({ amount: performanceBreakdownTotal, currency: rows[0]?.currency || 'MYR' })}</strong><span>{t('sellerAffiliate.top10Gmv')}</span></div></div><div className="seller-creator-breakdown__legend">{performanceBreakdown.map((item, index) => <div key={item.name}><i style={{ background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} /><span>{item.name}</span><strong>{formatMoney({ amount: item.value, currency: rows[0]?.currency || 'MYR' })}</strong></div>)}</div></div></section> : null}
        {section === 'creators' ? <section className="section-card seller-creator-breakdown"><div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.breakdownTitle')}</h2><p className="section-card__meta">{t('sellerAffiliate.breakdownMeta')}</p></div><div className="field seller-creator-breakdown__select"><label htmlFor="creator-breakdown-metric">{t('sellerAffiliate.metric')}</label><SelectDropdown id="creator-breakdown-metric" value={creatorBreakdownMetric} onChange={setCreatorBreakdownMetric} icon={<BarChart3 size={16} />} options={creatorBreakdownMetricOptions} /></div></div>{creatorBreakdown.length ? <div className="seller-creator-breakdown__body"><div className="seller-creator-breakdown__chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={creatorBreakdown} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{creatorBreakdown.map((item, index) => <Cell key={item.name} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />)}</Pie><Tooltip formatter={(value) => creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: value, currency: creatorBreakdownCurrency }) : formatNumber(value)} /></PieChart></ResponsiveContainer><div className="seller-creator-breakdown__center"><strong>{creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: creatorBreakdownTotal, currency: creatorBreakdownCurrency }) : formatNumber(creatorBreakdownTotal)}</strong><span>{t(`sellerAffiliate.breakdown_${creatorBreakdownMetric}`)}</span></div></div><div className="seller-creator-breakdown__legend">{creatorBreakdown.slice(0, 8).map((item, index) => <div key={item.name}><i style={{ background: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length] }} /><span>{item.name}</span><strong>{creatorBreakdownMetric === 'gmv' ? formatMoney({ amount: item.value, currency: creatorBreakdownCurrency }) : formatNumber(item.value)}</strong></div>)}</div></div> : <div className="empty-state">{t('sellerAffiliate.noData')}</div>}</section> : null}
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
        {ordersOnly && orderMode === 'management' ? <section className="section-card order-product-management">
          <div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.orderManagementTitle')}</h2></div><div className="order-product-management__summary"><span className="chip">{t('sellerAffiliate.categoryCount', { count: orderCategories.length })}</span><span className="chip">{t('sellerAffiliate.productCount', { count: orderProducts.length })}</span></div></div>

          {categoryError ? <div className="empty-state empty-state--compact" role="alert">{categoryError}</div> : null}
          {(categoryLoading || catalogLoading) && !orderCategories.length && !orderProducts.length ? <div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div> : <>
            <div className="order-product-management__workspace order-product-management__workspace--grouping">
              <section className="order-product-management__products" aria-labelledby="all-products-title">
                <div className="order-product-management__column-heading"><div><span className="order-product-management__eyebrow">{t('sellerAffiliate.allProducts')}</span><strong id="all-products-title">{formatNumber(filteredOrderProducts.length)} / {formatNumber(orderProducts.length)}</strong></div></div>
                {selectedProductIds.length ? <div className="order-product-management__bulk" role="region" aria-label={t('sellerAffiliate.bulkActions')}><strong>{t('sellerAffiliate.productsSelected', { count: selectedProductIds.length })}</strong><SelectDropdown id="bulk-category-select" className="order-product-management__bulk-dropdown" value={bulkCategoryId} onChange={setBulkCategoryId} options={bulkCategoryOptions} placeholder={t('sellerAffiliate.uncategorized')} /><button className="button button--small" type="button" disabled={categoryLoading} onClick={assignSelectedProducts}>{t('sellerAffiliate.apply')}</button><button className="button button--small button--ghost" type="button" onClick={() => setSelectedProductIds([])}>{t('common.close')}</button></div> : null}
                <div className="order-product-management__product-list">
                  <div className="order-product-management__list-select"><label><input type="checkbox" checked={allVisibleProductsSelected} onChange={() => setSelectedProductIds((current) => allVisibleProductsSelected ? current.filter((id) => !visibleProductIds.includes(id)) : [...new Set([...current, ...visibleProductIds])])} aria-label={t('sellerAffiliate.selectVisibleProducts')} /> {t('sellerAffiliate.selectVisibleProducts')}</label></div>
                  {filteredOrderProducts.length ? filteredOrderProducts.map((product) => { const categoryId = orderProductCategoryMap.get(String(product.id)); return <div className={`order-product-management__product-card${selectedProductIds.includes(String(product.id)) ? ' is-selected' : ''}${draggedProductId === String(product.id) ? ' is-dragging' : ''}`} draggable="true" tabIndex="0" role="button" aria-pressed={selectedProductIds.includes(String(product.id))} onClick={(event) => { if (event.target.closest('input')) return; toggleSelectedProduct(product.id); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSelectedProduct(product.id); } }} onDragStart={(event) => startProductDrag(event, product)} onDragEnd={clearProductDragState} key={product.id}><input type="checkbox" checked={selectedProductIds.includes(String(product.id))} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelectedProduct(product.id)} aria-label={t('sellerAffiliate.selectProduct', { product: product.title || product.id })} /><div className="seller-affiliate__product order-product-management__product-info">{product.main_image_url ? <img src={product.main_image_url} alt="" loading="lazy" /> : <span className="order-product-management__product-placeholder">P</span>}<div><strong>{product.title || product.id}</strong>{product.title ? <span>{product.id}</span> : null}<span className={`order-product-management__category-tag${categoryId ? '' : ' is-uncategorized'}`}>{categoryId ? orderCategoryNameMap.get(categoryId) : t('sellerAffiliate.uncategorized')}</span></div></div></div>; }) : <div className="empty-state">{orderProducts.length ? t('sellerAffiliate.noProductMatches') : t('sellerAffiliate.noOrderProducts')}</div>}
                </div>
              </section>
              <section className="order-product-management__groups" aria-labelledby="groups-title"><div className="order-product-management__column-heading"><div><span className="order-product-management__eyebrow" id="groups-title">{t('sellerAffiliate.groups')}</span></div><form className="order-product-management__create" onSubmit={submitOrderCategory}><label className="sr-only" htmlFor="order-category-name">{t('sellerAffiliate.categoryName')}</label><input id="order-category-name" value={categoryName} maxLength={120} onChange={(event) => setCategoryName(event.target.value)} placeholder={t('sellerAffiliate.categoryNamePlaceholder')} /><button type="submit" disabled={categoryLoading || !categoryName.trim()} aria-label={t('sellerAffiliate.createCategory')} title={t('sellerAffiliate.createCategory')}>＋</button></form></div><div className="order-product-management__group-list">{orderCategories.map((category) => { const groupProducts = orderProducts.filter((product) => orderProductCategoryMap.get(String(product.id)) === String(category.id)); return <div className={`order-product-group${categoryFilter === String(category.id) ? ' is-filter-active' : ''}${dragOverCategoryId === String(category.id) ? ' is-drag-over' : ''}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverCategoryId(String(category.id)); }} onDragLeave={() => setDragOverCategoryId(null)} onDrop={(event) => dropProductsOnCategory(event, category.id)} key={category.id}><div className="order-product-group__header"><strong>{category.name}</strong><span>{groupProducts.length}</span><button className="order-product-category__delete" type="button" disabled={categoryLoading} aria-label={`${t('sellerAffiliate.deleteCategory')}: ${category.name}`} title={t('sellerAffiliate.deleteCategory')} onClick={() => removeOrderCategory(category)}>×</button></div><div className="order-product-group__products">{groupProducts.map((product) => <div className="order-product-group__product" key={product.id}>{product.main_image_url ? <img src={product.main_image_url} alt="" /> : <span className="order-product-management__product-placeholder">P</span>}<span title={product.title || product.id}>{product.title || product.id}</span></div>)}</div></div>; })}{!orderCategories.length ? <div className="empty-state empty-state--compact">{t('sellerAffiliate.noCategories')}</div> : null}<div className={`order-product-group order-product-group--uncategorized${categoryFilter === 'uncategorized' ? ' is-filter-active' : ''}${dragOverCategoryId === '' ? ' is-drag-over' : ''}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverCategoryId(''); }} onDragLeave={() => setDragOverCategoryId(null)} onDrop={(event) => dropProductsOnCategory(event, '')}><div className="order-product-group__header"><span className="order-product-group__trash-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7l1-3h4l1 3" /></svg></span><strong>{t('sellerAffiliate.removeCategory')}</strong></div></div></div></section>
            </div>
          </>}
        </section> : null}
        {ordersOnly && orderMode === 'statistics' ? <section className="section-card order-statistics">
          <div className="section-card__header"><div><h2 className="section-card__title">{t('sellerAffiliate.orderStatisticsTitle')}</h2></div></div>
          <form className="order-statistics__filters" onSubmit={(event) => event.preventDefault()}>
            <div className="field">
              <label htmlFor="order-statistics-period">{t('sellerAffiliate.statisticsPeriod')}</label>
              <SelectDropdown
                id="order-statistics-period"
                value={statisticsPeriod}
                onChange={setStatisticsPeriod}
                icon={<CalendarDays size={16} />}
                options={statisticsPeriodOptions}
              />
            </div>
            {statisticsPeriod === 'custom' ? (
              <>
                <div className="field">
                  <label htmlFor="order-statistics-start">{t('sellerAffiliate.startDate')}</label>
                  <DatePickerInput
                    id="order-statistics-start"
                    label={t('sellerAffiliate.startDate')}
                    value={statisticsRange.start}
                    max={statisticsRange.end}
                    onChange={(value) => setStatisticsRange((current) => ({ ...current, start: value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="order-statistics-end">{t('sellerAffiliate.endDate')}</label>
                  <DatePickerInput
                    id="order-statistics-end"
                    label={t('sellerAffiliate.endDate')}
                    value={statisticsRange.end}
                    min={statisticsRange.start}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(value) => setStatisticsRange((current) => ({ ...current, end: value }))}
                  />
                </div>
              </>
            ) : null}
            <div className="field">
              <label htmlFor="order-statistics-creator">{t('sellerAffiliate.koc')}</label>
              <SelectDropdown
                id="order-statistics-creator"
                value={statisticsCreator}
                onChange={setStatisticsCreator}
                icon={<Users size={16} />}
                options={statisticsCreatorOptions}
              />
            </div>
            <div className="field">
              <label htmlFor="order-statistics-category">{t('sellerAffiliate.category')}</label>
              <SelectDropdown
                id="order-statistics-category"
                value={statisticsCategory}
                onChange={setStatisticsCategory}
                icon={<Filter size={16} />}
                options={statisticsCategoryOptions}
              />
            </div>
          </form>
          {statisticsError ? <div className="empty-state empty-state--compact" role="alert">{statisticsError}</div> : null}
          <div className="order-statistics__summary">
            <article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.totalProductQuantity')}</p><p className="stat-card__value">{formatNumber(orderStatistics.totals?.quantity)}</p></article>
            <article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.distinctProducts')}</p><p className="stat-card__value">{formatNumber(orderStatistics.totals?.products)}</p></article>
            <article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.matchedOrders')}</p><p className="stat-card__value">{formatNumber(orderStatistics.totals?.orders)}</p></article>
          </div>
          {orderStatistics.truncated ? <div className="empty-state empty-state--compact" role="status">{t('sellerAffiliate.statisticsTruncated')}</div> : null}
          <div className="table-wrap"><table className="data-table order-statistics__table"><thead><tr><th>{t('sellerAffiliate.category')}</th><th className="cell-number">{t('sellerAffiliate.productCount')}</th><th className="cell-number">{t('sellerAffiliate.quantity')}</th><th className="cell-number">{t('sellerAffiliate.orderCount')}</th><th className="cell-number">{t('sellerAffiliate.kocCount')}</th></tr></thead><tbody>
            {statisticsLoading ? <tr><td colSpan={5}><div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div></td></tr> : groupedOrderStatistics.length ? groupedOrderStatistics.map((category) => { const expanded = expandedStatisticCategories.has(category.id); return <React.Fragment key={category.id}><tr className={`order-statistics__category-row${expanded ? ' is-expanded' : ''}`} onClick={() => toggleStatisticCategory(category.id)} tabIndex="0" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleStatisticCategory(category.id); } }}><td><span className="order-statistics__expand-icon" aria-hidden="true">{expanded ? '⌄' : '›'}</span><strong>{category.name}</strong></td><td className="cell-number">{formatNumber(category.products.length)}</td><td className="cell-number"><strong>{formatNumber(category.quantity)}</strong></td><td className="cell-number">{formatNumber(category.orderCount)}</td><td className="cell-number">{formatNumber(category.creatorCount)}</td></tr>{expanded ? <tr className="order-statistics__products-row"><td colSpan={5}><div className="order-statistics__products"><div className="order-statistics__products-heading">{t('sellerAffiliate.productsInCategory', { count: category.products.length })}</div>{category.products.map((product) => <div className="order-statistics__product-row" key={product.product_id}><div className="seller-affiliate__product">{product.image_url ? <img src={product.image_url} alt="" loading="lazy" /> : null}<div><strong>{product.product_name || product.product_id}</strong><span>{product.product_id}</span></div></div><strong className="cell-number">{formatNumber(product.quantity)}</strong><span className="cell-number">{formatNumber(product.order_count)}</span><span className="cell-number">{formatNumber(product.creator_count)}</span></div>)}</div></td></tr> : null}</React.Fragment>; }) : <tr><td colSpan={5}><div className="empty-state">{t('sellerAffiliate.noStatisticsData')}</div></td></tr>}
          </tbody></table></div>
        </section> : null}
        {section !== 'performance' && (section !== 'discover' || hasMarketplaceScope) && (!ordersOnly || orderMode === 'orders') ? <section className="section-card">
          <div className="section-card__header"><div><h2 className="section-card__title">{t(`sellerAffiliate.${section}Title`)}</h2>{section !== 'target' && section !== 'discover' && section !== 'open' && !(ordersOnly && section === 'orders') ? <p className="section-card__meta">{t(`sellerAffiliate.${section}Meta`)}</p> : null}</div><span className="chip">{formatNumber(data.total_count ?? rows.length)}</span></div>
          <div className="table-wrap"><table className="data-table seller-affiliate__table"><thead><tr>{section === 'open' ? <><th>{t('sellerAffiliate.product')}</th><th>{t('sellerAffiliate.commission')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.status')}</th></> : section === 'target' ? <><th>{t('sellerAffiliate.invitation')}</th><th>{t('sellerAffiliate.products')}</th><th>{t('sellerAffiliate.creators')}</th><th>{t('sellerAffiliate.validity')}</th><th>{t('sellerAffiliate.status')}</th></> : section === 'discover' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.creatorGmv30')}</th><th>{t('sellerAffiliate.itemsSold')}</th><th>{t('sellerAffiliate.avgVideoViews')}</th><th>{t('sellerAffiliate.engagementRate')}</th><th>{t('sellerAffiliate.actions')}</th></> : section === 'performance' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.creatorGmv')}</th><th>{t('sellerAffiliate.affiliateOrders')}</th><th>{t('sellerAffiliate.itemsSold')}</th><th>{t('sellerAffiliate.productImpressions')}</th><th>{t('sellerAffiliate.refundedGmv')}</th><th>{t('sellerAffiliate.followers')}</th></> : section === 'creators' ? <><th>{t('sellerAffiliate.creator')}</th><th>{t('sellerAffiliate.followers')}</th><th>{t('sellerAffiliate.creatorGmv30')}</th><th>{t('sellerAffiliate.content')}</th><th>{t('sellerAffiliate.fulfillment')}</th><th>{t('sellerAffiliate.status')}</th><th>{t('sellerAffiliate.actions')}</th></> : <><th>{t('sellerAffiliate.order')}</th><th>{t('sellerAffiliate.video')}</th><th>{t('sellerAffiliate.createdAt')}</th></>}</tr></thead><tbody>
            {loading ? <tr><td colSpan={section === 'orders' ? 3 : section === 'discover' ? 6 : 7}><div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div></td></tr> : section !== 'discover' && rows.length ? rows.map((row, index) => section === 'open' ? <tr key={row.id || index}><td><div className="seller-affiliate__product">{row.product?.main_image_url ? <img src={row.product.main_image_url} alt="" loading="lazy" /> : null}<div><strong>{row.product?.title || row.product?.id || row.id}</strong><span>{row.product?.id}</span></div></div></td><td>{formatRate(row.current_commission?.rate ?? row.commission_rate)}</td><td>{formatNumber(row.showcase_creator_count)} / {formatNumber(row.content_creator_count)}</td><td><span className="chip">{formatStatus(row.status, t)}</span></td></tr> : section === 'target' ? <tr key={row.id || index}><td><strong>{row.name || row.id}</strong><span className="row-subtitle">{row.id}</span><div className="target-collaboration__creators">{(row.creators || []).slice(0, 3).map((creator, creatorIndex) => <div className="creator-identity" key={creator.creator_open_id || creator.user_id || creator.username || creatorIndex}><CreatorAvatar src={creator.avatar?.url || creator.avatar_url} name={creator.nickname || creator.username} /><span><strong>{creator.nickname || creator.username || '—'}</strong><span className="row-subtitle">{creator.username ? `@${creator.username.replace(/^@/, '')}` : '—'}</span></span></div>)}{row.creators?.length > 3 ? <span className="target-collaboration__more">+{formatNumber(row.creators.length - 3)}</span> : null}</div></td><td>{formatNumber(row.products?.length ?? row.product_count)}</td><td>{formatNumber(row.showcase_creator_count)} / {formatNumber(row.content_creator_count)}</td><td>{formatTime(row.end_time)}</td><td><span className="chip">{formatStatus(row.status || row.collaboration_status, t)}</span></td></tr> : section === 'performance' ? <tr key={row.id || index}>{performanceCreatorCell(row)}<td>{formatMoney({ amount: row.affiliate_gmv, currency: row.currency })}</td><td>{formatNumber(row.affiliate_orders)}</td><td>{formatNumber(row.items_sold)}</td><td>{formatNumber(row.product_impressions)}</td><td>{formatMoney({ amount: row.refunded_gmv, currency: row.currency })}</td><td>{formatNumber(row.followers)}</td></tr> : section === 'creators' ? <tr key={row.id || index}><td><div className="creator-identity"><CreatorAvatar src={row.creator?.avatar_url} name={row.creator?.nickname || row.creator?.username} /><span><strong>{row.creator?.nickname || row.creator?.username || '—'}</strong><span className="row-subtitle">{row.creator?.username ? `@${row.creator.username.replace(/^@/, '')}` : row.creator?.user_id}</span></span></div></td><td>{formatNumber(row.creator?.follower_count)}</td><td>{formatMoney(row.creator?.gmv)}</td><td>{row.sample_content_status === 'UNAVAILABLE' ? t('common.noData') : row.sample_content_status === 'PENDING_SYNC' ? t('sellerAffiliate.loadContent') : row.sample_content_count ? <>{formatNumber(row.sample_content_count)}<span className="row-subtitle">{formatNumber(row.sample_content_views)} {t('common.views')}</span></> : t('sellerAffiliate.notPosted')}</td><td>{row.creator?.fulfillment_percentage ? `${row.creator.fulfillment_percentage}%` : formatStatus(row.fulfillment_status, t)}</td><td><span className="chip">{formatStatus(row.status, t)}</span></td><td><button className="button button--small button--ghost" type="button" onClick={() => openCreatorDetail(row)}>{t('sellerAffiliate.view')}</button></td></tr> : <tr key={row.order_id || row.id || index}><td><AffiliateOrderSummary row={row} /></td><td><AffiliateOrderVideos row={row} shopId={shopId} t={t} /></td><td>{formatTime(row.create_time || row.created_time)}</td></tr>) : !rows.length ? <tr><td colSpan={section === 'orders' ? 3 : section === 'discover' ? 6 : 7}><div className="empty-state">{t(section === 'discover' && data.search_pending ? 'sellerAffiliate.discoverSearchPending' : section === 'discover' && !submittedKeyword ? 'sellerAffiliate.discoverSyncPending' : 'sellerAffiliate.noData')}</div></td></tr> : null}
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
            alwaysVisible={ordersOnly && orderMode === 'orders'}
          />
        </section> : null}
      </> : null}
      {inviteCreator ? createPortal(<InviteCreatorModal t={t} locale={locale} creator={inviteCreator} activeTab={inviteTab} onTabChange={setInviteTab} invitations={ongoingInvitations} selectedInvitationId={selectedInvitationId} onSelectInvitation={setSelectedInvitationId} search={invitationSearch} onSearchChange={setInvitationSearch} products={inviteProducts} form={inviteForm} setForm={setInviteForm} onToggleProduct={toggleInviteProduct} loading={inviteLoading} onClose={() => setInviteCreator(null)} onSubmit={inviteTab === 'ongoing' ? submitExistingInvite : submitInvite} />, document.body) : null}
      {selectedCreatorApplication ? <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreatorDetail(); }}><aside className="koc-drawer" role="dialog" aria-modal="true" aria-labelledby="seller-creator-detail-title"><div className="koc-drawer__header"><div><h2 id="seller-creator-detail-title">{selectedCreatorApplication.creator?.nickname || selectedCreatorApplication.creator?.username}</h2><p>{selectedCreatorApplication.creator?.username ? `@${selectedCreatorApplication.creator.username.replace(/^@/, '')}` : selectedCreatorApplication.creator?.user_id}</p></div><button className="button button--ghost" type="button" onClick={closeCreatorDetail} aria-label={t('common.close')}>×</button></div><div className="koc-drawer__body"><section className="drawer-section"><div className="drawer-profile">{selectedCreatorApplication.creator?.avatar_url ? <img src={selectedCreatorApplication.creator.avatar_url} alt="" /> : null}<div><strong>{selectedCreatorApplication.creator?.nickname || selectedCreatorApplication.creator?.username}</strong><span>{formatNumber(selectedCreatorApplication.creator?.follower_count)} {t('sellerAffiliate.followers')}</span></div></div></section><section className="page__stats page__stats--four"><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.creatorGmv')}</p><p className="stat-card__value">{formatMoney(selectedCreatorApplication.creator?.gmv)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.content')}</p><p className="stat-card__value">{selectedCreatorApplication.sample_content_count === null || selectedCreatorApplication.sample_content_count === undefined ? '—' : formatNumber(selectedCreatorApplication.sample_content_count)}</p></article><article className="stat-card"><p className="stat-card__label">{t('common.views')}</p><p className="stat-card__value">{selectedCreatorApplication.sample_content_views === null || selectedCreatorApplication.sample_content_views === undefined ? '—' : formatNumber(selectedCreatorApplication.sample_content_views)}</p></article><article className="stat-card"><p className="stat-card__label">{t('sellerAffiliate.fulfillment')}</p><p className="stat-card__value">{selectedCreatorApplication.creator?.fulfillment_percentage ? `${selectedCreatorApplication.creator.fulfillment_percentage}%` : '—'}</p></article></section><section className="drawer-section"><h3>{t('sellerAffiliate.sampleDetail')}</h3><div className="drawer-meta"><span>{t('sellerAffiliate.status')}: <strong>{selectedCreatorApplication.status || '—'}</strong></span><span>{t('sellerAffiliate.fulfillmentStatus')}: <strong>{selectedCreatorApplication.fulfillment_status || '—'}</strong></span><span>{t('sellerAffiliate.sampleOrder')}: <strong>{selectedCreatorApplication.order_id || '—'}</strong></span><span>{t('sellerAffiliate.tracking')}: <strong>{selectedCreatorApplication.tracking_number || '—'}</strong></span><span>{t('sellerAffiliate.product')}: <strong>{selectedCreatorApplication.product?.title || selectedCreatorApplication.product?.id || '—'}</strong></span></div></section><section className="drawer-section"><h3>{t('sellerAffiliate.creatorContent')}</h3>{creatorDetailLoading ? <div className="empty-state"><span className="loading-dot" />{t('common.loading')}</div> : <div className="drawer-meta"><span>{t('sellerAffiliate.videos')}: <strong>{creatorContent?.video_count ?? '—'}</strong></span><span>{t('sellerAffiliate.lives')}: <strong>{creatorContent?.live_count ?? '—'}</strong></span><span>{t('sellerAffiliate.promotionStatus')}: <strong>{creatorContent?.promotion_status || '—'}</strong></span><span>{t('sellerAffiliate.promotionEnd')}: <strong>{formatTime(creatorContent?.promotion_end_time)}</strong></span></div>}</section></div></aside></div> : null}
    </div>
  );
};

export default SellerAffiliatePanel;
