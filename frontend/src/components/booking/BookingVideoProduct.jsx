import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const BookingVideoProduct = ({ product, isTarget, quantity, onClick }) => {
  const tooltipId = useId();
  const itemRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => setFailed(false), [product.thumbnailUrl]);

  const showTooltip = () => {
    const rect = itemRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 24);
    const showAbove = rect.bottom + 110 > window.innerHeight;
    setTooltip({
      left: Math.min(window.innerWidth - width - 12, Math.max(12, rect.left)),
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      width,
      showAbove,
    });
  };

  return (
    <button
      type="button"
      className={`booking-video-expansion__product${isTarget ? ' booking-video-expansion__product--target' : ''}`}
      ref={itemRef}
      aria-label={`${isTarget ? '[Sản phẩm Booking] ' : ''}${product.name || product.id} - Xem chi tiết đơn hàng`}
      aria-describedby={tooltip ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltip(null)}
      onFocus={showTooltip}
      onBlur={() => setTooltip(null)}
      onClick={onClick}
    >
      {product.thumbnailUrl && !failed
        ? <img src={product.thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span className="booking-video-expansion__product-placeholder" aria-hidden="true">P</span>}
      {quantity !== undefined && quantity !== null ? (
        <span
          className={`booking-video-expansion__product-badge${quantity > 0 ? ' booking-video-expansion__product-badge--active' : ''}`}
          aria-label={`Số lượng bán: ${quantity}`}
        >
          x{quantity}
        </span>
      ) : null}
      {tooltip ? createPortal(
        <span
          className={`booking-video-expansion__product-tooltip${tooltip.showAbove ? ' booking-video-expansion__product-tooltip--above' : ''}`}
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
        >
          {isTarget ? <span className="booking-video-expansion__product-target-tag">Sản phẩm Booking</span> : null}
          {product.name || product.id}
          {quantity !== undefined && quantity !== null ? (
            <span className="booking-video-expansion__product-tooltip-qty">
              Đã bán: {quantity}
            </span>
          ) : null}
          <span className="booking-video-expansion__product-tooltip-hint">Nhấp để xem chi tiết đơn</span>
        </span>,
        document.body,
      ) : null}
    </button>
  );
};

export default BookingVideoProduct;
