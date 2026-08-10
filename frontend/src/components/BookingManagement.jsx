import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createBooking,
  deleteBooking,
  fetchBookingTargetKocDetail,
  fetchBookingTargetKocs,
  fetchBookings,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokShopVideoThumbnail,
  fetchUsers,
  matchBookingVideo,
  updateBooking,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import { hasPermission } from '../lib/session';
import { useSession } from '../lib/useSession';
import AppAvatar from './AppAvatar';
import DatePickerInput from './DatePickerInput';

const initialForm = { creator_key: '', staff_id: '', total_cost: '' };
const DEFAULT_PERFORMANCE_WINDOW = 'PAST_30_DAYS';
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
const collaborationOf = (booking) => snapshotOf(booking).collaboration || {};
const performanceOf = (booking) => Object.prototype.hasOwnProperty.call(booking || {}, 'reference_performance')
  ? booking.reference_performance
  : snapshotOf(booking).performance || null;
const bookingVideosOf = (booking) => Array.isArray(booking?.booking_videos) ? booking.booking_videos : [];
const latestBookingVideoSnapshot = (video) => [...(video?.performance_snapshots || [])]
  .sort((left, right) => (
    String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0)
  ))[0] || null;
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

const BookingStaffSelect = ({ users, value, onChange, placeholder, loading, loadingLabel, allLabel, showAll = false }) => {
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = users.find((user) => String(user.id) === String(value)) || null;
  const isAll = showAll && value === 'all';

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
      <button className="booking-staff-select__trigger" type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={menuId} disabled={loading} onClick={toggle}>
        <TargetKocAvatar src={selected?.avatar_url} name={selected?.name || 'U'} />
        <span><strong>{isAll ? allLabel : selected?.name || (loading ? loadingLabel : placeholder)}</strong>{selected?.email ? <small>{selected.email}</small> : null}</span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="booking-koc-combobox__menu booking-staff-select__menu" id={menuId} role="listbox">
          <label className="booking-staff-select__search">
            <span className="sr-only">Tìm nhân viên</span>
            <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc email…" />
          </label>
          {showAll ? <button className={`booking-koc-combobox__option${isAll ? ' booking-koc-combobox__option--active' : ''}`} type="button" role="option" aria-selected={isAll} onClick={() => { onChange('all'); setOpen(false); }}>
            <TargetKocAvatar name="U" />
            <span><strong>{allLabel}</strong></span>
            {isAll ? <span className="booking-staff-select__check" aria-hidden="true">✓</span> : null}
          </button> : null}
          {filteredUsers.length ? filteredUsers.map((user) => (
            <button className={`booking-koc-combobox__option${String(user.id) === String(value) ? ' booking-koc-combobox__option--active' : ''}`} type="button" role="option" aria-selected={String(user.id) === String(value)} key={user.id} onClick={() => { onChange(String(user.id)); setOpen(false); }}>
              <TargetKocAvatar src={user.avatar_url} name={user.name} />
              <span><strong>{user.name}</strong><small>{user.email || '—'}</small></span>
              {String(user.id) === String(value) ? <span className="booking-staff-select__check" aria-hidden="true">✓</span> : null}
            </button>
          )) : <div className="booking-koc-combobox__empty">Không có nhân viên phù hợp.</div>}
        </div>
      ) : null}
    </div>
  );
};

const BookingVideoThumbnail = ({ shopId, video, snapshot, index }) => {
  const rawVideo = snapshot?.raw_metrics?.video || snapshot?.raw_metrics || {};
  const listVideo = rawVideo?.list || rawVideo;
  const directThumbnail = video?.thumbnail_url
    || listVideo?.thumbnail_url
    || listVideo?.cover_image_url
    || listVideo?.cover_url
    || rawVideo?.thumbnail_url
    || rawVideo?.cover_image_url
    || rawVideo?.cover_url
    || null;
  const [thumbnail, setThumbnail] = useState(directThumbnail);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setThumbnail(directThumbnail);
    setFailed(false);
    if (directThumbnail || !shopId || !video?.platform_video_id || !video?.creator_username) return undefined;
    const controller = new AbortController();
    fetchTikTokShopVideoThumbnail(shopId, video.platform_video_id, video.creator_username, controller.signal)
      .then((payload) => setThumbnail(payload?.thumbnail_url || null))
      .catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [directThumbnail, shopId, video?.creator_username, video?.platform_video_id]);

  const content = thumbnail && !failed
    ? <img src={thumbnail} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="booking-video-expansion__thumbnail-placeholder" aria-hidden="true">▶</span>;
  return (
    <span className="booking-video-expansion__thumbnail">
      {video?.video_url ? <a href={video.video_url} target="_blank" rel="noreferrer" tabIndex={-1}>{content}</a> : content}
      <span className="booking-video-expansion__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    </span>
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

const BookingDetailProduct = ({ product }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const source = product?.product || product || {};
  const name = source.title || source.name || source.product_name || source.id || source.product_id || '—';
  const id = source.id || source.product_id || null;
  const thumbnailUrl = source.main_image_url
    || source.thumbnail_url
    || source.thumbnailUrl
    || source.image_url
    || source.image?.url
    || source.images?.[0]?.url
    || null;
  useEffect(() => setImageFailed(false), [thumbnailUrl]);
  return (
    <div className="booking-detail-product">
      {thumbnailUrl && !imageFailed
        ? <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
        : <span className="booking-detail-product__placeholder" aria-hidden="true">P</span>}
      <span><strong title={name}>{name}</strong>{id && String(id) !== String(name) ? <small>{id}</small> : null}</span>
    </div>
  );
};

const BookingDetailProducts = ({ shopId, videos, label, formatNumber }) => {
  const sourceProducts = useMemo(() => {
    const byId = new Map();
    for (const video of videos) {
      const snapshot = latestBookingVideoSnapshot(video);
      for (const product of productsOfBookingVideo(video, snapshot)) {
        const existing = byId.get(product.id) || {};
        byId.set(product.id, {
          id: product.id,
          name: product.name || existing.name || null,
          thumbnailUrl: product.thumbnailUrl || existing.thumbnailUrl || null,
        });
      }
    }
    return [...byId.values()];
  }, [videos]);
  const [products, setProducts] = useState(sourceProducts);

  useEffect(() => {
    setProducts(sourceProducts);
    if (!shopId || !sourceProducts.length) return undefined;
    const missing = sourceProducts.filter((product) => !product.name || !product.thumbnailUrl);
    if (!missing.length) return undefined;
    const controller = new AbortController();
    Promise.all(missing.map(async (product) => {
      try {
        const payload = await fetchTikTokSellerOpenCollaborations(shopId, {
          signal: controller.signal,
          pageSize: 20,
          keyword: product.id,
        });
        const row = (payload?.open_collaborations || []).find((item) => String(item?.product?.id) === product.id);
        return row?.product ? {
          id: product.id,
          name: row.product.title || product.name,
          thumbnailUrl: row.product.main_image_url || product.thumbnailUrl,
        } : product;
      } catch {
        return product;
      }
    })).then((resolved) => {
      if (!controller.signal.aborted) setProducts(resolved);
    });
    return () => controller.abort();
  }, [shopId, sourceProducts]);

  return (
    <>
      <span>{label} ({formatNumber(products.length)})</span>
      {products.length
        ? <div className="booking-detail-products">{products.map((product) => <BookingDetailProduct product={product} key={product.id} />)}</div>
        : <strong>—</strong>}
    </>
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
    const controller = new AbortController();
    Promise.all(missing.map(async (product) => {
      try {
        const payload = await fetchTikTokSellerOpenCollaborations(shopId, {
          signal: controller.signal,
          pageSize: 20,
          keyword: product.id,
        });
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
      if (!controller.signal.aborted) setProducts(loaded);
    });
    return () => controller.abort();
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
                <small>@{creator.username} · {creator.collaboration_count ? `${creator.collaboration_count} ${collaborationLabel}` : performanceSourceLabel}</small>
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

const BookingManagement = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const session = useSession();
  const canManageUsers = hasPermission(session, 'users');
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [targetKocs, setTargetKocs] = useState([]);
  const [targetKocQuery, setTargetKocQuery] = useState('');
  const [performanceWindow, setPerformanceWindow] = useState(DEFAULT_PERFORMANCE_WINDOW);
  const [selectedManagerKey, setSelectedManagerKey] = useState('');
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const [targetKocPage, setTargetKocPage] = useState(1);
  const [targetKocPagination, setTargetKocPagination] = useState({ page: 1, total_pages: 1 });
  const [targetKocsLoading, setTargetKocsLoading] = useState(false);
  const [selectedKocDetail, setSelectedKocDetail] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [matchingVideoId, setMatchingVideoId] = useState(null);
  const [videoMatchDialog, setVideoMatchDialog] = useState(null);
  const [expandedBookingId, setExpandedBookingId] = useState(null);
  const [manualVideoUrl, setManualVideoUrl] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [detailCost, setDetailCost] = useState('');
  const [error, setError] = useState('');
  const [openActions, setOpenActions] = useState({
    id: null,
    direction: 'down',
    top: 0,
    bottom: 0,
    right: 0,
  });
  const toggleBookingRow = (event, bookingId) => {
    if (event.target.closest('button, a, input, select, textarea, label')) return;
    setExpandedBookingId((current) => String(current) === String(bookingId) ? null : bookingId);
  };

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
  const formatCollaborationStatus = (value) => value
    ? t(`booking.collaborationStatuses.${String(value).toUpperCase()}`)
    : '—';

  useEffect(() => {
    const previousCurrency = costInputCurrencyRef.current;
    if (previousCurrency === selectedCurrency) return;
    setForm((current) => {
      if (current.total_cost === '') return current;
      const converted = convertAmount(current.total_cost, previousCurrency);
      return { ...current, total_cost: editableCurrencyAmount(converted, selectedCurrency) };
    });
    setDetailCost((current) => {
      if (current === '') return current;
      return editableCurrencyAmount(convertAmount(current, previousCurrency), selectedCurrency);
    });
    costInputCurrencyRef.current = selectedCurrency;
  }, [convertAmount, selectedCurrency]);

  useEffect(() => {
    const closeActions = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'click' && event.target.closest('.booking-action-menu')) return;
      setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
    };
    document.addEventListener('click', closeActions);
    document.addEventListener('keydown', closeActions);
    window.addEventListener('resize', closeActions);
    window.addEventListener('scroll', closeActions, true);
    return () => {
      document.removeEventListener('click', closeActions);
      document.removeEventListener('keydown', closeActions);
      window.removeEventListener('resize', closeActions);
      window.removeEventListener('scroll', closeActions, true);
    };
  }, []);

  const toggleActionsMenu = (bookingId, triggerElement) => {
    setOpenActions((current) => {
      if (current.id === bookingId) {
        return { id: null, direction: 'down', top: 0, bottom: 0, right: 0 };
      }
      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const direction = spaceBelow < 150 && spaceAbove > spaceBelow ? 'up' : 'down';
      return {
        id: bookingId,
        direction,
        top: Math.min(window.innerHeight - 12, rect.bottom + 8),
        bottom: Math.max(12, window.innerHeight - (rect.top - 8)),
        right: Math.max(12, window.innerWidth - rect.right),
      };
    });
  };

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
    })
      .then((loadedBookings) => setBookings(loadedBookings))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [customRange.end, customRange.start, performanceWindow, t]);

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
      .then((creator) => setSelectedKocDetail({ key: form.creator_key, creator }))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); });
    return () => controller.abort();
  }, [form.creator_key, selectedKocSummary, t]);
  const stats = useMemo(() => bookings.reduce((result, booking) => {
    const rawCost = finiteNumber(booking.total_cost ?? booking.booking_cost);
    const convertedCost = convertAmount(rawCost, booking.currency);
    const rawRevenue = finiteNumber(booking.actual_performance?.gross_gmv);
    const convertedRevenue = convertAmount(rawRevenue, booking.actual_performance?.currency);
    result.total += 1;
    result.totalCost += convertedCost ?? rawCost;
    result.totalRevenue += convertedRevenue ?? rawRevenue;
    result.videoCount += bookingVideosOf(booking).length || Number(booking.actual_performance?.video_count || 0);
    return result;
  }, { total: 0, totalCost: 0, totalRevenue: 0, videoCount: 0 }), [bookings, convertAmount]);
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
        });
      }
      const group = groups.get(key);
      const rawCost = finiteNumber(booking.total_cost ?? booking.booking_cost);
      const convertedCost = convertAmount(rawCost, booking.currency) ?? rawCost;
      const rawRevenue = finiteNumber(booking.actual_performance?.gross_gmv);
      const convertedRevenue = convertAmount(rawRevenue, booking.actual_performance?.currency) ?? rawRevenue;
      group.bookings.push(booking);
      group.totalCost += convertedCost;
      group.totalRevenue += convertedRevenue;
      group.videoCount += bookingVideosOf(booking).length || Number(booking.actual_performance?.video_count || 0);
    }
    return [...groups.values()].sort((left, right) => {
      if (left.key === 'unassigned') return 1;
      if (right.key === 'unassigned') return -1;
      return left.manager.name.localeCompare(right.manager.name, locale);
    });
  }, [bookings, canManageUsers, convertAmount, locale, session, t, users]);
  const activeBookingGroup = bookingGroups.find((group) => group.key === selectedManagerKey)
    || bookingGroups[0]
    || null;
  const showAllBookingGroups = canManageUsers && selectedManagerKey === 'all';
  const bookingGroupsToRender = showAllBookingGroups ? bookingGroups : activeBookingGroup ? [activeBookingGroup] : [];
  const bookingManagerFilterValue = showAllBookingGroups ? 'all' : activeBookingGroup?.key || '';
  const incompleteCustomCoverage = performanceWindow === 'CUSTOM'
    ? bookings
      .map((booking) => booking.reference_performance_coverage)
      .filter((coverage) => coverage && !coverage.complete)
      .sort((left, right) => Number(left.available_days) - Number(right.available_days))[0] || null
    : null;

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
      });
      setBookings((items) => [created, ...items]);
      fetchBookings(undefined, {
        windowType: performanceWindow,
        ...(performanceWindow === 'CUSTOM' ? {
          startDate: customRange.start,
          endDate: customRange.end,
        } : {}),
      }).then(setBookings).catch(() => {});
      setForm({ ...initialForm, staff_id: canManageUsers ? '' : String(session?.user?.id || '') });
    } catch (err) {
      setError(err.message || t('booking.errorCreate'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (booking) => {
    if (!window.confirm(t('booking.deleteConfirm', { id: booking.id }))) return;
    try {
      setDeletingId(booking.id);
      setError('');
      await deleteBooking(booking.id);
      setBookings((items) => items.filter((item) => item.id !== booking.id));
      if (selectedBooking?.id === booking.id) setSelectedBooking(null);
    } catch (err) {
      setError(err.message || t('booking.errorDelete'));
    } finally {
      setDeletingId(null);
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
    setSelectedBooking((current) => current?.id === updated.id
      ? {
        ...updated,
        ...(Object.prototype.hasOwnProperty.call(current, 'reference_performance')
          ? { reference_performance: current.reference_performance }
          : {}),
      }
      : current);
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

  const saveCost = async (event) => {
    event.preventDefault();
    try {
      setUpdatingId(selectedBooking.id);
      const updated = await updateBooking(selectedBooking.id, {
        total_cost: Number(detailCost),
        currency: selectedCurrency,
      });
      replaceBooking(updated);
    } catch (err) {
      setError(err.message || t('booking.errorUpdate'));
    } finally {
      setUpdatingId(null);
    }
  };

  const renderPerformance = (performance) => {
    if (!performance) return <span className="chip">{t('booking.noPerformance')}</span>;
    const gmv = optionalNumber(performance.affiliate_gmv);
    const views = optionalNumber(performance.video_views);
    return (
      <div className="booking-performance-cell">
        <strong>{gmv === null ? '—' : formatMoney(gmv, performance.currency)}</strong>
        <small>{views === null ? '—' : formatNumber(views)} {t('booking.views')}</small>
      </div>
    );
  };

  const creatorMetric = (performance, field, { money = false } = {}) => {
    const value = optionalNumber(performance?.[field]);
    if (value === null) return '—';
    return money ? formatMoney(value, performance.currency) : formatNumber(value);
  };

  return (
    <div className="page">
      <section className="page__hero">
        <div><h1 className="page__title">{t('booking.heroTitle') || heroTitle}</h1></div>
        <div className="page__stats booking-stats booking-stats--evaluation">
          <article className="stat-card"><p className="stat-card__label">{t('booking.evaluations')}</p><p className="stat-card__value">{stats.total}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.matchedVideo')}</p><p className="stat-card__value">{formatNumber(stats.videoCount)}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.costRevenueRatio')}</p><p className="stat-card__value">{stats.totalRevenue > 0 ? formatRate(stats.totalCost / stats.totalRevenue) : '—'}</p></article>
          <article className="stat-card"><p className="stat-card__label">{t('booking.totalCost')}</p><p className="stat-card__value">{formatMoney(stats.totalCost, selectedCurrency)}</p></article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header"><div><h2 className="section-card__title">{t('booking.createEvaluation')}</h2></div></div>
        <form className="filter-panel booking-evaluation-form" onSubmit={handleSubmit}>
          <div className="field"><label>{t('booking.targetCreator')}</label><TargetKocCombobox creators={targetKocs} value={form.creator_key} onChange={(value) => setForm((current) => ({ ...current, creator_key: value }))} onSearch={(keyword) => { setTargetKocQuery(keyword); setTargetKocPage(1); }} onLoadMore={() => setTargetKocPage((current) => current + 1)} hasMore={targetKocPagination.page < targetKocPagination.total_pages} loading={targetKocsLoading} placeholder={t('booking.searchKoc')} noResults={t('booking.noSyncedCollaboration')} performanceSourceLabel={t('booking.creatorPerformance')} collaborationLabel={t('booking.collaboration')} loadMoreLabel={t('booking.loadMoreKocs')} loadingLabel={t('booking.loadingKocs')} /></div>
          {canManageUsers ? <div className="field"><label>{t('booking.bookingStaff')}</label><BookingStaffSelect users={users} value={form.staff_id} onChange={(value) => setForm((current) => ({ ...current, staff_id: value }))} placeholder={t('booking.selectStaff')} loading={usersLoading} loadingLabel={t('booking.loading')} /></div> : null}
          <div className="field"><label htmlFor="total_cost">{t('booking.totalCost')} ({currencyLabel})</label><input id="total_cost" type="number" min="0" step={selectedCurrency === 'VND' ? '1' : '0.01'} inputMode="decimal" value={form.total_cost} onChange={(event) => setForm((current) => ({ ...current, total_cost: event.target.value }))} required /></div>
          <div className="actions"><button className="button" type="submit" disabled={saving || !selectedKoc || !form.staff_id}>{saving ? t('booking.submitting') : t('booking.evaluate')}</button></div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-card__header booking-evaluation-list-header"><div><h2 className="section-card__title">{t('booking.evaluationList')}</h2></div><div className="booking-performance-controls">{bookingGroups.length ? <div className="field booking-manager-filter"><label>{t('booking.bookingStaff')}</label><BookingStaffSelect users={bookingGroups.map((group) => ({ id: group.key, ...group.manager }))} value={bookingManagerFilterValue} onChange={(value) => { setSelectedManagerKey(value); setExpandedBookingId(null); }} placeholder={t('booking.selectStaff')} allLabel={t('booking.allStaff')} showAll={canManageUsers} loading={false} loadingLabel={t('booking.loading')} /></div> : null}<div className="field booking-performance-period"><label htmlFor="booking-performance-window">{t('booking.performancePeriod')}</label><select id="booking-performance-window" value={performanceWindow} onChange={(event) => setPerformanceWindow(event.target.value)}><option value="PAST_7_DAYS">{t('booking.period7Days')}</option><option value="PAST_30_DAYS">{t('booking.period30Days')}</option><option value="CUSTOM">{t('booking.periodCustom')}</option></select></div>{performanceWindow === 'CUSTOM' ? <><div className="field booking-performance-date"><label htmlFor="booking-performance-start">{t('booking.startDate')}</label><DatePickerInput id="booking-performance-start" label={t('booking.startDate')} value={customRange.start} min={earliestCustomStart} max={customRange.end || latestCompleteDate} onChange={(value) => setCustomRange((current) => ({ ...current, start: value }))} /></div><div className="field booking-performance-date"><label htmlFor="booking-performance-end">{t('booking.endDate')}</label><DatePickerInput id="booking-performance-end" label={t('booking.endDate')} value={customRange.end} min={customRange.start || undefined} max={latestCustomEnd} onChange={(value) => setCustomRange((current) => ({ ...current, end: value }))} /></div></> : null}</div></div>
        {incompleteCustomCoverage ? <p className="form-error" role="status">{t('booking.customCoverageIncomplete', {
          available: incompleteCustomCoverage.available_days,
          requested: incompleteCustomCoverage.requested_days,
        })}</p> : null}
        {loading ? <div className="empty-state"><span className="loading-dot" />{t('booking.loading')}</div> : bookingGroupsToRender.length ? <div className="content-performance__groups content-performance__groups--filtered booking-manager-groups">{bookingGroupsToRender.map((group) => <article className="content-performance__group booking-manager-group" key={group.key}>
        <div className="content-performance__group-header"><div className="booking-manager-group__identity"><TargetKocAvatar src={group.manager.avatar_url} name={group.manager.name} /><span><h3>{group.manager.name}</h3>{group.manager.email ? <small>{group.manager.email}</small> : null}</span></div></div>
        <div className="content-performance__metrics booking-manager-group__metrics">
          <span><small>{t('booking.evaluations')}</small><strong>{formatNumber(group.bookings.length)}</strong></span>
          <span><small>{t('booking.matchedVideo')}</small><strong>{formatNumber(group.videoCount)}</strong></span>
          <span><small>{t('booking.costRevenueRatio')}</small><strong>{group.totalRevenue > 0 ? formatRate(group.totalCost / group.totalRevenue) : '—'}</strong></span>
          <span><small>{t('booking.totalCost')}</small><strong>{formatMoney(group.totalCost, selectedCurrency)}</strong></span>
        </div>
        <div className="table-wrap"><table className="data-table booking-evaluation-table">
          <thead>
            <tr><th className="booking-koc-column">{t('booking.kocColumn')}</th><th className="booking-creator-performance-column">{t('booking.creatorPerformance')}</th><th className="cell-number booking-total-cost-column">{t('booking.totalCost')}</th><th className="booking-video-column">{t('booking.matchedVideo')}</th><th className="cell-number booking-refunds-column">{t('booking.refunds')}</th><th className="cell-number">{t('booking.products')}</th><th className="cell-number booking-samples-column">{t('booking.samplesShipped')}</th><th className="cell-number">{t('booking.estimatedCommission')}</th><th className="cell-actions">{t('booking.actionsColumn')}</th></tr>
          </thead>
          <tbody>
            {group.bookings.map((booking) => {
              const performance = performanceOf(booking);
              const bookingVideos = bookingVideosOf(booking);
              const videoCount = bookingVideos.length || Number(booking.actual_performance?.video_count || 0);
              const expanded = String(expandedBookingId) === String(booking.id);
              return <React.Fragment key={booking.id}>
              <tr className={expanded ? 'booking-row booking-row--expanded' : 'booking-row'} onClick={(event) => toggleBookingRow(event, booking.id)}>
                <td className="booking-koc-column"><div className="booking-koc-identity"><TargetKocAvatar src={booking.creator_avatar_url} name={booking.creator_name || booking.creator_username} /><span><strong>{booking.creator_name || booking.creator_username || 'KOC'}</strong><small>@{booking.creator_username}</small></span></div></td>
                <td className="booking-creator-performance-column">{renderPerformance(performance)}</td>
                <td className="cell-number booking-total-cost-column"><strong>{formatMoney(booking.total_cost ?? booking.booking_cost, booking.currency)}</strong></td>
                <td className="booking-video-column"><span className="booking-video-count"><strong>{t('booking.videosCount', { count: videoCount })}</strong></span></td>
                <td className="cell-number booking-refunds-column">{creatorMetric(performance, 'refunded_gmv', { money: true })}</td>
                <td className="cell-number"><div className="booking-product-summary"><strong>{creatorMetric(performance, 'items_sold')} <span>{t('booking.itemsSold')}</span></strong><small>{creatorMetric(performance, 'items_refunded')} {t('booking.refundedShort')}</small></div></td>
                <td className="cell-number booking-samples-column">{creatorMetric(performance, 'samples_shipped')}</td>
                <td className="cell-number">{creatorMetric(performance, 'estimated_commission', { money: true })}</td>
                <td className="cell-actions">
                  <div className="action-menu booking-action-menu">
                    <button
                      className="action-menu__trigger"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={openActions.id === booking.id}
                      aria-label={t('booking.actionsColumn')}
                      onClick={(event) => toggleActionsMenu(booking.id, event.currentTarget)}
                    >
                      •••
                    </button>
                    {openActions.id === booking.id ? createPortal(
                      <div
                        className={`action-menu__panel booking-action-menu booking-action-menu__popover action-menu__panel--${openActions.direction}`}
                        role="menu"
                        style={{
                          position: 'fixed',
                          right: `${openActions.right}px`,
                          top: openActions.direction === 'down' ? `${openActions.top}px` : 'auto',
                          bottom: openActions.direction === 'up' ? `${openActions.bottom}px` : 'auto',
                        }}
                      >
                      <button
                        type="button"
                        className="action-menu__item"
                        role="menuitem"
                        onClick={() => {
                          setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                          setSelectedBooking(booking);
                          const rawCost = booking.total_cost ?? booking.booking_cost;
                          setDetailCost(editableCurrencyAmount(convertAmount(rawCost, booking.currency) ?? rawCost, selectedCurrency));
                        }}
                      >
                        {t('booking.details')}
                      </button>
                      <button
                        type="button"
                        className="action-menu__item action-menu__item--danger"
                        disabled={deletingId === booking.id}
                        role="menuitem"
                        onClick={() => {
                          setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                          handleDelete(booking);
                        }}
                      >
                        {deletingId === booking.id ? t('booking.deleting') : t('booking.delete')}
                      </button>
                      </div>
                      ,
                      document.body,
                    ) : null}
                  </div>
                </td>
              </tr>
              {expanded ? <tr className="booking-video-detail-row"><td colSpan={9}><div className="booking-video-expansion">
                {bookingVideos.length ? <div className="booking-video-expansion__list">{bookingVideos.map((video, videoIndex) => {
                  const latest = latestBookingVideoSnapshot(video);
                  const social = bookingVideoSocialMetrics(latest);
                  return <article className="booking-video-expansion__item" key={video.id || video.platform_video_id}>
                    <div className="booking-video-expansion__identity">
                      <div className="booking-video-expansion__title">
                        <BookingVideoThumbnail shopId={booking.target_shop_id} video={video} snapshot={latest} index={videoIndex} />
                        <div>
                          {video.video_url ? <a href={video.video_url} target="_blank" rel="noreferrer"><strong>{video.title || video.platform_video_id}</strong><span aria-hidden="true"> ↗</span></a> : <strong>{video.title || video.platform_video_id}</strong>}
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
                    {latest ? <div className="booking-video-expansion__metrics">
                      <div><span>{t('booking.videoGmv')}</span><strong>{formatMoney(latest.gross_gmv, latest.currency || booking.currency)}</strong></div>
                      <div><span>{t('booking.videoItemsSold')}</span><strong>{formatNumber(latest.items_sold)}</strong></div>
                      <div><span>{t('booking.videoCtr')}</span><strong>{formatRate(productCtrOfBookingVideo(latest))}</strong></div>
                      <BookingVideoProducts shopId={booking.target_shop_id} video={video} snapshot={latest} label={t('booking.products')} />
                    </div> : <div className="booking-video-expansion__pending"><span className="loading-dot" /><span>{t('booking.awaitingFirstSync')}</span></div>}
                    {video.last_sync_error ? <p className="booking-video-expansion__error">{video.last_sync_error}</p> : null}
                  </article>;
                })}</div> : <div className="empty-state empty-state--compact">{t('booking.awaitingVideo')}</div>}
              </div></td></tr> : null}
              </React.Fragment>;
            })}
          </tbody>
        </table></div>
        </article>)}</div> : <div className="empty-state">{t('booking.noEvaluations')}</div>}
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

      {selectedBooking ? (() => {
        const collaboration = collaborationOf(selectedBooking);
        return <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBooking(null); }}>
          <aside className="koc-drawer booking-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title">
            <div className="koc-drawer__header"><div className="booking-detail-drawer__heading"><TargetKocAvatar src={selectedBooking.creator_avatar_url} name={selectedBooking.creator_name} /><div><h2 id="booking-detail-title">{t('booking.detailTitle', { id: selectedBooking.id })}</h2><p>{selectedBooking.creator_name || selectedBooking.creator_username} · @{selectedBooking.creator_username}</p></div></div><button className="button button--ghost" type="button" aria-label={t('common.close')} onClick={() => setSelectedBooking(null)}>×</button></div>
            <div className="koc-drawer__body">
              <section className="drawer-section"><div className="booking-detail-grid">{collaboration.id ? <><div><span>{t('booking.partnerStatus')}</span><strong>{formatCollaborationStatus(collaboration.status)}</strong></div><div><span>{t('booking.validUntil')}</span><strong>{formatDate(collaboration.end_at)}</strong></div></> : null}<div className="booking-detail-grid__wide"><BookingDetailProducts shopId={selectedBooking.target_shop_id} videos={bookingVideosOf(selectedBooking)} label={t('booking.products')} formatNumber={formatNumber} /></div></div></section>
              <form className="booking-detail-form" onSubmit={saveCost}>
                <div className="booking-detail-form__cost-row"><label className="field"><span>{t('booking.totalCost')} ({currencyLabel})</span><input type="number" min="0" step={selectedCurrency === 'VND' ? '1' : '0.01'} value={detailCost} onChange={(event) => setDetailCost(event.target.value)} required /></label><button className="button" type="submit" disabled={updatingId === selectedBooking.id}>{updatingId === selectedBooking.id ? t('common.loading') : t('booking.saveCost')}</button></div>
              </form>
            </div>
          </aside>
        </div>;
      })() : null}
    </div>
  );
};

export default BookingManagement;
