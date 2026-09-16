import React, { useMemo } from 'react';
import { bookingProductOrderBreakdown } from '../../lib/bookingMetrics';
import BookingDetailProduct from './BookingDetailProduct';

const BookingProductOrderExpansion = ({
  booking,
  orders,
  performance,
  t,
  formatNumber,
  onSelectProduct,
}) => {
  const products = useMemo(
    () => (performance?.breakdown || bookingProductOrderBreakdown(booking, orders)),
    [booking, orders, performance?.breakdown],
  );
  return (
    <div className="booking-product-order-expansion">
      <div className="booking-product-order-expansion__heading">
        <strong>{t('booking.productOrderBreakdown')}</strong>
      </div>
      {products.length ? (
        <div className="booking-product-order-expansion__list">
          {products.map((product) => (
            <article
              className="booking-product-order-expansion__item booking-product-order-expansion__item--clickable"
              key={product.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectProduct?.({ product, booking })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectProduct?.({ product, booking }); }}
              title="Nhấp để xem chi tiết đơn hàng"
            >
              <BookingDetailProduct product={product} />
              <div className="booking-product-order-expansion__metrics">
                <strong>{t('booking.ordersCount', { count: formatNumber(product.orderCount) })}</strong>
                <span className="booking-product-order-expansion__hint">Xem đơn →</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state empty-state--compact">{t('booking.noAttachedProducts')}</div>
      )}
    </div>
  );
};

export default BookingProductOrderExpansion;
