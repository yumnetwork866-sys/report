import React from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';

const BookingDeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  message,
  confirmLabel,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="booking-delete-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onClose();
        }
      }}
    >
      <div
        className="booking-delete-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-describedby="booking-delete-confirm-message"
      >
        <div className="booking-delete-confirm__content">
          <div className="booking-delete-confirm__icon" aria-hidden="true">
            <Trash2 size={22} />
          </div>
          <strong id="booking-delete-confirm-message">
            {message}
          </strong>
        </div>
        <div className="booking-delete-confirm__actions">
          <button
            className="button button--ghost"
            type="button"
            disabled={isDeleting}
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            className="button button--danger"
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default BookingDeleteConfirmModal;
