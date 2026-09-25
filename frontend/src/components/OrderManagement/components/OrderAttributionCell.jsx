import React from 'react';
import AppAvatar from '../../AppAvatar';
import { getAffiliateOrderCreators, getAffiliateOrderSources } from '../../../lib/sellerAffiliate';

export const OrderAttributionCell = ({ row, t }) => {
  const creators = getAffiliateOrderCreators(row);
  const sources = getAffiliateOrderSources(row);
  const primaryCreator = creators[0];
  const primarySource = sources[0];

  if (!primaryCreator && !primarySource) {
    return (
      <div className="order-attribution-cell">
        <span className="seller-affiliate__source-badge seller-affiliate__source-badge--direct">
          {t('sellerAffiliate.orderSource_DIRECT') || 'Trực tiếp'}
        </span>
      </div>
    );
  }

  const sourceType = String(primarySource?.type || (primaryCreator ? 'AFFILIATE' : 'DIRECT')).toUpperCase();
  const sourceLabel = t(`sellerAffiliate.orderSource_${sourceType}`, { defaultValue: sourceType });
  const isVideo = sourceType === 'VIDEO';

  return (
    <div className="order-attribution-cell">
      {primaryCreator ? (
        <div className="creator-identity creator-identity--compact">
          <AppAvatar src={primaryCreator.avatarUrl} name={primaryCreator.name || primaryCreator.username || 'Creator'} />
          <span className="creator-identity__text">
            <strong>{primaryCreator.name || primaryCreator.username}</strong>
            {primaryCreator.username ? <small className="row-subtitle">@{primaryCreator.username.replace(/^@+/, '')}</small> : null}
          </span>
        </div>
      ) : null}
      <div className="order-attribution-cell__source">
        <span className={`seller-affiliate__source-badge seller-affiliate__source-badge--${sourceType.toLowerCase()}`}>
          {sourceLabel}
        </span>
        {isVideo && primarySource?.url ? (
          <a
            href={primarySource.url}
            target="_blank"
            rel="noreferrer"
            className="order-attribution-cell__video-link"
            onClick={(event) => event.stopPropagation()}
            title={primarySource.title || 'Xem video TikTok'}
          >
            {primarySource.title ? primarySource.title : '▶ Xem video'}
          </a>
        ) : primarySource?.title ? (
          <span className="order-attribution-cell__video-title" title={primarySource.title}>
            {primarySource.title}
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default OrderAttributionCell;
