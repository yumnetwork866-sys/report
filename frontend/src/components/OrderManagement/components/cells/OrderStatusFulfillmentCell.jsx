import React from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { getOrderShipping, getOrderSla, getTrackingUrl } from '../../../../lib/sellerAffiliate';

const orderStatusLabel = (status, t) => t(`sellerAffiliate.orderState_${status}`, { defaultValue: status || '—' });

export const OrderStatusFulfillmentCell = ({ row, formatTime, t }) => {
  const status = String(row.order_status || row.status || 'UNKNOWN').toUpperCase();
  const shipping = getOrderShipping(row);
  const sla = getOrderSla(row);
  const trackingUrl = getTrackingUrl(shipping.provider, shipping.trackingNumber);

  const isOverdue = sla.state === 'OVERDUE';
  const isUrgent = sla.state === 'URGENT';
  const hasCancelRequest = Boolean(
    row.buyer_cancel_reason || row.cancel_user === 'BUYER' || (row.buyer_cancellation && row.buyer_cancellation !== 'no')
  );

  return (
    <div className="order-compact-cell order-compact-cell--status">
      <div className="order-compact-cell__top">
        <span className={`seller-affiliate__order-state seller-affiliate__order-state--${status.toLowerCase()}`}>
          {orderStatusLabel(status, t)}
        </span>
        {hasCancelRequest ? (
          <span className="order-compact-cell__warning-badge order-compact-cell__warning-badge--danger" title={t('sellerAffiliate.buyerCancelRequested')}>
            <AlertTriangle size={11} />
            {t('sellerAffiliate.buyerCancelRequested')}
          </span>
        ) : (isOverdue || isUrgent) ? (
          <span
            className={`order-compact-cell__warning-badge ${isOverdue ? 'order-compact-cell__warning-badge--danger' : 'order-compact-cell__warning-badge--warning'}`}
            title={sla.deadline ? `${t(`sellerAffiliate.orderSla_${sla.state}`)}: ${formatTime(sla.deadline)}` : t(`sellerAffiliate.orderSla_${sla.state}`)}
          >
            <AlertTriangle size={11} />
            {t(`sellerAffiliate.orderSla_${sla.state}`)}
          </span>
        ) : null}
      </div>

      <div className="order-compact-cell__bottom">
        {shipping.provider || shipping.trackingNumber ? (
          <div className="order-compact-cell__carrier">
            {trackingUrl ? (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="order-compact-cell__tracking-link"
                onClick={(event) => event.stopPropagation()}
                title={`${t('sellerAffiliate.trackOrder')}: ${shipping.provider || ''} ${shipping.trackingNumber}`}
              >
                <span>{shipping.provider ? `${shipping.provider}: ` : ''}{shipping.trackingNumber}</span>
                <ExternalLink size={10} aria-hidden="true" />
              </a>
            ) : (
              <span className="row-subtitle">
                {shipping.provider ? `${shipping.provider}: ` : ''}{shipping.trackingNumber}
              </span>
            )}
          </div>
        ) : (
          <span className="row-subtitle">
            {orderStatusLabel(shipping.status, t)}
          </span>
        )}
      </div>
    </div>
  );
};

export default OrderStatusFulfillmentCell;
