import React, { useMemo } from 'react';
import BookingRow from './BookingRow';
import { SortIcon } from './BookingIcons';
import {
  bookingProductsOf,
  bookingVideoPerformanceForVideos,
  bookingVideosOf,
  finiteNumber,
  groupBookingRowsByCreator,
  mergeBookingProductBreakdowns,
} from '../../lib/bookingMetrics';

const uniqueVideosOfBookings = (bookingRecords, videoPerformanceByBooking) => {
  const videos = new Map();
  for (const booking of bookingRecords) {
    const videoData = videoPerformanceByBooking.get(String(booking.id));
    const list = videoData?.videos || bookingVideosOf(booking);
    for (const video of list) {
      const identity = String(video.platform_video_id || video.id || '').trim();
      const key = identity || `booking:${booking.id}:video:${videos.size}`;
      if (!videos.has(key)) videos.set(key, video);
    }
  }
  return [...videos.values()];
};

const aggregateProductPerformance = (bookingRecords, productPerformanceByBooking, convertAmount, selectedCurrency) => {
  const performances = bookingRecords
    .map((booking) => productPerformanceByBooking.get(String(booking.id)))
    .filter(Boolean);
  const result = {
    source: 'AFFILIATE_ORDERS',
    has_products: false,
    currency: selectedCurrency,
    affiliate_gmv: 0,
    affiliate_orders: 0,
    items_sold: 0,
    items_refunded: 0,
    refunded_gmv: 0,
    estimated_commission: 0,
    breakdown: mergeBookingProductBreakdowns(performances),
  };
  let hasCommission = false;
  for (const performance of performances) {
    result.has_products = result.has_products || Boolean(performance.has_products);
    result.affiliate_gmv += convertAmount(performance.affiliate_gmv, performance.currency)
      ?? finiteNumber(performance.affiliate_gmv);
    result.refunded_gmv += convertAmount(performance.refunded_gmv, performance.currency)
      ?? finiteNumber(performance.refunded_gmv);
    result.affiliate_orders += finiteNumber(performance.affiliate_orders);
    result.items_sold += finiteNumber(performance.items_sold);
    result.items_refunded += finiteNumber(performance.items_refunded);
    if (performance.estimated_commission !== null && performance.estimated_commission !== undefined) {
      result.estimated_commission += convertAmount(performance.estimated_commission, performance.currency)
        ?? finiteNumber(performance.estimated_commission);
      hasCommission = true;
    }
  }
  if (!hasCommission) result.estimated_commission = null;
  return result;
};

const BookingEvaluationTable = ({
  bookings,
  bookingSort,
  onSort,
  expandedBookingId,
  onToggleRow,
  onSelectBooking,
  bookingTab,
  productPerformanceByBooking,
  videoPerformanceByBooking,
  bookingInPeriodById,
  productOrdersByShop,
  selectedCurrency,
  convertAmount,
  onSelectProduct,
  formatMoney,
  formatNumber,
  formatDate,
  formatRate,
  renderPerformance,
  creatorMetric,
  t,
}) => {
  const creatorRows = useMemo(() => groupBookingRowsByCreator(bookings), [bookings]);

  return (
    <div className="booking-manager-expanded-detail">
      <div className="table-wrap">
        <table className="data-table booking-evaluation-table">
          <thead>
            <tr>
              <th className="booking-koc-column sortable-th">
                <button type="button" className="table-sort-btn" onClick={() => onSort('koc')}>
                  <span>{t('booking.kocColumn')}</span>
                  <SortIcon active={bookingSort.key === 'koc'} direction={bookingSort.direction} />
                </button>
              </th>
              <th className="booking-creator-performance-column sortable-th">
                <button type="button" className="table-sort-btn" onClick={() => onSort('revenue')}>
                  <span>{t('booking.gmvColumn')}</span>
                  <SortIcon active={bookingSort.key === 'revenue'} direction={bookingSort.direction} />
                </button>
              </th>
              <th className="cell-number booking-total-cost-column sortable-th">
                <button type="button" className="table-sort-btn" onClick={() => onSort('cost')}>
                  <span>{t('booking.totalCost')}</span>
                  <SortIcon active={bookingSort.key === 'cost'} direction={bookingSort.direction} />
                </button>
              </th>
              <th className="booking-video-column sortable-th">
                <button type="button" className="table-sort-btn" onClick={() => onSort('videos')}>
                  <span>{t(bookingTab === 'product' ? 'booking.affiliateOrders' : 'booking.matchedVideo')}</span>
                  <SortIcon active={bookingSort.key === 'videos'} direction={bookingSort.direction} />
                </button>
              </th>
              <th className="cell-number sortable-th">
                <button type="button" className="table-sort-btn" onClick={() => onSort('items_sold')}>
                  <span>{t('booking.products')}</span>
                  <SortIcon active={bookingSort.key === 'items_sold'} direction={bookingSort.direction} />
                </button>
              </th>
              <th className="cell-number booking-refunds-column sortable-th">
                <button type="button" className="table-sort-btn" onClick={() => onSort('refunds')}>
                  <span>{t('booking.refunds')}</span>
                  <SortIcon active={bookingSort.key === 'refunds'} direction={bookingSort.direction} />
                </button>
              </th>
              <th className="cell-number booking-samples-column sortable-th">
                <button type="button" className="table-sort-btn" onClick={() => onSort('samples')}>
                  <span>{t('booking.samplesShipped')}</span>
                  <SortIcon active={bookingSort.key === 'samples'} direction={bookingSort.direction} />
                </button>
              </th>
              <th className="cell-number sortable-th">
                <button type="button" className="table-sort-btn" onClick={() => onSort('commission')}>
                  <span>{t('booking.estimatedCommission')}</span>
                  <SortIcon active={bookingSort.key === 'commission'} direction={bookingSort.direction} />
                </button>
              </th>
              <th className="cell-actions">{t('booking.actionsColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {creatorRows.map((booking) => {
              const bookingRecords = booking._creator_bookings || [booking];
              const videos = uniqueVideosOfBookings(bookingRecords, videoPerformanceByBooking);
              const shopOrders = productOrdersByShop[String(booking.target_shop_id)] || [];
              const videoPerformance = bookingVideoPerformanceForVideos(videos, null, shopOrders);
              const performance = bookingTab === 'product'
                ? aggregateProductPerformance(
                  bookingRecords,
                  productPerformanceByBooking,
                  convertAmount,
                  selectedCurrency,
                )
                : videoPerformance;
              const totalCost = bookingRecords.reduce((sum, record) => {
                if (!bookingInPeriodById.get(String(record.id))) return sum;
                const rawCost = finiteNumber(record.total_cost ?? record.booking_cost);
                return sum + (convertAmount(rawCost, record.currency) ?? rawCost);
              }, 0);
              const productsById = new Map(bookingRecords.flatMap((record) => bookingProductsOf(record))
                .map((product) => [String(product.id || product.product_id), product]));
              const displayBooking = {
                ...booking,
                total_cost: totalCost,
                booking_cost: totalCost,
                currency: selectedCurrency,
                booking_videos: videos,
                evaluation_snapshot: {
                  ...(booking.evaluation_snapshot || {}),
                  products: [...productsById.values()],
                  product_ids: [...productsById.keys()],
                },
              };
              const videoData = {
                videos,
                performance: videoPerformance,
                videoCount: videos.length,
              };
              const expanded = String(expandedBookingId) === String(booking.id);

              return (
                <BookingRow
                  key={booking.id}
                  booking={displayBooking}
                  expanded={expanded}
                  onToggleRow={onToggleRow}
                  onSelectBooking={onSelectBooking}
                  bookingTab={bookingTab}
                  performance={performance}
                  videoData={videoData}
                  showBookingCost={bookingRecords.some((record) => bookingInPeriodById.get(String(record.id)))}
                  shopOrders={shopOrders}
                  onSelectProduct={onSelectProduct}
                  formatMoney={formatMoney}
                  formatNumber={formatNumber}
                  formatDate={formatDate}
                  formatRate={formatRate}
                  renderPerformance={renderPerformance}
                  creatorMetric={creatorMetric}
                  t={t}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BookingEvaluationTable;
