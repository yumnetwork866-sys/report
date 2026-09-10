import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  createBooking,
  deleteBooking,
  fetchBookingTargetKocDetail,
  fetchBookingTargetKocs,
  fetchBookings,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokSellerAffiliateOrders,
  fetchUsers,
  matchBookingVideo,
  updateBooking,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import { hasPermission } from '../lib/session';
import { useSession } from '../lib/useSession';
import AppAvatar from './AppAvatar';
import BookingVideoThumbnail from './BookingVideoThumbnail';
import DatePickerInput from './DatePickerInput';
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';

const DEFAULT_PERFORMANCE_WINDOW = 'LIFETIME';
const generateBookingMonthOptions = (count = 12) => {
  const options = [{ value: 'all', labelKey: 'booking.allMonths' }];
  const d = new Date();
  for (let i = 0; i < count; i += 1) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    options.push({
      value: `${year}-${month}`,
      label: `${month}/${year}`,
    });
    d.setMonth(d.getMonth() - 1);
  }
  return options;
};
const PRODUCT_ORDERS_CACHE_TTL_MS = 5 * 60 * 1000;
const BOOKING_UI_SESSION_KEY = 'booking-management-ui';
const PRODUCT_ORDERS_CACHE_SESSION_KEY = 'booking-product-orders-cache';
const bookingResourceCache = new Map();
const cachedBookingResource = (key, load) => {
  const cached = bookingResourceCache.get(key);
  if (cached && Date.now() - cached.createdAt < PRODUCT_ORDERS_CACHE_TTL_MS) return cached.promise;
  const promise = Promise.resolve().then(load).catch((error) => {
    bookingResourceCache.delete(key);
    throw error;
  });
  bookingResourceCache.set(key, { createdAt: Date.now(), promise });
  return promise;
};
const bookingUiSession = () => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(BOOKING_UI_SESSION_KEY) || '{}');
  } catch {
    return {};
  }
};
const productOrdersCacheSession = () => {
  if (typeof window === 'undefined') return new Map();
  try {
    const now = Date.now();
    const entries = JSON.parse(window.sessionStorage.getItem(PRODUCT_ORDERS_CACHE_SESSION_KEY) || '[]');
    return new Map(entries.filter(([, cached]) => (
      cached?.ordersByShop && now - Number(cached.fetchedAt) < PRODUCT_ORDERS_CACHE_TTL_MS
    )));
  } catch {
    return new Map();
  }
};
const persistProductOrdersCache = (cache) => {
  try {
    window.sessionStorage.setItem(PRODUCT_ORDERS_CACHE_SESSION_KEY, JSON.stringify([...cache]));
  } catch {
    // Keep the in-memory cache when session storage is unavailable or full.
  }
};
const dateInputValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
const shiftDateInputValue = (value, days) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const defaultBookingForm = () => {
  const today = dateInputValue(new Date());
  return {
    creator_key: '',
    staff_id: '',
    total_cost: '',
    committed_videos: 1,
    product_ids: [],
    start_date: today,
    end_date: shiftDateInputValue(today, 7),
  };
};
const initialForm = defaultBookingForm();
const defaultCustomRange = () => {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start: dateInputValue(start), end: dateInputValue(end) };
};


const targetKocKey = (creator) => {
  const identity = creator.creator_open_id || `username:${String(creator.username || '').toLocaleLowerCase()}`;
  return `${creator.shop_id}:${identity}`;
};
const snapshotOf = (booking) => booking?.evaluation_snapshot || {};
const bookingVideosOf = (booking) => Array.isArray(booking?.booking_videos) ? booking.booking_videos : [];
const bookingProductsOf = (booking) => {
  const snapshot = snapshotOf(booking);
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const byId = new Map(products.map((product) => [String(product.id || product.product_id), product]));
  for (const value of Array.isArray(snapshot.product_ids) ? snapshot.product_ids : []) {
    const id = String(value || '').trim();
    if (id && !byId.has(id)) byId.set(id, { id, name: id, image_url: null });
  }
  return [...byId.values()].filter((product) => String(product.id || product.product_id || '').trim());
};

const orderRangeForWindow = (windowType, customRange) => {
  const end = windowType === 'CUSTOM'
    ? customRange.end
    : shiftDateInputValue(dateInputValue(new Date()), -1);
  const days = Number(String(windowType).match(/^PAST_(\d+)_DAYS$/)?.[1]) || 30;
  const start = windowType === 'CUSTOM' ? customRange.start : shiftDateInputValue(end, -(days - 1));
  const malaysiaMidnightUnix = (value) => Math.floor(new Date(`${value}T00:00:00+08:00`).getTime() / 1000);
  return {
    startTime: malaysiaMidnightUnix(start),
    endTime: malaysiaMidnightUnix(shiftDateInputValue(end, 1)),
  };
};

const bookingProductOrderPerformance = (booking, orders = []) => {
  const selectedProducts = bookingProductsOf(booking);
  const selectedIds = new Set(selectedProducts.map((product) => String(product.id || product.product_id)));
  const creatorUsername = String(booking.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
  const orderIds = new Set();
  let affiliateGmv = 0;
  let refundedGmv = 0;
  let itemsSold = 0;
  let itemsRefunded = 0;
  let estimatedCommission = 0;
  let currency = booking.currency || 'MYR';

  for (const order of orders) {
    const orderId = String(order?.id || order?.order_id || '').trim();
    let matchedOrder = false;
    for (const sku of Array.isArray(order?.skus) ? order.skus : []) {
      const productId = String(sku?.product_id || '').trim();
      const skuCreator = String(sku?.creator_username || order?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
      if (!selectedIds.has(productId) || (creatorUsername && skuCreator !== creatorUsername)) continue;
      const quantity = Math.max(0, finiteNumber(sku?.quantity));
      const refundedQuantity = Math.min(quantity, Math.max(0, finiteNumber(sku?.refunded_quantity)));
      const price = Math.max(0, finiteNumber(sku?.price?.amount ?? sku?.price_amount));
      const commissionRate = Math.max(0, finiteNumber(sku?.creator_commission_rate));
      currency = sku?.price?.currency || sku?.currency || currency;
      itemsSold += quantity;
      itemsRefunded += refundedQuantity;
      affiliateGmv += price * quantity;
      refundedGmv += price * refundedQuantity;
      estimatedCommission += price * (quantity - refundedQuantity) * commissionRate / 10000;
      matchedOrder = true;
    }
    if (matchedOrder && orderId) orderIds.add(orderId);
  }

  return {
    source: 'AFFILIATE_ORDERS',
    has_products: selectedProducts.length > 0,
    currency,
    affiliate_gmv: affiliateGmv,
    affiliate_orders: orderIds.size,
    items_sold: itemsSold,
    items_refunded: itemsRefunded,
    refunded_gmv: refundedGmv,
    estimated_commission: estimatedCommission,
    selected_products: selectedProducts,
  };
};
const bookingProductOrderBreakdown = (booking, orders = []) => {
  const selectedProducts = bookingProductsOf(booking);
  const selectedIds = new Set(selectedProducts.map((product) => String(product.id || product.product_id)));
  const creatorUsername = String(booking.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
  const rowsById = new Map(selectedProducts.map((product) => {
    const id = String(product.id || product.product_id);
    return [id, {
      id,
      name: product.name || product.title || product.product_name || id,
      thumbnailUrl: product.main_image_url || product.thumbnail_url || product.thumbnailUrl || product.image_url || null,
      orderIds: new Set(),
      quantity: 0,
    }];
  }));

  orders.forEach((order, orderIndex) => {
    const orderKey = String(order?.id || order?.order_id || `order:${orderIndex}`);
    const orderProducts = new Map((Array.isArray(order?.products) ? order.products : [])
      .map((product) => [String(product?.id || product?.product_id || ''), product]));
    for (const sku of Array.isArray(order?.skus) ? order.skus : []) {
      const productId = String(sku?.product_id || '').trim();
      const skuCreator = String(sku?.creator_username || order?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
      if (!selectedIds.has(productId) || (creatorUsername && skuCreator !== creatorUsername)) continue;

      const product = orderProducts.get(productId) || {};
      const row = rowsById.get(productId);
      row.name = sku?.product_name || product?.title || product?.name || product?.product_name || row.name;
      row.thumbnailUrl = product?.main_image_url || product?.thumbnail_url || product?.thumbnailUrl || product?.image_url || row.thumbnailUrl;
      row.orderIds.add(orderKey);
      row.quantity += Math.max(0, finiteNumber(sku?.quantity));
    }
  });

  return [...rowsById.values()]
    .map(({ orderIds, ...product }) => ({ ...product, orderCount: orderIds.size }))
    .sort((left, right) => right.orderCount - left.orderCount || right.quantity - left.quantity || left.name.localeCompare(right.name));
};
const latestBookingVideoSnapshot = (video) => [...(video?.performance_snapshots || [])]
  .sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || null;
const bookingVideosByRevenue = (videos = []) => videos
  .map((video, index) => ({ video, index, revenue: finiteNumber(latestBookingVideoSnapshot(video)?.gross_gmv) }))
  .sort((left, right) => right.revenue - left.revenue || left.index - right.index)
  .map(({ video }) => video);
const BOOKING_VIDEO_ICON_PATHS = {
  views: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  likes: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6a5.5 5.5 0 0 0 1-8.8Z'],
  comments: ['M21 12a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 21l1.4-3.5A8 8 0 1 1 21 12Z'],
  shares: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M8.6 10.5l6.8-4', 'M8.6 13.5l6.8 4'],
};
const BookingVideoIcon = ({ name }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {BOOKING_VIDEO_ICON_PATHS[name].map((path) => <path key={path} d={path} />)}
  </svg>
);
const bookingVideoSocialMetrics = (snapshot) => {
  const rawVideo = snapshot?.raw_metrics?.video || snapshot?.raw_metrics || {};
  const listVideo = rawVideo?.list || rawVideo;
  const traffic = rawVideo?.detail?.performance?.intervals?.[0]?.traffic || {};
  return {
    views: snapshot?.views ?? listVideo?.views ?? traffic.views,
    likes: traffic.likes ?? listVideo?.likes ?? rawVideo?.likes,
    comments: traffic.comments ?? listVideo?.comments ?? rawVideo?.comments,
    shares: traffic.shares ?? listVideo?.shares ?? rawVideo?.shares,
  };
};
const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const optionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const editableCurrencyAmount = (value, currency) => {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return String(currency === 'VND' ? Math.round(amount) : Math.round(amount * 100) / 100);
};

const TargetKocAvatar = ({ src, name }) => <AppAvatar src={src} name={name || 'KOC'} />;

const SortIcon = ({ active, direction }) => {
  if (!active) {
    return (
      <span className="table-sort-icon table-sort-icon--idle" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7 15 5 5 5-5" />
          <path d="m7 9 5-5 5 5" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`table-sort-icon table-sort-icon--active table-sort-icon--${direction}`} aria-hidden="true">
      {direction === 'asc' ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m18 15-6-6-6 6" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      )}
    </span>
  );
};

const BookingStaffSelect = ({ users, value, onChange, placeholder, loading, loadingLabel, allLabel, showAll = false }) => {
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = users.find((user) => String(user.id) === String(value)) || null;
  const isAll = showAll && value === 'all';
  const showTriggerAvatar = !isAll && Boolean(selected);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const selectableUsers = users.filter((user) => user.is_active !== false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredUsers = normalizedQuery
    ? selectableUsers.filter((user) =>
      [user.name, user.email].filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase().includes(normalizedQuery)))
    : selectableUsers;

  const toggle = () => setOpen((current) => !current);

  return (
    <div className="booking-koc-combobox booking-staff-select" ref={rootRef}>
      <button className={`booking-staff-select__trigger${!showTriggerAvatar ? ' booking-staff-select__trigger--no-avatar' : ''}`} type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={menuId} disabled={loading} onClick={toggle}>
        {showTriggerAvatar ? <TargetKocAvatar src={selected?.avatar_url} name={selected?.name || 'U'} /> : null}
        <span className="booking-staff-select__meta"><strong>{isAll ? allLabel : selected?.name || (loading ? loadingLabel : placeholder)}</strong>{selected?.email ? <small>{selected.email}</small> : null}</span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="booking-koc-combobox__menu booking-staff-select__menu" id={menuId} role="listbox">
          <label className="booking-staff-select__search">
            <span className="sr-only">Tìm nhân viên</span>
            <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc email…" />
          </label>
          {showAll ? <button className={`booking-koc-combobox__option booking-staff-select__option--all${isAll ? ' booking-koc-combobox__option--active' : ''}`} type="button" role="option" aria-selected={isAll} onClick={() => { onChange('all'); setOpen(false); }}>
            <span className="booking-staff-select__option-meta"><strong>{allLabel}</strong></span>
            {isAll ? <span className="booking-staff-select__check" aria-hidden="true">✓</span> : null}
          </button> : null}
          {filteredUsers.length ? filteredUsers.map((user) => (
            <button className={`booking-koc-combobox__option${String(user.id) === String(value) ? ' booking-koc-combobox__option--active' : ''}`} type="button" role="option" aria-selected={String(user.id) === String(value)} key={user.id} onClick={() => { onChange(String(user.id)); setOpen(false); }}>
              <TargetKocAvatar src={user.avatar_url} name={user.name} />
              <span className="booking-staff-select__option-meta"><strong>{user.name}</strong><small>{user.email || '—'}</small></span>
              {String(user.id) === String(value) ? <span className="booking-staff-select__check" aria-hidden="true">✓</span> : null}
            </button>
          )) : <div className="booking-koc-combobox__empty">Không có nhân viên phù hợp.</div>}
        </div>
      ) : null}
    </div>
  );
};

const productsOfBookingVideo = (video, snapshot) => {
  const raw = snapshot?.raw_metrics || {};
  const rawVideo = raw?.video || raw;
  const listVideo = rawVideo?.list || rawVideo;
  const breakdowns = rawVideo?.detail?.performance?.intervals?.[0]?.sales?.breakdowns || [];
  const sourceProducts = [
    ...(Array.isArray(video?.affiliate_products) ? video.affiliate_products : []),
    ...(Array.isArray(raw.products) ? raw.products : []),
    ...(Array.isArray(listVideo.products) ? listVideo.products : []),
    ...(Array.isArray(breakdowns) ? breakdowns : []),
  ];
  const byId = new Map();
  for (const product of sourceProducts) {
    const id = String(product?.id || product?.product_id || '').trim();
    if (!id) continue;
    const existing = byId.get(id) || {};
    byId.set(id, {
      id,
      name: product?.name || product?.title || product?.product_name || existing.name || null,
      thumbnailUrl: product?.main_image_url || product?.thumbnail_url || product?.thumbnailUrl || product?.image_url || existing.thumbnailUrl || null,
    });
  }
  const ids = [raw.product_id, rawVideo.product_id, listVideo.product_id]
    .flatMap((value) => String(value || '').split(','))
    .map((id) => id.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!byId.has(id)) byId.set(id, { id, name: null, thumbnailUrl: null });
  }
  return [...byId.values()];
};

const productCtrOfBookingVideo = (snapshot) => {
  const raw = snapshot?.raw_metrics || {};
  const rawVideo = raw?.video || raw;
  const listVideo = rawVideo?.list || rawVideo;
  const sales = rawVideo?.detail?.performance?.intervals?.[0]?.sales || {};
  const ratioOf = (source) => {
    const impressions = optionalNumber(source?.product_impressions);
    const clicks = optionalNumber(source?.product_clicks);
    return impressions !== null && impressions > 0 ? (clicks || 0) / impressions : null;
  };
  const overallRatio = ratioOf(sales.overall) ?? ratioOf(raw);
  if (overallRatio !== null) return overallRatio;
  const productRows = Array.isArray(sales.breakdowns) && sales.breakdowns.length
    ? sales.breakdowns
    : Array.isArray(listVideo.products) ? listVideo.products : [];
  const totals = productRows.reduce((result, product) => {
    const impressions = optionalNumber(product?.product_impressions);
    if (impressions === null) return result;
    result.impressions += impressions;
    result.clicks += optionalNumber(product?.product_clicks) || 0;
    return result;
  }, { clicks: 0, impressions: 0 });
  return totals.impressions > 0 ? totals.clicks / totals.impressions : null;
};

const BookingVideoProduct = ({ product }) => {
  const tooltipId = useId();
  const itemRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  useEffect(() => setFailed(false), [product.thumbnailUrl]);
  const showTooltip = () => {
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
  return (
    <span
      className="booking-video-expansion__product"
      ref={itemRef}
      tabIndex={0}
      aria-label={product.name || product.id}
      aria-describedby={tooltip ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltip(null)}
      onFocus={showTooltip}
      onBlur={() => setTooltip(null)}
    >
      {product.thumbnailUrl && !failed
        ? <img src={product.thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span className="booking-video-expansion__product-placeholder" aria-hidden="true">P</span>}
      {tooltip ? createPortal(
        <span
          className={`booking-video-expansion__product-tooltip${tooltip.showAbove ? ' booking-video-expansion__product-tooltip--above' : ''}`}
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
        >
          {product.name || product.id}
        </span>,
        document.body,
      ) : null}
    </span>
  );
};

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

const BookingProductOrderExpansion = ({ booking, orders, t, formatNumber }) => {
  const products = useMemo(
    () => bookingProductOrderBreakdown(booking, orders),
    [booking, orders],
  );
  return (
    <div className="booking-product-order-expansion">
      <div className="booking-product-order-expansion__heading">
        <strong>{t('booking.productOrderBreakdown')}</strong>
      </div>
      {products.length ? <div className="booking-product-order-expansion__list">
        {products.map((product) => <article className="booking-product-order-expansion__item" key={product.id}>
          <BookingDetailProduct product={product} />
          <div className="booking-product-order-expansion__metrics">
            <strong>{t('booking.ordersCount', { count: formatNumber(product.orderCount) })}</strong>
          </div>
        </article>)}
      </div> : <div className="empty-state empty-state--compact">{t('booking.noAttachedProducts')}</div>}
    </div>
  );
};

const BookingVideoProducts = ({ shopId, video, snapshot, label }) => {
  const sourceProducts = useMemo(() => productsOfBookingVideo(video, snapshot), [snapshot, video]);
  const [products, setProducts] = useState(sourceProducts);

  useEffect(() => {
    setProducts(sourceProducts);
    if (!shopId || !sourceProducts.length) return undefined;
    const missing = sourceProducts.filter((product) => !product.name || !product.thumbnailUrl);
    if (!missing.length) return undefined;
    let active = true;
    Promise.all(missing.map(async (product) => {
      try {
        const payload = await cachedBookingResource(`video-product:${shopId}:${product.id}`, () => (
          fetchTikTokSellerOpenCollaborations(shopId, { pageSize: 20, keyword: product.id })
        ));
        const row = (payload?.open_collaborations || []).find((item) => String(item?.product?.id) === product.id);
        return row?.product ? {
          id: product.id,
          name: row.product.title || product.name,
          thumbnailUrl: row.product.main_image_url || product.thumbnailUrl,
        } : product;
      } catch {
        return product;
      }
    })).then((loaded) => {
      if (active) setProducts(loaded);
    });
    return () => { active = false; };
  }, [shopId, sourceProducts]);

  return (
    <div className="booking-video-expansion__products-card">
      <span className="booking-video-expansion__products-label">{label}</span>
      <span className="booking-video-expansion__products">
        {products.length ? products.map((product) => <BookingVideoProduct product={product} key={product.id} />) : '—'}
      </span>
    </div>
  );
};

const TargetKocCombobox = ({
  creators, value, onChange, onSearch, onLoadMore, hasMore, loading,
  placeholder, noResults, performanceSourceLabel, collaborationLabel, loadMoreLabel, loadingLabel,
}) => {
  const rootRef = useRef(null);
  const selectedCreator = useMemo(
    () => creators.find((creator) => targetKocKey(creator) === value) || null,
    [creators, value],
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selectedName = selectedCreator?.nickname || selectedCreator?.username || '';

  useEffect(() => setQuery(selectedName), [selectedName]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
        setQuery(selectedName);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open, selectedName]);

  const openSearch = () => {
    setQuery('');
    onSearch('');
    setOpen(true);
  };

  return (
    <div className="booking-koc-combobox" ref={rootRef}>
      <div className={`booking-koc-combobox__control${selectedCreator && !open ? ' booking-koc-combobox__control--selected' : ''}`}>
        {selectedCreator && !open ? (
          <span className="booking-koc-combobox__selected-avatar" aria-hidden="true">
            <TargetKocAvatar src={selectedCreator.avatar_url} name={selectedName} />
          </span>
        ) : null}
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="booking-koc-options"
          value={query}
          placeholder={placeholder}
          required
          onFocus={openSearch}
          onChange={(event) => {
            setQuery(event.target.value);
            onSearch(event.target.value);
            onChange('');
            setOpen(true);
          }}
        />
        <button type="button" aria-label={placeholder} aria-expanded={open} onClick={() => {
          if (open) {
            setOpen(false);
            setQuery(selectedName);
          } else {
            openSearch();
          }
        }}>
          <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="booking-koc-combobox__menu" id="booking-koc-options" role="listbox">
          {creators.length ? creators.map((creator) => (
            <button
              className={`booking-koc-combobox__option${targetKocKey(creator) === value ? ' booking-koc-combobox__option--active' : ''}`}
              type="button"
              role="option"
              aria-selected={targetKocKey(creator) === value}
              key={targetKocKey(creator)}
              onClick={() => { onChange(targetKocKey(creator)); setQuery(creator.nickname || creator.username || ''); setOpen(false); }}
            >
              <TargetKocAvatar src={creator.avatar_url} name={creator.nickname || creator.username} />
              <span>
                <strong>{creator.nickname || creator.username}</strong>
                <small>{creator.shop_name ? `${creator.shop_name} · ` : ''}@{creator.username} · {creator.collaboration_count ? `${creator.collaboration_count} ${collaborationLabel}` : performanceSourceLabel}</small>
              </span>
            </button>
          )) : loading ? null : <div className="booking-koc-combobox__empty">{noResults}</div>}
          {loading ? <div className="booking-koc-combobox__empty"><span className="loading-dot" />{loadingLabel}</div> : null}
          {!loading && hasMore ? <button className="booking-koc-combobox__load-more" type="button" onClick={onLoadMore}>{loadMoreLabel}</button> : null}
        </div>
      ) : null}
    </div>
  );
};

const BookingMonthCard = ({
  booking,
  isSelected,
  selectedCurrency,
  currencyLabel,
  convertAmount,
  editableCurrencyAmount,
  formatMoney,
  formatNumber,
  formatRatio,
  formatDate,
  updatingId,
  deletingId,
  onSave,
  onDelete,
  allShopProducts,
  productsLoading,
  t,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [startDate, setStartDate] = useState(booking.start_date ? String(booking.start_date).slice(0, 10) : '');
  const [endDate, setEndDate] = useState(booking.end_date ? String(booking.end_date).slice(0, 10) : (booking.deadline ? String(booking.deadline).slice(0, 10) : ''));
  const rawCost = booking.total_cost ?? booking.booking_cost;
  const [cost, setCost] = useState(editableCurrencyAmount(convertAmount(rawCost, booking.currency) ?? rawCost, selectedCurrency));
  const [committedVideos, setCommittedVideos] = useState(booking.committed_videos || 1);
  const [productIds, setProductIds] = useState(bookingProductsOf(booking).map((p) => String(p.id || p.product_id)));
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productPickerTriggerRef = useRef(null);
  const productPickerMenuRef = useRef(null);

  useEffect(() => {
    if (!productPickerOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (productPickerTriggerRef.current?.contains(event.target)
        || productPickerMenuRef.current?.contains(event.target)) return;
      setProductPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [productPickerOpen]);

  useEffect(() => {
    setStartDate(booking.start_date ? String(booking.start_date).slice(0, 10) : '');
    setEndDate(booking.end_date ? String(booking.end_date).slice(0, 10) : (booking.deadline ? String(booking.deadline).slice(0, 10) : ''));
    const rCost = booking.total_cost ?? booking.booking_cost;
    setCost(editableCurrencyAmount(convertAmount(rCost, booking.currency) ?? rCost, selectedCurrency));
    setCommittedVideos(booking.committed_videos || 1);
    setProductIds(bookingProductsOf(booking).map((p) => String(p.id || p.product_id)));
  }, [booking, convertAmount, editableCurrencyAmount, selectedCurrency]);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    await onSave(booking.id, {
      total_cost: Number(cost),
      committed_videos: Math.max(1, Number.parseInt(committedVideos, 10) || 1),
      start_date: startDate || null,
      end_date: endDate || null,
      deadline: endDate || null,
      currency: selectedCurrency,
      product_ids: productIds,
      products: (allShopProducts || []).filter((p) => productIds.includes(p.id)),
    });
  };

  const cardVideos = bookingVideosOf(booking);
  const videoCount = cardVideos.length || Number(booking.actual_performance?.video_count || 0);
  const targetVideos = booking.committed_videos || 1;
  const actualGmv = Number(booking.actual_performance?.gross_gmv || booking.actual_performance?.affiliate_gmv || 0);
  const performanceCurrency = booking.actual_performance?.currency || booking.currency;
  const numCost = Number(booking.total_cost ?? booking.booking_cost ?? 0);
  const convertedCost = convertAmount(numCost, booking.currency);
  const convertedGmv = convertAmount(actualGmv, performanceCurrency);
  const ratio = (convertedGmv > 0 && convertedCost !== null) ? (convertedCost / convertedGmv) : null;
  const itemsSold = booking.actual_performance?.items_sold;

  const selectedProductsList = useMemo(() => {
    const shopProductsById = new Map((allShopProducts || []).map((p) => [String(p.id), p]));
    const bookingProductsById = new Map(bookingProductsOf(booking).map((p) => [String(p.id || p.product_id), p]));
    return productIds.map((id) => {
      const sp = shopProductsById.get(String(id));
      const bp = bookingProductsById.get(String(id));
      return {
        id: String(id),
        name: sp?.name || bp?.name || bp?.title || bp?.product_name || id,
        imageUrl: sp?.imageUrl || bp?.imageUrl || bp?.thumbnailUrl || bp?.image_url || bp?.main_image_url || bp?.thumbnail_url || null,
      };
    });
  }, [allShopProducts, booking, productIds]);

  return (
    <article className={`booking-month-card${isSelected ? ' booking-month-card--active' : ''}`}>
      <div className="booking-month-card__header">
        <div className="booking-month-card__header-left">
          <span className="booking-month-card__date-range">
            {formatDate(booking.start_date)} → {formatDate(booking.end_date || booking.deadline)}
          </span>
        </div>
        <div className="booking-month-card__header-badges">
          {videoCount >= targetVideos ? (
            <span className="booking-month-card__badge booking-month-card__badge--success">
              {videoCount}/{targetVideos}
            </span>
          ) : videoCount === 0 ? (
            <span className="booking-month-card__badge booking-month-card__badge--pending">
              0/{targetVideos}
            </span>
          ) : (
            <span className="booking-month-card__badge booking-month-card__badge--info">
              {videoCount}/{targetVideos}
            </span>
          )}
          <button
            className="booking-month-card__edit"
            type="button"
            aria-pressed={isEditing}
            aria-label={t(isEditing ? 'booking.bookingCardCollapse' : 'booking.bookingCardEdit')}
            title={t(isEditing ? 'booking.bookingCardCollapse' : 'booking.bookingCardEdit')}
            onClick={() => setIsEditing((current) => !current)}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            className="booking-month-card__edit booking-month-card__delete"
            type="button"
            disabled={deletingId === booking.id}
            aria-label={t(deletingId === booking.id ? 'booking.deleting' : 'booking.delete')}
            title={t(deletingId === booking.id ? 'booking.deleting' : 'booking.delete')}
            onClick={() => onDelete(booking)}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="booking-month-card__body">
        <div className="booking-month-card__metrics">
          <div className="booking-month-card__metric-item">
            <span>{t('booking.cost')}</span>
            <strong>{formatMoney(numCost, booking.currency)}</strong>
          </div>
          <div className="booking-month-card__metric-item">
            <span>GMV</span>
            <strong>{actualGmv > 0 ? formatMoney(actualGmv, performanceCurrency) : '—'}</strong>
          </div>
          <div className="booking-month-card__metric-item">
            <span>{t('booking.costRevenueRatio')}</span>
            <strong>{formatRatio(ratio)}</strong>
          </div>
          <div className="booking-month-card__metric-item">
            <span>{t('booking.videoItemsSold')}</span>
            <strong>{itemsSold !== undefined && itemsSold !== null ? formatNumber(itemsSold) : '—'}</strong>
          </div>
        </div>

        <div className="booking-month-card__products-section">
          <div className="booking-month-card__products-header">
            <span className="booking-month-card__products-label">
              {t('booking.products')} {selectedProductsList.length ? `(${selectedProductsList.length})` : ''}
            </span>
            {isEditing ? (
              <button
                ref={productPickerTriggerRef}
                className="booking-month-card__add-product-btn"
                type="button"
                aria-expanded={productPickerOpen}
                disabled={productsLoading}
                onClick={() => setProductPickerOpen((prev) => !prev)}
              >
                <Plus size={14} aria-hidden="true" />
                <span>{t('booking.addProduct')}</span>
              </button>
            ) : null}
          </div>

          {isEditing && productPickerOpen ? (
            <div ref={productPickerMenuRef} className="booking-product-picker__menu booking-detail-product-picker__menu" role="listbox">
              {allShopProducts.length ? (
                allShopProducts.map((product) => (
                  <label className="booking-product-picker__option" key={product.id}>
                    <input
                      type="checkbox"
                      checked={productIds.includes(product.id)}
                      onChange={() => setProductIds((current) => (
                        current.includes(product.id)
                          ? current.filter((id) => id !== product.id)
                          : [...current, product.id]
                      ))}
                    />
                    <span>
                      {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span className="booking-product-picker__placeholder">P</span>}
                      <span>
                        <strong>{product.name}</strong>
                        <small>{product.id}</small>
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <div className="booking-product-picker__empty">{t('booking.noProducts')}</div>
              )}
            </div>
          ) : null}

          {selectedProductsList.length ? (
            <div className="booking-detail-products">
              {selectedProductsList.map((product) => (
                <BookingDetailProduct
                  key={product.id}
                  product={product}
                  onRemove={isEditing ? (idToRemove) => {
                    setProductIds((curr) => curr.filter((id) => String(id) !== String(idToRemove)));
                  } : null}
                />
              ))}
            </div>
          ) : (
            isEditing && !productPickerOpen ? (
              <p className="booking-month-card__products-empty">{t('booking.noAttachedProducts')}</p>
            ) : null
          )}
        </div>

        {isEditing ? (
          <form className="booking-month-card__form" onSubmit={handleFormSubmit}>
            <div className="field booking-modal-date-range">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`start-date-${booking.id}`}>{t('booking.startDate')}</label>
                  <DatePickerInput
                    id={`start-date-${booking.id}`}
                    label={t('booking.startDate')}
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(val) => setStartDate(val)}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`end-date-${booking.id}`}>{t('booking.endDate')}</label>
                  <DatePickerInput
                    id={`end-date-${booking.id}`}
                    label={t('booking.endDate')}
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(val) => setEndDate(val)}
                  />
                </div>
              </div>
            </div>

            <div className="field booking-modal-cost-videos">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`cost-${booking.id}`}>{t('booking.totalCost')} ({currencyLabel})</label>
                  <input
                    id={`cost-${booking.id}`}
                    type="number"
                    min="0"
                    step={selectedCurrency === 'VND' ? '1' : '0.01'}
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    required
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`committed-${booking.id}`}>{t('booking.committedVideos')}</label>
                  <input
                    id={`committed-${booking.id}`}
                    type="number"
                    min="1"
                    step="1"
                    value={committedVideos}
                    onChange={(e) => setCommittedVideos(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="booking-month-card__actions">
              <button
                className="button button--small"
                type="submit"
                disabled={updatingId === booking.id}
              >
                {updatingId === booking.id ? t('common.loading') : t('booking.saveChanges')}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </article>
  );
};

const BookingManagement = ({
  heroTitle,
  embeddedMode = null,
  embeddedBookingId = null,
  initialStaffId = '',
  onEmbeddedClose,
  onEmbeddedChanged,
}) => {
  const { t, language } = useI18n();
  const session = useSession();
  const canManageUsers = hasPermission(session, 'users');
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [targetKocs, setTargetKocs] = useState([]);
  const [targetKocQuery, setTargetKocQuery] = useState('');
  const performanceWindow = DEFAULT_PERFORMANCE_WINDOW;
  const [selectedMonth, setSelectedMonth] = useState('all');
  const monthOptions = useMemo(() => generateBookingMonthOptions(), []);
  const [bookingTab, setBookingTab] = useState(() => (
    bookingUiSession().bookingTab === 'product' ? 'product' : 'video'
  ));
  const [productOrdersByShop, setProductOrdersByShop] = useState({});
  const productOrdersCacheRef = useRef(null);
  if (productOrdersCacheRef.current === null) productOrdersCacheRef.current = productOrdersCacheSession();
  const [productOrdersLoading, setProductOrdersLoading] = useState(false);
  const [productOrdersError, setProductOrdersError] = useState('');
  const [selectedManagerKey, setSelectedManagerKey] = useState(() => (
    bookingUiSession().selectedManagerKey || (canManageUsers ? 'all' : '')
  ));
  const [expandedGroupKeys, setExpandedGroupKeys] = useState(() => new Set());
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [targetKocPage, setTargetKocPage] = useState(1);
  const [targetKocPagination, setTargetKocPagination] = useState({ page: 1, total_pages: 1 });
  const [targetKocsLoading, setTargetKocsLoading] = useState(false);
  const [selectedKocDetail, setSelectedKocDetail] = useState(null);
  const [isCreateBookingOpen, setIsCreateBookingOpen] = useState(embeddedMode === 'create');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const createProductPickerTriggerRef = useRef(null);
  const createProductPickerMenuRef = useRef(null);
  const [channelProducts, setChannelProducts] = useState([]);
  const [channelProductsLoading, setChannelProductsLoading] = useState(false);
  const [form, setForm] = useState(() => ({ ...initialForm, staff_id: initialStaffId ? String(initialStaffId) : '' }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [matchingVideoId, setMatchingVideoId] = useState(null);
  const [videoMatchDialog, setVideoMatchDialog] = useState(null);
  const [expandedBookingId, setExpandedBookingId] = useState(() => bookingUiSession().expandedBookingId ?? null);
  const [manualVideoUrl, setManualVideoUrl] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [creatorDeleteConfirmOpen, setCreatorDeleteConfirmOpen] = useState(false);
  const [bookingDeleteConfirm, setBookingDeleteConfirm] = useState(null);
  const [detailProducts, setDetailProducts] = useState([]);
  const [detailProductsLoading, setDetailProductsLoading] = useState(false);
  const [creatorBookings, setCreatorBookings] = useState([]);
  const [, setCreatorBookingsLoading] = useState(false);
  const [error, setError] = useState('');
  const closeCreateBooking = useCallback(() => {
    setIsCreateBookingOpen(false);
    if (embeddedMode === 'create') onEmbeddedClose?.();
  }, [embeddedMode, onEmbeddedClose]);
  const closeBookingDetail = useCallback(() => {
    setCreatorDeleteConfirmOpen(false);
    setBookingDeleteConfirm(null);
    setSelectedBooking(null);
    if (embeddedMode === 'detail') onEmbeddedClose?.();
  }, [embeddedMode, onEmbeddedClose]);
  useEffect(() => {
    if (!productPickerOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (createProductPickerTriggerRef.current?.contains(event.target)
        || createProductPickerMenuRef.current?.contains(event.target)) return;
      setProductPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [productPickerOpen]);
  const openCreateBookingFromDrawer = () => {
    if (!selectedBooking) return;
    const creator = {
      shop_id: selectedBooking.target_shop_id,
      shop_name: selectedBooking.target_shop?.name,
      creator_open_id: selectedBooking.creator_open_id,
      username: selectedBooking.creator_username,
      nickname: selectedBooking.creator_name,
      avatar_url: selectedBooking.creator_avatar_url,
    };
    const creatorKey = targetKocKey(creator);
    setTargetKocs((current) => current.some((item) => targetKocKey(item) === creatorKey)
      ? current
      : [creator, ...current]);
    setTargetKocQuery('');
    setTargetKocPage(1);
    setSelectedKocDetail(null);
    setProductPickerOpen(false);
    setForm({
      ...defaultBookingForm(),
      creator_key: creatorKey,
      staff_id: selectedBooking.staff_id
        ? String(selectedBooking.staff_id)
        : canManageUsers ? '' : String(session?.user?.id || ''),
    });
    setIsCreateBookingOpen(true);
  };
  const toggleBookingRow = (event, bookingId) => {
    if (event.target.closest('button, a, input, select, textarea, label')) return;
    setExpandedBookingId((current) => String(current) === String(bookingId) ? null : bookingId);
  };
  const toggleGroup = useCallback((groupKey) => {
    setExpandedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);
  const [overviewSort, setOverviewSort] = useState({ key: 'ratio', direction: 'desc' });
  const [bookingSort, setBookingSort] = useState({ key: 'revenue', direction: 'desc' });

  const handleOverviewSort = (key) => {
    setOverviewSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const handleBookingSort = (key) => {
    setBookingSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { key, direction: 'desc' };
    });
  };

  useEffect(() => {
    try {
      window.sessionStorage.setItem(BOOKING_UI_SESSION_KEY, JSON.stringify({
        bookingTab,
        selectedManagerKey,
        expandedBookingId,
      }));
    } catch {
      // The page still works when session storage is unavailable.
    }
  }, [bookingTab, expandedBookingId, selectedManagerKey]);


  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const formatNumber = (value, options) => finiteNumber(value).toLocaleString(locale, options);
  const { formatMoney, currency: selectedCurrency, convertAmount } = useMoneyFormatter(locale);
  const costInputCurrencyRef = useRef(selectedCurrency);
  const currencyLabel = selectedCurrency === 'VND' ? 'VNĐ' : 'RM';
  const latestCompleteDate = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return dateInputValue(yesterday);
  }, []);
  const earliestCustomStart = customRange.end
    ? shiftDateInputValue(customRange.end, -179)
    : undefined;
  const latestCustomEnd = customRange.start
    ? [latestCompleteDate, shiftDateInputValue(customRange.start, 179)].sort()[0]
    : latestCompleteDate;
  const formatDate = (value) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
    : '—';
  const formatRate = (value) => {
    const rate = optionalNumber(value);
    if (rate === null) return '—';
    return `${formatNumber(rate <= 1 ? rate * 100 : rate, { maximumFractionDigits: 2 })}%`;
  };
  const formatRatio = (value) => {
    const ratio = optionalNumber(value);
    return ratio === null ? '—' : `${formatNumber(ratio * 100, { maximumFractionDigits: 2 })}%`;
  };
  useEffect(() => {
    const previousCurrency = costInputCurrencyRef.current;
    if (previousCurrency === selectedCurrency) return;
    setForm((current) => {
      if (current.total_cost === '') return current;
      const converted = convertAmount(current.total_cost, previousCurrency);
      return { ...current, total_cost: editableCurrencyAmount(converted, selectedCurrency) };
    });
    costInputCurrencyRef.current = selectedCurrency;
  }, [convertAmount, selectedCurrency]);

  useEffect(() => {
    if (!isCreateBookingOpen) {
      setProductPickerOpen(false);
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !saving) closeCreateBooking();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeCreateBooking, isCreateBookingOpen, saving]);

  useEffect(() => {
    if (!selectedBooking) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [selectedBooking]);

  useEffect(() => {
    if (!selectedBooking?.target_shop_id) {
      setDetailProducts([]);
      setDetailProductsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const selectedProducts = bookingProductsOf(selectedBooking);
    setDetailProductsLoading(true);
    fetchTikTokSellerOpenCollaborations(selectedBooking.target_shop_id, {
      signal: controller.signal,
      pageSize: 100,
    }).then((payload) => {
      const byId = new Map();
      for (const product of [
        ...(payload?.open_collaborations || []).map((item) => item.product),
        ...selectedProducts,
      ]) {
        const id = String(product?.id || product?.product_id || '').trim();
        if (!id) continue;
        byId.set(id, {
          id,
          name: product?.title || product?.name || product?.product_name || id,
          imageUrl: product?.main_image_url || product?.imageUrl || product?.image_url || product?.thumbnail_url || '',
        });
      }
      if (!controller.signal.aborted) setDetailProducts([...byId.values()]);
    }).catch((err) => {
      if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad'));
    }).finally(() => {
      if (!controller.signal.aborted) setDetailProductsLoading(false);
    });
    return () => controller.abort();
  }, [selectedBooking, t]);

  useEffect(() => {
    if (!selectedBooking) {
      setCreatorBookings([]);
      return undefined;
    }
    const localMatches = bookings.filter((b) => (
      (selectedBooking.creator_open_id && b.creator_open_id === selectedBooking.creator_open_id)
      || (selectedBooking.creator_username && String(b.creator_username || '').toLowerCase() === String(selectedBooking.creator_username || '').toLowerCase())
    ));
    if (!localMatches.some((b) => b.id === selectedBooking.id)) {
      localMatches.push(selectedBooking);
    }
    localMatches.sort((a, b) => new Date(b.start_date || b.deadline || b.created_at || 0) - new Date(a.start_date || a.deadline || a.created_at || 0));
    setCreatorBookings(localMatches);

    const controller = new AbortController();
    setCreatorBookingsLoading(true);
    fetchBookings(controller.signal, {
      creatorUsername: selectedBooking.creator_username,
      creatorOpenId: selectedBooking.creator_open_id,
      month: 'all',
      windowType: performanceWindow,
    })
      .then((items) => {
        if (!controller.signal.aborted && Array.isArray(items) && items.length) {
          items.sort((a, b) => new Date(b.start_date || b.deadline || b.created_at || 0) - new Date(a.start_date || a.deadline || a.created_at || 0));
          setCreatorBookings(items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setCreatorBookingsLoading(false);
      });

    return () => controller.abort();
  }, [bookings, convertAmount, performanceWindow, selectedBooking, selectedCurrency]);

  useEffect(() => {
    if (!canManageUsers) {
      const currentUser = session?.user;
      setUsers(currentUser?.id ? [currentUser] : []);
      setUsersLoading(false);
      setForm((current) => ({ ...current, staff_id: currentUser?.id ? String(currentUser.id) : '' }));
      return undefined;
    }

    const controller = new AbortController();
    setUsersLoading(true);
    fetchUsers(controller.signal)
      .then((rows) => setUsers(Array.isArray(rows) ? rows : []))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
      .finally(() => { if (!controller.signal.aborted) setUsersLoading(false); });
    return () => controller.abort();
  }, [canManageUsers, session, t]);

  useEffect(() => {
    if (performanceWindow === 'CUSTOM' && (!customRange.start || !customRange.end || customRange.start > customRange.end)) {
      setLoading(false);
      setError(t('booking.invalidCustomRange'));
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchBookings(controller.signal, {
      windowType: performanceWindow,
      ...(performanceWindow === 'CUSTOM' ? { startDate: customRange.start, endDate: customRange.end } : {}),
      month: selectedMonth,
    })
      .then((loadedBookings) => setBookings(loadedBookings))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [customRange.end, customRange.start, performanceWindow, selectedMonth, t]);

  useEffect(() => {
    if (loading) return;
    const action = searchParams.get('action');
    const requestedBookingId = searchParams.get('booking');
    const requestedStaffId = searchParams.get('staff');
    if (action === 'create') setIsCreateBookingOpen(true);
    if (requestedStaffId && canManageUsers) {
      const groupKey = `id:${requestedStaffId}`;
      setSelectedManagerKey(groupKey);
      setExpandedGroupKeys(new Set([groupKey]));
    }
    if (requestedBookingId) {
      const booking = bookings.find((item) => String(item.id) === requestedBookingId);
      if (booking) {
        setSelectedBooking(booking);
        const staffId = booking.staff_id ? String(booking.staff_id) : '';
        const staffName = String(booking.staff_name || booking.staff?.name || '').trim();
        const groupKey = staffId ? `id:${staffId}` : staffName ? `name:${staffName.toLocaleLowerCase()}` : 'unassigned';
        setSelectedManagerKey(canManageUsers ? groupKey : '');
        setExpandedGroupKeys(new Set([groupKey]));
        setExpandedBookingId(booking.id);
      }
    }
    if (action || requestedBookingId || requestedStaffId) {
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      next.delete('booking');
      next.delete('staff');
      setSearchParams(next, { replace: true });
    }
  }, [bookings, canManageUsers, loading, searchParams, setSearchParams]);

  useEffect(() => {
    if (embeddedMode !== 'detail' || !embeddedBookingId || loading) return;
    const booking = bookings.find((item) => String(item.id) === String(embeddedBookingId));
    if (booking) setSelectedBooking(booking);
  }, [bookings, embeddedBookingId, embeddedMode, loading]);

  useEffect(() => {
    const controller = new AbortController();
    setTargetKocsLoading(true);
    const timeout = window.setTimeout(() => {
      fetchBookingTargetKocs({
        keyword: targetKocQuery.trim(),
        page: targetKocPage,
        pageSize: 20,
        signal: controller.signal,
      })
        .then((payload) => {
          const items = payload.items || [];
          setTargetKocs((current) => targetKocPage === 1
            ? items
            : [...current, ...items.filter((item) => (
              !current.some((existing) => targetKocKey(existing) === targetKocKey(item))
            ))]);
          setTargetKocPagination(payload.pagination || { page: targetKocPage, total_pages: targetKocPage });
        })
        .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
        .finally(() => { if (!controller.signal.aborted) setTargetKocsLoading(false); });
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [targetKocPage, targetKocQuery, t]);

  const selectedKocSummary = useMemo(
    () => targetKocs.find((creator) => targetKocKey(creator) === form.creator_key) || null,
    [form.creator_key, targetKocs],
  );
  const selectedKoc = selectedKocDetail?.key === form.creator_key ? selectedKocDetail.creator : null;
  const channelShopId = selectedKocSummary?.shop_id || targetKocs[0]?.shop_id || '';
  const bookingProducts = useMemo(() => {
    const byId = new Map();
    channelProducts.forEach((product) => {
      const id = String(product?.id || product?.product_id || '').trim();
      if (!id) return;
      byId.set(id, {
        id,
        name: product.title || product.name || product.product_name || id,
        imageUrl: product.main_image_url || product.image_url || product.thumbnail_url || '',
      });
    });
    return [...byId.values()];
  }, [channelProducts]);

  useEffect(() => {
    if (!isCreateBookingOpen || !channelShopId) {
      setChannelProducts([]);
      setChannelProductsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setChannelProductsLoading(true);
    fetchTikTokSellerOpenCollaborations(channelShopId, { signal: controller.signal, pageSize: 100 })
      .then((payload) => {
        const products = (payload?.open_collaborations || [])
          .map((item) => item.product)
          .filter((product) => product?.id);
        if (!controller.signal.aborted) setChannelProducts(products);
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
      .finally(() => { if (!controller.signal.aborted) setChannelProductsLoading(false); });
    return () => controller.abort();
  }, [channelShopId, isCreateBookingOpen, t]);

  useEffect(() => {
    setProductPickerOpen(false);
    setForm((current) => ({
      ...current,
      product_ids: current.product_ids.filter((id) => bookingProducts.some((product) => product.id === id)),
    }));
  }, [bookingProducts]);

  const toggleBookingProduct = (productId) => {
    setForm((current) => ({
      ...current,
      product_ids: current.product_ids.includes(productId)
        ? current.product_ids.filter((id) => id !== productId)
        : [...current.product_ids, productId],
    }));
  };

  useEffect(() => {
    if (!selectedKocSummary || !form.creator_key) {
      setSelectedKocDetail(null);
      return undefined;
    }
    const controller = new AbortController();
    setSelectedKocDetail(null);
    fetchBookingTargetKocDetail({
      shopId: selectedKocSummary.shop_id,
      creatorOpenId: selectedKocSummary.creator_open_id,
      username: selectedKocSummary.username,
      signal: controller.signal,
    })
      .then((creator) => {
        setSelectedKocDetail({ key: form.creator_key, creator });
        if (creator?.collaboration?.start_at || creator?.collaboration?.end_at) {
          setForm((current) => ({
            ...current,
            start_date: creator.collaboration?.start_at ? creator.collaboration.start_at.slice(0, 10) : current.start_date,
            end_date: creator.collaboration?.end_at ? creator.collaboration.end_at.slice(0, 10) : current.end_date,
          }));
        }
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); });
    return () => controller.abort();
  }, [form.creator_key, selectedKocSummary, t]);
  useEffect(() => {
    const shopIds = [...new Set(bookings
      .filter((booking) => bookingProductsOf(booking).length)
      .map((booking) => String(booking.target_shop_id || ''))
      .filter(Boolean))].sort();
    if (!shopIds.length) {
      setProductOrdersByShop({});
      setProductOrdersError('');
      setProductOrdersLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const range = orderRangeForWindow(performanceWindow, customRange);
    const cacheKey = `${range.startTime}:${range.endTime}:${shopIds.join(',')}`;
    const cached = productOrdersCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < PRODUCT_ORDERS_CACHE_TTL_MS) {
      setProductOrdersByShop(cached.ordersByShop);
      setProductOrdersError('');
      setProductOrdersLoading(false);
      return undefined;
    }
    setProductOrdersLoading(true);
    setProductOrdersError('');
    Promise.all(shopIds.map(async (shopId) => {
      const orders = [];
      let pageToken = '';
      for (let page = 0; page < 100; page += 1) {
        const payload = await fetchTikTokSellerAffiliateOrders(shopId, {
          signal: controller.signal,
          pageSize: 100,
          pageToken,
          startTime: range.startTime,
          endTime: range.endTime,
        });
        orders.push(...(payload?.orders || payload?.affiliate_orders || []));
        const nextPageToken = String(payload?.next_page_token || '');
        if (!nextPageToken || nextPageToken === pageToken) break;
        pageToken = nextPageToken;
      }
      return [shopId, orders];
    })).then((entries) => {
      if (!controller.signal.aborted) {
        const ordersByShop = Object.fromEntries(entries);
        productOrdersCacheRef.current.set(cacheKey, { ordersByShop, fetchedAt: Date.now() });
        persistProductOrdersCache(productOrdersCacheRef.current);
        setProductOrdersByShop(ordersByShop);
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') setProductOrdersError(err.message || t('booking.productOrdersError'));
    }).finally(() => {
      if (!controller.signal.aborted) setProductOrdersLoading(false);
    });
    return () => controller.abort();
  }, [bookings, customRange, performanceWindow, t]);
  const productPerformanceByBooking = useMemo(() => new Map(bookings.map((booking) => [
    String(booking.id),
    bookingProductOrderPerformance(booking, productOrdersByShop[String(booking.target_shop_id)] || []),
  ])), [bookings, productOrdersByShop]);
  const stats = useMemo(() => bookings.reduce((result, booking) => {
    const rawCost = finiteNumber(booking.total_cost ?? booking.booking_cost);
    const convertedCost = convertAmount(rawCost, booking.currency);
    const tabPerformance = bookingTab === 'product'
      ? productPerformanceByBooking.get(String(booking.id))
      : booking.actual_performance;
    const rawRevenue = finiteNumber(bookingTab === 'product' ? tabPerformance?.affiliate_gmv : tabPerformance?.gross_gmv);
    const convertedRevenue = convertAmount(rawRevenue, tabPerformance?.currency);
    result.total += 1;
    result.totalCost += convertedCost ?? rawCost;
    result.totalRevenue += convertedRevenue ?? rawRevenue;
    result.committedVideos += Number(booking.committed_videos || 1);
    result.videoCount += bookingTab === 'product'
      ? finiteNumber(tabPerformance?.affiliate_orders)
      : bookingVideosOf(booking).length || Number(booking.actual_performance?.video_count || 0);
    return result;
  }, { total: 0, totalCost: 0, totalRevenue: 0, videoCount: 0, committedVideos: 0 }), [bookingTab, bookings, convertAmount, productPerformanceByBooking]);
  const creatorBookingStats = useMemo(() => creatorBookings.reduce((result, booking) => {
    const rawCost = finiteNumber(booking.total_cost ?? booking.booking_cost);
    const convertedCost = convertAmount(rawCost, booking.currency);
    const performance = booking.actual_performance || {};
    const rawGmv = finiteNumber(performance.gross_gmv || performance.affiliate_gmv);
    const convertedGmv = convertAmount(rawGmv, performance.currency || booking.currency);
    result.totalCost += convertedCost ?? rawCost;
    result.totalGmv += convertedGmv ?? rawGmv;
    result.itemsSold += finiteNumber(performance.items_sold);
    return result;
  }, { totalCost: 0, totalGmv: 0, itemsSold: 0 }), [creatorBookings, convertAmount]);
  const bookingGroups = useMemo(() => {
    const usersById = new Map(users.map((user) => [String(user.id), user]));
    const groups = new Map();
    const visibleBookings = canManageUsers
      ? bookings
      : bookings.filter((booking) => String(booking.staff_id || '') === String(session?.user?.id || ''));
    for (const booking of visibleBookings) {
      const staffId = booking.staff_id ? String(booking.staff_id) : '';
      const staffName = String(booking.staff_name || booking.staff?.name || '').trim();
      const key = staffId ? `id:${staffId}` : staffName ? `name:${staffName.toLocaleLowerCase()}` : 'unassigned';
      if (!groups.has(key)) {
        const user = usersById.get(staffId) || booking.staff || null;
        groups.set(key, {
          key,
          manager: {
            name: user?.name || staffName || t('booking.unassigned'),
            email: user?.email || null,
            avatar_url: user?.avatar_url || null,
          },
          bookings: [],
          totalCost: 0,
          totalRevenue: 0,
          videoCount: 0,
          committedVideos: 0,
        });
      }
      const group = groups.get(key);
      const rawCost = finiteNumber(booking.total_cost ?? booking.booking_cost);
      const convertedCost = convertAmount(rawCost, booking.currency) ?? rawCost;
      const tabPerformance = bookingTab === 'product'
        ? productPerformanceByBooking.get(String(booking.id))
        : booking.actual_performance;
      const rawRevenue = finiteNumber(bookingTab === 'product' ? tabPerformance?.affiliate_gmv : tabPerformance?.gross_gmv);
      const convertedRevenue = convertAmount(rawRevenue, tabPerformance?.currency) ?? rawRevenue;
      group.bookings.push(booking);
      group.totalCost += convertedCost;
      group.totalRevenue += convertedRevenue;
      group.committedVideos += Number(booking.committed_videos || 1);
      group.videoCount += bookingTab === 'product'
        ? finiteNumber(tabPerformance?.affiliate_orders)
        : bookingVideosOf(booking).length || Number(booking.actual_performance?.video_count || 0);
    }
    for (const group of groups.values()) {
      group.bookings.sort((left, right) => {
        const performanceOfBooking = (booking) => bookingTab === 'product'
          ? productPerformanceByBooking.get(String(booking.id))
          : booking.actual_performance;
        const revenueOfBooking = (booking) => {
          const performance = performanceOfBooking(booking);
          const revenue = finiteNumber(bookingTab === 'product' ? performance?.affiliate_gmv : performance?.gross_gmv);
          return convertAmount(revenue, performance?.currency) ?? revenue;
        };
        return revenueOfBooking(right) - revenueOfBooking(left)
          || Number(right.id || 0) - Number(left.id || 0);
      });
    }
    return [...groups.values()].sort((left, right) => {
      if (left.key === 'unassigned') return 1;
      if (right.key === 'unassigned') return -1;
      return left.manager.name.localeCompare(right.manager.name, locale);
    });
  }, [bookingTab, bookings, canManageUsers, convertAmount, locale, productPerformanceByBooking, session, t, users]);
  const activeBookingGroup = bookingGroups.find((group) => group.key === selectedManagerKey)
    || bookingGroups[0]
    || null;
  const showAllBookingGroups = canManageUsers && selectedManagerKey === 'all';
  const bookingGroupsToRender = useMemo(() => (
    showAllBookingGroups ? bookingGroups : activeBookingGroup ? [activeBookingGroup] : []
  ), [activeBookingGroup, bookingGroups, showAllBookingGroups]);
  const bookingManagerFilterValue = showAllBookingGroups ? 'all' : activeBookingGroup?.key || '';

  const sortedBookingGroupsToRender = useMemo(() => {
    const list = [...bookingGroupsToRender];
    if (!overviewSort.key) return list;
    const { key, direction } = overviewSort;
    const factor = direction === 'desc' ? -1 : 1;

    return list.sort((a, b) => {
      if (key === 'staff') {
        return factor * a.manager.name.localeCompare(b.manager.name, locale);
      }
      let valA = 0;
      let valB = 0;
      if (key === 'koc') {
        valA = a.bookings.length;
        valB = b.bookings.length;
      } else if (key === 'videos') {
        valA = a.videoCount;
        valB = b.videoCount;
      } else if (key === 'cost') {
        valA = a.totalCost;
        valB = b.totalCost;
      } else if (key === 'revenue') {
        valA = a.totalRevenue;
        valB = b.totalRevenue;
      } else if (key === 'ratio') {
        valA = a.totalRevenue > 0 ? a.totalCost / a.totalRevenue : 0;
        valB = b.totalRevenue > 0 ? b.totalCost / b.totalRevenue : 0;
      }
      if (valA !== valB) {
        return factor * (valA > valB ? 1 : -1);
      }
      return a.manager.name.localeCompare(b.manager.name, locale);
    });
  }, [bookingGroupsToRender, locale, overviewSort]);

  const sortedBookingsOfGroup = useCallback((bookingsList) => {
    const list = [...bookingsList];
    const { key, direction } = bookingSort;
    const factor = direction === 'desc' ? -1 : 1;

    const performanceOf = (booking) => (
      bookingTab === 'product'
        ? productPerformanceByBooking.get(String(booking.id))
        : booking.actual_performance
    );
    const revenueOf = (booking) => {
      const perf = performanceOf(booking);
      const raw = finiteNumber(bookingTab === 'product' ? perf?.affiliate_gmv : perf?.gross_gmv);
      return convertAmount(raw, perf?.currency) ?? raw;
    };
    const costOf = (booking) => {
      const raw = finiteNumber(booking.total_cost ?? booking.booking_cost);
      return convertAmount(raw, booking.currency) ?? raw;
    };
    const videoCountOf = (booking) => {
      if (bookingTab === 'product') {
        return finiteNumber(performanceOf(booking)?.affiliate_orders);
      }
      return bookingVideosOf(booking).length || Number(booking.actual_performance?.video_count || 0);
    };

    return list.sort((a, b) => {
      if (key === 'koc') {
        const nameA = String(a.creator_name || a.creator_username || '').trim();
        const nameB = String(b.creator_name || b.creator_username || '').trim();
        return factor * nameA.localeCompare(nameB, locale);
      }
      let valA = 0;
      let valB = 0;
      if (key === 'revenue') {
        valA = revenueOf(a);
        valB = revenueOf(b);
      } else if (key === 'cost') {
        valA = costOf(a);
        valB = costOf(b);
      } else if (key === 'videos') {
        valA = videoCountOf(a);
        valB = videoCountOf(b);
      } else if (key === 'ratio') {
        const revA = revenueOf(a);
        const revB = revenueOf(b);
        valA = revA > 0 ? costOf(a) / revA : 0;
        valB = revB > 0 ? costOf(b) / revB : 0;
      } else if (key === 'refunds') {
        valA = finiteNumber(performanceOf(a)?.refunded_gmv);
        valB = finiteNumber(performanceOf(b)?.refunded_gmv);
      } else if (key === 'items_sold') {
        valA = finiteNumber(performanceOf(a)?.items_sold);
        valB = finiteNumber(performanceOf(b)?.items_sold);
      } else if (key === 'samples') {
        valA = finiteNumber(performanceOf(a)?.samples_shipped);
        valB = finiteNumber(performanceOf(b)?.samples_shipped);
      } else if (key === 'commission') {
        valA = finiteNumber(performanceOf(a)?.estimated_commission);
        valB = finiteNumber(performanceOf(b)?.estimated_commission);
      }
      if (valA !== valB) {
        return factor * (valA > valB ? 1 : -1);
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [bookingSort, bookingTab, convertAmount, locale, productPerformanceByBooking]);

  useEffect(() => {
    if (!canManageUsers && bookingGroups.length === 1) {
      setExpandedGroupKeys(new Set([bookingGroups[0].key]));
    }
  }, [canManageUsers, bookingGroups]);


  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedKoc) return;
    try {
      setSaving(true);
      setError('');
      const created = await createBooking({
        staff_id: Number(canManageUsers ? form.staff_id : session?.user?.id),
        target_shop_id: selectedKoc.shop_id,
        target_collaboration_id: selectedKoc.collaboration_id || null,
        creator_open_id: selectedKoc.creator_open_id,
        creator_username: selectedKoc.username,
        total_cost: Number(form.total_cost),
        currency: selectedCurrency,
        committed_videos: Math.max(1, Number.parseInt(form.committed_videos, 10) || 1),
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        deadline: form.end_date || undefined,
        product_ids: form.product_ids,
        products: bookingProducts.filter((product) => form.product_ids.includes(product.id)),
      });
      setBookings((items) => [created, ...items]);
      if (selectedBooking && (
        (selectedBooking.creator_open_id && selectedBooking.creator_open_id === created.creator_open_id)
        || String(selectedBooking.creator_username || '').toLocaleLowerCase() === String(created.creator_username || '').toLocaleLowerCase()
      )) {
        setCreatorBookings((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      }
      fetchBookings(undefined, {
        windowType: performanceWindow,
        ...(performanceWindow === 'CUSTOM' ? {
          startDate: customRange.start,
          endDate: customRange.end,
        } : {}),
        month: selectedMonth,
      }).then(setBookings).catch(() => {});
      setForm({ ...initialForm, staff_id: canManageUsers ? '' : String(session?.user?.id || '') });
      onEmbeddedChanged?.(created);
      closeCreateBooking();
    } catch (err) {
      setError(err.message || t('booking.errorCreate'));
    } finally {
      setSaving(false);
    }
  };

  const replaceBooking = (updated) => {
    setBookings((items) => items.map((item) => item.id === updated.id
      ? {
        ...updated,
        ...(Object.prototype.hasOwnProperty.call(item, 'reference_performance')
          ? { reference_performance: item.reference_performance }
          : {}),
      }
      : item));
    setCreatorBookings((items) => items.map((item) => item.id === updated.id
      ? {
        ...updated,
        ...(Object.prototype.hasOwnProperty.call(item, 'reference_performance')
          ? { reference_performance: item.reference_performance }
          : {}),
      }
      : item));
    setSelectedBooking((current) => current?.id === updated.id
      ? {
        ...updated,
        ...(Object.prototype.hasOwnProperty.call(current, 'reference_performance')
          ? { reference_performance: current.reference_performance }
          : {}),
      }
      : current);
  };

  const handleSaveCard = async (bookingId, payload) => {
    try {
      setUpdatingId(bookingId);
      setError('');
      const updated = await updateBooking(bookingId, payload);
      replaceBooking(updated);
      onEmbeddedChanged?.(updated);
    } catch (err) {
      setError(err.message || t('booking.errorUpdate'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteCard = async (booking) => {
    try {
      setDeletingId(booking.id);
      setError('');
      await deleteBooking(booking.id);
      setBookings((items) => items.filter((item) => item.id !== booking.id));
      setCreatorBookings((items) => items.filter((item) => item.id !== booking.id));
      if (selectedBooking?.id === booking.id) {
        const remaining = creatorBookings.filter((item) => item.id !== booking.id);
        if (remaining.length) {
          setSelectedBooking(remaining[0]);
        } else {
          closeBookingDetail();
        }
      }
    } catch (err) {
      setError(err.message || t('booking.errorDelete'));
    } finally {
      setDeletingId(null);
      setBookingDeleteConfirm(null);
    }
  };

  const handleDeleteCreatorBookings = async () => {
    if (!creatorBookings.length || !selectedBooking) return;
    const bookingsToDelete = [...creatorBookings];
    try {
      setDeletingId('creator');
      setError('');
      const results = await Promise.allSettled(bookingsToDelete.map(async (booking) => {
        await deleteBooking(booking.id);
        return booking.id;
      }));
      const deletedIds = new Set(results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value));
      setBookings((items) => items.filter((item) => !deletedIds.has(item.id)));
      const remaining = bookingsToDelete.filter((booking) => !deletedIds.has(booking.id));
      setCreatorBookings(remaining);
      if (remaining.length) {
        setSelectedBooking(remaining[0]);
        setError(t('booking.errorDelete'));
      } else {
        closeBookingDetail();
      }
    } catch (err) {
      setError(err.message || t('booking.errorDelete'));
    } finally {
      setDeletingId(null);
      setCreatorDeleteConfirmOpen(false);
    }
  };

  const findBookingVideo = async (booking, videoId, videoUrl) => {
    try {
      setMatchingVideoId(booking.id);
      setError('');
      const result = await matchBookingVideo(booking.id, { videoId, videoUrl });
      if (result.status === 'matched') {
        replaceBooking(result.booking);
        setVideoMatchDialog(null);
        return;
      }
      if (result.status === 'needs_confirmation') {
        setVideoMatchDialog({ booking, candidates: result.candidates || [], range: result.range });
        setManualVideoUrl('');
        return;
      }
      if (booking.video_platform_id) {
        setError(t('booking.videoRefreshNone'));
      } else {
        setVideoMatchDialog({ booking, candidates: [], range: result.range });
        setManualVideoUrl('');
      }
    } catch (err) {
      setError(err.message || t('booking.videoMatchError'));
    } finally {
      setMatchingVideoId(null);
    }
  };

  const renderPerformance = (performance) => {
    if (!performance) return <span className="chip">{t('booking.noPerformance')}</span>;
    if (performance.source === 'AFFILIATE_ORDERS' && !performance.has_products) {
      return <span className="chip">{t('booking.noAttachedProducts')}</span>;
    }
    const gmv = optionalNumber(performance.affiliate_gmv ?? performance.gross_gmv);
    const secondaryValue = performance.source === 'AFFILIATE_ORDERS'
      ? null
      : optionalNumber(performance.video_views ?? performance.views);
    return (
      <div className="booking-performance-cell">
        <strong>{gmv === null ? '—' : formatMoney(gmv, performance.currency)}</strong>
        {performance.source !== 'AFFILIATE_ORDERS'
          ? <small>{secondaryValue === null ? '—' : formatNumber(secondaryValue)} {t('booking.views')}</small>
          : null}
      </div>
    );
  };

  const creatorMetric = (performance, field, { money = false } = {}) => {
    const value = optionalNumber(performance?.[field]);
    if (value === null) return '—';
    return money ? formatMoney(value, performance.currency) : formatNumber(value);
  };

  return (
    <div className={`page${embeddedMode ? ' booking-management--embedded' : ''}`}>
      <section className="page__hero booking-page-hero">
        <div><h1 className="page__title">{t('booking.heroTitle') || heroTitle}</h1></div>
        <div className="page__stats booking-stats booking-stats--evaluation">
          <article className="stat-card"><p className="stat-card__label">{t('booking.evaluations')}</p><p className="stat-card__value">{stats.total}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t(bookingTab === 'product' ? 'booking.affiliateOrders' : 'booking.matchedVideo')}</p><p className="stat-card__value">{formatNumber(stats.videoCount)}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.totalCost')}</p><p className="stat-card__value">{formatMoney(stats.totalCost, selectedCurrency)}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.totalRevenue')}</p><p className="stat-card__value">{formatMoney(stats.totalRevenue, selectedCurrency)}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.costRevenueRatio')}</p><p className="stat-card__value">{formatRatio(stats.totalRevenue > 0 ? stats.totalCost / stats.totalRevenue : null)}</p></article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}

      <section className="booking-create-action">
        <div className="booking-view-tabs" role="tablist" aria-label={t('booking.viewTabs')}>
          <button className={`booking-view-tabs__tab${bookingTab === 'video' ? ' booking-view-tabs__tab--active' : ''}`} type="button" role="tab" aria-selected={bookingTab === 'video'} aria-controls="booking-list-panel" onClick={() => setBookingTab('video')}>{t('booking.videoTab')}</button>
          <button className={`booking-view-tabs__tab${bookingTab === 'product' ? ' booking-view-tabs__tab--active' : ''}`} type="button" role="tab" aria-selected={bookingTab === 'product'} aria-controls="booking-list-panel" onClick={() => setBookingTab('product')}>{t('booking.productTab')}</button>
        </div>
        <button className="button" type="button" onClick={() => setIsCreateBookingOpen(true)}>＋ {t('booking.addBooking')}</button>
      </section>

      {isCreateBookingOpen ? createPortal(
        <div className="booking-create-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeCreateBooking(); }}>
          <section className="booking-create-modal" role="dialog" aria-modal="true" aria-labelledby="booking-create-modal-title">
            <header className="booking-create-modal__header"><div><h2 id="booking-create-modal-title">{t('booking.createEvaluation')}</h2></div><button className="button button--ghost" type="button" aria-label={t('common.close')} disabled={saving} onClick={closeCreateBooking}>×</button></header>
            <form className="filter-panel booking-evaluation-form" onSubmit={handleSubmit}>
              <div className="field"><label>{t('booking.targetCreator')}</label><TargetKocCombobox creators={targetKocs} value={form.creator_key} onChange={(value) => setForm((current) => ({ ...current, creator_key: value }))} onSearch={(keyword) => { setTargetKocQuery(keyword); setTargetKocPage(1); }} onLoadMore={() => setTargetKocPage((current) => current + 1)} hasMore={targetKocPagination.page < targetKocPagination.total_pages} loading={targetKocsLoading} placeholder={t('booking.searchKoc')} noResults={t('booking.noSyncedCollaboration')} performanceSourceLabel={t('booking.creatorPerformance')} collaborationLabel={t('booking.collaboration')} loadMoreLabel={t('booking.loadMoreKocs')} loadingLabel={t('booking.loadingKocs')} /></div>
              {canManageUsers ? <div className="field"><label>{t('booking.bookingStaff')}</label><BookingStaffSelect users={users} value={form.staff_id} onChange={(value) => setForm((current) => ({ ...current, staff_id: value }))} placeholder={t('booking.selectStaff')} loading={usersLoading} loadingLabel={t('booking.loading')} /></div> : null}
              <div className="field booking-product-picker-field">
                <label>{t('booking.products')}</label>
                <div className="booking-product-picker">
                  <button ref={createProductPickerTriggerRef} className="booking-product-picker__trigger" type="button" aria-expanded={productPickerOpen} onClick={() => setProductPickerOpen((current) => !current)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Plus size={14} aria-hidden="true" />
                      <span>{t('booking.addProduct')}</span>
                      {form.product_ids.length ? <span className="chip chip--compact">{form.product_ids.length}</span> : null}
                    </span>
                    <span className="sidebar__chevron" aria-hidden="true" />
                  </button>
                  {productPickerOpen ? (
                    <div ref={createProductPickerMenuRef} className="booking-product-picker__menu" role="listbox" aria-label={t('booking.products')}>
                      {channelProductsLoading ? (
                        <div className="booking-product-picker__empty"><span className="loading-dot" />{t('booking.loadingProducts')}</div>
                      ) : bookingProducts.length ? (
                        bookingProducts.map((product) => (
                          <label className="booking-product-picker__option" key={product.id}>
                            <input type="checkbox" checked={form.product_ids.includes(product.id)} onChange={() => toggleBookingProduct(product.id)} />
                            <span>
                              {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span className="booking-product-picker__placeholder">P</span>}
                              <span><strong>{product.name}</strong><small>{product.id}</small></span>
                            </span>
                          </label>
                        ))
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {form.product_ids.length ? (
                  <div style={{ marginTop: '8px' }}>
                    <div className="booking-detail-products">
                      {form.product_ids.map((id) => {
                        const p = bookingProducts.find((item) => String(item.id) === String(id)) || {};
                        return (
                          <BookingDetailProduct
                            key={id}
                            product={{
                              id,
                              name: p.name || id,
                              imageUrl: p.imageUrl || null,
                            }}
                            onRemove={() => toggleBookingProduct(id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="field booking-modal-date-range">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="booking-form-start-date">{t('booking.startDate')}</label>
                    <DatePickerInput
                      id="booking-form-start-date"
                      label={t('booking.startDate')}
                      value={form.start_date}
                      max={form.end_date || undefined}
                      onChange={(value) => setForm((current) => ({ ...current, start_date: value }))}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="booking-form-end-date">{t('booking.endDate')}</label>
                    <DatePickerInput
                      id="booking-form-end-date"
                      label={t('booking.endDate')}
                      value={form.end_date}
                      min={form.start_date || undefined}
                      onChange={(value) => setForm((current) => ({ ...current, end_date: value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="field booking-modal-cost-videos">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="total_cost">{t('booking.totalCost')} ({currencyLabel})</label>
                    <input
                      id="total_cost"
                      type="number"
                      min="0"
                      step={selectedCurrency === 'VND' ? '1' : '0.01'}
                      inputMode="decimal"
                      value={form.total_cost}
                      onChange={(event) => setForm((current) => ({ ...current, total_cost: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label htmlFor="committed_videos">{t('booking.committedVideos')}</label>
                    <input
                      id="committed_videos"
                      type="number"
                      min="1"
                      step="1"
                      value={form.committed_videos}
                      onChange={(event) => setForm((current) => ({ ...current, committed_videos: event.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>
              <footer className="booking-create-modal__footer"><button className="button button--ghost" type="button" disabled={saving} onClick={closeCreateBooking}>{t('common.cancel')}</button><button className="button" type="submit" disabled={saving || !selectedKoc || !form.staff_id || !form.start_date || !form.end_date}>{saving ? t('booking.submitting') : t('booking.evaluate')}</button></footer>
            </form>
          </section>
        </div>, document.body,
      ) : null}
      <section className="section-card" id="booking-list-panel" role="tabpanel">
        <div className="section-card__header booking-evaluation-list-header">
          <div className="booking-performance-controls">
            {bookingGroups.length ? (
              <div className="field booking-manager-filter">
                <label>{t('booking.bookingStaff')}</label>
                <BookingStaffSelect
                  users={bookingGroups.map((group) => ({ id: group.key, ...group.manager }))}
                  value={bookingManagerFilterValue}
                  onChange={(value) => {
                    setSelectedManagerKey(value);
                    setExpandedBookingId(null);
                    if (value !== 'all') {
                      setExpandedGroupKeys(new Set([value]));
                    } else {
                      setExpandedGroupKeys(new Set());
                    }
                  }}
                  placeholder={t('booking.selectStaff')}
                  allLabel={t('booking.allStaff')}
                  showAll={canManageUsers}
                  loading={false}
                  loadingLabel={t('booking.loading')}
                />
              </div>
            ) : null}
            <div className="field booking-month-filter">
              <label htmlFor="booking-month-select">{t('booking.bookingMonth')}</label>
              <select
                id="booking-month-select"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.labelKey ? t(opt.labelKey) : opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {productOrdersError && bookingTab === 'product' ? <p className="form-error" role="alert">{productOrdersError}</p> : null}
        {loading || (bookingTab === 'product' && productOrdersLoading) ? (
          <div className="empty-state"><span className="loading-dot" />{t('booking.loading')}</div>
        ) : bookingGroupsToRender.length ? (
          <div className="table-wrap booking-staff-overview-wrap">
            <table className="data-table data-table--compact booking-staff-overview-table">
              <thead>
                <tr>
                  <th className="sortable-th">
                    <button type="button" className="table-sort-btn" onClick={() => handleOverviewSort('staff')}>
                      <span>{t('booking.bookingStaff')}</span>
                      <SortIcon active={overviewSort.key === 'staff'} direction={overviewSort.direction} />
                    </button>
                  </th>
                  <th className="cell-number sortable-th">
                    <button type="button" className="table-sort-btn" onClick={() => handleOverviewSort('koc')}>
                      <span>{t('booking.kocColumn')}</span>
                      <SortIcon active={overviewSort.key === 'koc'} direction={overviewSort.direction} />
                    </button>
                  </th>
                  <th className="cell-number sortable-th">
                    <button type="button" className="table-sort-btn" onClick={() => handleOverviewSort('videos')}>
                      <span>{t(bookingTab === 'product' ? 'booking.affiliateOrders' : 'booking.matchedVideo')}</span>
                      <SortIcon active={overviewSort.key === 'videos'} direction={overviewSort.direction} />
                    </button>
                  </th>
                  <th className="cell-number sortable-th">
                    <button type="button" className="table-sort-btn" onClick={() => handleOverviewSort('cost')}>
                      <span>{t('booking.totalCost')}</span>
                      <SortIcon active={overviewSort.key === 'cost'} direction={overviewSort.direction} />
                    </button>
                  </th>
                  <th className="cell-number sortable-th">
                    <button type="button" className="table-sort-btn" onClick={() => handleOverviewSort('revenue')}>
                      <span>{t('booking.totalRevenue')}</span>
                      <SortIcon active={overviewSort.key === 'revenue'} direction={overviewSort.direction} />
                    </button>
                  </th>
                  <th className="cell-number sortable-th">
                    <button type="button" className="table-sort-btn" onClick={() => handleOverviewSort('ratio')}>
                      <span>{t('booking.costRevenueRatio')}</span>
                      <SortIcon active={overviewSort.key === 'ratio'} direction={overviewSort.direction} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedBookingGroupsToRender.map((group) => {
                  const isExpanded = expandedGroupKeys.has(group.key);
                  return (
                    <React.Fragment key={group.key}>
                      <tr
                        className={isExpanded ? 'member-row member-row--expanded' : 'member-row'}
                        onClick={(event) => {
                          if (event.target.closest('button, a, input, select, textarea, label')) return;
                          toggleGroup(group.key);
                        }}
                      >
                        <td>
                          <button
                            className="member-row__trigger booking-staff-row__trigger"
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => toggleGroup(group.key)}
                          >
                            <TargetKocAvatar src={group.manager.avatar_url} name={group.manager.name} />
                            <span className="booking-staff-row__identity">
                              <strong>{group.manager.name}</strong>
                              {group.manager.email ? <small>{group.manager.email}</small> : null}
                            </span>
                          </button>
                        </td>
                        <td className="cell-number">{formatNumber(group.bookings.length)}</td>
                        <td className="cell-number">{bookingTab === 'product' ? formatNumber(group.videoCount) : `${formatNumber(group.videoCount)} / ${formatNumber(group.committedVideos || group.bookings.length)}`}</td>
                        <td className="cell-number">{formatMoney(group.totalCost, selectedCurrency)}</td>
                        <td className="cell-number">{formatMoney(group.totalRevenue, selectedCurrency)}</td>
                        <td className="cell-number">{formatRatio(group.totalRevenue > 0 ? group.totalCost / group.totalRevenue : null)}</td>
                      </tr>
                      {isExpanded ? (
                        <tr className="member-detail-row">
                          <td colSpan={6}>
                            <div className="booking-manager-expanded-detail">
                              <div className="table-wrap">
                                <table className="data-table booking-evaluation-table">
                                  <thead>
                                    <tr>
                                      <th className="booking-koc-column sortable-th">
                                        <button type="button" className="table-sort-btn" onClick={() => handleBookingSort('koc')}>
                                          <span>{t('booking.kocColumn')}</span>
                                          <SortIcon active={bookingSort.key === 'koc'} direction={bookingSort.direction} />
                                        </button>
                                      </th>
                                      <th className="booking-creator-performance-column sortable-th">
                                        <button type="button" className="table-sort-btn" onClick={() => handleBookingSort('revenue')}>
                                          <span>{t('booking.gmvColumn')}</span>
                                          <SortIcon active={bookingSort.key === 'revenue'} direction={bookingSort.direction} />
                                        </button>
                                      </th>
                                      <th className="cell-number booking-total-cost-column sortable-th">
                                        <button type="button" className="table-sort-btn" onClick={() => handleBookingSort('cost')}>
                                          <span>{t('booking.totalCost')}</span>
                                          <SortIcon active={bookingSort.key === 'cost'} direction={bookingSort.direction} />
                                        </button>
                                      </th>
                                      <th className="booking-video-column sortable-th">
                                        <button type="button" className="table-sort-btn" onClick={() => handleBookingSort('videos')}>
                                          <span>{t(bookingTab === 'product' ? 'booking.affiliateOrders' : 'booking.matchedVideo')}</span>
                                          <SortIcon active={bookingSort.key === 'videos'} direction={bookingSort.direction} />
                                        </button>
                                      </th>
                                      <th className="cell-number sortable-th">
                                        <button type="button" className="table-sort-btn" onClick={() => handleBookingSort('items_sold')}>
                                          <span>{t('booking.products')}</span>
                                          <SortIcon active={bookingSort.key === 'items_sold'} direction={bookingSort.direction} />
                                        </button>
                                      </th>
                                      <th className="cell-number booking-refunds-column sortable-th">
                                        <button type="button" className="table-sort-btn" onClick={() => handleBookingSort('refunds')}>
                                          <span>{t('booking.refunds')}</span>
                                          <SortIcon active={bookingSort.key === 'refunds'} direction={bookingSort.direction} />
                                        </button>
                                      </th>
                                      <th className="cell-number booking-samples-column sortable-th">
                                        <button type="button" className="table-sort-btn" onClick={() => handleBookingSort('samples')}>
                                          <span>{t('booking.samplesShipped')}</span>
                                          <SortIcon active={bookingSort.key === 'samples'} direction={bookingSort.direction} />
                                        </button>
                                      </th>
                                      <th className="cell-number sortable-th">
                                        <button type="button" className="table-sort-btn" onClick={() => handleBookingSort('commission')}>
                                          <span>{t('booking.estimatedCommission')}</span>
                                          <SortIcon active={bookingSort.key === 'commission'} direction={bookingSort.direction} />
                                        </button>
                                      </th>
                                      <th className="cell-actions">{t('booking.actionsColumn')}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sortedBookingsOfGroup(group.bookings).map((booking) => {
                                      const performance = bookingTab === 'product'
                                        ? productPerformanceByBooking.get(String(booking.id))
                                        : booking.actual_performance;
                                      const bookingVideos = bookingVideosByRevenue(bookingVideosOf(booking));
                                      const videoCount = bookingVideos.length || Number(booking.actual_performance?.video_count || 0);
                                      const expanded = String(expandedBookingId) === String(booking.id);
                                      return (
                                        <React.Fragment key={booking.id}>
                                          <tr className={expanded ? 'booking-row booking-row--expanded' : 'booking-row'} onClick={(event) => toggleBookingRow(event, booking.id)}>
                                            <td className="booking-koc-column"><div className="booking-koc-identity"><TargetKocAvatar src={booking.creator_avatar_url} name={booking.creator_name || booking.creator_username} /><span><strong>{booking.creator_name || booking.creator_username || 'KOC'}</strong><small>@{booking.creator_username}</small></span></div></td>
                                            <td className="booking-creator-performance-column">{renderPerformance(performance)}</td>
                                            <td className="cell-number booking-total-cost-column"><strong>{formatMoney(booking.total_cost ?? booking.booking_cost, booking.currency)}</strong></td>
                                            <td className="booking-video-column"><span className="booking-video-count"><strong>{bookingTab === 'product' ? t('booking.ordersCount', { count: performance?.affiliate_orders || 0 }) : t('booking.videoProgress', { current: videoCount, target: booking.committed_videos || 1 })}</strong></span></td>
                                            <td className="cell-number"><div className="booking-product-summary"><strong>{creatorMetric(performance, 'items_sold')} <span>{t('booking.itemsSold')}</span></strong><small>{creatorMetric(performance, 'items_refunded')} {t('booking.refundedShort')}</small></div></td>
                                            <td className="cell-number booking-refunds-column">{creatorMetric(performance, 'refunded_gmv', { money: true })}</td>
                                            <td className="cell-number booking-samples-column">{bookingTab === 'product' ? '—' : creatorMetric(performance, 'samples_shipped')}</td>
                                            <td className="cell-number">{creatorMetric(performance, 'estimated_commission', { money: true })}</td>
                                            <td className="cell-actions">
                                              <button
                                                className="booking-action-open"
                                                type="button"
                                                aria-label={t('booking.details')}
                                                title={t('booking.details')}
                                                onClick={() => setSelectedBooking(booking)}
                                              >
                                                <ChevronLeft size={18} aria-hidden="true" />
                                              </button>
                                            </td>
                                          </tr>
                                          {expanded ? (
                                            <tr className="booking-video-detail-row">
                                              <td colSpan={9}>
                                                {bookingTab === 'product' ? (
                                                  <BookingProductOrderExpansion booking={booking} orders={productOrdersByShop[String(booking.target_shop_id)] || []} t={t} formatNumber={formatNumber} />
                                                ) : (
                                                  <div className="booking-video-expansion">
                                                    {bookingVideos.length ? (
                                                      <div className="booking-video-expansion__list">
                                                        {bookingVideos.map((video, videoIndex) => {
                                                          const latest = latestBookingVideoSnapshot(video);
                                                          const social = bookingVideoSocialMetrics(latest);
                                                          return (
                                                            <article className="booking-video-expansion__item" key={video.id || video.platform_video_id}>
                                                              <div className="booking-video-expansion__identity">
                                                                <div className="booking-video-expansion__title">
                                                                  <BookingVideoThumbnail shopId={booking.target_shop_id} video={video} snapshot={latest} index={videoIndex} />
                                                                  <div>
                                                                    {video.video_url ? (
                                                                      <a href={video.video_url} target="_blank" rel="noreferrer">
                                                                        <strong>{video.title || video.platform_video_id}</strong>
                                                                        <span aria-hidden="true"> ↗</span>
                                                                      </a>
                                                                    ) : (
                                                                      <strong>{video.title || video.platform_video_id}</strong>
                                                                    )}
                                                                    <small>{t('booking.postedAt')} {formatDate(video.posted_at)}</small>
                                                                    <span className="booking-video-expansion__social">
                                                                      <span title={`${t('booking.videoViews')}: ${formatNumber(social.views)}`}><BookingVideoIcon name="views" />{formatNumber(social.views)}</span>
                                                                      <span title={`${t('videoLibrary.likes')}: ${formatNumber(social.likes)}`}><BookingVideoIcon name="likes" />{formatNumber(social.likes)}</span>
                                                                      <span title={`${t('videoLibrary.comments')}: ${formatNumber(social.comments)}`}><BookingVideoIcon name="comments" />{formatNumber(social.comments)}</span>
                                                                      <span title={`${t('videoLibrary.shares')}: ${formatNumber(social.shares)}`}><BookingVideoIcon name="shares" />{formatNumber(social.shares)}</span>
                                                                    </span>
                                                                  </div>
                                                                </div>
                                                              </div>
                                                              {latest ? (
                                                                <div className="booking-video-expansion__metrics">
                                                                  <div><span>{t('booking.videoGmv')}</span><strong>{formatMoney(latest.gross_gmv, latest.currency || booking.currency)}</strong></div>
                                                                  <div><span>{t('booking.videoItemsSold')}</span><strong>{formatNumber(latest.items_sold)}</strong></div>
                                                                  <div><span>{t('booking.videoCtr')}</span><strong>{formatRate(productCtrOfBookingVideo(latest))}</strong></div>
                                                                  <BookingVideoProducts shopId={booking.target_shop_id} video={video} snapshot={latest} label={t('booking.products')} />
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
                                        </React.Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">{t('booking.noEvaluations')}</div>
        )}
      </section>

      {videoMatchDialog ? (
        <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setVideoMatchDialog(null); }}>
          <aside className="koc-drawer booking-video-match-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-video-match-title">
            <div className="koc-drawer__header"><div><h2 id="booking-video-match-title">{t('booking.videoCandidatesTitle')}</h2></div><button className="button button--ghost" type="button" aria-label={t('common.close')} onClick={() => setVideoMatchDialog(null)}>×</button></div>
            <div className="koc-drawer__body">
              {videoMatchDialog.candidates.length ? <div className="booking-video-candidates">{videoMatchDialog.candidates.map((candidate) => <button className="booking-video-candidate" type="button" key={candidate.id} disabled={matchingVideoId === videoMatchDialog.booking.id} onClick={() => findBookingVideo(videoMatchDialog.booking, candidate.id)}><span><strong>{candidate.title || candidate.id}</strong><small>@{candidate.username} · {formatDate(candidate.posted_at)}</small></span><span><strong>{formatMoney(candidate.gmv?.amount, candidate.gmv?.currency)}</strong><small>{formatNumber(candidate.views)} {t('booking.views')} · {formatNumber(candidate.orders)} {t('booking.orders')}</small></span></button>)}</div> : <p className="section-card__meta">{t('booking.videoMatchNone')}</p>}
              <form className="booking-video-manual" onSubmit={(event) => { event.preventDefault(); findBookingVideo(videoMatchDialog.booking, null, manualVideoUrl); }}>
                <label className="field"><span>{t('booking.manualVideoUrl')}</span><input type="url" required value={manualVideoUrl} placeholder="https://www.tiktok.com/@username/video/..." onChange={(event) => setManualVideoUrl(event.target.value)} /></label>
                <button className="button" type="submit" disabled={matchingVideoId === videoMatchDialog.booking.id}>{matchingVideoId === videoMatchDialog.booking.id ? t('booking.linkingVideo') : t('booking.linkVideo')}</button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}

      {selectedBooking ? createPortal(
        <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeBookingDetail(); }}>
          <aside className="koc-drawer booking-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
            <div className="koc-drawer__header">
              <div className="booking-detail-drawer__heading"><TargetKocAvatar src={selectedBooking.creator_avatar_url} name={selectedBooking.creator_name} /><div><h2 id="booking-detail-title">{selectedBooking.creator_name || selectedBooking.creator_username}</h2><p>@{selectedBooking.creator_username} · {t('booking.allMonthsCount', { count: creatorBookings.length || 1 })}</p></div></div>
              <div className="booking-detail-drawer__header-actions">
                <button
                  className="button button--ghost booking-detail-drawer__delete"
                  type="button"
                  disabled={deletingId === 'creator' || !creatorBookings.length}
                  aria-label={t(deletingId === 'creator' ? 'booking.deleting' : 'booking.deleteCreatorBookings')}
                  title={t(deletingId === 'creator' ? 'booking.deleting' : 'booking.deleteCreatorBookings')}
                  onClick={() => setCreatorDeleteConfirmOpen(true)}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
                <button className="button button--ghost booking-detail-drawer__close" type="button" aria-label={t('common.close')} onClick={closeBookingDetail}>×</button>
              </div>
            </div>
            <div className="koc-drawer__body">
              <div className="booking-detail-summary">
                <article className="booking-detail-summary__card">
                  <span>{t('booking.totalCost')}</span>
                  <strong>{formatMoney(creatorBookingStats.totalCost, selectedCurrency)}</strong>
                </article>
                <article className="booking-detail-summary__card">
                  <span>{t('booking.totalGmv')}</span>
                  <strong>{formatMoney(creatorBookingStats.totalGmv, selectedCurrency)}</strong>
                </article>
                <article className="booking-detail-summary__card">
                  <span>{t('booking.totalCostRevenueRatio')}</span>
                  <strong>{formatRatio(creatorBookingStats.totalGmv > 0 ? creatorBookingStats.totalCost / creatorBookingStats.totalGmv : null)}</strong>
                </article>
                <article className="booking-detail-summary__card">
                  <span>{t('booking.totalItemsSold')}</span>
                  <strong>{formatNumber(creatorBookingStats.itemsSold)}</strong>
                </article>
              </div>
              <div className="booking-cards-list">
                {creatorBookings.map((b) => (
                  <BookingMonthCard
                    key={b.id}
                    booking={b}
                    isSelected={b.id === selectedBooking.id}
                    selectedCurrency={selectedCurrency}
                    currencyLabel={currencyLabel}
                    convertAmount={convertAmount}
                    editableCurrencyAmount={editableCurrencyAmount}
                    formatMoney={formatMoney}
                    formatNumber={formatNumber}
                    formatRatio={formatRatio}
                    formatDate={formatDate}
                    updatingId={updatingId}
                    deletingId={deletingId}
                    onSave={handleSaveCard}
                    onDelete={(booking) => setBookingDeleteConfirm(booking)}
                    allShopProducts={detailProducts}
                    productsLoading={detailProductsLoading}
                    t={t}
                  />
                ))}
                <button className="booking-cards-list__add" type="button" onClick={openCreateBookingFromDrawer} aria-label={t('booking.addBooking')}>
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
          </aside>
        </div>,
        document.body,
      ) : null}

      {creatorDeleteConfirmOpen && selectedBooking ? createPortal(
        <div
          className="booking-delete-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && deletingId !== 'creator') {
              setCreatorDeleteConfirmOpen(false);
            }
          }}
        >
          <div className="booking-delete-confirm" role="alertdialog" aria-modal="true" aria-describedby="booking-delete-confirm-message">
            <div className="booking-delete-confirm__content">
              <div className="booking-delete-confirm__icon" aria-hidden="true"><Trash2 size={22} /></div>
              <strong id="booking-delete-confirm-message">
                {t('booking.deleteCreatorBookingsConfirm', {
                  name: selectedBooking.creator_name || `@${selectedBooking.creator_username}`,
                  count: creatorBookings.length,
                })}
              </strong>
            </div>
            <div className="booking-delete-confirm__actions">
              <button className="button button--ghost" type="button" disabled={deletingId === 'creator'} onClick={() => setCreatorDeleteConfirmOpen(false)}>
                {t('common.cancel')}
              </button>
              <button className="button button--danger" type="button" disabled={deletingId === 'creator'} onClick={handleDeleteCreatorBookings}>
                {deletingId === 'creator' ? t('booking.deleting') : t('booking.delete')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {bookingDeleteConfirm ? createPortal(
        <div
          className="booking-delete-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && deletingId !== bookingDeleteConfirm.id) {
              setBookingDeleteConfirm(null);
            }
          }}
        >
          <div className="booking-delete-confirm" role="alertdialog" aria-modal="true" aria-describedby="booking-card-delete-confirm-message">
            <div className="booking-delete-confirm__content">
              <div className="booking-delete-confirm__icon" aria-hidden="true"><Trash2 size={22} /></div>
              <strong id="booking-card-delete-confirm-message">
                {t('booking.deleteConfirm', { id: bookingDeleteConfirm.id })}
              </strong>
            </div>
            <div className="booking-delete-confirm__actions">
              <button className="button button--ghost" type="button" disabled={deletingId === bookingDeleteConfirm.id} onClick={() => setBookingDeleteConfirm(null)}>
                {t('common.cancel')}
              </button>
              <button className="button button--danger" type="button" disabled={deletingId === bookingDeleteConfirm.id} onClick={() => handleDeleteCard(bookingDeleteConfirm)}>
                {deletingId === bookingDeleteConfirm.id ? t('booking.deleting') : t('booking.delete')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

export default BookingManagement;
