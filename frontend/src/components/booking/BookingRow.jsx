import React, { memo } from 'react';
import { ChevronLeft } from 'lucide-react';
import TargetKocAvatar from './TargetKocAvatar';
import BookingVideoThumbnail from '../BookingVideoThumbnail';
import BookingVideoProducts from './BookingVideoProducts';
import BookingProductOrderExpansion from './BookingProductOrderExpansion';
import { computeBookingTimeline } from '../../lib/bookingTimeline';
import {
  bookingVideosOf,
  bookingVideosByRevenue,
  latestBookingVideoSnapshot,
  bookingVideoOrderMetrics,
  productCtrOfBookingVideo,
} from '../../lib/bookingMetrics';

const BookingRow = memo(({
  booking,
  expanded,
  onToggleRow,
  onSelectBooking,
  bookingTab,
  performance,
  videoData,
  shopOrders,
  onSelectProduct,
  formatMoney,
  formatNumber,
  formatDate,
  formatRate,
  renderPerformance,
  creatorMetric,
  t,
}) => {
  const bookingVideos = videoData?.videos || bookingVideosByRevenue(bookingVideosOf(booking));
  const postedVideos = bookingVideos.filter((v) => v.posted_at).sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at));
  const firstPostedDate = postedVideos[0]?.posted_at || booking.posted_at;
  const startDate = booking.created_at;
  const deadlineDate = null;
  const videoCount = bookingTab === 'product'
    ? Number(performance?.affiliate_orders || 0)
    : (videoData?.videoCount ?? bookingVideos.length);

  const timeline = computeBookingTimeline({
    startDate,
    deadlineDate,
    postedVideos,
    firstPostedDate,
    videoCount,
    status: booking.status,
    t,
  });

  return (
    <>
      <tr
        className={expanded ? 'booking-row booking-row--expanded' : 'booking-row'}
        onClick={(event) => onToggleRow(event, booking.id)}
      >
        <td className="booking-koc-column">
          <div className="booking-koc-identity">
            <TargetKocAvatar src={booking.creator_avatar_url} name={booking.creator_name || booking.creator_username} />
            <span>
              <strong>{booking.creator_name || booking.creator_username || 'KOC'}</strong>
              <small>@{booking.creator_username}</small>
              {timeline.badge ? (
                <div className="booking-row-timeline">
                  <span
                    className={`booking-row-timeline__badge booking-row-timeline__badge--${timeline.badge.type}`}
                    title={timeline.badge.tooltip}
                  >
                    {timeline.badge.label}
                  </span>
                </div>
              ) : null}
            </span>
          </div>
        </td>
        <td className="booking-creator-performance-column">{renderPerformance(performance)}</td>
        <td className="cell-number booking-total-cost-column">
          <strong>{formatMoney(booking.total_cost ?? booking.booking_cost, booking.currency)}</strong>
        </td>
        <td className="booking-video-column">
          <span className="booking-video-count">
            <strong>
              {bookingTab === 'product'
                ? t('booking.ordersCount', { count: performance?.affiliate_orders || 0 })
                : t('booking.videosCount', { count: videoCount })}
            </strong>
          </span>
        </td>
        <td className="cell-number">
          <div className="booking-product-summary">
            <strong>{creatorMetric(performance, 'items_sold')} <span>{t('booking.itemsSold')}</span></strong>
            <small>{creatorMetric(performance, 'items_refunded')} {t('booking.refundedShort')}</small>
          </div>
        </td>
        <td className="cell-number booking-refunds-column">{creatorMetric(performance, 'refunded_gmv', { money: true })}</td>
        <td className="cell-number booking-samples-column">{bookingTab === 'product' ? '—' : creatorMetric(performance, 'samples_shipped')}</td>
        <td className="cell-number">{creatorMetric(performance, 'estimated_commission', { money: true })}</td>
        <td className="cell-actions">
          <button
            className="booking-action-open"
            type="button"
            aria-label={t('booking.details')}
            title={t('booking.details')}
            onClick={() => onSelectBooking(booking)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="booking-video-detail-row">
          <td colSpan={9}>
            {bookingTab === 'product' ? (
              <BookingProductOrderExpansion
                booking={booking}
                performance={performance}
                orders={shopOrders}
                t={t}
                formatNumber={formatNumber}
                onSelectProduct={onSelectProduct}
              />
            ) : (
              <div className="booking-video-expansion">
                {bookingVideos.length ? (
                  <div className="booking-video-expansion__list">
                    {bookingVideos.map((video, videoIndex) => {
                      const latest = latestBookingVideoSnapshot(video);
                      const liveMetrics = bookingVideoOrderMetrics(video, booking, shopOrders);
                      const displayGrossGmv = liveMetrics ? liveMetrics.grossGmv : Number(latest?.gross_gmv || 0);
                      const displayItemsSold = liveMetrics ? liveMetrics.itemsSold : Number(latest?.items_sold || 0);
                      const displayCurrency = (liveMetrics && liveMetrics.currency) || latest?.currency || booking.currency;
                      return (
                        <article className="booking-video-expansion__item" key={video.id || video.platform_video_id}>
                          <div className="booking-video-expansion__identity">
                            <div className="booking-video-expansion__title">
                              <BookingVideoThumbnail
                                shopId={booking.target_shop_id}
                                video={video}
                                snapshot={latest}
                                index={videoIndex}
                                username={video.creator_username || booking.creator_username}
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
                                <small>{formatDate(video.posted_at)}</small>
                              </div>
                            </div>
                          </div>
                          {latest || liveMetrics ? (
                            <div className="booking-video-expansion__metrics">
                              <button
                                type="button"
                                className="booking-video-expansion__metric-card--clickable"
                                onClick={() => onSelectProduct({ product: null, video: { ...video, snapshot: latest }, booking, snapshot: latest })}
                                title="Nhấp để xem chi tiết toàn bộ đơn hàng của video"
                              >
                                <span>{t('booking.videoGmv')}</span>
                                <strong>{formatMoney(displayGrossGmv, displayCurrency)}</strong>
                              </button>
                              <button
                                type="button"
                                className="booking-video-expansion__metric-card--clickable"
                                onClick={() => onSelectProduct({ product: null, video: { ...video, snapshot: latest }, booking, snapshot: latest })}
                                title="Nhấp để xem chi tiết toàn bộ đơn hàng của video"
                              >
                                <span>{t('booking.videoItemsSold')}</span>
                                <strong>{formatNumber(displayItemsSold)}</strong>
                              </button>
                              <div><span>{t('booking.videoCtr')}</span><strong>{formatRate(productCtrOfBookingVideo(latest))}</strong></div>
                              <BookingVideoProducts
                                shopId={booking.target_shop_id}
                                video={video}
                                snapshot={latest}
                                label={t('booking.products')}
                                booking={booking}
                                onSelectProduct={onSelectProduct}
                                orders={shopOrders}
                              />
                            </div>
                          ) : (
                            <div className="booking-video-expansion__pending"><span className="loading-dot" /><span>{t('booking.awaitingFirstSync')}</span></div>
                          )}
                          {video.last_sync_error ? <p className="booking-video-expansion__error">{video.last_sync_error}</p> : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="booking-video-expansion__empty">
                    <p>{t('booking.noMatchedVideo')}</p>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
});

BookingRow.displayName = 'BookingRow';

export default BookingRow;
