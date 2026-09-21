import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchTikTokShopVideoThumbnail } from '../../lib/api';
import AppAvatar from '../AppAvatar';

export const VideoThumbnail = ({ shopId, video, href }) => {
  const videoId = video?.video_id || video?.id;
  const sourceVideo = video?.raw_metrics?.list || {};
  const directThumbnail = video?.thumbnail_url
    || sourceVideo.thumbnail_url
    || sourceVideo.cover_image_url
    || sourceVideo.cover_url
    || null;
  const [thumbnail, setThumbnail] = useState(directThumbnail);
  const [failed, setFailed] = useState(false);
  const username = video?.creator?.user_name
    || video?.username
    || sourceVideo?.creator?.user_name
    || sourceVideo?.username;
  const title = video?.video_title || video?.title || '';

  useEffect(() => {
    setThumbnail(directThumbnail);
    setFailed(false);
    if (directThumbnail || !shopId || !videoId || !username) return undefined;
    const controller = new AbortController();
    fetchTikTokShopVideoThumbnail(shopId, videoId, username, controller.signal)
      .then((payload) => setThumbnail(payload?.thumbnail_url || null))
      .catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [directThumbnail, shopId, username, videoId]);

  const content = thumbnail && !failed
    ? <img src={thumbnail} alt={title} loading="lazy" onError={() => setFailed(true)} />
    : <span className="shop-video-analytics__thumbnail-placeholder" aria-hidden="true">▶</span>;
  return <span className="shop-video-analytics__thumbnail">{href ? <a href={href} target="_blank" rel="noreferrer">{content}</a> : content}</span>;
};

export const CreatorAvatar = ({ src, name }) => <AppAvatar src={src} name={name || 'Creator'} />;

const ProductThumbnail = ({ src }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return <span className="video-export-product__thumbnail video-export-product__thumbnail--fallback" aria-hidden="true">P</span>;
  }
  return <img className="video-export-product__thumbnail" src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
};

export const VideoProduct = ({ product }) => {
  const tooltipId = useId();
  const itemRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const showTooltip = () => {
    if (!product.name) return;
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
  const hideTooltip = () => setTooltip(null);
  return (
    <div
      className="video-export-product"
      ref={itemRef}
      tabIndex={product.name ? 0 : undefined}
      aria-label={product.name || product.id}
      aria-describedby={tooltip ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      <span className="video-export-product__summary">
        <ProductThumbnail src={product.thumbnailUrl} />
      </span>
      {tooltip ? createPortal(
        <span
          className={`video-export-product__tooltip${tooltip.showAbove ? ' video-export-product__tooltip--above' : ''}`}
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
        >
          {product.name}
        </span>,
        document.body,
      ) : null}
    </div>
  );
};
