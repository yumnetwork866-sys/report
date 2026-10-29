import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import BookingVideoThumbnail from '../BookingVideoThumbnail';
import { extractTikTokVideoId, extractVideoHashtags, fullTitleOfVideo } from '../../lib/bookingMetrics';

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
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const fullTitle = fullTitleOfVideo(video, snapshot);
  const hashtags = extractVideoHashtags(video, fullTitle);
  const videoId = extractTikTokVideoId(video);

  const showTooltip = () => {
    if (isPlayerModalOpen) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(380, window.innerWidth - 24);
    const estimatedHeight = 140;
    const showAbove = rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight;
    setTooltip({
      left: Math.min(window.innerWidth - width - 12, Math.max(12, rect.left)),
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      width,
      showAbove,
    });
  };

  const hideTooltip = () => setTooltip(null);

  const handleModalChange = (open) => {
    setIsPlayerModalOpen(open);
    if (open) setTooltip(null);
  };

  const handleTitleClick = (e) => {
    e.stopPropagation();
    setTooltip(null);
    if (videoId) {
      setIsPlayerModalOpen(true);
    } else if (video?.video_url) {
      window.open(video.video_url, '_blank', 'noopener,noreferrer');
    }
  };

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
        isModalOpen={isPlayerModalOpen}
        onModalChange={handleModalChange}
      />
      <div>
        <button
          type="button"
          className="booking-video-expansion__title-btn"
          onClick={handleTitleClick}
          aria-label={video?.title || (videoId ? `Xem video ${videoId}` : 'Xem video TikTok')}
        >
          <strong>{video.title || video.platform_video_id}</strong>
        </button>
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
          <div className="booking-video-tooltip__row">
            <span className="booking-video-tooltip__label">Tiêu đề:</span>
            <p className="booking-video-tooltip__title">{fullTitle}</p>
          </div>
          <div className="booking-video-tooltip__row">
            <span className="booking-video-tooltip__label">Hashtag:</span>
            {hashtags.length > 0 ? (
              <div className="booking-video-tooltip__tags">
                {hashtags.map((tag) => (
                  <span key={tag} className="booking-video-tooltip__tag">{tag}</span>
                ))}
              </div>
            ) : (
              <span className="booking-video-tooltip__empty-hint">Không có hashtag</span>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

export default BookingVideoTitle;

