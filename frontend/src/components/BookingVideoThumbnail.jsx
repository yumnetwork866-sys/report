import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { fetchTikTokShopVideoThumbnail } from '../lib/api';
import { cachedThumbnail, thumbnailFrom } from '../lib/bookingVideoThumbnails';
import { extractTikTokVideoId, extractTikTokUsername } from '../lib/bookingMetrics';
import TikTokVideoModal from './TikTokVideoModal';

const BookingVideoThumbnail = ({
  shopId,
  video,
  snapshot,
  index,
  username: explicitUsername,
  shared = false,
  isModalOpen: controlledModalOpen,
  onModalChange,
}) => {
  const containerRef = useRef(null);
  const directThumbnail = thumbnailFrom(video, snapshot);
  const [thumbnail, setThumbnail] = useState(directThumbnail);
  const [failed, setFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [internalModalOpen, setInternalModalOpen] = useState(false);

  const isModalOpen = controlledModalOpen !== undefined ? controlledModalOpen : internalModalOpen;

  const setModalOpenState = (open) => {
    if (controlledModalOpen === undefined) {
      setInternalModalOpen(open);
    }
    onModalChange?.(open);
  };

  const videoId = extractTikTokVideoId(video);
  const username = extractTikTokUsername(video, explicitUsername);
  const videoUrl = video?.video_url || (username && videoId ? `https://www.tiktok.com/@${username}/video/${videoId}` : null);

  useEffect(() => {
    setThumbnail(directThumbnail);
    setFailed(false);
    if (directThumbnail || !shopId || !videoId || !username) return undefined;
    let active = true;
    const cacheKey = `${shopId}:${videoId}:${username.toLowerCase()}`;
    cachedThumbnail(cacheKey, () => (
      fetchTikTokShopVideoThumbnail(shopId, videoId, username)
    ))
      .then((payload) => { if (active && payload?.thumbnail_url) setThumbnail(payload.thumbnail_url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [directThumbnail, shopId, username, videoId]);

  useEffect(() => {
    if (isVisible || !containerRef.current || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isVisible]);

  const thumbnailIframeSrc = videoId
    ? `https://www.tiktok.com/player/v1/${videoId}?embed_from=oembed&autoplay=0&muted=1&music_info=0&description=0`
    : null;

  const handleClick = (e) => {
    e.stopPropagation();
    if (videoId) {
      setModalOpenState(true);
    } else if (videoUrl) {
      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <button
        ref={containerRef}
        type="button"
        className={'booking-video-expansion__thumbnail' + (shared ? ' booking-video-expansion__thumbnail--shared' : '')}
        onClick={handleClick}
        aria-label={video?.title || (videoId ? `Xem video ${videoId}` : 'Xem video TikTok')}
      >
        <span className="booking-video-expansion__thumbnail-placeholder" aria-hidden="true">▶</span>

        {thumbnail && !failed ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : thumbnailIframeSrc && isVisible ? (
          <div className="booking-video-expansion__thumbnail-iframe-viewport">
            <iframe
              src={thumbnailIframeSrc}
              className={`booking-video-expansion__thumbnail-iframe${iframeLoaded ? ' booking-video-expansion__thumbnail-iframe--loaded' : ''}`}
              title={video?.title || 'TikTok thumbnail'}
              loading="lazy"
              scrolling="no"
              tabIndex={-1}
              aria-hidden="true"
              onLoad={() => setIframeLoaded(true)}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        ) : null}

        <div className="booking-video-expansion__thumbnail-overlay" aria-hidden="true">
          <span className="booking-video-expansion__thumbnail-play-badge">
            <Play size={13} fill="currentColor" />
          </span>
        </div>

        <span className="booking-video-expansion__index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
      </button>

      <TikTokVideoModal
        isOpen={isModalOpen}
        onClose={() => setModalOpenState(false)}
        videoId={videoId}
        title={video?.title}
        username={username}
        videoUrl={videoUrl}
      />
    </>
  );
};

export default BookingVideoThumbnail;
