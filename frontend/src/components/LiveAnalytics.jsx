import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChevronDown,
  Clock,
  MessageSquare,
  Pencil,
  Package,
  Radio,
  Search,
  ShoppingBag,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import { formatDateOnly } from '../lib/date';
import { fetchLiveHosts, fetchTikTokSellerAffiliateOrders, fetchTikTokShopLivePerformance } from '../lib/api';
import { useSession } from '../lib/useSession';
import { hasPermission } from '../lib/session';
import AppAvatar from './AppAvatar';
import LiveHostEditor from './LiveHostEditor';
import SelectDropdown from './SelectDropdown';
import useShopInventory from './shop-analytics/hooks/useShopInventory';
import useShopAnalyticsData from './shop-analytics/hooks/useShopAnalyticsData';
import ShopAnalyticsFilters from './shop-analytics/ShopAnalyticsFilters';
import AnalyticsIcon from './shop-analytics/AnalyticsIcon';
import Pagination from './Pagination';
import { OrderDetailDrawer } from './SellerAffiliatePanel/components/AffiliatePresentation';
import { shopDateUnix } from './SellerAffiliatePanel/utils/sellerAffiliateUtils';
import { orderStatusLabel } from '../lib/sellerAffiliate';
import {
  formatDisplayDateTime,
  moneyValue,
  numericValue,
  percentageChange,
  rangeForDays,
  shiftDate,
} from './shop-analytics/shopAnalyticsUtils';
import '../styles/features/order-management.css';
import '../styles/pages/live-analytics.css';

const SHOP_PALETTE = [
  '#0284c7', // Sky Blue
  '#f97316', // Orange
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#eab308', // Amber
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];
import {
  calculateDurationSeconds,
  extractLiveGmv,
  extractSessionComments,
  findLivePerformanceForSession,
  formatLiveDuration,
  formatTotalDuration,
  isInternalLiveChannel,
  resolveLiveSessionHost,
  resolveLiveSessionSource,
} from './liveAnalyticsUtils.js';

const TOTAL_SERIES_ID = '__total__';
const TOTAL_LINE_COLOR = '#0f172a';

const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e9f3',
  boxShadow: '0 8px 24px rgba(45, 70, 110, 0.12)',
  color: '#17243d',
  background: '#ffffff',
  fontSize: '0.8125rem',
  padding: '10px 14px',
};

const MultiShopLiveTooltip = ({ active, payload, label, formatMoney }) => {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => {
    if (a.dataKey === 'overallGmv') return -2;
    if (a.dataKey === 'liveGmv') return -1;
    if (b.dataKey === 'overallGmv' || b.dataKey === 'liveGmv') return 1;
    return (Number(b.value) || 0) - (Number(a.value) || 0);
  });

  return (
    <div
      style={{
        ...CHART_TOOLTIP_STYLE,
        minWidth: 220,
      }}
    >
      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-soft, #475569)', marginBottom: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((item) => {
          const isTotal = item.dataKey === 'liveGmv' || item.dataKey === 'overallGmv';
          return (
            <div
              key={item.dataKey || item.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: '0.8125rem',
                paddingBottom: isTotal && sorted.length > 1 ? 5 : undefined,
                borderBottom: isTotal && sorted.length > 1 ? '1px dashed #e2e8f0' : undefined,
                marginBottom: isTotal && sorted.length > 1 ? 2 : undefined,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: isTotal ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: item.color || item.stroke,
                    flexShrink: 0,
                  }}
                />
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isTotal ? 700 : 500 }}>
                  {item.name}
                </span>
              </span>
              <strong style={{ fontWeight: isTotal ? 700 : 600, color: 'var(--color-text)' }}>
                {formatMoney ? formatMoney(item.value) : item.value}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LiveAnalytics = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const { formatMoney: formatPreferredMoney } = useMoneyFormatter(locale);

  // Filters & State
  const initialRange = useMemo(() => rangeForDays(7), []);
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [periodPreset, setPeriodPreset] = useState('7d');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'channels' | 'products' | 'orders'
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [sourceType, setSourceType] = useState('all'); // 'all' | 'external' | 'shop'
  const [selectedSession, setSelectedSession] = useState(null);
  const [editingSession, setEditingSession] = useState(null);
  const [hostAssignments, setHostAssignments] = useState({});
  const appSession = useSession();
  const canEditHost = hasPermission(appSession, 'admin.shops.manage');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderPage, setOrderPage] = useState(1);
  const ordersPerPage = 15;
  const [sessionPage, setSessionPage] = useState(1);
  const sessionsPerPage = 20;

  const invalidRange = !startDate || !endDate || startDate >= endDate;

  // Shop inventory
  const inventory = useShopInventory({
    allowAll: true,
    onError: setError,
    t,
  });
  const {
    changeSelectedShop,
    channels: internalChannels = [],
    loading: inventoryLoading,
    missingAnalyticsScope,
    selectedShop,
    selectedShopId,
    shops,
    tokenExpired,
  } = inventory;

  const internalChannelUsernames = useMemo(() => {
    const set = new Set();
    (Array.isArray(internalChannels) ? internalChannels : []).forEach((c) => {
      const u = String(c.username || '').trim().toLowerCase().replace(/^@+/, '');
      if (u) set.add(u);
    });
    (Array.isArray(shops) ? shops : []).forEach((s) => {
      const u = String(s.avatar_channel?.username || '').trim().toLowerCase().replace(/^@+/, '');
      if (u) set.add(u);
    });
    return set;
  }, [internalChannels, shops]);

  const shopsById = useMemo(() => {
    const map = new Map();
    (Array.isArray(shops) ? shops : []).forEach((s) => {
      if (s?.id) map.set(String(s.id), s);
    });
    return map;
  }, [shops]);

  const allShopsSelected = selectedShopId === 'all';
  const isCrossBorder = useMemo(() => {
    if (!allShopsSelected || !shops.length) return false;
    const regions = new Set(
      shops
        .map((shop) => String(shop.region || shop.authorization?.app?.region || 'VN').trim().toUpperCase())
        .filter(Boolean),
    );
    return regions.size > 1;
  }, [allShopsSelected, shops]);

  const currency = isCrossBorder ? 'USD' : 'LOCAL';

  // Analytics Snapshot Data
  const analytics = useShopAnalyticsData({
    currency,
    endDate,
    invalidRange,
    managementOnly: false,
    missingAnalyticsScope,
    onError: setError,
    selectedShopId,
    shops,
    startDate,
    t,
    tokenExpired,
    videoOnly: false,
  });

  const {
    analyticsLoading,
    hasComparison,
    intervals,
    shopSeries,
    snapshot,
    totals,
  } = analytics;

  const isMultiShop = allShopsSelected && Array.isArray(shopSeries) && shopSeries.length > 1;

  useEffect(() => {
    const controller = new AbortController();
    setHostAssignments({});
    fetchLiveHosts(selectedShopId, controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      setHostAssignments(Object.fromEntries(rows.map((row) => [`${row.shop_id}:${row.session_id}`, row])));
    }).catch((err) => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [selectedShopId]);

  // Multi-shop compare state
  const [toggledOffShopIds, setToggledOffShopIds] = useState(() => new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const compareWrapperRef = useRef(null);

  useEffect(() => {
    setToggledOffShopIds(new Set());
    setSelectedChannel('all');
    setSourceType('all');
  }, [selectedShopId]);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const handleClickOutside = (event) => {
      if (
        event.key === 'Escape'
        || (event.type === 'pointerdown' && !compareWrapperRef.current?.contains(event.target))
      ) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('keydown', handleClickOutside);
    return () => {
      window.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('keydown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const isVisible = useCallback((shopId) => !toggledOffShopIds.has(shopId), [toggledOffShopIds]);
  const isTotalVisible = !toggledOffShopIds.has(TOTAL_SERIES_ID);

  const toggleShop = useCallback((shopId) => {
    setToggledOffShopIds((prev) => {
      const next = new Set(prev);
      if (next.has(shopId)) next.delete(shopId);
      else next.add(shopId);
      return next;
    });
  }, []);

  const toggleTotal = useCallback(() => {
    setToggledOffShopIds((prev) => {
      const next = new Set(prev);
      if (next.has(TOTAL_SERIES_ID)) next.delete(TOTAL_SERIES_ID);
      else next.add(TOTAL_SERIES_ID);
      return next;
    });
  }, []);

  const selectAllShops = useCallback(() => {
    setToggledOffShopIds(new Set());
  }, []);

  const deselectAllShops = useCallback(() => {
    setToggledOffShopIds(new Set([TOTAL_SERIES_ID, ...(shopSeries || []).map((s) => s.shopId)]));
  }, [shopSeries]);

  const totalCount = (shopSeries || []).length;
  const visibleCount = (shopSeries || []).filter((s) => isVisible(s.shopId)).length;

  // Currency & formatting
  const displayCurrency = intervals.find((row) => row?.gmv?.currency && row?.gmv?.currency !== 'LOCAL')?.gmv?.currency
    || (selectedShop?.region === 'MY' ? 'MYR' : 'VND');

  const formatMoney = useCallback((value, currencyCode = displayCurrency) => (
    formatPreferredMoney(value, currencyCode === 'LOCAL' ? displayCurrency : currencyCode)
  ), [displayCurrency, formatPreferredMoney]);

  const formatNumber = useCallback((value) => (
    numericValue(value).toLocaleString(locale, { maximumFractionDigits: 0 })
  ), [locale]);

  const formatPercent = useCallback((value) => (
    `${numericValue(value).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
  ), [locale]);

  const formatMoneyValues = useCallback((values) => {
    const moneyValues = (Array.isArray(values) ? values : [values])
      .filter((money) => money && (typeof money === 'object' ? money.amount !== undefined && money.amount !== null && money.amount !== '' : Number.isFinite(Number(money))));
    if (!moneyValues.length) return '—';
    return moneyValues.map((money) => {
      const amount = Number(typeof money === 'object' ? money?.amount : money);
      const curr = (typeof money === 'object' ? money?.currency : null) || displayCurrency;
      return formatMoney(amount, curr);
    }).join(' + ');
  }, [formatMoney, displayCurrency]);

  // Live Orders from Database
  const [liveOrders, setLiveOrders] = useState([]);
  const [liveOrdersLoading, setLiveOrdersLoading] = useState(false);
  const [livePerformances, setLivePerformances] = useState([]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    if (invalidRange) {
      setLiveOrders([]);
      setLiveOrdersLoading(false);
      return () => controller.abort();
    }

    const fetchOrders = async () => {
      setLiveOrdersLoading(true);
      try {
        const effectiveEndExclusive = periodPreset === 'custom' ? endDate : shiftDate(endDate, 1);
        let results = [];
        if (selectedShopId === 'all') {
          const eligibleShops = shops.filter((s) => s.id);
          const settled = await Promise.allSettled(
            eligibleShops.map((shop) => {
              const startTime = shopDateUnix(startDate, shop?.region);
              const endTime = shopDateUnix(effectiveEndExclusive, shop?.region);
              return fetchTikTokSellerAffiliateOrders(shop.id, {
                source: 'db',
                contentType: 'LIVE',
                pageSize: 100,
                ...(Number.isFinite(startTime) ? { startTime } : {}),
                ...(Number.isFinite(endTime) ? { endTime } : {}),
                signal: controller.signal,
              });
            }),
          );
          settled.forEach((res, index) => {
            if (res.status === 'fulfilled' && Array.isArray(res.value?.orders)) {
              const shopName = eligibleShops[index]?.name || '';
              const shopId = eligibleShops[index]?.id;
              const shopOrders = res.value.orders.map((o) => ({ ...o, shopName, shop_id: o.shop_id || shopId }));
              results.push(...shopOrders);
            }
          });
        } else if (selectedShopId) {
          const startTime = shopDateUnix(startDate, selectedShop?.region);
          const endTime = shopDateUnix(effectiveEndExclusive, selectedShop?.region);
          const res = await fetchTikTokSellerAffiliateOrders(selectedShopId, {
            source: 'db',
            contentType: 'LIVE',
            pageSize: 100,
            ...(Number.isFinite(startTime) ? { startTime } : {}),
            ...(Number.isFinite(endTime) ? { endTime } : {}),
            signal: controller.signal,
          });
          if (Array.isArray(res?.orders)) {
            const shopName = selectedShop?.name || '';
            results = res.orders.map((o) => ({ ...o, shopName, shop_id: o.shop_id || selectedShopId }));
          }
        }

        if (active) {
          setLiveOrders(results);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[LiveAnalytics] Failed to fetch live orders:', err);
        }
      } finally {
        if (active) setLiveOrdersLoading(false);
      }
    };

    fetchOrders();

    return () => {
      active = false;
      controller.abort();
    };
  }, [endDate, invalidRange, periodPreset, selectedShop, selectedShopId, shops, startDate]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    if (invalidRange) {
      setLivePerformances([]);
      return () => controller.abort();
    }

    const fetchPerformance = async () => {
      const effectiveEndExclusive = periodPreset === 'custom' ? endDate : shiftDate(endDate, 1);
      const eligibleShops = selectedShopId === 'all'
        ? shops.filter((shop) => shop.id)
        : (selectedShop?.id ? [selectedShop] : []);
      try {
        const settled = await Promise.allSettled(eligibleShops.map(async (shop) => {
          const payload = await fetchTikTokShopLivePerformance(shop.id, {
            startDate,
            endDate: effectiveEndExclusive,
            currency,
            signal: controller.signal,
          });
          return (Array.isArray(payload?.lives) ? payload.lives : []).map((live) => ({
            ...live,
            shopId: shop.id,
          }));
        }));
        if (!active) return;
        setLivePerformances(settled.flatMap((result) => (
          result.status === 'fulfilled' ? result.value : []
        )));
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[LiveAnalytics] Failed to fetch live performance:', err);
        }
      }
    };

    fetchPerformance();

    return () => {
      active = false;
      controller.abort();
    };
  }, [currency, endDate, invalidRange, periodPreset, selectedShop, selectedShopId, shops, startDate]);

  const { livePerformanceByShopSession, livePerformancesByShop } = useMemo(() => {
    const bySession = new Map();
    const byShop = new Map();
    livePerformances.forEach((live) => {
      if (!live?.live_id) return;
      bySession.set(`${live.shopId}:${live.live_id}`, live);
      if (!live.shopId) return;
      const shopKey = String(live.shopId);
      const shopLives = byShop.get(shopKey) || [];
      shopLives.push(live);
      byShop.set(shopKey, shopLives);
    });
    return { livePerformanceByShopSession: bySession, livePerformancesByShop: byShop };
  }, [livePerformances]);

  // Period / Date filter handlers
  const changeCustomDate = (setter, currentValue) => (nextValue) => {
    if (nextValue === currentValue) return;
    setter(nextValue);
  };

  const changeCustomEndDate = (selectedDate) => {
    const nextEndDate = shiftDate(selectedDate, 1);
    if (nextEndDate !== endDate) setEndDate(nextEndDate);
  };

  const changePeriodPreset = (eventOrValue) => {
    const nextPreset = typeof eventOrValue === 'string' ? eventOrValue : eventOrValue?.target?.value;
    setPeriodPreset(nextPreset);
    if (nextPreset === 'custom') return;
    const days = Number(nextPreset.replace(/d$/, ''));
    if (!Number.isFinite(days) || days <= 0) return;
    const nextRange = rangeForDays(days);
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
  };

  const periodOptions = useMemo(() => [
    { value: '7d', label: t('shopAnalytics.period7d') },
    { value: '30d', label: t('shopAnalytics.period30d') },
    { value: '90d', label: t('shopAnalytics.period90d') },
    { value: 'custom', label: t('shopAnalytics.periodCustom') },
  ], [t]);

  // Daily Trend Data from Snapshot Intervals
  const liveIntervals = useMemo(() => {
    return intervals.map((row) => {
      const liveGmv = extractLiveGmv(row);
      const overallGmv = moneyValue(row?.gmv);
      const liveShare = overallGmv > 0 ? (liveGmv / overallGmv) * 100 : 0;
      const breakdowns = Array.isArray(row?.gmv_breakdowns) && row.gmv_breakdowns.length > 0
        ? row.gmv_breakdowns
        : (Array.isArray(row?.gmv?.breakdowns) ? row.gmv.breakdowns : []);
      const liveItem = breakdowns.find((b) => b?.type === 'LIVE' || b?.content_type === 'LIVE');

      const entry = {
        date: formatDateOnly(row.start_date, row.start_date),
        rawDate: row.start_date,
        liveGmv,
        overallGmv,
        liveShare,
        orders: row.orders || 0,
        unitsSold: row.units_sold || 0,
        currency: liveItem?.currency || row.gmv?.currency || displayCurrency,
      };

      if (isMultiShop && Array.isArray(shopSeries)) {
        shopSeries.forEach((s) => {
          const match = Array.isArray(s.intervals)
            ? s.intervals.find((i) => i.start_date === row.start_date || String(i.start_date).slice(0, 10) === String(row.start_date).slice(0, 10))
            : null;
          const sLiveGmv = match ? extractLiveGmv(match) : 0;
          const sOverallGmv = match ? moneyValue(match.gmv) : 0;
          entry[`shop_${s.shopId}_liveGmv`] = sLiveGmv;
          entry[`shop_${s.shopId}_overallGmv`] = sOverallGmv;
        });
      }

      return entry;
    });
  }, [intervals, displayCurrency, isMultiShop, shopSeries]);

  // Comparison Live GMV from Previous Period
  const comparisonLiveGmv = useMemo(() => {
    const compIntervals = snapshot?.metrics?.comparison_intervals || [];
    return compIntervals.reduce((sum, row) => sum + extractLiveGmv(row), 0);
  }, [snapshot]);

  // Aggregated Sessions and Top Products from Live Orders
  const { sessionList, topProductsList, liveOrderRows } = useMemo(() => {
    const sessions = {};
    const productMap = {};
    const flatRows = [];

    liveOrders.forEach((order) => {
      const skus = Array.isArray(order.skus) ? order.skus : [];
      const liveSkus = skus.filter((s) => (
        ['LIVE', 'PRE_LIVE', 'LIVESTREAM', 'LIVE_STREAM'].includes(String(s.content_type || '').toUpperCase())
      ));

      if (!liveSkus.length) return;

      const orderCreateTime = order.create_time
        ? (typeof order.create_time === 'number' ? order.create_time * 1000 : Date.parse(order.create_time))
        : null;

      const totalCommission = liveSkus.reduce((sum, s) => {
        const comm = s.raw_data?.estimated_paid_commission?.amount || s.estimated_paid_commission?.amount || s.estimated_commission;
        return sum + (moneyValue(comm) || 0);
      }, 0);
      const commSku = liveSkus.find((s) => s.raw_data?.commission_rate || s.commission_rate);
      const commissionRate = commSku
        ? (Number(commSku.raw_data?.commission_rate || commSku.commission_rate) / 100)
        : 0;
      const settlementStatus = liveSkus[0]?.settlement_status || liveSkus[0]?.raw_data?.settlement_status || '';
      const currentShop = shopsById.get(String(order.shop_id || order.shopId)) || selectedShop;
      const orderCreatorUsername = liveSkus[0]?.creator_username || order.creator_username || '';
      const orderIsExternal = resolveLiveSessionSource({
        creatorUsername: orderCreatorUsername,
        shopName: order.shopName || currentShop?.name,
        avatarChannelUsername: currentShop?.avatar_channel?.username,
        internalChannelUsernames,
        totalCommission,
        commissionRate,
      });

      flatRows.push({
        rawOrder: order,
        orderId: order.id || order.order_id,
        shopId: order.shop_id || order.shopId,
        shopName: order.shopName,
        createTime: orderCreateTime,
        status: order.order_status || order.status || 'COMPLETED',
        buyerEmail: order.buyer_email,
        skus: liveSkus,
        creatorUsername: orderCreatorUsername,
        isExternal: orderIsExternal,
        sessionId: String(liveSkus[0]?.content_id || liveSkus[0]?.room_id || 'unknown'),
        totalGmv: liveSkus.reduce((sum, s) => sum + (moneyValue(s.price) * (Number(s.quantity) || 1)), 0),
        totalCommission,
        commissionRate,
        settlementStatus,
        currency: liveSkus[0]?.currency || order.currency || displayCurrency,
      });

      liveSkus.forEach((sku) => {
        const cid = String(sku.content_id || sku.room_id || 'unknown');
        const shopId = order.shop_id || order.shopId;
        const sessionKey = `${shopId}:${cid}`;
        const qty = Number(sku.quantity) || 1;
        const gmv = (moneyValue(sku.price) || 0) * qty;
        const creatorUsername = sku.creator_username || order.creator_username || (order.shopName ? order.shopName.toLowerCase().replace(/\s+/g, '.') : 'shop');
        const creatorNickname = sku.creator_nickname || sku.raw_data?.creator_nickname || sku.raw_data?.creator?.nickname || order.shopName || 'Shop';
        const creatorAvatar = sku.creator_avatar_url || sku.raw_data?.creator_avatar_url || sku.raw_data?.creator?.avatar_url;

        const isExternal = resolveLiveSessionSource({
          creatorUsername,
          shopName: order.shopName || currentShop?.name,
          avatarChannelUsername: currentShop?.avatar_channel?.username,
          internalChannelUsernames,
          totalCommission,
          commissionRate,
        });

        // Group Session
        if (!sessions[sessionKey]) {
          sessions[sessionKey] = {
            sessionId: cid,
            sessionKey,
            shopId,
            creatorUsername,
            creatorNickname,
            creatorAvatar,
            currency: sku.currency || displayCurrency,
            orderIds: new Set(),
            totalQuantity: 0,
            totalGmv: 0,
            totalCommission: 0,
            isExternal,
            products: {},
            firstTime: orderCreateTime,
            lastTime: orderCreateTime,
            orders: [],
          };
        }

        const s = sessions[sessionKey];
        s.orderIds.add(order.id || order.order_id);
        s.totalQuantity += qty;
        s.totalGmv += gmv;
        s.totalCommission += totalCommission;
        if (isExternal) s.isExternal = true;
        if (orderCreateTime && (!s.firstTime || orderCreateTime < s.firstTime)) s.firstTime = orderCreateTime;
        if (orderCreateTime && (!s.lastTime || orderCreateTime > s.lastTime)) s.lastTime = orderCreateTime;
        if (!s.orders.some((o) => (o.id || o.order_id) === (order.id || order.order_id))) {
          s.orders.push(order);
        }

        const pid = sku.product_id;
        if (pid) {
          if (!s.products[pid]) {
            s.products[pid] = {
              productId: pid,
              name: sku.product_name,
              imageUrl: sku.product_image || sku.image_url || sku.raw_data?.product_image || sku.raw_data?.sku_image,
              quantity: 0,
              gmv: 0,
            };
          }
          s.products[pid].quantity += qty;
          s.products[pid].gmv += gmv;
        }

        // Group Global Product
        if (pid) {
          if (!productMap[pid]) {
            productMap[pid] = {
              productId: pid,
              name: sku.product_name,
              imageUrl: sku.product_image || sku.image_url || sku.raw_data?.product_image || sku.raw_data?.sku_image,
              quantity: 0,
              gmv: 0,
              orderIds: new Set(),
              currency: sku.currency || displayCurrency,
            };
          }
          productMap[pid].quantity += qty;
          productMap[pid].gmv += gmv;
          productMap[pid].orderIds.add(order.id || order.order_id);
        }
      });
    });

    livePerformances.forEach((live) => {
      if (!live?.live_id || !live.shopId) return;
      const sessionKey = `${live.shopId}:${live.live_id}`;
      if (!sessions[sessionKey]) {
        const alreadyMatched = Object.values(sessions).some((s) => {
          const matchedPerf = livePerformanceByShopSession.get(s.sessionKey)
            || findLivePerformanceForSession(livePerformancesByShop.get(String(s.shopId)), s);
          return matchedPerf?.live_id === live.live_id;
        });
        if (!alreadyMatched) {
          const currentShop = shopsById.get(String(live.shopId)) || selectedShop;
          const isExternal = resolveLiveSessionSource({
            creatorUsername: live.creator_username,
            authorType: live.author_type,
            shopName: currentShop?.name,
            avatarChannelUsername: currentShop?.avatar_channel?.username,
            internalChannelUsernames,
          });
          const explicitDuration = live.duration ?? live.duration_seconds;
          const startMs = live.start_time;
          let endMs = live.end_time;
          if (startMs && explicitDuration && (!endMs || endMs <= startMs)) {
            endMs = startMs + explicitDuration * 1000;
          }
          sessions[sessionKey] = {
            sessionId: live.live_id,
            sessionKey,
            shopId: live.shopId,
            creatorUsername: live.creator_username || 'shop',
            creatorNickname: live.creator_nickname || live.creator_username || 'Shop',
            creatorAvatar: null,
            currency: displayCurrency,
            orderIds: new Set(),
            totalQuantity: 0,
            totalGmv: 0,
            totalCommission: 0,
            isExternal,
            products: {},
            firstTime: startMs,
            lastTime: endMs,
            durationSec: explicitDuration || calculateDurationSeconds(startMs, endMs),
            orders: [],
          };
        }
      }
    });

    const sessionArr = Object.values(sessions).map((sess) => {
      const performance = livePerformanceByShopSession.get(sess.sessionKey)
        || findLivePerformanceForSession(livePerformancesByShop.get(String(sess.shopId)), sess);
      const explicitDuration = performance?.duration ?? performance?.duration_seconds ?? sess.durationSec;
      const firstTime = performance?.start_time || sess.firstTime;
      let lastTime = performance?.end_time || sess.lastTime;
      if (firstTime && explicitDuration && (!lastTime || lastTime <= firstTime)) {
        lastTime = firstTime + explicitDuration * 1000;
      }
      const durationSec = calculateDurationSeconds(firstTime, lastTime, explicitDuration);
      const { host, hostSource } = resolveLiveSessionHost(
        hostAssignments[sess.sessionKey] || null,
        performance?.auto_host || null,
      );
      const totalComments = extractSessionComments(performance, sess);
      const currentShop = shopsById.get(String(sess.shopId)) || selectedShop;
      const isExternal = resolveLiveSessionSource({
        creatorUsername: sess.creatorUsername,
        authorType: performance?.author_type,
        shopName: currentShop?.name,
        avatarChannelUsername: currentShop?.avatar_channel?.username,
        internalChannelUsernames,
        totalCommission: sess.totalCommission,
      });

      return {
        ...sess,
        isExternal,
        firstTime,
        lastTime,
        durationSec,
        host,
        hostSource,
        liveTitle: performance?.title || '',
        hashtags: performance?.hashtags || [],
        orderCount: sess.orderIds.size,
        totalComments,
        productsList: Object.values(sess.products).sort((a, b) => b.gmv - a.gmv),
      };
    }).sort((a, b) => (b.firstTime || 0) - (a.firstTime || 0));

    const productsArr = Object.values(productMap).map((p) => ({
      ...p,
      orderCount: p.orderIds.size,
    })).sort((a, b) => b.gmv - a.gmv);

    return {
      sessionList: sessionArr,
      topProductsList: productsArr,
      liveOrderRows: flatRows.sort((a, b) => (b.createTime || 0) - (a.createTime || 0)),
    };
  }, [liveOrders, displayCurrency, hostAssignments, livePerformanceByShopSession, livePerformancesByShop, internalChannelUsernames, shopsById, selectedShop]);

  // Overall KPI totals
  const totalSnapshotLiveGmv = useMemo(() => (
    liveIntervals.reduce((sum, item) => sum + item.liveGmv, 0)
  ), [liveIntervals]);

  const ordersLiveGmv = useMemo(() => (
    sessionList.reduce((sum, s) => sum + s.totalGmv, 0)
  ), [sessionList]);

  // Use snapshot live gmv if available, fallback to orders gmv
  const liveGmv = totalSnapshotLiveGmv > 0 ? totalSnapshotLiveGmv : ordersLiveGmv;
  const totalShopGmv = totals.gmv || 0;
  const liveGmvShare = totalShopGmv > 0 ? (liveGmv / totalShopGmv) * 100 : 0;

  const liveGmvChange = useMemo(() => (
    percentageChange(totalSnapshotLiveGmv, comparisonLiveGmv, hasComparison && comparisonLiveGmv > 0)
  ), [totalSnapshotLiveGmv, comparisonLiveGmv, hasComparison]);

  // Live orders count (actual from DB or estimated proportional)
  const actualLiveOrdersCount = liveOrderRows.length;
  const estimatedLiveOrdersCount = totals.orders && liveGmvShare > 0
    ? Math.round((totals.orders * liveGmvShare) / 100)
    : actualLiveOrdersCount;
  const displayLiveOrders = estimatedLiveOrdersCount || actualLiveOrdersCount;

  // Live units sold
  const actualLiveUnits = sessionList.reduce((sum, s) => sum + s.totalQuantity, 0);
  const estimatedLiveUnits = totals.unitsSold && liveGmvShare > 0
    ? Math.round((totals.unitsSold * liveGmvShare) / 100)
    : actualLiveUnits;
  const displayUnitsSold = estimatedLiveUnits || actualLiveUnits;

  // Live AOV
  const liveAov = displayLiveOrders > 0 ? liveGmv / displayLiveOrders : 0;

  // Distinct hosts / creators
  const distinctHosts = useMemo(() => {
    const hosts = new Set(sessionList.map((s) => s.host ? `user:${s.host.id}` : s.creatorUsername).filter(Boolean));
    return hosts.size;
  }, [sessionList]);

  // Total comments across all sessions
  const totalLiveComments = useMemo(() => (
    sessionList.reduce((sum, s) => sum + (s.totalComments || 0), 0)
  ), [sessionList]);

  // Channel aggregation (Kênh Live)
  const channelList = useMemo(() => {
    const channelMap = {};
    sessionList.forEach((sess) => {
      const username = (sess.creatorUsername || 'unknown').toLowerCase();
      if (!channelMap[username]) {
        channelMap[username] = {
          username: sess.creatorUsername || 'unknown',
          nickname: sess.creatorNickname || sess.creatorUsername || '—',
          avatar: sess.creatorAvatar,
          isExternal: Boolean(sess.isExternal),
          sessionsCount: 0,
          totalDurationSec: 0,
          orderCount: 0,
          totalQuantity: 0,
          totalGmv: 0,
          totalCommission: 0,
          totalComments: 0,
          currency: sess.currency,
          sessions: [],
        };
      }
      const c = channelMap[username];
      c.sessionsCount += 1;
      c.totalDurationSec += (sess.durationSec || 0);
      c.orderCount += (sess.orderCount || 0);
      c.totalQuantity += (sess.totalQuantity || 0);
      c.totalGmv += (sess.totalGmv || 0);
      c.totalCommission += (sess.totalCommission || 0);
      if (sess.totalComments !== null && sess.totalComments !== undefined) {
        c.totalComments += sess.totalComments;
      }
      if (sess.isExternal) c.isExternal = true;
      c.sessions.push(sess);
    });

    return Object.values(channelMap).sort((a, b) => b.totalGmv - a.totalGmv);
  }, [sessionList]);

  // Source type options
  const sourceTypeOptions = useMemo(() => [
    { value: 'all', label: t('liveAnalytics.allSources', 'Tất cả nguồn live') },
    { value: 'external', label: t('liveAnalytics.externalKoc', 'Người ngoài live (KOC / Affiliate)') },
    { value: 'shop', label: t('liveAnalytics.shopInternal', 'Kênh nội bộ Shop') },
  ], [t]);

  // Filtered channel list by source & search
  const filteredChannelList = useMemo(() => {
    let list = channelList;
    if (sourceType === 'external') list = list.filter((c) => c.isExternal);
    else if (sourceType === 'shop') list = list.filter((c) => !c.isExternal);
    if (!searchKeyword.trim()) return list;
    const term = searchKeyword.trim().toLowerCase();
    return list.filter((c) => (
      c.username.toLowerCase().includes(term)
      || (c.nickname && c.nickname.toLowerCase().includes(term))
    ));
  }, [channelList, sourceType, searchKeyword]);

  // Filtered sessions by sourceType & channel
  const sourceFilteredSessions = useMemo(() => {
    return sessionList.filter((s) => {
      if (sourceType === 'external' && !s.isExternal) return false;
      if (sourceType === 'shop' && s.isExternal) return false;
      if (selectedChannel && selectedChannel !== 'all') {
        if ((s.creatorUsername || '').toLowerCase() !== selectedChannel.toLowerCase()) return false;
      }
      return true;
    });
  }, [sessionList, sourceType, selectedChannel]);

  // Filtered sessions by search keyword
  const filteredSessions = useMemo(() => {
    if (!searchKeyword.trim()) return sourceFilteredSessions;
    const term = searchKeyword.trim().toLowerCase();
    return sourceFilteredSessions.filter((s) => (
      s.sessionId.toLowerCase().includes(term)
      || s.creatorUsername.toLowerCase().includes(term)
      || (s.creatorNickname && s.creatorNickname.toLowerCase().includes(term))
      || s.host?.name?.toLowerCase().includes(term)
      || s.host?.email?.toLowerCase().includes(term)
      || s.productsList.some((p) => p.name && p.name.toLowerCase().includes(term))
    ));
  }, [sourceFilteredSessions, searchKeyword]);

  // Paginated live sessions
  const totalSessionPages = Math.ceil(filteredSessions.length / sessionsPerPage) || 1;
  const paginatedSessions = useMemo(() => {
    const startIndex = (sessionPage - 1) * sessionsPerPage;
    return filteredSessions.slice(startIndex, startIndex + sessionsPerPage);
  }, [filteredSessions, sessionPage]);

  useEffect(() => {
    setSessionPage(1);
  }, [endDate, searchKeyword, selectedChannel, selectedShopId, sourceType, startDate]);

  useEffect(() => {
    setSessionPage((page) => Math.min(page, totalSessionPages));
  }, [totalSessionPages]);

  // Filtered products by source, channel & search keyword
  const filteredProducts = useMemo(() => {
    let prods = topProductsList;
    if (sourceType !== 'all' || (selectedChannel && selectedChannel !== 'all')) {
      const allowedProductIds = new Set(sourceFilteredSessions.flatMap((s) => s.productsList.map((p) => p.productId)));
      prods = prods.filter((p) => allowedProductIds.has(p.productId));
    }
    if (!searchKeyword.trim()) return prods;
    const term = searchKeyword.trim().toLowerCase();
    return prods.filter((p) => p.name && p.name.toLowerCase().includes(term));
  }, [sourceFilteredSessions, searchKeyword, selectedChannel, sourceType, topProductsList]);

  // Filtered orders by source, channel & search keyword
  const channelFilteredOrders = useMemo(() => {
    let orders = liveOrderRows;
    if (sourceType !== 'all') {
      const allowedSessionIds = new Set(sourceFilteredSessions.map((s) => s.sessionId));
      orders = orders.filter((o) => (
        allowedSessionIds.has(String(o.sessionId || ''))
        || o.skus.some((s) => allowedSessionIds.has(String(s.content_id || s.room_id || '')))
        || (sourceType === 'external' ? o.isExternal : !o.isExternal)
      ));
    }
    if (selectedChannel && selectedChannel !== 'all') {
      const target = selectedChannel.toLowerCase();
      orders = orders.filter((o) => (
        (o.creatorUsername || '').toLowerCase() === target
        || o.skus.some((s) => (s.creator_username || '').toLowerCase() === target)
        || (o.rawOrder?.creator_username || '').toLowerCase() === target
      ));
    }
    return orders;
  }, [liveOrderRows, selectedChannel, sourceFilteredSessions, sourceType]);

  const filteredOrders = useMemo(() => {
    if (!searchKeyword.trim()) return channelFilteredOrders;
    const term = searchKeyword.trim().toLowerCase();
    return channelFilteredOrders.filter((o) => (
      o.orderId.toLowerCase().includes(term)
      || o.skus.some((s) => (
        (s.creator_username && s.creator_username.toLowerCase().includes(term))
        || (s.product_name && s.product_name.toLowerCase().includes(term))
        || (s.content_id && s.content_id.toLowerCase().includes(term))
      ))
    ));
  }, [channelFilteredOrders, searchKeyword]);

  // Paginated live orders
  const paginatedOrders = useMemo(() => {
    const startIndex = (orderPage - 1) * ordersPerPage;
    return filteredOrders.slice(startIndex, startIndex + ordersPerPage);
  }, [filteredOrders, orderPage]);

  const totalOrderPages = Math.ceil(filteredOrders.length / ordersPerPage) || 1;

  // Chart Tooltip matching app theme
  const renderChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const liveItem = payload.find((p) => p.dataKey === 'liveGmv');
    const totalItem = payload.find((p) => p.dataKey === 'overallGmv');
    const itemLiveVal = Number(liveItem?.value) || 0;
    const itemTotalVal = Number(totalItem?.value) || 0;
    const itemShare = itemTotalVal > 0 ? (itemLiveVal / itemTotalVal) * 100 : 0;

    return (
      <div style={CHART_TOOLTIP_STYLE}>
        <strong style={{ display: 'block', marginBottom: 6, color: '#17243d', fontSize: '0.875rem' }}>{label}</strong>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: 'var(--color-primary, #2f6fe4)', fontWeight: 700 }}>
          <span>LIVE GMV:</span>
          <span>{formatMoney(itemLiveVal)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: 'var(--color-muted, #718096)', fontWeight: 600, marginTop: 4 }}>
          <span>{t('liveAnalytics.total')}:</span>
          <span>{formatMoney(itemTotalVal)}</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-muted, #718096)', marginTop: 6, paddingTop: 4, borderTop: '1px solid #e2e9f3' }}>
          {t('liveAnalytics.liveShare')}: <strong>{formatPercent(itemShare)}</strong>
        </div>
      </div>
    );
  };

  const renderDelta = useCallback((change, fallbackText) => {
    if (analyticsLoading) return <span className="shop-analytics__change is-muted">{t('common.loading')}</span>;
    if (change === null || change === undefined) {
      if (fallbackText) return <span className="shop-analytics__change is-muted">{fallbackText}</span>;
      return <span className="shop-analytics__change is-muted">{t('shopAnalytics.noComparison')}</span>;
    }
    const favorable = change >= 0;
    const tone = change === 0 ? 'is-neutral' : favorable ? 'is-positive' : 'is-negative';
    const direction = change > 0 ? t('shopAnalytics.increased') : change < 0 ? t('shopAnalytics.decreased') : t('shopAnalytics.unchanged');
    return (
      <span className={`shop-analytics__change ${tone}`}>
        <span aria-hidden="true">{change > 0 ? '↑' : change < 0 ? '↓' : '→'}</span>
        {' '}{direction}{' '}{Math.abs(change).toLocaleString(locale, { maximumFractionDigits: 1 })}%{' '}{t('shopAnalytics.vsPrevious')}
      </span>
    );
  }, [analyticsLoading, locale, t]);

  return (
    <div className="page live-analytics">
      {/* Global Filters */}
      <ShopAnalyticsFilters
        endDate={endDate}
        invalidRange={invalidRange}
        loading={inventoryLoading}
        onEndDateChange={changeCustomEndDate}
        onPeriodChange={changePeriodPreset}
        onShopChange={changeSelectedShop}
        onStartDateChange={changeCustomDate(setStartDate, startDate)}
        periodOptions={periodOptions}
        periodPreset={periodPreset}
        selectedShopId={selectedShopId}
        shops={shops}
        startDate={startDate}
        t={t}
      />

      {error ? (
        <div className="section-card shop-analytics__error" role="alert">
          {error}
        </div>
      ) : null}

      {/* KPI Cards matching Overview Page */}
      <section className="page__stats shop-analytics__stats" aria-label={t('liveAnalytics.title')}>
        {/* KPI 1: Live GMV */}
        <article className="stat-card shop-analytics__stat shop-analytics__stat--gmv">
          <div className="shop-analytics__stat-heading">
            <p className="stat-card__label">{t('liveAnalytics.liveGmv')}</p>
            <span className="shop-analytics__stat-icon" aria-hidden="true">
              <AnalyticsIcon name="gmv" />
            </span>
          </div>
          <p className="stat-card__value">
            {analyticsLoading ? <span className="shop-analytics__value-skeleton" /> : formatMoney(liveGmv)}
          </p>
          {renderDelta(liveGmvChange, `${formatPercent(liveGmvShare)} ${t('liveAnalytics.pctOfTotal')}`)}
        </article>

        {/* KPI 2: Live Share % */}
        <article className="stat-card shop-analytics__stat shop-analytics__stat--liveShare">
          <div className="shop-analytics__stat-heading">
            <p className="stat-card__label">{t('liveAnalytics.liveShare')}</p>
            <span className="shop-analytics__stat-icon" aria-hidden="true" style={{ background: '#f1edff', color: '#7657e9' }}>
              <TrendingUp size={18} />
            </span>
          </div>
          <p className="stat-card__value">
            {analyticsLoading ? <span className="shop-analytics__value-skeleton" /> : formatPercent(liveGmvShare)}
          </p>
          <span className="shop-analytics__change is-muted">
            {t('liveAnalytics.pctOfTotal')} ({formatMoney(totalShopGmv)})
          </span>
        </article>

        {/* KPI 3: Live Orders */}
        <article className="stat-card shop-analytics__stat shop-analytics__stat--orders">
          <div className="shop-analytics__stat-heading">
            <p className="stat-card__label">{t('liveAnalytics.liveOrders')}</p>
            <span className="shop-analytics__stat-icon" aria-hidden="true">
              <AnalyticsIcon name="orders" />
            </span>
          </div>
          <p className="stat-card__value">
            {analyticsLoading ? <span className="shop-analytics__value-skeleton" /> : formatNumber(displayLiveOrders)}
          </p>
          <span className="shop-analytics__change is-muted">
            {t('liveAnalytics.liveOrdersDesc')}
          </span>
        </article>

        {/* KPI 4: Units Sold */}
        <article className="stat-card shop-analytics__stat shop-analytics__stat--unitsSold">
          <div className="shop-analytics__stat-heading">
            <p className="stat-card__label">{t('liveAnalytics.liveUnits')}</p>
            <span className="shop-analytics__stat-icon" aria-hidden="true">
              <AnalyticsIcon name="unitsSold" />
            </span>
          </div>
          <p className="stat-card__value">
            {analyticsLoading ? <span className="shop-analytics__value-skeleton" /> : formatNumber(displayUnitsSold)}
          </p>
          <span className="shop-analytics__change is-muted">
            {t('liveAnalytics.liveUnitsDesc')}
          </span>
        </article>

        {/* KPI 5: AOV */}
        <article className="stat-card shop-analytics__stat shop-analytics__stat--avgOrderValue">
          <div className="shop-analytics__stat-heading">
            <p className="stat-card__label">{t('liveAnalytics.liveAov')}</p>
            <span className="shop-analytics__stat-icon" aria-hidden="true">
              <AnalyticsIcon name="avgOrderValue" />
            </span>
          </div>
          <p className="stat-card__value">
            {analyticsLoading ? <span className="shop-analytics__value-skeleton" /> : formatMoney(liveAov)}
          </p>
          <span className="shop-analytics__change is-muted">
            {t('liveAnalytics.liveAovDesc')}
          </span>
        </article>

        {/* KPI 6: Live Sessions & Hosts */}
        <article className="stat-card shop-analytics__stat shop-analytics__stat--sessions">
          <div className="shop-analytics__stat-heading">
            <p className="stat-card__label">{t('liveAnalytics.liveSessions')}</p>
            <span className="shop-analytics__stat-icon" aria-hidden="true" style={{ background: '#f1edff', color: '#7657e9' }}>
              <Radio size={18} />
            </span>
          </div>
          <p className="stat-card__value">
            {liveOrdersLoading && !sessionList.length ? <span className="shop-analytics__value-skeleton" /> : formatNumber(sessionList.length)}
          </p>
          <span className="shop-analytics__change is-muted">
            <Users size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
            {distinctHosts} {t('liveAnalytics.liveHosts')}
            {totalLiveComments > 0 ? (
              <span style={{ marginLeft: 6 }}>
                · <MessageSquare size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 2 }} />
                {formatNumber(totalLiveComments)} {t('comments', 'bình luận')}
              </span>
            ) : null}
          </span>
        </article>
      </section>

      {/* Daily Live Revenue Chart Card */}
      <section className="live-analytics__chart-card">
        {isMultiShop ? (
          <div className="live-analytics__chart-header">
            <div className="shop-analytics__compare-wrapper" ref={compareWrapperRef}>
              <button
                type="button"
                className={`shop-analytics__compare-btn ${dropdownOpen ? 'is-open' : ''}`}
                onClick={() => setDropdownOpen((prev) => !prev)}
                aria-expanded={dropdownOpen}
              >
                <span>{t('shopAnalytics.shopDropdownBtn', 'Shop')}</span>
                <ChevronDown size={14} className={`shop-analytics__compare-chevron ${dropdownOpen ? 'is-open' : ''}`} />
              </button>
              {dropdownOpen ? (
                <div className="shop-analytics__compare-popover">
                  <div className="shop-analytics__compare-popover-header">
                    <span className="shop-analytics__compare-popover-title">
                      {visibleCount}/{totalCount}
                    </span>
                    <div className="shop-analytics__compare-popover-actions">
                      <button type="button" onClick={selectAllShops} className="shop-analytics__legend-action-btn">
                        {t('common.selectAll', 'Chọn tất cả')}
                      </button>
                      <span className="shop-analytics__legend-action-divider">·</span>
                      <button type="button" onClick={deselectAllShops} className="shop-analytics__legend-action-btn">
                        {t('common.deselectAll', 'Bỏ chọn')}
                      </button>
                    </div>
                  </div>
                  <div className="shop-analytics__compare-popover-list">
                    <label
                      className={`shop-analytics__compare-popover-item ${isTotalVisible ? 'is-active' : ''}`}
                      title={t('shopAnalytics.totalAllShops', 'Tổng')}
                    >
                      <input
                        type="checkbox"
                        checked={isTotalVisible}
                        onChange={toggleTotal}
                      />
                      <span className="shop-analytics__legend-indicator" style={{ backgroundColor: TOTAL_LINE_COLOR }} />
                      <span className="shop-analytics__compare-popover-name" style={{ fontWeight: 600 }}>
                        {t('shopAnalytics.totalAllShops', 'Tổng')}
                      </span>
                    </label>
                    <div className="shop-analytics__compare-popover-divider" />
                    {shopSeries.map((shop, idx) => {
                      const color = SHOP_PALETTE[idx % SHOP_PALETTE.length];
                      const shopVisible = isVisible(shop.shopId);
                      return (
                        <label
                          key={shop.shopId}
                          className={`shop-analytics__compare-popover-item ${shopVisible ? 'is-active' : ''}`}
                          title={shop.shopName}
                        >
                          <input
                            type="checkbox"
                            checked={shopVisible}
                            onChange={() => toggleShop(shop.shopId)}
                          />
                          <span className="shop-analytics__legend-indicator" style={{ backgroundColor: color }} />
                          <span className="shop-analytics__compare-popover-name">{shop.shopName}</span>
                          {shop.region ? (
                            <span className="shop-analytics__legend-badge">{shop.region}</span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div style={{ width: '100%', height: 320 }}>
          {liveIntervals.length ? (
            <ResponsiveContainer width="100%" height="100%">
              {isMultiShop ? (
                <ComposedChart data={liveIntervals} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e9f3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#718096', fontSize: 12 }}
                    axisLine={{ stroke: '#cbd8e8' }}
                    tickLine={false}
                    minTickGap={26}
                  />
                  <YAxis
                    tick={{ fill: '#718096', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                  />
                  <Tooltip content={<MultiShopLiveTooltip formatMoney={formatMoney} />} />
                  {isTotalVisible ? (
                    <Line
                      type="monotone"
                      dataKey="liveGmv"
                      name={t('shopAnalytics.totalAllShops', 'Tổng')}
                      stroke={TOTAL_LINE_COLOR}
                      strokeWidth={2.5}
                      dot={liveIntervals.length <= 14 ? { r: 3, fill: '#ffffff', stroke: TOTAL_LINE_COLOR, strokeWidth: 2 } : false}
                      activeDot={{ r: 5, strokeWidth: 2, fill: TOTAL_LINE_COLOR }}
                    />
                  ) : null}
                  {shopSeries.map((shop, idx) => {
                    if (!isVisible(shop.shopId)) return null;
                    const color = SHOP_PALETTE[idx % SHOP_PALETTE.length];
                    return (
                      <Line
                        key={shop.shopId}
                        type="monotone"
                        dataKey={`shop_${shop.shopId}_liveGmv`}
                        name={shop.shopName}
                        stroke={color}
                        strokeWidth={2.5}
                        dot={liveIntervals.length <= 14 ? { r: 3, fill: '#ffffff', stroke: color, strokeWidth: 2 } : false}
                        activeDot={{ r: 5, strokeWidth: 2, fill: color }}
                      />
                    );
                  })}
                </ComposedChart>
              ) : (
                <AreaChart data={liveIntervals} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="liveGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2f6fe4" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2f6fe4" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.16} />
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e9f3" />
                  <XAxis dataKey="date" tick={{ fill: '#718096', fontSize: 12 }} axisLine={{ stroke: '#cbd8e8' }} />
                  <YAxis
                    tick={{ fill: '#718096', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val)}
                  />
                  <Tooltip content={renderChartTooltip} />
                  <Area
                    type="monotone"
                    dataKey="overallGmv"
                    name={t('liveAnalytics.total')}
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#totalGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="liveGmv"
                    name={t('liveAnalytics.liveGmv')}
                    stroke="#2f6fe4"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#liveGradient)"
                    activeDot={{ r: 6, fill: '#2f6fe4', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="empty-state empty-state--compact" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span>{t('shopAnalytics.noData')}</span>
            </div>
          )}
        </div>
      </section>

      {/* Tabs & Search Toolbar */}
      <div className="live-analytics__toolbar">
        <div className="live-analytics__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            className={`live-analytics__tab ${activeTab === 'overview' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Radio size={15} />
            <span>{t('liveAnalytics.tabOverview')}</span>
            <span className="live-analytics__tab-count">{filteredSessions.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'channels'}
            className={`live-analytics__tab ${activeTab === 'channels' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('channels')}
          >
            <Users size={15} />
            <span>{t('liveAnalytics.tabChannels')}</span>
            <span className="live-analytics__tab-count">{filteredChannelList.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'products'}
            className={`live-analytics__tab ${activeTab === 'products' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            <Package size={15} />
            <span>{t('liveAnalytics.tabProducts')}</span>
            <span className="live-analytics__tab-count">{filteredProducts.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'orders'}
            className={`live-analytics__tab ${activeTab === 'orders' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <ShoppingBag size={15} />
            <span>{t('liveAnalytics.tabOrders')}</span>
            <span className="live-analytics__tab-count">{filteredOrders.length}</span>
          </button>
        </div>

        <div className="live-analytics__filter-group">
          <div className="live-channel-select" style={{ minWidth: 175 }} title={t('liveAnalytics.filterSource')}>
            <SelectDropdown
              id="live-source-select"
              options={sourceTypeOptions}
              value={sourceType}
              onChange={setSourceType}
              placeholder={t('liveAnalytics.allSources')}
              icon={<Radio size={14} />}
            />
          </div>

          {selectedChannel !== 'all' ? (
            <button
              type="button"
              className="chip chip--primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 10px', fontSize: '0.8125rem', height: 36 }}
              onClick={() => setSelectedChannel('all')}
              title={t('common.clearFilter', 'Bỏ lọc kênh')}
            >
              <span>@{selectedChannel}</span>
              <X size={14} />
            </button>
          ) : null}

          <div className="live-analytics__search-input">
            <Search size={15} color="var(--color-muted, #718096)" />
            <input
              type="text"
              placeholder={t('liveAnalytics.searchPlaceholder')}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
            {searchKeyword ? (
              <button
                type="button"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                onClick={() => setSearchKeyword('')}
              >
                <X size={14} color="var(--color-muted, #718096)" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Tab 1: Sessions & Hosts */}
      {activeTab === 'overview' ? (
        <section className="live-analytics__section">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('liveAnalytics.colTikTokAccount')}</th>
                  <th>{t('liveAnalytics.appHost')}</th>
                  <th>{t('liveAnalytics.colSessionId')}</th>
                  <th>{t('liveAnalytics.colTime')}</th>
                  <th className="cell-number">{t('liveAnalytics.colOrders')}</th>
                  <th className="cell-number">{t('liveAnalytics.colUnits')}</th>
                  <th className="cell-number">{t('liveAnalytics.colRevenue')}</th>
                  <th className="cell-number">{t('liveAnalytics.colComments')}</th>
                  <th>{t('liveAnalytics.colProducts')}</th>
                  <th className="cell-actions">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {liveOrdersLoading && !sessionList.length ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state empty-state--compact table-empty-state">
                        <span className="loading-dot" />
                        {t('liveAnalytics.loading')}
                      </div>
                    </td>
                  </tr>
                ) : null}

                {!liveOrdersLoading && !filteredSessions.length ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state empty-state--compact table-empty-state">
                        {t('liveAnalytics.noSessions')}
                      </div>
                    </td>
                  </tr>
                ) : null}

                {paginatedSessions.map((session) => (
                  <tr key={session.sessionKey} className="live-session-row" tabIndex={0}
                    aria-label={`${t('liveAnalytics.viewSessionDetail')}: ${session.sessionId}`}
                    onClick={() => setSelectedSession(session)}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        setSelectedSession(session);
                      }
                    }}>
                    <td>
                      <div className="live-host-cell">
                        {session.creatorAvatar ? (
                          <img
                            src={session.creatorAvatar}
                            alt={session.creatorUsername}
                            className="live-host-avatar"
                          />
                        ) : (
                          <div className="live-host-avatar">
                            {(session.creatorUsername || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="live-host-meta">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span className="live-host-name">
                              {session.creatorNickname || session.creatorUsername}
                            </span>
                            <span className="chip chip--neutral" style={{ fontSize: '0.6875rem', padding: '1px 6px' }}>
                              {session.isExternal ? t('liveAnalytics.badgeKoc') : t('liveAnalytics.badgeShop')}
                            </span>
                          </div>
                          <span className="live-host-username">@{session.creatorUsername}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {session.host ? (
                        <div className="live-host-cell">
                          <AppAvatar src={session.host.avatar_url} name={session.host.name || session.host.email} className="live-host-avatar" fallbackClassName="live-host-avatar--fallback" />
                          <div className="live-host-meta">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span className="live-host-name">{session.host.name || session.host.email}</span>
                              {session.hostSource === 'auto_hashtag' ? (
                                <span
                                  className="chip chip--neutral"
                                  style={{ fontSize: '0.6875rem', padding: '1px 6px' }}
                                  title={t('liveAnalytics.autoHostTitle')}
                                >
                                  {t('liveAnalytics.autoHost')}
                                </span>
                              ) : null}
                            </div>
                            {session.host.email ? <span className="live-host-username">{session.host.email}</span> : null}
                          </div>
                        </div>
                      ) : <span className="live-host-unassigned">{t('liveAnalytics.unassignedHost')}</span>}
                    </td>
                    <td>
                      <span className="code-pill font-mono" title={session.sessionId}>
                        {session.sessionId.length > 12 ? `${session.sessionId.slice(0, 12)}...` : session.sessionId}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                          {session.firstTime ? formatDisplayDateTime(session.firstTime, '—') : '—'}
                        </span>
                        {session.firstTime ? (
                          <span
                            className="live-duration-pill"
                            title={session.lastTime && session.lastTime > session.firstTime ? `${formatDisplayDateTime(session.firstTime)} → ${formatDisplayDateTime(session.lastTime)}` : ''}
                          >
                            <Clock size={12} />
                            {formatLiveDuration(session.firstTime, session.lastTime, language, session.durationSec, session.orderCount)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="cell-number">
                      <strong>{formatNumber(session.orderCount)}</strong>
                    </td>
                    <td className="cell-number">
                      {formatNumber(session.totalQuantity)}
                    </td>
                    <td className="cell-number" style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                      {formatMoney(session.totalGmv, session.currency)}
                    </td>
                    <td className="cell-number">
                      {session.totalComments !== null && session.totalComments !== undefined
                        ? formatNumber(session.totalComments)
                        : '—'}
                    </td>
                    <td>
                      <div className="live-products-preview">
                        {session.productsList.slice(0, 3).map((prod) => (
                          prod.imageUrl ? (
                            <img
                              key={prod.productId}
                              src={prod.imageUrl}
                              alt={prod.name}
                              title={prod.name}
                              className="live-product-thumb"
                            />
                          ) : null
                        ))}
                        {session.productsList.length > 3 ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                            +{session.productsList.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="cell-actions">
                      {canEditHost ? <button
                        type="button"
                        className="live-action-btn"
                        disabled={!session.shopId || session.sessionId === 'unknown'}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingSession(session);
                        }}
                        title={t('liveAnalytics.editHost')}
                        aria-label={t('liveAnalytics.editHost')}
                      >
                        <Pencil size={15} />
                      </button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalSessionPages > 1 ? (
            <Pagination
              currentPage={sessionPage}
              totalPages={totalSessionPages}
              onPageChange={setSessionPage}
            />
          ) : null}
        </section>
      ) : null}

      {/* Tab 2: Channels (Kênh Live) */}
      {activeTab === 'channels' ? (
        <section className="live-analytics__section">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('liveAnalytics.colTikTokAccount')}</th>
                  <th className="cell-number">{t('liveAnalytics.colSessionsCount')}</th>
                  <th>{t('liveAnalytics.colDuration')}</th>
                  <th className="cell-number">{t('liveAnalytics.colOrders')}</th>
                  <th className="cell-number">{t('liveAnalytics.colUnits')}</th>
                  <th className="cell-number">{t('liveAnalytics.colRevenue')}</th>
                  <th className="cell-number">{t('liveAnalytics.colComments')}</th>
                  <th className="cell-number">{t('liveAnalytics.colAvgGmvPerSession')}</th>
                  <th className="cell-number">{t('liveAnalytics.channelGmvShare')}</th>
                  <th className="cell-actions">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {liveOrdersLoading && !filteredChannelList.length ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state empty-state--compact table-empty-state">
                        <span className="loading-dot" />
                        {t('liveAnalytics.loading')}
                      </div>
                    </td>
                  </tr>
                ) : null}

                {!liveOrdersLoading && !filteredChannelList.length ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state empty-state--compact table-empty-state">
                        {t('liveAnalytics.noChannels')}
                      </div>
                    </td>
                  </tr>
                ) : null}

                {filteredChannelList.map((ch) => {
                  const avgGmv = ch.sessionsCount > 0 ? ch.totalGmv / ch.sessionsCount : 0;
                  const totalLiveSales = channelList.reduce((sum, c) => sum + c.totalGmv, 0);
                  const share = totalLiveSales > 0 ? (ch.totalGmv / totalLiveSales) * 100 : 0;

                  return (
                    <tr
                      key={ch.username}
                      className="live-channel-row"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedChannel(ch.username);
                        setActiveTab('overview');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedChannel(ch.username);
                          setActiveTab('overview');
                        }
                      }}
                    >
                      <td>
                        <div className="live-host-cell">
                          {ch.avatar ? (
                            <img src={ch.avatar} alt={ch.username} className="live-host-avatar" />
                          ) : (
                            <div className="live-host-avatar">
                              {(ch.username || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <div className="live-host-meta">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span className="live-host-name">{ch.nickname || ch.username}</span>
                              <span className="chip chip--neutral" style={{ fontSize: '0.6875rem', padding: '1px 6px' }}>
                                {ch.isExternal ? t('liveAnalytics.badgeKoc') : t('liveAnalytics.badgeShop')}
                              </span>
                            </div>
                            <span className="live-host-username">@{ch.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="cell-number">
                        <strong>{formatNumber(ch.sessionsCount)}</strong>
                      </td>
                      <td>
                        <span className="live-duration-pill">
                          <Clock size={12} />
                          {formatTotalDuration(ch.totalDurationSec, language)}
                        </span>
                      </td>
                      <td className="cell-number">{formatNumber(ch.orderCount)}</td>
                      <td className="cell-number">{formatNumber(ch.totalQuantity)}</td>
                      <td className="cell-number" style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                        {formatMoney(ch.totalGmv, ch.currency)}
                      </td>
                      <td className="cell-number">
                        {ch.totalComments ? formatNumber(ch.totalComments) : '—'}
                      </td>
                      <td className="cell-number">{formatMoney(avgGmv, ch.currency)}</td>
                      <td className="cell-number">{formatPercent(share)}</td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChannel(ch.username);
                            setActiveTab('overview');
                          }}
                        >
                          {t('liveAnalytics.viewChannelSessions')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Tab 3: Top Products */}
      {activeTab === 'products' ? (
        <section className="live-analytics__section">
          {!filteredProducts.length ? (
            <div className="empty-state empty-state--compact">
              {t('liveAnalytics.noProducts')}
            </div>
          ) : (
            <div className="live-products-grid">
              {filteredProducts.map((product) => (
                <article className="live-product-card" key={product.productId}>
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="live-product-card__image"
                    />
                  ) : (
                    <div className="live-product-card__image" style={{ background: 'var(--color-surface-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={24} color="var(--color-muted)" />
                    </div>
                  )}
                  <div className="live-product-card__content">
                    <h4 className="live-product-card__title" title={product.name}>
                      {product.name || product.productId}
                    </h4>
                    <div className="live-product-card__metrics">
                      <span className="live-product-card__revenue">
                        {formatMoney(product.gmv, product.currency)}
                      </span>
                      <span className="live-product-card__units">
                        {formatNumber(product.quantity)} {t('liveAnalytics.units')} · {formatNumber(product.orderCount)} {t('liveAnalytics.orders')}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Tab 3: Live Orders List */}
      {activeTab === 'orders' ? (
        <section className="live-analytics__section">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('liveAnalytics.colOrderId')}</th>
                  <th>{t('liveAnalytics.colOrderTime')}</th>
                  {selectedShopId === 'all' ? <th>{t('liveAnalytics.shop')}</th> : null}
                  <th>{t('liveAnalytics.colHost')}</th>
                  <th>{t('liveAnalytics.colProducts')}</th>
                  <th className="cell-number">{t('liveAnalytics.colTotalAmount')}</th>
                  <th className="cell-number">{t('liveAnalytics.colCommission')}</th>
                  <th>{t('liveAnalytics.colOrderStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {!filteredOrders.length ? (
                  <tr>
                    <td colSpan={selectedShopId === 'all' ? 8 : 7}>
                      <div className="empty-state empty-state--compact table-empty-state">
                        {t('liveAnalytics.noOrders')}
                      </div>
                    </td>
                  </tr>
                ) : null}

                {paginatedOrders.map((order) => (
                  <tr key={order.orderId}>
                    <td>
                      <span
                        className="code-pill font-mono"
                        style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 650 }}
                        onClick={() => setSelectedOrder(order.rawOrder || order)}
                        title={order.orderId}
                      >
                        {order.orderId}
                      </span>
                    </td>
                    <td>
                      {order.createTime ? formatDisplayDateTime(order.createTime, '—') : '—'}
                    </td>
                    {selectedShopId === 'all' ? (
                      <td>
                        <span className="code-pill font-mono" style={{ fontSize: '0.75rem' }}>
                          {order.shopName || `Shop ${order.shopId}`}
                        </span>
                      </td>
                    ) : null}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="code-pill">
                          @{order.creatorUsername || order.skus[0]?.creator_username || (order.shopName ? order.shopName.toLowerCase().replace(/\s+/g, '.') : 'shop')}
                        </span>
                        <span className="chip chip--neutral" style={{ fontSize: '0.6875rem', padding: '1px 6px' }}>
                          {order.isExternal ? t('liveAnalytics.badgeKoc') : t('liveAnalytics.badgeShop')}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 300 }}>
                        {order.skus.map((sku, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem' }}>
                            <span
                              style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                color: 'var(--color-text)',
                              }}
                              title={sku.product_name}
                            >
                              • {sku.product_name}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', flexShrink: 0 }}>
                              x{sku.quantity || 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="cell-number" style={{ fontWeight: 750, color: 'var(--color-primary)' }}>
                      {formatMoney(order.totalGmv, order.currency)}
                    </td>
                    <td className="cell-number">
                      {order.totalCommission > 0 ? (
                        <div>
                          <strong>{formatMoney(order.totalCommission, order.currency)}</strong>
                          {order.commissionRate > 0 ? (
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                              ({order.commissionRate}%)
                            </span>
                          ) : null}
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`seller-affiliate__order-state seller-affiliate__order-state--${String(order.status || '').toLowerCase()}`}>
                        {orderStatusLabel(order.status, t)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalOrderPages > 1 ? (
            <Pagination
              currentPage={orderPage}
              totalPages={totalOrderPages}
              onPageChange={setOrderPage}
            />
          ) : null}
        </section>
      ) : null}

      {/* Session Details Drawer */}
      {editingSession ? (
        <LiveHostEditor
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={(saved) => {
            const hostObj = saved?.host || null;
            setHostAssignments((current) => ({
              ...current,
              [editingSession.sessionKey]: {
                shop_id: editingSession.shopId,
                session_id: editingSession.sessionId,
                host: hostObj,
              },
            }));
            setSelectedSession((current) => (
              current?.sessionKey === editingSession.sessionKey
                ? { ...current, host: hostObj }
                : current
            ));
          }}
          t={t}
        />
      ) : null}
      {selectedSession ? (
        <LiveSessionDrawer
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onSelectOrder={setSelectedOrder}
          onEditHost={setEditingSession}
          canEditHost={canEditHost}
          formatMoney={formatMoney}
          formatNumber={formatNumber}
          formatDisplayDateTime={formatDisplayDateTime}
          language={language}
          t={t}
        />
      ) : null}

      {/* TikTok Shop Order Detail Drawer */}
      {selectedOrder ? (
        <OrderDetailDrawer
          order={selectedOrder}
          shopId={selectedOrder.shop_id || selectedOrder.shopId || (selectedShopId !== 'all' ? selectedShopId : null)}
          onClose={() => setSelectedOrder(null)}
          formatTime={(val) => formatDisplayDateTime(val, '—')}
          formatMoneyValues={formatMoneyValues}
          t={t}
        />
      ) : null}
    </div>
  );
};

const LiveSessionDrawer = ({
  session,
  onClose,
  onSelectOrder,
  onEditHost,
  canEditHost,
  formatMoney,
  formatNumber,
  formatDisplayDateTime,
  language = 'vi',
  t,
}) => {
  const drawerRef = useRef(null);
  const closeBtnRef = useRef(null);

  // Scroll to top immediately on mount & whenever session changes
  useEffect(() => {
    if (drawerRef.current) {
      drawerRef.current.scrollTop = 0;
    }
    const rafId = requestAnimationFrame(() => {
      if (drawerRef.current) {
        drawerRef.current.scrollTop = 0;
      }
      closeBtnRef.current?.focus();
    });
    return () => cancelAnimationFrame(rafId);
  }, [session?.sessionId]);

  // Lock body scroll and close on Escape key when drawer is active
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!session) return null;

  const productsList = Array.isArray(session.productsList) ? session.productsList : [];
  const ordersList = Array.isArray(session.orders) ? session.orders : [];

  return createPortal(
    <div
      className="live-drawer-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        ref={drawerRef}
        key={session.sessionId}
        className="live-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-drawer-title"
      >
        <div className="live-drawer__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="live-badge">
              <span className="live-badge__dot" />
              LIVE
            </span>
            <h3 id="live-drawer-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 750, color: 'var(--color-text)' }}>
              {t('liveAnalytics.sessionDetails')}
            </h3>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="live-drawer__close"
            onClick={onClose}
            aria-label={t('liveAnalytics.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="live-drawer__body">
          {/* Host & Session Card */}
          <div className="live-analytics__stat" style={{ borderLeft: '4px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {session.host ? (
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>
                    <strong>{t('liveAnalytics.appHost')}:</strong> {session.host.name || session.host.email}
                  </p>
                ) : (
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                    {t('liveAnalytics.unassignedHost')}
                  </span>
                )}
                {session.hostSource === 'auto_hashtag' ? (
                  <span
                    className="chip chip--neutral"
                    style={{ fontSize: '0.6875rem', padding: '1px 6px' }}
                    title={t('liveAnalytics.autoHostTitle')}
                  >
                    {t('liveAnalytics.autoHost')}
                  </span>
                ) : null}
                <span className="chip chip--neutral" style={{ fontSize: '0.6875rem', padding: '1px 6px' }}>
                  {session.isExternal ? t('liveAnalytics.badgeKoc') : t('liveAnalytics.badgeShop')}
                </span>
              </div>
              {canEditHost && session.sessionId !== 'unknown' ? (
                <button
                  type="button"
                  className="button button--secondary button--sm"
                  onClick={() => onEditHost?.(session)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Pencil size={13} />
                  <span>{t('liveAnalytics.editHost')}</span>
                </button>
              ) : null}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {session.creatorAvatar ? (
                <img
                  src={session.creatorAvatar}
                  alt={session.creatorUsername}
                  className="live-host-avatar"
                  style={{ width: 44, height: 44 }}
                />
              ) : (
                <div className="live-host-avatar" style={{ width: 44, height: 44, fontSize: '1.125rem' }}>
                  {(session.creatorUsername || '?')[0].toUpperCase()}
                </div>
              )}
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 750, color: 'var(--color-text)' }}>
                  {session.creatorNickname || session.creatorUsername || '—'}
                </h4>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                  @{session.creatorUsername}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{t('liveAnalytics.colSessionId')}:</span>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>{session.sessionId}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{t('liveAnalytics.sessionStartTime')}:</span>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>
                  {session.firstTime ? formatDisplayDateTime(session.firstTime, '—') : '—'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{t('liveAnalytics.colDuration')}:</span>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-primary)' }}>
                  {formatLiveDuration(session.firstTime, session.lastTime, language, session.durationSec, session.orderCount)}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{t('liveAnalytics.colRevenue')}:</span>
                <p style={{ margin: 0, fontWeight: 750, fontSize: '1.0625rem', color: 'var(--color-primary)' }}>
                  {formatMoney(session.totalGmv, session.currency)}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{t('liveAnalytics.colOrders')}:</span>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>{formatNumber(session.orderCount)}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{t('liveAnalytics.colUnits')}:</span>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>{formatNumber(session.totalQuantity)}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{t('liveAnalytics.colComments')}:</span>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)' }}>
                  {session.totalComments !== null && session.totalComments !== undefined ? formatNumber(session.totalComments) : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Products in this Session */}
          <div className="section-card" style={{ padding: 16 }}>
            <h4 style={{ fontSize: '0.9375rem', fontWeight: 750, color: 'var(--color-text)', margin: '0 0 12px 0' }}>
              {t('liveAnalytics.productsSold')} ({productsList.length})
            </h4>
            {productsList.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>—</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {productsList.map((prod, idx) => (
                  <div
                    key={prod.productId || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 10,
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-default)',
                      background: 'var(--color-surface)',
                    }}
                  >
                    {prod.imageUrl ? (
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package size={20} color="var(--color-muted)" />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={prod.name}>
                        {prod.name}
                      </p>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                        {formatNumber(prod.quantity)} {t('liveAnalytics.units')}
                      </span>
                    </div>
                    <span style={{ fontWeight: 750, fontSize: '0.875rem', color: 'var(--color-primary)' }}>
                      {formatMoney(prod.gmv, session.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Orders in this session */}
          <div className="section-card" style={{ padding: 16 }}>
            <h4 style={{ fontSize: '0.9375rem', fontWeight: 750, color: 'var(--color-text)', margin: '0 0 12px 0' }}>
              {t('liveAnalytics.ordersTitle')} ({ordersList.length})
            </h4>
            {ordersList.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>—</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ordersList.map((ord, idx) => {
                  const ordSkus = Array.isArray(ord.skus) ? ord.skus : [];
                  const ordCreateTime = ord.create_time
                    ? (typeof ord.create_time === 'number' ? ord.create_time * 1000 : Date.parse(ord.create_time))
                    : null;
                  const ordCurrency = ordSkus[0]?.currency || ord.currency || session.currency;
                  const ordTotalGmv = ordSkus.reduce((sum, s) => sum + (moneyValue(s.price) * (Number(s.quantity) || 1)), 0);
                  const ordCommission = ordSkus.reduce((sum, s) => {
                    const comm = s.raw_data?.estimated_paid_commission?.amount || s.estimated_paid_commission?.amount || s.estimated_commission;
                    return sum + (moneyValue(comm) || 0);
                  }, 0);
                  const commSku = ordSkus.find((s) => s.raw_data?.commission_rate || s.commission_rate);
                  const ordCommissionRate = commSku
                    ? (Number(commSku.raw_data?.commission_rate || commSku.commission_rate) / 100)
                    : 0;
                  const settlementStatus = ordSkus[0]?.settlement_status || ordSkus[0]?.raw_data?.settlement_status || '';

                  return (
                    <article
                      key={ord.id || ord.order_id || idx}
                      className="live-session-order-card"
                    >
                      <div className="live-session-order-card__header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            className="code-pill font-mono"
                            style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 650 }}
                            onClick={() => onSelectOrder?.(ord)}
                            title={ord.id || ord.order_id}
                          >
                            {ord.id || ord.order_id}
                          </span>
                          {ordCreateTime ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                              {formatDisplayDateTime(ordCreateTime, '—')}
                            </span>
                          ) : null}
                        </div>
                        <span className={`seller-affiliate__order-state seller-affiliate__order-state--${String(ord.order_status || ord.status || 'completed').toLowerCase()}`}>
                          {orderStatusLabel(ord.order_status || ord.status || 'COMPLETED', t)}
                        </span>
                      </div>

                      {/* SKUs in this order */}
                      <div className="live-session-order-card__products">
                        {ordSkus.map((sku, sIdx) => {
                          const img = sku.product_image || sku.image_url || sku.raw_data?.product_image || sku.raw_data?.sku_image;
                          const qty = Number(sku.quantity) || 1;
                          const unitPrice = moneyValue(sku.price);
                          const rowGmv = unitPrice * qty;
                          return (
                            <div key={sku.sku_id || sIdx} className="live-session-order-card__product-row">
                              {img ? (
                                <img src={img} alt="" className="live-session-order-card__product-thumb" />
                              ) : (
                                <div className="live-session-order-card__product-thumb-placeholder">
                                  <Package size={14} />
                                </div>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p className="live-session-order-card__product-name" title={sku.product_name}>
                                  {sku.product_name}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                                  <span>x{qty}</span>
                                  {unitPrice ? <span>({formatMoney(unitPrice, sku.currency || ordCurrency)})</span> : null}
                                </div>
                              </div>
                              <span style={{ fontWeight: 650, fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                                {formatMoney(rowGmv, sku.currency || ordCurrency)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer with total GMV and commission */}
                      <div className="live-session-order-card__footer">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {ordCommission > 0 ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                              {t('liveAnalytics.colCommission')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(ordCommission, ordCurrency)}</strong>
                              {ordCommissionRate > 0 ? ` (${ordCommissionRate}%)` : ''}
                            </span>
                          ) : null}
                          {settlementStatus && settlementStatus !== '—' ? (
                            <span className="chip" style={{ fontSize: '0.6875rem', padding: '2px 6px' }}>
                              {settlementStatus}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{t('liveAnalytics.colTotalAmount')}:</span>
                          <strong style={{ fontSize: '0.9375rem', color: 'var(--color-primary)' }}>
                            {formatMoney(ordTotalGmv, ordCurrency)}
                          </strong>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
};

export default LiveAnalytics;
