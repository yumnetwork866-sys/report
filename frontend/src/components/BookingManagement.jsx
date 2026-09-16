import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createBooking,
  deleteBooking,
  fetchBookingTargetKocDetail,
  fetchBookingTargetKocs,
  fetchBookings,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokSellerAffiliateOrders,
  fetchUser,
  fetchUsers,
  matchBookingVideo,
  updateBooking,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import { hasPermission } from '../lib/session';
import { useSession } from '../lib/useSession';
import DatePickerInput from './DatePickerInput';

import {
  DEFAULT_PERFORMANCE_WINDOW,
  PRODUCT_ORDERS_CACHE_TTL_MS,
  generateBookingMonthOptions,
  bookingUiSession,
  productOrdersCacheSession,
  persistProductOrdersCache,
  dateInputValue,
  bookingDateOf,
  isBookingInPeriod,
  defaultBookingForm,
  defaultCustomRange,
  targetKocKey,
  bookingVideosOf,
  bookingVideosByRevenue,
  bookingVideoMatchesHashtags,
  bookingProductsOf,
  orderRangeForPeriod,
  bookingProductOrderPerformance,
  filterVideosByPeriod,
  bookingVideoPerformanceForVideos,
  finiteNumber,
  optionalNumber,
  editableCurrencyAmount,
} from '../lib/bookingMetrics';

import BookingStaffSelect from './booking/BookingStaffSelect';
import TargetKocAvatar from './booking/TargetKocAvatar';
import BookingEvaluationTable from './booking/BookingEvaluationTable';
import BookingProductOrderDetailModal from './booking/BookingProductOrderDetailModal';
import BookingCreateModal from './booking/BookingCreateModal';
import BookingVideoMatchDrawer from './booking/BookingVideoMatchDrawer';
import BookingDetailDrawer from './booking/BookingDetailDrawer';
import BookingDeleteConfirmModal from './booking/BookingDeleteConfirmModal';
import { SortIcon } from './booking/BookingIcons';

const initialForm = defaultBookingForm();

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
  const sessionUserId = String(session?.user?.id || 'anonymous');
  const hashtagFilterStorageKey = `booking-hashtag-filter:${sessionUserId}`;
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
  const [hashtagFilterEnabled, setHashtagFilterEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(hashtagFilterStorageKey) === 'true';
    } catch {
      return false;
    }
  });
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
  const [productOrderDetailModal, setProductOrderDetailModal] = useState(null);
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
    setForm({
      ...defaultBookingForm(),
      creator_key: creatorKey,
      staff_id: selectedBooking.staff_id
        ? String(selectedBooking.staff_id)
        : canManageUsers ? '' : String(session?.user?.id || ''),
    });
    setIsCreateBookingOpen(true);
  };

  const toggleBookingRow = useCallback((event, bookingId) => {
    if (event.target.closest('button, a, input, select, textarea, label')) return;
    setExpandedBookingId((current) => String(current) === String(bookingId) ? null : bookingId);
  }, []);

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

  const handleBookingSort = useCallback((key) => {
    setBookingSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { key, direction: 'desc' };
    });
  }, []);

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

  useEffect(() => {
    try {
      window.localStorage.setItem(hashtagFilterStorageKey, String(hashtagFilterEnabled));
    } catch {
      // The filter still works when local storage is unavailable.
    }
  }, [hashtagFilterEnabled, hashtagFilterStorageKey]);

  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const collator = useMemo(() => new Intl.Collator(locale, { sensitivity: 'base', numeric: true }), [locale]);
  const formatNumber = useCallback((value, options) => finiteNumber(value).toLocaleString(locale, options), [locale]);
  const { formatMoney, currency: selectedCurrency, convertAmount } = useMoneyFormatter(locale);
  const costInputCurrencyRef = useRef(selectedCurrency);
  const currencyLabel = selectedCurrency === 'VND' ? 'VNĐ' : 'RM';
  const formatDate = useCallback((value) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
    : '—', [locale]);
  const formatRate = useCallback((value) => {
    const rate = optionalNumber(value);
    if (rate === null) return '—';
    return `${formatNumber(rate <= 1 ? rate * 100 : rate, { maximumFractionDigits: 2 })}%`;
  }, [formatNumber]);
  const formatRatio = useCallback((value) => {
    const ratio = optionalNumber(value);
    return ratio === null ? '—' : `${formatNumber(ratio * 100, { maximumFractionDigits: 2 })}%`;
  }, [formatNumber]);

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
    if (!isCreateBookingOpen) return undefined;
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
    localMatches.sort((a, b) => new Date(bookingDateOf(b) || 0) - new Date(bookingDateOf(a) || 0));
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
          items.sort((a, b) => new Date(bookingDateOf(b) || 0) - new Date(bookingDateOf(a) || 0));
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
      setForm((current) => ({ ...current, staff_id: currentUser?.id ? String(currentUser.id) : '' }));
      if (!currentUser?.id) {
        setUsersLoading(false);
        return undefined;
      }
      const controller = new AbortController();
      setUsersLoading(true);
      fetchUser(currentUser.id, controller.signal)
        .then((user) => {
          if (!controller.signal.aborted) setUsers(user ? [user] : [currentUser]);
        })
        .catch((err) => {
          if (err.name !== 'AbortError' && !controller.signal.aborted) setUsers([currentUser]);
        })
        .finally(() => { if (!controller.signal.aborted) setUsersLoading(false); });
      return () => controller.abort();
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
    if (selectedMonth === 'custom' && (!customRange.start || !customRange.end || customRange.start > customRange.end)) {
      setLoading(false);
      setError(t('booking.invalidCustomRange'));
      return undefined;
    }
    const controller = new AbortController();
    const range = orderRangeForPeriod(selectedMonth, customRange);
    setLoading(true);
    setError('');
    fetchBookings(controller.signal, {
      windowType: range.windowType,
      ...(range.startDate ? { startDate: range.startDate, endDate: range.endDate } : {}),
      month: 'all',
    })
      .then((loadedBookings) => setBookings(loadedBookings))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [customRange, selectedMonth, t]);

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
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); });
    return () => controller.abort();
  }, [form.creator_key, selectedKocSummary, t]);

  useEffect(() => {
    const shopIds = [...new Set(bookings
      .filter((booking) => bookingProductsOf(booking).length)
      .map((booking) => String(booking.target_shop_id || ''))
      .filter(Boolean))].sort();
    const needsProductOrders = bookings.some(
      (booking) => bookingProductsOf(booking).length > 0 && !booking.product_performance,
    );
    if (!shopIds.length || !needsProductOrders) {
      setProductOrdersLoading(false);
      return undefined;
    }
    if (bookingTab !== 'product') {
      setProductOrdersLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const range = orderRangeForPeriod(selectedMonth, customRange);
    const cacheKey = `${range.startTime || 'all'}:${range.endTime || 'all'}:${shopIds.join(',')}`;
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
          source: 'db',
          pageSize: 200,
          pageToken,
          ...(range.startTime ? { startTime: range.startTime } : {}),
          ...(range.endTime ? { endTime: range.endTime } : {}),
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
  }, [bookingTab, bookings, customRange, selectedMonth, t]);

  const productPerformanceByBooking = useMemo(() => {
    const activeRange = orderRangeForPeriod(selectedMonth, customRange);
    return new Map(bookings.map((booking) => [
      String(booking.id),
      booking.product_performance
      || bookingProductOrderPerformance(booking, productOrdersByShop[String(booking.target_shop_id)] || [], activeRange),
    ]));
  }, [bookings, customRange, productOrdersByShop, selectedMonth]);

  const hashtagsByUserId = useMemo(() => new Map(users.map((user) => [
    String(user.id),
    Array.isArray(user.content_attribution?.hashtags) ? user.content_attribution.hashtags : [],
  ])), [users]);

  const videoPerformanceByBooking = useMemo(() => {
    const activeRange = orderRangeForPeriod(selectedMonth, customRange);
    return new Map(bookings.map((booking) => {
      const allVideos = bookingVideosOf(booking);
      const periodVideos = filterVideosByPeriod(allVideos, activeRange);
      const staffHashtags = hashtagsByUserId.get(String(booking.staff_id || booking.staff?.id || '')) || [];
      const filteredVideos = hashtagFilterEnabled
        ? periodVideos.filter((video) => bookingVideoMatchesHashtags(video, staffHashtags))
        : periodVideos;
      if (!activeRange.startDate && !activeRange.endDate && !hashtagFilterEnabled) {
        return [String(booking.id), {
          videos: bookingVideosByRevenue(allVideos),
          performance: booking.actual_performance,
          videoCount: allVideos.length || Number(booking.actual_performance?.video_count || 0),
        }];
      }
      const perf = bookingVideoPerformanceForVideos(
        filteredVideos,
        booking.actual_performance,
        productOrdersByShop[String(booking.target_shop_id)] || [],
      );
      return [String(booking.id), {
        videos: bookingVideosByRevenue(filteredVideos),
        performance: perf,
        videoCount: filteredVideos.length,
      }];
    }));
  }, [bookings, customRange, hashtagFilterEnabled, hashtagsByUserId, productOrdersByShop, selectedMonth]);

  const stats = useMemo(() => {
    const activeRange = orderRangeForPeriod(selectedMonth, customRange);
    return bookings.reduce((result, booking) => {
      const rawCost = finiteNumber(booking.total_cost ?? booking.booking_cost);
      const convertedCost = convertAmount(rawCost, booking.currency) ?? rawCost;
      const videoData = videoPerformanceByBooking.get(String(booking.id));
      const tabPerformance = bookingTab === 'product'
        ? productPerformanceByBooking.get(String(booking.id))
        : videoData?.performance || booking.actual_performance;
      const rawRevenue = finiteNumber(bookingTab === 'product' ? tabPerformance?.affiliate_gmv : tabPerformance?.gross_gmv);
      const convertedRevenue = convertAmount(rawRevenue, tabPerformance?.currency) ?? rawRevenue;
      const inPeriodForCost = isBookingInPeriod(booking, activeRange);

      result.total += 1;
      if (inPeriodForCost) {
        result.totalCost += convertedCost;
      }
      result.totalRevenue += convertedRevenue;
      result.committedVideos += Number(booking.committed_videos || 1);
      result.videoCount += bookingTab === 'product'
        ? finiteNumber(tabPerformance?.affiliate_orders)
        : (videoData?.videoCount ?? (bookingVideosOf(booking).length || Number(booking.actual_performance?.video_count || 0)));
      return result;
    }, { total: 0, totalCost: 0, totalRevenue: 0, videoCount: 0, committedVideos: 0 });
  }, [bookingTab, bookings, convertAmount, customRange, productPerformanceByBooking, selectedMonth, videoPerformanceByBooking]);

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
    const activeRange = orderRangeForPeriod(selectedMonth, customRange);
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
      const videoData = videoPerformanceByBooking.get(String(booking.id));
      const tabPerformance = bookingTab === 'product'
        ? productPerformanceByBooking.get(String(booking.id))
        : videoData?.performance || booking.actual_performance;
      const rawRevenue = finiteNumber(bookingTab === 'product' ? tabPerformance?.affiliate_gmv : tabPerformance?.gross_gmv);
      const convertedRevenue = convertAmount(rawRevenue, tabPerformance?.currency) ?? rawRevenue;
      const inPeriodForCost = isBookingInPeriod(booking, activeRange);

      group.bookings.push(booking);
      if (inPeriodForCost) {
        group.totalCost += convertedCost;
      }
      group.totalRevenue += convertedRevenue;
      group.committedVideos += Number(booking.committed_videos || 1);
      group.videoCount += bookingTab === 'product'
        ? finiteNumber(tabPerformance?.affiliate_orders)
        : (videoData?.videoCount ?? (bookingVideosOf(booking).length || Number(booking.actual_performance?.video_count || 0)));
    }
    for (const group of groups.values()) {
      group.bookings.sort((left, right) => {
        const performanceOfBooking = (booking) => (
          bookingTab === 'product'
            ? productPerformanceByBooking.get(String(booking.id))
            : (videoPerformanceByBooking.get(String(booking.id))?.performance || booking.actual_performance)
        );
        const revenueOfBooking = (booking) => {
          const performance = performanceOfBooking(booking);
          const revenue = finiteNumber(bookingTab === 'product' ? performance?.affiliate_gmv : (performance?.gross_gmv ?? performance?.affiliate_gmv));
          return convertAmount(revenue, performance?.currency) ?? revenue;
        };
        return revenueOfBooking(right) - revenueOfBooking(left)
          || Number(right.id || 0) - Number(left.id || 0);
      });
    }
    return [...groups.values()].sort((left, right) => {
      if (left.key === 'unassigned') return 1;
      if (right.key === 'unassigned') return -1;
      return collator.compare(left.manager.name, right.manager.name);
    });
  }, [bookingTab, bookings, canManageUsers, collator, convertAmount, customRange, productPerformanceByBooking, selectedMonth, session, t, users, videoPerformanceByBooking]);

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
        return factor * collator.compare(a.manager.name, b.manager.name);
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
        valA = a.totalRevenue > 0 ? a.totalCost / a.totalRevenue : (a.totalCost > 0 ? Infinity : 0);
        valB = b.totalRevenue > 0 ? b.totalCost / b.totalRevenue : (b.totalCost > 0 ? Infinity : 0);
      }
      if (valA !== valB) {
        return factor * (valA > valB ? 1 : -1);
      }
      return collator.compare(a.manager.name, b.manager.name);
    });
  }, [bookingGroupsToRender, collator, overviewSort]);

  const sortedBookingsOfGroup = useCallback((bookingsList) => {
    const list = [...bookingsList];
    if (!bookingSort.key) return list;
    const { key, direction } = bookingSort;
    const factor = direction === 'desc' ? -1 : 1;

    const performanceOf = (booking) => (
      bookingTab === 'product'
        ? productPerformanceByBooking.get(String(booking.id))
        : (videoPerformanceByBooking.get(String(booking.id))?.performance || booking.actual_performance)
    );
    const revenueOf = (booking) => {
      const perf = performanceOf(booking);
      const raw = finiteNumber(bookingTab === 'product' ? perf?.affiliate_gmv : (perf?.gross_gmv ?? perf?.affiliate_gmv));
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
      const videoData = videoPerformanceByBooking.get(String(booking.id));
      return videoData?.videoCount ?? (bookingVideosOf(booking).length || Number(booking.actual_performance?.video_count || 0));
    };

    return list.sort((a, b) => {
      if (key === 'koc') {
        const nameA = String(a.creator_name || a.creator_username || '').trim();
        const nameB = String(b.creator_name || b.creator_username || '').trim();
        const diff = collator.compare(nameA, nameB);
        if (diff !== 0) return factor * diff;
        return Number(b.id || 0) - Number(a.id || 0);
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
        valA = revA > 0 ? costOf(a) / revA : (costOf(a) > 0 ? Infinity : 0);
        valB = revB > 0 ? costOf(b) / revB : (costOf(b) > 0 ? Infinity : 0);
      } else if (key === 'refunds') {
        valA = finiteNumber(performanceOf(a)?.refunded_gmv);
        valB = finiteNumber(performanceOf(a)?.refunded_gmv);
      } else if (key === 'items_sold') {
        valA = finiteNumber(performanceOf(a)?.items_sold);
        valB = finiteNumber(performanceOf(a)?.items_sold);
      } else if (key === 'samples') {
        valA = finiteNumber(performanceOf(a)?.samples_shipped);
        valB = finiteNumber(performanceOf(a)?.samples_shipped);
      } else if (key === 'commission') {
        valA = finiteNumber(performanceOf(a)?.estimated_commission);
        valB = finiteNumber(performanceOf(a)?.estimated_commission);
      }
      if (valA !== valB) {
        return factor * (valA > valB ? 1 : -1);
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [bookingSort, bookingTab, collator, convertAmount, productPerformanceByBooking, videoPerformanceByBooking]);

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
        start_date: form.booking_date || dateInputValue(new Date()),
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
      const currentRange = orderRangeForPeriod(selectedMonth, customRange);
      fetchBookings(undefined, {
        windowType: currentRange.windowType,
        ...(currentRange.startDate ? {
          startDate: currentRange.startDate,
          endDate: currentRange.endDate,
        } : {}),
        month: 'all',
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

  const renderPerformance = useCallback((performance) => {
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
  }, [formatMoney, formatNumber, t]);

  const creatorMetric = useCallback((performance, field, { money = false } = {}) => {
    const value = optionalNumber(performance?.[field]);
    if (value === null) return '—';
    return money ? formatMoney(value, performance.currency) : formatNumber(value);
  }, [formatMoney, formatNumber]);

  return (
    <div className={`page${embeddedMode ? ' booking-management--embedded' : ''}`}>
      <section className="page__hero booking-page-hero">
        <div className="booking-page-hero__title-row">
          <h1 className="page__title">{t('booking.heroTitle') || heroTitle}</h1>
          <label
            className={`booking-hashtag-toggle${hashtagFilterEnabled ? ' booking-hashtag-toggle--active' : ''}`}
            title={t('booking.hashtagFilterHelp')}
          >
            <input
              type="checkbox"
              checked={hashtagFilterEnabled}
              onChange={(event) => setHashtagFilterEnabled(event.target.checked)}
            />
            <span className="booking-hashtag-toggle__track" aria-hidden="true"><i /></span>
            <span>{t('booking.hashtagFilter')}</span>
          </label>
        </div>
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

      <BookingCreateModal
        isOpen={isCreateBookingOpen}
        saving={saving}
        onClose={closeCreateBooking}
        onSubmit={handleSubmit}
        targetKocs={targetKocs}
        form={form}
        setForm={setForm}
        onSearchKoc={(keyword) => { setTargetKocQuery(keyword); setTargetKocPage(1); }}
        onLoadMoreKocs={() => setTargetKocPage((current) => current + 1)}
        targetKocPagination={targetKocPagination}
        targetKocsLoading={targetKocsLoading}
        channelProductsLoading={channelProductsLoading}
        bookingProducts={bookingProducts}
        toggleBookingProduct={toggleBookingProduct}
        currencyLabel={currencyLabel}
        selectedCurrency={selectedCurrency}
        canManageUsers={canManageUsers}
        users={users}
        usersLoading={usersLoading}
        selectedKoc={selectedKoc}
        t={t}
      />

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
              <label htmlFor="booking-month-select">{bookingTab === 'video' ? t('booking.videoPostPeriod') : t('booking.orderPeriod')}</label>
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
            {selectedMonth === 'custom' ? (
              <>
                <div className="field booking-month-custom-date">
                  <label htmlFor="booking-custom-start">{t('booking.startDate')}</label>
                  <DatePickerInput
                    id="booking-custom-start"
                    label={t('booking.startDate')}
                    value={customRange.start}
                    max={customRange.end || undefined}
                    onChange={(value) => setCustomRange((current) => ({ ...current, start: value }))}
                  />
                </div>
                <div className="field booking-month-custom-date">
                  <label htmlFor="booking-custom-end">{t('booking.endDate')}</label>
                  <DatePickerInput
                    id="booking-custom-end"
                    label={t('booking.endDate')}
                    value={customRange.end}
                    min={customRange.start || undefined}
                    onChange={(value) => setCustomRange((current) => ({ ...current, end: value }))}
                  />
                </div>
              </>
            ) : null}
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
                            <BookingEvaluationTable
                              bookings={sortedBookingsOfGroup(group.bookings)}
                              bookingSort={bookingSort}
                              onSort={handleBookingSort}
                              expandedBookingId={expandedBookingId}
                              onToggleRow={toggleBookingRow}
                              onSelectBooking={setSelectedBooking}
                              bookingTab={bookingTab}
                              productPerformanceByBooking={productPerformanceByBooking}
                              videoPerformanceByBooking={videoPerformanceByBooking}
                              productOrdersByShop={productOrdersByShop}
                              onSelectProduct={setProductOrderDetailModal}
                              formatMoney={formatMoney}
                              formatNumber={formatNumber}
                              formatDate={formatDate}
                              formatRate={formatRate}
                              renderPerformance={renderPerformance}
                              creatorMetric={creatorMetric}
                              t={t}
                            />
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

      <BookingVideoMatchDrawer
        videoMatchDialog={videoMatchDialog}
        onClose={() => setVideoMatchDialog(null)}
        matchingVideoId={matchingVideoId}
        findBookingVideo={findBookingVideo}
        manualVideoUrl={manualVideoUrl}
        setManualVideoUrl={setManualVideoUrl}
        formatDate={formatDate}
        formatMoney={formatMoney}
        formatNumber={formatNumber}
        t={t}
      />

      <BookingDetailDrawer
        selectedBooking={selectedBooking}
        onClose={closeBookingDetail}
        creatorBookings={creatorBookings}
        deletingId={deletingId}
        onRequestDeleteCreator={() => setCreatorDeleteConfirmOpen(true)}
        creatorBookingStats={creatorBookingStats}
        selectedCurrency={selectedCurrency}
        currencyLabel={currencyLabel}
        convertAmount={convertAmount}
        editableCurrencyAmount={editableCurrencyAmount}
        formatMoney={formatMoney}
        formatNumber={formatNumber}
        formatRatio={formatRatio}
        formatDate={formatDate}
        updatingId={updatingId}
        onSaveCard={handleSaveCard}
        onRequestDeleteCard={(booking) => setBookingDeleteConfirm(booking)}
        openCreateBookingFromDrawer={openCreateBookingFromDrawer}
        detailProducts={detailProducts}
        detailProductsLoading={detailProductsLoading}
        t={t}
      />

      <BookingDeleteConfirmModal
        isOpen={creatorDeleteConfirmOpen && Boolean(selectedBooking)}
        onClose={() => setCreatorDeleteConfirmOpen(false)}
        onConfirm={handleDeleteCreatorBookings}
        isDeleting={deletingId === 'creator'}
        message={t('booking.deleteCreatorBookingsConfirm', {
          name: selectedBooking?.creator_name || `@${selectedBooking?.creator_username}`,
          count: creatorBookings.length,
        })}
        confirmLabel={deletingId === 'creator' ? t('booking.deleting') : t('booking.delete')}
      />

      <BookingDeleteConfirmModal
        isOpen={Boolean(bookingDeleteConfirm)}
        onClose={() => setBookingDeleteConfirm(null)}
        onConfirm={() => handleDeleteCard(bookingDeleteConfirm)}
        isDeleting={deletingId === bookingDeleteConfirm?.id}
        message={t('booking.deleteConfirm', { id: bookingDeleteConfirm?.id })}
        confirmLabel={deletingId === bookingDeleteConfirm?.id ? t('booking.deleting') : t('booking.delete')}
      />

      {productOrderDetailModal ? (
        <BookingProductOrderDetailModal
          product={productOrderDetailModal.product}
          booking={productOrderDetailModal.booking}
          video={productOrderDetailModal.video}
          snapshot={productOrderDetailModal.snapshot || productOrderDetailModal.video?.snapshot}
          orders={productOrdersByShop[String(productOrderDetailModal.booking?.target_shop_id)] || []}
          loading={productOrdersLoading}
          onClose={() => setProductOrderDetailModal(null)}
          formatMoney={formatMoney}
          formatNumber={formatNumber}
          t={t}
          currency={productOrderDetailModal.booking?.currency || selectedCurrency}
          dateRange={orderRangeForPeriod(selectedMonth, customRange)}
        />
      ) : null}
    </div>
  );
};

export default BookingManagement;
