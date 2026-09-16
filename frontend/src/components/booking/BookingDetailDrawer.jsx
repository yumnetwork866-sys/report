import React from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import TargetKocAvatar from './TargetKocAvatar';
import BookingMonthCard from './BookingMonthCard';

const BookingDetailDrawer = ({
  selectedBooking,
  onClose,
  creatorBookings,
  deletingId,
  onRequestDeleteCreator,
  creatorBookingStats,
  selectedCurrency,
  currencyLabel,
  convertAmount,
  editableCurrencyAmount,
  formatMoney,
  formatNumber,
  formatRatio,
  formatDate,
  updatingId,
  onSaveCard,
  onRequestDeleteCard,
  openCreateBookingFromDrawer,
  detailProducts,
  detailProductsLoading,
  t,
}) => {
  if (!selectedBooking) return null;

  return createPortal(
    <div
      className="koc-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="koc-drawer booking-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-detail-title"
      >
        <div className="koc-drawer__header">
          <div className="booking-detail-drawer__heading">
            <TargetKocAvatar
              src={selectedBooking.creator_avatar_url}
              name={selectedBooking.creator_name}
            />
            <div>
              <h2 id="booking-detail-title">
                {selectedBooking.creator_name || selectedBooking.creator_username}
              </h2>
              <p>
                @{selectedBooking.creator_username} · {t('booking.allMonthsCount', { count: creatorBookings.length || 1 })}
              </p>
            </div>
          </div>
          <div className="booking-detail-drawer__header-actions">
            <button
              className="button button--ghost booking-detail-drawer__delete"
              type="button"
              disabled={deletingId === 'creator' || !creatorBookings.length}
              aria-label={t(deletingId === 'creator' ? 'booking.deleting' : 'booking.deleteCreatorBookings')}
              title={t(deletingId === 'creator' ? 'booking.deleting' : 'booking.deleteCreatorBookings')}
              onClick={onRequestDeleteCreator}
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
            <button
              className="button button--ghost booking-detail-drawer__close"
              type="button"
              aria-label={t('common.close')}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        <div className="koc-drawer__body">
          <div className="booking-detail-summary">
            <article className="booking-detail-summary__card">
              <span>{t('booking.totalCost')}</span>
              <strong>{formatMoney(creatorBookingStats.totalCost, selectedCurrency)}</strong>
            </article>
            <article className="booking-detail-summary__card">
              <span>{t('booking.totalGmv')}</span>
              <strong>{formatMoney(creatorBookingStats.totalGmv, selectedCurrency)}</strong>
            </article>
            <article className="booking-detail-summary__card">
              <span>{t('booking.totalCostRevenueRatio')}</span>
              <strong>
                {formatRatio(creatorBookingStats.totalGmv > 0 ? creatorBookingStats.totalCost / creatorBookingStats.totalGmv : null)}
              </strong>
            </article>
            <article className="booking-detail-summary__card">
              <span>{t('booking.totalItemsSold')}</span>
              <strong>{formatNumber(creatorBookingStats.itemsSold)}</strong>
            </article>
          </div>
          <div className="booking-cards-list">
            {creatorBookings.map((b) => (
              <BookingMonthCard
                key={b.id}
                booking={b}
                isSelected={b.id === selectedBooking.id}
                selectedCurrency={selectedCurrency}
                currencyLabel={currencyLabel}
                convertAmount={convertAmount}
                editableCurrencyAmount={editableCurrencyAmount}
                formatMoney={formatMoney}
                formatNumber={formatNumber}
                formatRatio={formatRatio}
                formatDate={formatDate}
                updatingId={updatingId}
                deletingId={deletingId}
                onSave={onSaveCard}
                onDelete={onRequestDeleteCard}
                allShopProducts={detailProducts}
                productsLoading={detailProductsLoading}
                t={t}
              />
            ))}
            <button
              className="booking-cards-list__add"
              type="button"
              onClick={openCreateBookingFromDrawer}
              aria-label={t('booking.addBooking')}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
};

export default BookingDetailDrawer;
