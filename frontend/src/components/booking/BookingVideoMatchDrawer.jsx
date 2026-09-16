import React from 'react';

const BookingVideoMatchDrawer = ({
  videoMatchDialog,
  onClose,
  matchingVideoId,
  findBookingVideo,
  manualVideoUrl,
  setManualVideoUrl,
  formatDate,
  formatMoney,
  formatNumber,
  t,
}) => {
  if (!videoMatchDialog) return null;

  return (
    <div
      className="koc-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="koc-drawer booking-video-match-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-video-match-title"
      >
        <div className="koc-drawer__header">
          <div><h2 id="booking-video-match-title">{t('booking.videoCandidatesTitle')}</h2></div>
          <button className="button button--ghost" type="button" aria-label={t('common.close')} onClick={onClose}>×</button>
        </div>
        <div className="koc-drawer__body">
          {videoMatchDialog.candidates?.length ? (
            <div className="booking-video-candidates">
              {videoMatchDialog.candidates.map((candidate) => (
                <button
                  className="booking-video-candidate"
                  type="button"
                  key={candidate.id}
                  disabled={matchingVideoId === videoMatchDialog.booking.id}
                  onClick={() => findBookingVideo(videoMatchDialog.booking, candidate.id)}
                >
                  <span>
                    <strong>{candidate.title || candidate.id}</strong>
                    <small>@{candidate.username} · {formatDate(candidate.posted_at)}</small>
                  </span>
                  <span>
                    <strong>{formatMoney(candidate.gmv?.amount, candidate.gmv?.currency)}</strong>
                    <small>{formatNumber(candidate.views)} {t('booking.views')} · {formatNumber(candidate.orders)} {t('booking.orders')}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="section-card__meta">{t('booking.videoMatchNone')}</p>
          )}
          <form
            className="booking-video-manual"
            onSubmit={(event) => {
              event.preventDefault();
              findBookingVideo(videoMatchDialog.booking, null, manualVideoUrl);
            }}
          >
            <label className="field">
              <span>{t('booking.manualVideoUrl')}</span>
              <input
                type="url"
                required
                value={manualVideoUrl}
                placeholder="https://www.tiktok.com/@username/video/..."
                onChange={(event) => setManualVideoUrl(event.target.value)}
              />
            </label>
            <button
              className="button"
              type="submit"
              disabled={matchingVideoId === videoMatchDialog.booking.id}
            >
              {matchingVideoId === videoMatchDialog.booking.id ? t('booking.linkingVideo') : t('booking.linkVideo')}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
};

export default BookingVideoMatchDrawer;
