import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  bookingDateOf,
  bookingProductsOf,
  bookingVideosOf,
} from '../../lib/bookingMetrics';
import DatePickerInput from '../DatePickerInput';
import BookingDetailProduct from './BookingDetailProduct';

const BookingMonthCard = ({
  booking,
  isSelected,
  selectedCurrency,
  currencyLabel,
  convertAmount,
  editableCurrencyAmount,
  formatMoney,
  formatNumber,
  formatRatio,
  formatDate,
  updatingId,
  deletingId,
  onSave,
  onDelete,
  allShopProducts,
  productsLoading,
  t,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const rawCost = booking.total_cost ?? booking.booking_cost;
  const [cost, setCost] = useState(editableCurrencyAmount(convertAmount(rawCost, booking.currency) ?? rawCost, selectedCurrency));
  const [committedVideos, setCommittedVideos] = useState(booking.committed_videos || 1);
  const [bookingDate, setBookingDate] = useState(bookingDateOf(booking));
  const [productIds, setProductIds] = useState(bookingProductsOf(booking).map((p) => String(p.id || p.product_id)));
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productPickerTriggerRef = useRef(null);
  const productPickerMenuRef = useRef(null);

  useEffect(() => {
    if (!productPickerOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (productPickerTriggerRef.current?.contains(event.target)
        || productPickerMenuRef.current?.contains(event.target)) return;
      setProductPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [productPickerOpen]);

  useEffect(() => {
    const rCost = booking.total_cost ?? booking.booking_cost;
    setCost(editableCurrencyAmount(convertAmount(rCost, booking.currency) ?? rCost, selectedCurrency));
    setCommittedVideos(booking.committed_videos || 1);
    setBookingDate(bookingDateOf(booking));
    setProductIds(bookingProductsOf(booking).map((p) => String(p.id || p.product_id)));
  }, [booking, convertAmount, editableCurrencyAmount, selectedCurrency]);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    await onSave(booking.id, {
      total_cost: Number(cost),
      committed_videos: Math.max(1, Number.parseInt(committedVideos, 10) || 1),
      start_date: bookingDate || null,
      end_date: null,
      deadline: null,
      currency: selectedCurrency,
      product_ids: productIds,
      products: (allShopProducts || []).filter((p) => productIds.includes(p.id)),
    });
  };

  const cardVideos = bookingVideosOf(booking);
  const videoCount = cardVideos.length || Number(booking.actual_performance?.video_count || 0);
  const targetVideos = booking.committed_videos || 1;
  const actualGmv = Number(booking.actual_performance?.gross_gmv || booking.actual_performance?.affiliate_gmv || 0);
  const performanceCurrency = booking.actual_performance?.currency || booking.currency;
  const numCost = Number(booking.total_cost ?? booking.booking_cost ?? 0);
  const convertedCost = convertAmount(numCost, booking.currency);
  const convertedGmv = convertAmount(actualGmv, performanceCurrency);
  const ratio = (convertedGmv > 0 && convertedCost !== null) ? (convertedCost / convertedGmv) : null;
  const itemsSold = booking.actual_performance?.items_sold;

  const selectedProductsList = useMemo(() => {
    const shopProductsById = new Map((allShopProducts || []).map((p) => [String(p.id), p]));
    const bookingProductsById = new Map(bookingProductsOf(booking).map((p) => [String(p.id || p.product_id), p]));
    return productIds.map((id) => {
      const sp = shopProductsById.get(String(id));
      const bp = bookingProductsById.get(String(id));
      return {
        id: String(id),
        name: sp?.name || bp?.name || bp?.title || bp?.product_name || id,
        imageUrl: sp?.imageUrl || bp?.imageUrl || bp?.thumbnailUrl || bp?.image_url || bp?.main_image_url || bp?.thumbnail_url || null,
      };
    });
  }, [allShopProducts, booking, productIds]);

  return (
    <article className={`booking-month-card${isSelected ? ' booking-month-card--active' : ''}`}>
      <div className="booking-month-card__header">
        <div className="booking-month-card__header-left">
          <span className="booking-month-card__date-range">
            {formatDate(bookingDateOf(booking) || booking.created_at)}
          </span>
        </div>
        <div className="booking-month-card__header-badges">
          {videoCount >= targetVideos ? (
            <span className="booking-month-card__badge booking-month-card__badge--success">
              {videoCount}/{targetVideos}
            </span>
          ) : videoCount === 0 ? (
            <span className="booking-month-card__badge booking-month-card__badge--pending">
              0/{targetVideos}
            </span>
          ) : (
            <span className="booking-month-card__badge booking-month-card__badge--info">
              {videoCount}/{targetVideos}
            </span>
          )}
          <button
            className="booking-month-card__edit"
            type="button"
            aria-pressed={isEditing}
            aria-label={t(isEditing ? 'booking.bookingCardCollapse' : 'booking.bookingCardEdit')}
            title={t(isEditing ? 'booking.bookingCardCollapse' : 'booking.bookingCardEdit')}
            onClick={() => setIsEditing((current) => !current)}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            className="booking-month-card__edit booking-month-card__delete"
            type="button"
            disabled={deletingId === booking.id}
            aria-label={t(deletingId === booking.id ? 'booking.deleting' : 'booking.delete')}
            title={t(deletingId === booking.id ? 'booking.deleting' : 'booking.delete')}
            onClick={() => onDelete(booking)}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="booking-month-card__body">
        <div className="booking-month-card__metrics">
          <div className="booking-month-card__metric-item">
            <span>{t('booking.cost')}</span>
            <strong>{formatMoney(numCost, booking.currency)}</strong>
          </div>
          <div className="booking-month-card__metric-item">
            <span>GMV</span>
            <strong>{actualGmv > 0 ? formatMoney(actualGmv, performanceCurrency) : '—'}</strong>
          </div>
          <div className="booking-month-card__metric-item">
            <span>{t('booking.costRevenueRatio')}</span>
            <strong>{formatRatio(ratio)}</strong>
          </div>
          <div className="booking-month-card__metric-item">
            <span>{t('booking.videoItemsSold')}</span>
            <strong>{itemsSold !== undefined && itemsSold !== null ? formatNumber(itemsSold) : '—'}</strong>
          </div>
        </div>

        <div className="booking-month-card__products-section">
          <div className="booking-month-card__products-header">
            <span className="booking-month-card__products-label">
              {t('booking.products')} {selectedProductsList.length ? `(${selectedProductsList.length})` : ''}
            </span>
            {isEditing ? (
              <button
                ref={productPickerTriggerRef}
                className="booking-month-card__add-product-btn"
                type="button"
                aria-expanded={productPickerOpen}
                disabled={productsLoading}
                onClick={() => setProductPickerOpen((prev) => !prev)}
              >
                <Plus size={14} aria-hidden="true" />
                <span>{t('booking.addProduct')}</span>
              </button>
            ) : null}
          </div>

          {isEditing && productPickerOpen ? (
            <div ref={productPickerMenuRef} className="booking-product-picker__menu booking-detail-product-picker__menu" role="listbox">
              {allShopProducts.length ? (
                allShopProducts.map((product) => (
                  <label className="booking-product-picker__option" key={product.id}>
                    <input
                      type="checkbox"
                      checked={productIds.includes(product.id)}
                      onChange={() => setProductIds((current) => (
                        current.includes(product.id)
                          ? current.filter((id) => id !== product.id)
                          : [...current, product.id]
                      ))}
                    />
                    <span>
                      {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span className="booking-product-picker__placeholder">P</span>}
                      <span>
                        <strong>{product.name}</strong>
                        <small>{product.id}</small>
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <div className="booking-product-picker__empty">{t('booking.noProducts')}</div>
              )}
            </div>
          ) : null}

          {selectedProductsList.length ? (
            <div className="booking-detail-products">
              {selectedProductsList.map((product) => (
                <BookingDetailProduct
                  key={product.id}
                  product={product}
                  onRemove={isEditing ? (idToRemove) => {
                    setProductIds((curr) => curr.filter((id) => String(id) !== String(idToRemove)));
                  } : null}
                />
              ))}
            </div>
          ) : (
            isEditing && !productPickerOpen ? (
              <p className="booking-month-card__products-empty">{t('booking.noAttachedProducts')}</p>
            ) : null
          )}
        </div>

        {isEditing ? (
          <form className="booking-month-card__form" onSubmit={handleFormSubmit}>
            <div className="field booking-modal-cost-videos">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`date-${booking.id}`}>{t('booking.bookingDate')}</label>
                  <DatePickerInput
                    id={`date-${booking.id}`}
                    label={t('booking.bookingDate')}
                    value={bookingDate}
                    onChange={(val) => setBookingDate(val)}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`cost-${booking.id}`}>{t('booking.totalCost')} ({currencyLabel})</label>
                  <input
                    id={`cost-${booking.id}`}
                    type="number"
                    min="0"
                    step={selectedCurrency === 'VND' ? '1' : '0.01'}
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    required
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`committed-${booking.id}`}>{t('booking.committedVideos')}</label>
                  <input
                    id={`committed-${booking.id}`}
                    type="number"
                    min="1"
                    step="1"
                    value={committedVideos}
                    onChange={(e) => setCommittedVideos(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="booking-month-card__actions">
              <button
                className="button button--small"
                type="submit"
                disabled={updatingId === booking.id}
              >
                {updatingId === booking.id ? t('common.loading') : t('booking.saveChanges')}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </article>
  );
};

export default BookingMonthCard;
