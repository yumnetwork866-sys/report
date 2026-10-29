import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X } from 'lucide-react';

const TikTokVideoModal = ({
  isOpen,
  onClose,
  videoId,
  title,
  username,
  videoUrl,
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !videoId) return null;

  const modalIframeSrc = `https://www.tiktok.com/player/v1/${videoId}?embed_from=oembed&autoplay=1&music_info=1&description=1`;
  const cleanUsername = username ? String(username).replace(/^@+/, '') : '';
  const finalVideoUrl = videoUrl || (cleanUsername && videoId ? `https://www.tiktok.com/@${cleanUsername}/video/${videoId}` : null);

  return createPortal(
    <div
      className="booking-video-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'TikTok Video Player'}
    >
      <div className="booking-video-modal" onClick={(e) => e.stopPropagation()}>
        <div className="booking-video-modal__header">
          <div className="booking-video-modal__info">
            {cleanUsername ? <span className="booking-video-modal__creator">@{cleanUsername}</span> : null}
            <h4 className="booking-video-modal__title">{title || `Video ${videoId}`}</h4>
          </div>
          <div className="booking-video-modal__actions">
            {finalVideoUrl && (
              <a
                href={finalVideoUrl}
                target="_blank"
                rel="noreferrer"
                className="booking-video-modal__link"
                title="Mở trên TikTok"
              >
                <span>Mở TikTok</span>
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
            <button
              type="button"
              className="booking-video-modal__close"
              onClick={onClose}
              aria-label="Đóng"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="booking-video-modal__player-wrap">
          <iframe
            src={modalIframeSrc}
            className="booking-video-modal__iframe"
            title={title || 'TikTok player'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TikTokVideoModal;

