import React from 'react';
import { ChevronRight } from 'lucide-react';

export const OrderActionCell = ({ row, onView, t }) => {
  return (
    <div className="order-compact-cell order-compact-cell--action">
      <button
        type="button"
        className="button button--ghost order-compact-cell__chevron-btn"
        onClick={(event) => {
          event.stopPropagation();
          onView(row);
        }}
        title={t('sellerAffiliate.orderDetail')}
        aria-label={t('sellerAffiliate.orderDetail')}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
};

export default OrderActionCell;
