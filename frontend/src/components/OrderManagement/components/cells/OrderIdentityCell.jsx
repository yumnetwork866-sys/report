import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export const OrderIdentityCell = ({ row, formatTime, t }) => {
  const [copied, setCopied] = useState(false);
  const orderId = String(row.order_id || row.id || '');

  const copy = async (event) => {
    event.stopPropagation();
    if (!orderId || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="order-compact-cell order-compact-cell--identity">
      <div className="order-compact-cell__top">
        <strong className="order-compact-cell__id" title={orderId}>{orderId}</strong>
        <button
          type="button"
          className="order-compact-cell__copy-btn"
          onClick={copy}
          title={copied ? t('sellerAffiliate.orderCopied') : t('sellerAffiliate.copyOrderId')}
          aria-label={copied ? t('sellerAffiliate.orderCopied') : t('sellerAffiliate.copyOrderId')}
        >
          {copied ? <Check size={12} className="text-positive" /> : <Copy size={12} />}
        </button>
      </div>

      <div className="order-compact-cell__bottom">
        <span className="row-subtitle order-compact-cell__time">
          {formatTime(row.create_time || row.created_time)}
        </span>
      </div>
    </div>
  );
};

export default OrderIdentityCell;
