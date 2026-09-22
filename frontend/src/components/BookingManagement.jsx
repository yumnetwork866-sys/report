import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createBooking,
  deleteBooking,
  fetchBookingTargetKocDetail,
  fetchBookingTargetKocs,
  fetchBookingProductPerformance,
  fetchBookings,
  fetchTikTokSellerOpenCollaborations,
  fetchUser,
  fetchUsers,
  matchBookingVideo,
  updateBooking,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import { hasPermission } from '../lib/session';
import { useSession } from '../lib/useSession';

import {
  BOOKING_UI_SESSION_KEY,
  DEFAULT_PERFORMANCE_WINDOW,
  generateBookingMonthOptions,
  bookingUiSession,
  dateInputValue,
  bookingDateOf,
  defaultBookingForm,
  defaultCustomRange,
  targetKocKey,
  bookingProductsOf,
  orderRangeForPeriod,
  finiteNumber,
  optionalNumber,
  editableCurrencyAmount,
  defaultBookingSortForTab,
  currentBookingMonth,
} from '../lib/bookingMetrics';

import BookingProductOrderDetailModal from './booking/BookingProductOrderDetailModal';
import BookingCreateModal from './booking/BookingCreateModal';
import BookingVideoMatchDrawer from './booking/BookingVideoMatchDrawer';
import BookingDetailDrawer from './booking/BookingDetailDrawer';
import BookingDeleteConfirmModal from './booking/BookingDeleteConfirmModal';
import BookingPageHero from './booking/BookingPageHero';
import BookingListControls from './booking/BookingListControls';
import BookingGroupsTable from './booking/BookingGroupsTable';
import BookingTableSkeleton from './booking/BookingTableSkeleton';
import useBookingAnalytics from './booking/useBookingAnalytics';

const initialForm = defaultBookingForm();
const emptyProductOrdersByShop = Object.freeze({});

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
  const [selectedMonth, setSelectedMonth] = useState(() => (
    bookingUiSession().selectedMonth || currentBookingMonth()
  ));
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
  const [productPerformanceLoading, setProductPerformanceLoading] = useState(() => (
    bookingUiSession().bookingTab === 'product'
  ));
  const [productPerformanceError, setProductPerformanceError] = useState('');
  const [error, setError] = useState('');
  const productOrdersByShop = emptyProductOrdersByShop;

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
  const [bookingSortByTab, setBookingSortByTab] = useState(() => ({
    video: { ...defaultBookingSortForTab('video') },
    product: { ...defaultBookingSortForTab('product') },
  }));
  const bookingSort = bookingSortByTab[bookingTab] || defaultBookingSortForTab(bookingTab);

  const handleOverviewSort = (key) => {
    setOverviewSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const handleBookingSort = useCallback((key) => {
    setBookingSortByTab((current) => {
      const currentSort = current[bookingTab] || defaultBookingSortForTab(bookingTab);
      const nextSort = currentSort.key === key
        ? { key, direction: currentSort.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: 'desc' };
      return {
        ...current,
        [bookingTab]: nextSort,
      };
    });
  }, [bookingTab]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(BOOKING_UI_SESSION_KEY, JSON.stringify({
        bookingTab,
        selectedManagerKey,
        expandedBookingId,
        selectedMonth,
      }));
    } catch {
      // The page still works when session storage is unavailable.
    }
  }, [bookingTab, expandedBookingId, selectedManagerKey, selectedMonth]);

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
      String(b.staff_id || '') === String(selectedBooking.staff_id || '')
      && (
        (selectedBooking.creator_open_id && b.creator_open_id === selectedBooking.creator_open_id)
        || (selectedBooking.creator_username && String(b.creator_username || '').toLowerCase() === String(selectedBooking.creator_username || '').toLowerCase())
      )
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
      staffId: selectedBooking.staff_id,
      month: 'all',
      windowType: performanceWindow,
      includeProductPerformance: false,
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
      ...(range.startTime ? { startTime: range.startTime, endTime: range.endTime } : {}),
      month: 'all',
      includeProductPerformance: false,
    })
      .then((loadedBookings) => setBookings(loadedBookings))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message || t('booking.errorLoad')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [customRange, selectedMonth, t]);

  useEffect(() => {
    if (bookingTab !== 'product') {
      setProductPerformanceLoading(false);
      setProductPerformanceError('');
      return undefined;
    }
    if (loading) return undefined;

    const controller = new AbortController();
    const range = orderRangeForPeriod(selectedMonth, customRange);
    setProductPerformanceLoading(true);
    setProductPerformanceError('');
    fetchBookingProductPerformance(controller.signal, {
      startDate: range.startDate,
      endDate: range.endDate,
      startTime: range.startTime,
      endTime: range.endTime,
    })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const performance = payload?.performance || {};
        setBookings((current) => current.map((booking) => ({
          ...booking,
          product_performance: performance[String(booking.id)] || null,
        })));
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setProductPerformanceError(err.message || t('booking.productOrdersError'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setProductPerformanceLoading(false);
      });

    return () => controller.abort();
  }, [bookingTab, customRange, loading, selectedMonth, t]);

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
    if (!isCreateBookingOpen) {
      setTargetKocsLoading(false);
      return undefined;
    }
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
  }, [isCreateBookingOpen, targetKocPage, targetKocQuery, t]);

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

  const {
    stats,
    bookingGroups,
    bookingGroupsToRender,
    bookingManagerFilterValue,
    sortedBookingGroupsToRender,
    sortedBookingsOfGroup,
    productPerformanceByBooking,
    videoPerformanceByBooking,
    bookingInPeriodById,
  } = useBookingAnalytics({
    bookings,
    users,
    canManageUsers,
    sessionUserId,
    bookingTab,
    selectedMonth,
    customRange,
    hashtagFilterEnabled,
    productOrdersByShop,
    selectedManagerKey,
    overviewSort,
    bookingSort,
    collator,
    convertAmount,
    t,
  });

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
        includeProductPerformance: false,
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

  const listLoading = loading || (bookingTab === 'product' && productPerformanceLoading);

  return (
    <div className={`page${embeddedMode ? ' booking-management--embedded' : ''}`}>
      <BookingPageHero
        heroTitle={heroTitle}
        hashtagFilterEnabled={hashtagFilterEnabled}
        onHashtagFilterChange={setHashtagFilterEnabled}
        bookingTab={bookingTab}
        stats={stats}
        selectedCurrency={selectedCurrency}
        formatNumber={formatNumber}
        formatMoney={formatMoney}
        formatRatio={formatRatio}
        loading={listLoading}
        t={t}
      />

      {error ? <section className="section-card empty-state empty-state--compact" role="alert">{error}</section> : null}

      <section className="booking-create-action">
        <div className="booking-view-tabs" role="tablist" aria-label={t('booking.viewTabs')}>
          <button className={`booking-view-tabs__tab${bookingTab === 'video' ? ' booking-view-tabs__tab--active' : ''}`} type="button" role="tab" aria-selected={bookingTab === 'video'} aria-controls="booking-list-panel" onClick={() => setBookingTab('video')}>{t('booking.videoTab')}</button>
          <button className={`booking-view-tabs__tab${bookingTab === 'product' ? ' booking-view-tabs__tab--active' : ''}`} type="button" role="tab" aria-selected={bookingTab === 'product'} aria-controls="booking-list-panel" onClick={() => { if (bookingTab !== 'product') setProductPerformanceLoading(true); setBookingTab('product'); }}>{t('booking.productTab')}</button>
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
        <BookingListControls
          bookingGroups={bookingGroups}
          bookingManagerFilterValue={bookingManagerFilterValue}
          onManagerChange={(value) => {
            setSelectedManagerKey(value);
            setExpandedBookingId(null);
            setExpandedGroupKeys(value !== 'all' ? new Set([value]) : new Set());
          }}
          canManageUsers={canManageUsers}
          bookingTab={bookingTab}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          monthOptions={monthOptions}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          t={t}
        />
        {productPerformanceError && bookingTab === 'product' ? <p className="form-error" role="alert">{productPerformanceError}</p> : null}
        {listLoading ? (
          <BookingTableSkeleton label={t('booking.loading')} />
        ) : bookingGroupsToRender.length ? (
          <BookingGroupsTable
            groups={sortedBookingGroupsToRender}
            expandedGroupKeys={expandedGroupKeys}
            onToggleGroup={toggleGroup}
            overviewSort={overviewSort}
            onOverviewSort={handleOverviewSort}
            sortedBookingsOfGroup={sortedBookingsOfGroup}
            bookingTableProps={{
              bookingSort,
              onSort: handleBookingSort,
              expandedBookingId,
              onToggleRow: toggleBookingRow,
              onSelectBooking: setSelectedBooking,
              bookingTab,
              productPerformanceByBooking,
              videoPerformanceByBooking,
              bookingInPeriodById,
              productOrdersByShop,
              onSelectProduct: setProductOrderDetailModal,
              formatMoney,
              formatNumber,
              formatDate,
              formatRate,
              renderPerformance,
              creatorMetric,
              t,
            }}
            selectedCurrency={selectedCurrency}
            formatMoney={formatMoney}
            formatNumber={formatNumber}
            formatRatio={formatRatio}
            t={t}
          />
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
          loading={false}
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
