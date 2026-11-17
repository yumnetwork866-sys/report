import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import TargetKocAvatar from './TargetKocAvatar';

const BookingExportModal = ({ groups, initialSelectedKeys, isExporting, error, onClose, onConfirm, t }) => {
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(initialSelectedKeys));
  const [shopId, setShopId] = useState('all');
  const dialogRef = useRef(null);
  const allRef = useRef(null);
  const titleId = useId();
  const shopSelectId = useId();
  const shopsById = new Map();
  for (const group of groups) {
    for (const booking of group.bookings || []) {
      const id = String(booking.target_shop_id || booking.target_shop?.id || '');
      if (id && !shopsById.has(id)) shopsById.set(id, booking.target_shop?.name || `Shop #${id}`);
    }
  }
  const shops = [...shopsById].sort((a, b) => a[1].localeCompare(b[1]));
  const visibleGroups = shopId === 'all' ? groups : groups.filter((group) => (
    (group.bookings || []).some((booking) => String(booking.target_shop_id || booking.target_shop?.id || '') === shopId)
  ));
  const selected = visibleGroups.filter((group) => selectedKeys.has(group.key));
  const allSelected = visibleGroups.length > 0 && selected.length === visibleGroups.length;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = selected.length > 0 && !allSelected;
  }, [allSelected, selected.length]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!isExporting) onClose();
    }
    if (event.key !== 'Tab') return;
    const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) {
      event.preventDefault();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="booking-delete-confirm-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isExporting) onClose();
    }}>
      <div className="booking-export-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}
        aria-busy={isExporting} ref={dialogRef} tabIndex={-1} onKeyDown={handleKeyDown}>
        <div className="booking-export-modal__header">
          <h2 id={titleId}>{t('booking.exportOrders')}</h2>
          <button type="button" className="button button--ghost" onClick={onClose}
            disabled={isExporting} aria-label={t('booking.exportClose')}><X size={20} /></button>
        </div>
        <div className="field booking-export-modal__shop">
          <label htmlFor={shopSelectId}>{t('booking.shop')}</label>
          <select id={shopSelectId} value={shopId} disabled={isExporting} onChange={(event) => setShopId(event.target.value)}>
            <option value="all">{t('booking.exportAllShops')}</option>
            {shops.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <label className="booking-export-modal__option">
          <input ref={allRef} type="checkbox" checked={allSelected} disabled={isExporting || !visibleGroups.length}
            onChange={(event) => {
              const checked = event.target.checked;
              setSelectedKeys((current) => {
                const next = new Set(current);
                for (const group of visibleGroups) {
                  if (checked) next.add(group.key);
                  else next.delete(group.key);
                }
                return next;
              });
            }} />
          <strong>{t('booking.exportSelectAll')}</strong>
          <span className="booking-export-modal__count">{selected.length}/{visibleGroups.length}</span>
        </label>
        <div className="booking-export-modal__list" role="group" aria-label={t('booking.bookingStaff')}>
          {visibleGroups.map((group) => (
            <label className="booking-export-modal__option" key={group.key}>
              <input type="checkbox" checked={selectedKeys.has(group.key)} disabled={isExporting}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelectedKeys((current) => {
                    const next = new Set(current);
                    if (checked) next.add(group.key);
                    else next.delete(group.key);
                    return next;
                  });
                }} />
              <TargetKocAvatar src={group.manager.avatar_url} name={group.manager.name} />
              <span className="booking-export-modal__staff">
                <strong>{group.manager.name}</strong>
                {group.manager.email ? <small>{group.manager.email}</small> : null}
              </span>
            </label>
          ))}
          {!visibleGroups.length ? <p>{t('booking.exportNoStaff')}</p> : null}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="booking-export-modal__actions">
          <button type="button" className="button button--ghost" disabled={isExporting} onClick={onClose}>
            {t('booking.exportCancel')}
          </button>
          <button type="button" className="button button--primary" disabled={isExporting || !selected.length}
            onClick={() => onConfirm(selected.map((group) => group.key), shopId === 'all' ? undefined : shopId)}>
            <Download size={16} />
            {t(isExporting ? 'booking.exportingOrders' : 'booking.exportOrders')}
          </button>
        </div>
      </div>
    </div>, document.body,
  );
};

export default BookingExportModal;
