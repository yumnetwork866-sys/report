import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import AppAvatar from '../../../AppAvatar';
import { getAffiliateOrderCreators, getAffiliateOrderSources } from '../../../../lib/sellerAffiliate';

export const OrderIdentityAttributionCell = ({ row, formatTime, t }) => {
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

  const creators = getAffiliateOrderCreators(row);
  const sources = getAffiliateOrderSources(row);
  const primaryCreator = creators[0];
  const primarySource = sources[0];

  const sourceType = String(primarySource?.type || (primaryCreator ? 'AFFILIATE' : 'DIRECT')).toUpperCase();
  const sourceLabel = t(`sellerAffiliate.orderSource_${sourceType}`, { defaultValue: sourceType });
  const isVideo = sourceType === 'VIDEO';

  return (
    <div className="order-compact-cell order-compact-cell--identity">
      <div className="order-compact-cell__top">
        <span className="order-compact-cell__id-wrapper">
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
        </span>
        <span className={`seller-affiliate__source-badge seller-affiliate__source-badge--${sourceType.toLowerCase()}`}>
          {sourceLabel}
        </span>
      </div>

      <div className="order-compact-cell__bottom">
        {primaryCreator ? (
          <span className="order-compact-cell__creator" title={`@${primaryCreator.username || primaryCreator.name}`}>
            <AppAvatar src={primaryCreator.avatarUrl} name={primaryCreator.name || primaryCreator.username} size={18} />
            <span className="order-compact-cell__creator-name">{primaryCreator.name || primaryCreator.username}</span>
          </span>
        ) : null}
        {isVideo && primarySource?.url ? (
          <a
            href={primarySource.url}
            target="_blank"
            rel="noreferrer"
            className="order-compact-cell__video-link"
            onClick={(event) => event.stopPropagation()}
            title={primarySource.title || 'Xem video'}
          >
            ▶ {primarySource.title ? (primarySource.title.length > 25 ? `${primarySource.title.slice(0, 25)}...` : primarySource.title) : 'Video'}
          </a>
        ) : null}
        <span className="row-subtitle order-compact-cell__time">
          {formatTime(row.create_time || row.created_time)}
        </span>
      </div>
    </div>
  );
};

export default OrderIdentityAttributionCell;
