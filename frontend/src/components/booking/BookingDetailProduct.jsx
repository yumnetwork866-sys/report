import React, { useState, useEffect } from 'react';

const BookingDetailProduct = ({ product, onRemove }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const source = product?.product || product || {};
  const name = source.title || source.name || source.product_name || source.id || source.product_id || '—';
  const id = source.id || source.product_id || null;
  const thumbnailUrl = source.imageUrl
    || source.main_image_url
    || source.thumbnail_url
    || source.thumbnailUrl
    || source.image_url
    || source.image?.url
    || source.images?.[0]?.url
    || null;
  useEffect(() => setImageFailed(false), [thumbnailUrl]);
  return (
    <div className={`booking-detail-product${onRemove ? ' booking-detail-product--removable' : ''}`}>
      {thumbnailUrl && !imageFailed
        ? <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
        : <span className="booking-detail-product__placeholder" aria-hidden="true">P</span>}
      <span><strong title={name}>{name}</strong>{id && String(id) !== String(name) ? <small>{id}</small> : null}</span>
      {onRemove && id ? (
        <button
          type="button"
          className="booking-detail-product__remove"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(id);
          }}
          title="Xóa"
          aria-label="Xóa"
        >
          ×
        </button>
      ) : null}
    </div>
  );
};

export default BookingDetailProduct;
