import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import BookingVideoThumbnail from '../BookingVideoThumbnail';
import { extractVideoHashtags, fullTitleOfVideo } from '../../lib/bookingMetrics';

const BookingVideoTitle = ({
  video,
  snapshot,
  booking,
  videoIndex,
  displayViews,
  t,
  formatNumber,
  formatDateOnly,
}) => {
  const tooltipId = useId();
  const triggerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const fullTitle = fullTitleOfVideo(video, snapshot);
  const hashtags = extractVideoHashtags(video, fullTitle);

  const showTooltip = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(380, window.innerWidth - 24);
    const estimatedHeight = 180;
    const showAbove = rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight;
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
      className="booking-video-expansion__title"
      ref={triggerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      aria-describedby={tooltip ? tooltipId : undefined}
    >
      <BookingVideoThumbnail
        shopId={booking.target_shop_id}
        video={video}
        snapshot={snapshot}
        index={videoIndex}
        username={video.creator_username || booking.creator_username}
        shared={Boolean(video.is_shared_booking_video || Number(video.shared_booking_count) > 1)}
      />
      <div>
        {video.video_url ? (
          <a href={video.video_url} target="_blank" rel="noreferrer">
            <strong>{video.title || video.platform_video_id}</strong>
            <span aria-hidden="true"> ↗</span>
          </a>
        ) : (
          <strong>{video.title || video.platform_video_id}</strong>
        )}
        <small>{formatDateOnly(video.posted_at, '—')}</small>
        <div className="video-engagement video-engagement--inline booking-video-expansion__stats-line">
          <span title={t('videoLibrary.views', 'Lượt xem')} aria-label={`${t('videoLibrary.views', 'Lượt xem')}: ${formatNumber(displayViews ?? 0)}`}>
            <Eye size={13} strokeWidth={1.8} aria-hidden="true" />
            {formatNumber(displayViews ?? 0)}
          </span>
        </div>
      </div>
      {tooltip ? createPortal(
        <div
          className={`booking-video-tooltip${tooltip.showAbove ? ' booking-video-tooltip--above' : ''}`}
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
        >
          {(video.platform_video_id || video.posted_at) ? (
            <div className="booking-video-tooltip__header">
              {video.platform_video_id ? (
                <span className="booking-video-tooltip__id">ID: {video.platform_video_id}</span>
              ) : <span />}
              {video.posted_at ? (
                <span className="booking-video-tooltip__date">
                  {formatDateOnly(video.posted_at, '—')}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="booking-video-tooltip__body">
            <span className="booking-video-tooltip__label">Tiêu đề:</span>
            <p className="booking-video-tooltip__title">{fullTitle}</p>
          </div>
          {hashtags.length > 0 ? (
            <div className="booking-video-tooltip__hashtags">
              <span className="booking-video-tooltip__label">Hashtag ({hashtags.length}):</span>
              <div className="booking-video-tooltip__tags">
                {hashtags.map((tag) => (
                  <span key={tag} className="booking-video-tooltip__tag">{tag}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="booking-video-tooltip__no-hashtags">
              <span className="booking-video-tooltip__label">Hashtag:</span>
              <span className="booking-video-tooltip__empty-hint">Không có hashtag</span>
            </div>
          )}
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

export default BookingVideoTitle;

