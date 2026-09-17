import React from 'react';
import BookingRow from './BookingRow';
import { SortIcon } from './BookingIcons';

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
  onSelectProduct,
  formatMoney,
  formatNumber,
  formatDate,
  formatRate,
  renderPerformance,
  creatorMetric,
  t,
}) => {
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
            {bookings.map((booking) => {
              const videoData = videoPerformanceByBooking.get(String(booking.id));
              const performance = bookingTab === 'product'
                ? productPerformanceByBooking.get(String(booking.id))
                : (videoData?.performance || booking.actual_performance);
              const expanded = String(expandedBookingId) === String(booking.id);
              const shopOrders = productOrdersByShop[String(booking.target_shop_id)] || [];

              return (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  expanded={expanded}
                  onToggleRow={onToggleRow}
                  onSelectBooking={onSelectBooking}
                  bookingTab={bookingTab}
                  performance={performance}
                  videoData={videoData}
                  showBookingCost={bookingInPeriodById.get(String(booking.id))}
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
