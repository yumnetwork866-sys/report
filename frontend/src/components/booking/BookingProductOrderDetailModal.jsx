import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchTikTokShopVideoThumbnail, fetchTikTokSellerAffiliateOrders } from '../../lib/api';
import { cachedThumbnail, thumbnailFrom } from '../../lib/bookingVideoThumbnails';
import {
  bookingProductsOf,
  extractProductOrderRows,
  formatOrderTimestamp,
} from '../../lib/bookingMetrics';

const OrderVideoThumbnail = ({ row, shopId, username }) => {
  const [thumbnail, setThumbnail] = useState(null);
  const [title, setTitle] = useState(row.videoTitle || '');
  const [failed, setFailed] = useState(false);
  const videoId = String(row.contentId || '').trim();

  useEffect(() => {
    setThumbnail(null);
    setTitle(row.videoTitle || '');
    setFailed(false);
    if (!shopId || !videoId || !username) return undefined;

    let active = true;
    const normalizedUsername = String(username).trim().replace(/^@+/, '');
    const cacheKey = `${shopId}:${videoId}:${normalizedUsername.toLowerCase()}`;
    cachedThumbnail(cacheKey, () => (
      fetchTikTokShopVideoThumbnail(shopId, videoId, normalizedUsername)
    ))
      .then((payload) => {
        if (!active) return;
        setThumbnail(payload?.thumbnail_url || null);
        setTitle(payload?.title || row.videoTitle || 'Video TikTok');
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [row.videoTitle, shopId, username, videoId]);

  const tooltip = title || `Video TikTok ${videoId}`;
  const normalizedUsername = String(username || '').trim().replace(/^@+/, '');
  const videoUrl = normalizedUsername && videoId
    ? `https://www.tiktok.com/@${encodeURIComponent(normalizedUsername)}/video/${encodeURIComponent(videoId)}`
    : null;
  const content = (
    <>
      {thumbnail && !failed ? (
        <img
          src={thumbnail}
          alt={title || 'Video TikTok'}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="booking-product-order-modal__source-video-placeholder" aria-hidden="true">▶</span>
      )}
    </>
  );
  return videoUrl ? (
    <a
      className="booking-product-order-modal__source-video"
      href={videoUrl}
      target="_blank"
      rel="noreferrer"
      title={tooltip}
      aria-label={`Mở video ${tooltip}`}
    >
      {content}
    </a>
  ) : (
    <span className="booking-product-order-modal__source-video" title={tooltip}>{content}</span>
  );
};

const BookingProductOrderDetailModal = ({
  product,
  booking,
  video,
  snapshot,
  orders = [],
  loading = false,
  onClose,
  formatMoney,
  formatNumber,
  t,
  currency,
  dateRange,
}) => {
  const effectiveSnapshot = snapshot || video?.snapshot;
  const [videoThumbnail, setVideoThumbnail] = useState(() => (
    video?.thumbnail_url
    || video?.cover_image_url
    || thumbnailFrom(video, effectiveSnapshot)
    || null
  ));
  const [videoThumbFailed, setVideoThumbFailed] = useState(false);

  useEffect(() => {
    const direct = video?.thumbnail_url
      || video?.cover_image_url
      || thumbnailFrom(video, effectiveSnapshot)
      || null;
    if (direct) {
      setVideoThumbnail(direct);
      setVideoThumbFailed(false);
      return undefined;
    }
    if (product) return undefined;

    const shopId = booking?.target_shop_id;
    const videoId = String(video?.platform_video_id || video?.id || '').trim();
    const username = String(video?.creator_username || booking?.creator_username || '').trim().replace(/^@+/, '');
    if (!shopId || !videoId || !username) return undefined;

    let active = true;
    const cacheKey = `${shopId}:${videoId}:${username.toLowerCase()}`;
    cachedThumbnail(cacheKey, () => (
      fetchTikTokShopVideoThumbnail(shopId, videoId, username)
    ))
      .then((payload) => {
        if (active && payload?.thumbnail_url) {
          setVideoThumbnail(payload.thumbnail_url);
          setVideoThumbFailed(false);
        }
      })
      .catch(() => {
        if (active) setVideoThumbFailed(true);
      });
    return () => { active = false; };
  }, [product, video, effectiveSnapshot, booking?.target_shop_id, booking?.creator_username]);

  const [modalOrders, setModalOrders] = useState(() => (Array.isArray(orders) && orders.length ? orders : []));
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (Array.isArray(orders) && orders.length > 0) {
      setModalOrders(orders);
      setModalError('');
      return undefined;
    }
    const shopId = booking?.target_shop_id;
    if (!shopId) return undefined;

    const controller = new AbortController();
    setModalLoading(true);
    setModalError('');
    const loadOrders = async () => {
      const loaded = [];
      let pageToken = '';
      for (let page = 0; page < 100; page += 1) {
        const payload = await fetchTikTokSellerAffiliateOrders(shopId, {
          signal: controller.signal,
          source: 'db',
          pageSize: 100,
          pageToken,
          ...(product?.id ? { productId: product.id } : {}),
          ...(booking?.creator_username ? { creatorUsername: booking.creator_username } : {}),
          ...(dateRange?.startTime ? { startTime: dateRange.startTime } : {}),
          ...(dateRange?.endTime ? { endTime: dateRange.endTime } : {}),
        });
        loaded.push(...(payload?.orders || payload?.affiliate_orders || []));
        const nextPageToken = String(payload?.next_page_token || '');
        if (!nextPageToken || nextPageToken === pageToken) break;
        pageToken = nextPageToken;
      }
      return loaded;
    };
    loadOrders()
      .then((loaded) => {
        if (!controller.signal.aborted) setModalOrders(loaded);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError.name !== 'AbortError') {
          setModalError(requestError.message || t('booking.productOrdersError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setModalLoading(false);
      });

    return () => controller.abort();
  }, [booking?.target_shop_id, booking?.creator_username, product?.id, orders, dateRange?.startTime, dateRange?.endTime, t]);

  const effectiveOrders = modalOrders.length ? modalOrders : orders;
  const isEffectiveLoading = loading || modalLoading;

  const [filterMode, setFilterMode] = useState(() => (video?.platform_video_id ? 'video' : 'all'));
  const [searchQuery, setSearchQuery] = useState('');

  const { rows, currency: orderCurrency } = useMemo(
    () => extractProductOrderRows(effectiveOrders, product?.id, booking?.creator_username, video?.platform_video_id),
    [effectiveOrders, product?.id, booking?.creator_username, video?.platform_video_id],
  );

  const videoMatchRowsCount = useMemo(() => rows.filter((r) => r.isVideoMatch).length, [rows]);

  const productThumbMap = useMemo(() => {
    const map = new Map();
    if (product?.id) {
      const img = product.thumbnailUrl || product.image_url || product.thumbnail_url || product.imageUrl;
      if (img) map.set(String(product.id), img);
    }
    for (const p of bookingProductsOf(booking)) {
      const id = String(p?.id || p?.product_id || '').trim();
      const img = p?.image_url || p?.imageUrl || p?.thumbnail_url || p?.thumbnailUrl || p?.main_image_url;
      if (id && img) map.set(id, img);
    }
    for (const p of Array.isArray(video?.affiliate_products) ? video.affiliate_products : []) {
      const id = String(p?.id || p?.product_id || '').trim();
      const img = p?.thumbnail_url || p?.thumbnailUrl || p?.main_image_url || p?.image_url;
      if (id && img) map.set(id, img);
    }
    for (const order of Array.isArray(orders) ? orders : []) {
      for (const prod of Array.isArray(order?.products) ? order.products : []) {
        const id = String(prod?.id || prod?.product_id || '').trim();
        const img = prod?.main_image_url || prod?.image_url || prod?.thumbnail_url || prod?.thumbnailUrl;
        if (id && img && !map.has(id)) map.set(id, img);
      }
    }
    return map;
  }, [product, booking, video, orders]);

  const tabRows = useMemo(() => {
    if (filterMode === 'video' && video?.platform_video_id) {
      return rows.filter((r) => r.isVideoMatch);
    }
    return rows;
  }, [rows, filterMode, video?.platform_video_id]);

  const activeStats = useMemo(() => {
    const list = tabRows;
    const orderIds = new Set();
    let items = 0;
    let refundedItems = 0;
    let gmv = 0;
    let comm = 0;
    for (const r of list) {
      if (r.orderId) orderIds.add(r.orderId);
      items += r.quantity;
      refundedItems += r.refundedQuantity;
      gmv += r.gmv;
      comm += r.commission;
    }
    return {
      orderCount: orderIds.size,
      items,
      refundedItems,
      gmv,
      commission: comm,
    };
  }, [tabRows]);

  const filteredRows = useMemo(() => {
    let list = tabRows;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => (
        r.orderId.toLowerCase().includes(q)
        || r.skuName.toLowerCase().includes(q)
        || (r.productName && r.productName.toLowerCase().includes(q))
        || (r.videoTitle && r.videoTitle.toLowerCase().includes(q))
      ));
    }
    return list;
  }, [tabRows, searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const activeCurrency = orderCurrency || currency;

  return createPortal((
    <div
      className="booking-product-order-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="booking-product-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-order-detail-title"
      >
        <header className="booking-product-order-modal__header">
          <div className="booking-product-order-modal__product-info">
            <div className="booking-product-order-modal__thumbnail">
              {product ? (
                (product.thumbnailUrl || (product.id ? productThumbMap.get(String(product.id)) : null)) ? (
                  <img
                    src={product.thumbnailUrl || productThumbMap.get(String(product.id))}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="booking-product-order-modal__placeholder">P</span>
                )
              ) : (videoThumbnail && !videoThumbFailed) ? (
                <img
                  src={videoThumbnail}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setVideoThumbFailed(true)}
                />
              ) : (
                <span className="booking-product-order-modal__placeholder">▶</span>
              )}
            </div>
            <div className="booking-product-order-modal__title-box">
              <h2 id="product-order-detail-title" className="booking-product-order-modal__title" title={product?.name || product?.id || video?.title || 'Đơn hàng của Video'}>
                {product ? (product.name || product.id) : (video?.title || 'Tất cả đơn hàng của Video')}
              </h2>
              <small className="row-subtitle">
                {product ? `Mã sản phẩm: ${product.id}` : `Video ID: ${video?.platform_video_id || '—'}`}
              </small>
            </div>
          </div>
          <button
            className="button button--ghost"
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            style={{ fontSize: '1.25rem', minWidth: '36px', height: '36px' }}
          >
            ×
          </button>
        </header>

        <div className="booking-product-order-modal__body">
          <div className="booking-product-order-modal__stats">
            <div className="booking-product-order-modal__stat">
              <span>{t('booking.orderCount', { defaultValue: 'Số đơn hàng' })}</span>
              <strong>{formatNumber(activeStats.orderCount)}</strong>
            </div>
            <div className="booking-product-order-modal__stat">
              <span>{t('booking.itemsSoldTotal', { defaultValue: 'Số lượng đã bán' })}</span>
              <strong>
                {formatNumber(activeStats.items)}
                {activeStats.refundedItems > 0 ? (
                  <small style={{ fontWeight: 500, fontSize: '.75rem', color: 'var(--color-danger, #ef4444)' }}>
                    {' '}(-{activeStats.refundedItems})
                  </small>
                ) : null}
              </strong>
            </div>
            <div className="booking-product-order-modal__stat">
              <span>{t('booking.videoGmv', { defaultValue: 'Doanh số (GMV)' })}</span>
              <strong>{formatMoney(activeStats.gmv, activeCurrency)}</strong>
            </div>
            <div className="booking-product-order-modal__stat">
              <span>{t('booking.estimatedCommission', { defaultValue: 'Hoa hồng ước tính' })}</span>
              <strong>{formatMoney(activeStats.commission, activeCurrency)}</strong>
            </div>
          </div>

          <div className="booking-product-order-modal__filter-bar">
            {video ? (
              <div className="booking-product-order-modal__tabs">
                <button
                  type="button"
                  className={`booking-product-order-modal__tab${filterMode === 'video' ? ' booking-product-order-modal__tab--active' : ''}`}
                  onClick={() => setFilterMode('video')}
                >
                  Đơn từ video này ({videoMatchRowsCount})
                </button>
                <button
                  type="button"
                  className={`booking-product-order-modal__tab${filterMode === 'all' ? ' booking-product-order-modal__tab--active' : ''}`}
                  onClick={() => setFilterMode('all')}
                >
                  Tất cả đơn của KOC ({rows.length})
                </button>
              </div>
            ) : <div />}
            <input
              type="search"
              className="booking-product-order-modal__search"
              placeholder={product ? 'Tìm mã đơn, phân loại...' : 'Tìm mã đơn, sản phẩm, phân loại...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {isEffectiveLoading ? (
            <div className="booking-order-skeleton" role="status" aria-label="Đang tải danh sách đơn hàng">
              {[0, 1, 2, 3, 4].map((row) => (
                <div className="booking-order-skeleton__row" key={row} aria-hidden="true">
                  <span className="booking-skeleton booking-skeleton--order" />
                  <span className="booking-skeleton booking-skeleton--date" />
                  <span className="booking-skeleton booking-skeleton--product" />
                  <span className="booking-skeleton booking-skeleton--value" />
                  <span className="booking-skeleton booking-skeleton--value" />
                </div>
              ))}
              <span className="sr-only">Đang tải danh sách đơn hàng...</span>
            </div>
          ) : modalError ? (
            <div className="empty-state" role="alert" style={{ padding: '36px 0' }}>
              <p>{modalError}</p>
            </div>
          ) : filteredRows.length > 0 ? (
            <div className="booking-product-order-modal__table-wrap">
              <table className="booking-product-order-modal__table">
                <thead>
                  <tr>
                    <th>Đơn hàng</th>
                    <th>Thời gian đặt</th>
                    <th style={{ minWidth: '220px' }}>Phân loại</th>
                    <th style={{ textAlign: 'right' }}>Số lượng</th>
                    <th style={{ textAlign: 'right' }}>Đơn giá</th>
                    <th style={{ textAlign: 'right' }}>Thành tiền</th>
                    <th style={{ textAlign: 'right' }}>Hoa hồng</th>
                    <th>Nguồn</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => {
                    const thumb = row.thumbnailUrl || productThumbMap.get(String(row.productId)) || null;
                    const displaySkuName = row.classification || row.skuName || 'Mặc định';
                    return (
                      <tr key={`${row.orderId}:${row.skuId || idx}`}>
                        <td>
                          <div className="booking-product-order-modal__order-cell">
                            <div className="booking-product-order-modal__product-cell-thumb">
                              {thumb ? (
                                <img src={thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                              ) : (
                                <span>{(row.displayProductName || row.productName || 'P').trim().charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="booking-product-order-modal__order-cell-info">
                              <strong
                                className="booking-product-order-modal__order-product-name"
                                title={row.productName || row.displayProductName}
                              >
                                {row.displayProductName || row.productName || '—'}
                              </strong>
                              <span
                                className="booking-product-order-modal__order-id"
                                title={`Mã đơn: ${row.orderId}`}
                              >
                                {row.orderId}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {(() => {
                            const formatted = formatOrderTimestamp(row.orderTime);
                            return (
                              <div className="booking-product-order-modal__time-cell">
                                <span className="booking-product-order-modal__time-date">{formatted.date}</span>
                                {formatted.time ? (
                                  <small className="booking-product-order-modal__time-hour">{formatted.time}</small>
                                ) : null}
                              </div>
                            );
                          })()}
                        </td>
                        <td>
                          <div className="booking-product-order-modal__sku-cell">
                            <span className="booking-product-order-modal__sku-badge" title={displaySkuName}>
                              {displaySkuName}
                            </span>
                            {row.skuId ? (
                              <small className="booking-product-order-modal__sku-id" title={`SKU ID: ${row.skuId}`}>
                                {row.skuId}
                              </small>
                            ) : null}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 650 }}>
                          {formatNumber(row.quantity)}
                          {row.refundedQuantity > 0 ? (
                            <small style={{ color: 'var(--color-danger, #ef4444)', marginLeft: '4px' }}>
                              (-{row.refundedQuantity})
                            </small>
                          ) : null}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {formatMoney(row.price, row.currency)}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 650 }}>
                          {formatMoney(row.gmv, row.currency)}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--color-accent-strong)' }}>
                          {formatMoney(row.commission, row.currency)}
                        </td>
                        <td>
                          {video && row.isVideoMatch ? (
                            <span
                              className="booking-product-order-modal__tag-video booking-product-order-modal__tag-video--match"
                              title={`Video: ${row.contentId}`}
                            >
                              Video này
                            </span>
                          ) : video && row.contentType === 'VIDEO' ? (
                            <span
                              className="booking-product-order-modal__tag-video booking-product-order-modal__tag-video--other"
                              title={`Video ID: ${row.contentId}`}
                            >
                              Video khác
                            </span>
                          ) : row.contentType === 'VIDEO' ? (
                            <OrderVideoThumbnail
                              row={row}
                              shopId={booking?.target_shop_id}
                              username={booking?.creator_username}
                            />
                          ) : (
                            <span className="booking-product-order-modal__tag-other">
                              {row.contentType || 'Khác'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '36px 0' }}>
              <p>
                {searchQuery
                  ? 'Không tìm thấy đơn hàng nào khớp với tìm kiếm.'
                  : filterMode === 'video'
                    ? 'Chưa ghi nhận đơn hàng nào được gắn trực tiếp vào video này.'
                    : 'Chưa có đơn hàng nào phát sinh cho sản phẩm này trong khoảng thời gian đã chọn.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body);
};

export default BookingProductOrderDetailModal;
