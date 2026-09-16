import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import TargetKocCombobox from './TargetKocCombobox';
import BookingStaffSelect from './BookingStaffSelect';
import BookingDetailProduct from './BookingDetailProduct';
import DatePickerInput from '../DatePickerInput';

const BookingCreateModal = ({
  isOpen,
  saving,
  onClose,
  onSubmit,
  targetKocs,
  form,
  setForm,
  onSearchKoc,
  onLoadMoreKocs,
  targetKocPagination,
  targetKocsLoading,
  channelProductsLoading,
  bookingProducts,
  toggleBookingProduct,
  currencyLabel,
  selectedCurrency,
  canManageUsers,
  users,
  usersLoading,
  selectedKoc,
  t,
}) => {
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!productPickerOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setProductPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [productPickerOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="booking-create-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="booking-create-modal" role="dialog" aria-modal="true" aria-labelledby="booking-create-modal-title">
        <header className="booking-create-modal__header">
          <div><h2 id="booking-create-modal-title">{t('booking.createEvaluation')}</h2></div>
          <button className="button button--ghost" type="button" aria-label={t('common.close')} disabled={saving} onClick={onClose}>×</button>
        </header>
        <form className="filter-panel booking-evaluation-form" onSubmit={onSubmit}>
          <div className="booking-evaluation-form__col">
            <div className="field">
              <label>{t('booking.targetCreator')}</label>
              <TargetKocCombobox
                creators={targetKocs}
                value={form.creator_key}
                onChange={(value) => setForm((current) => ({ ...current, creator_key: value }))}
                onSearch={onSearchKoc}
                onLoadMore={onLoadMoreKocs}
                hasMore={targetKocPagination.page < targetKocPagination.total_pages}
                loading={targetKocsLoading}
                placeholder={t('booking.searchKoc')}
                noResults={t('booking.noSyncedCollaboration')}
                performanceSourceLabel={t('booking.creatorPerformance')}
                collaborationLabel={t('booking.collaboration')}
                loadMoreLabel={t('booking.loadMoreKocs')}
                loadingLabel={t('booking.loadingKocs')}
              />
            </div>
            <div className="field booking-product-picker-field">
              <label>{t('booking.products')}</label>
              <div className="booking-product-picker">
                <button
                  ref={triggerRef}
                  className="booking-product-picker__trigger"
                  type="button"
                  aria-expanded={productPickerOpen}
                  onClick={() => setProductPickerOpen((current) => !current)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={14} aria-hidden="true" />
                    <span>{t('booking.addProduct')}</span>
                    {form.product_ids.length ? <span className="chip chip--compact">{form.product_ids.length}</span> : null}
                  </span>
                  <span className="sidebar__chevron" aria-hidden="true" />
                </button>
                {productPickerOpen ? (
                  <div ref={menuRef} className="booking-product-picker__menu" role="listbox" aria-label={t('booking.products')}>
                    {channelProductsLoading ? (
                      <div className="booking-product-picker__empty"><span className="loading-dot" />{t('booking.loadingProducts')}</div>
                    ) : bookingProducts.length ? (
                      bookingProducts.map((product) => (
                        <label className="booking-product-picker__option" key={product.id}>
                          <input
                            type="checkbox"
                            checked={form.product_ids.includes(product.id)}
                            onChange={() => toggleBookingProduct(product.id)}
                          />
                          <span>
                            {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span className="booking-product-picker__placeholder">P</span>}
                            <span><strong>{product.name}</strong><small>{product.id}</small></span>
                          </span>
                        </label>
                      ))
                    ) : null}
                  </div>
                ) : null}
              </div>
              {form.product_ids.length ? (
                <div style={{ marginTop: '8px' }}>
                  <div className="booking-detail-products">
                    {form.product_ids.map((id) => {
                      const p = bookingProducts.find((item) => String(item.id) === String(id)) || {};
                      return (
                        <BookingDetailProduct
                          key={id}
                          product={{
                            id,
                            name: p.name || id,
                            imageUrl: p.imageUrl || null,
                          }}
                          onRemove={() => toggleBookingProduct(id)}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="total_cost">{t('booking.totalCost')} ({currencyLabel})</label>
              <input
                id="total_cost"
                type="number"
                min="0"
                step={selectedCurrency === 'VND' ? '1' : '0.01'}
                inputMode="decimal"
                value={form.total_cost}
                onChange={(event) => setForm((current) => ({ ...current, total_cost: event.target.value }))}
                required
              />
            </div>
          </div>

          <div className="booking-evaluation-form__col">
            {canManageUsers ? (
              <div className="field">
                <label>{t('booking.bookingStaff')}</label>
                <BookingStaffSelect
                  users={users}
                  value={form.staff_id}
                  onChange={(value) => setForm((current) => ({ ...current, staff_id: value }))}
                  placeholder={t('booking.selectStaff')}
                  loading={usersLoading}
                  loadingLabel={t('booking.loading')}
                />
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="booking_date">{t('booking.bookingDate')}</label>
              <DatePickerInput
                id="booking_date"
                label={t('booking.bookingDate')}
                value={form.booking_date}
                onChange={(value) => setForm((current) => ({ ...current, booking_date: value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="committed_videos">{t('booking.committedVideos')}</label>
              <input
                id="committed_videos"
                type="number"
                min="1"
                step="1"
                value={form.committed_videos}
                onChange={(event) => setForm((current) => ({ ...current, committed_videos: event.target.value }))}
                required
              />
            </div>
          </div>

          <footer className="booking-create-modal__footer">
            <button className="button button--ghost" type="button" disabled={saving} onClick={onClose}>{t('common.cancel')}</button>
            <button className="button" type="submit" disabled={saving || !selectedKoc || !form.staff_id}>
              {saving ? t('booking.submitting') : t('booking.evaluate')}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
};

export default BookingCreateModal;
