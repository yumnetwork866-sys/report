import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchTikTokSellerAffiliateOrders,
  fetchTikTokSellerAffiliateOrderOverview,
  fetchTikTokShops,
} from '../../../lib/api';
import { useI18n } from '../../../lib/language';
import { useMoneyFormatter } from '../../../lib/currency';
import {
  getStoredSelectedShopId,
  resolveSelectedShopId,
  setStoredSelectedShopId,
  subscribeSelectedShop,
} from '../../../lib/shopSelection';
import {
  PAGE_SIZE,
  PRODUCT_SCOPE,
  REQUIRED_SCOPE,
} from '../../SellerAffiliatePanel/constants';
import {
  defaultStatisticsRange,
  shiftDateValue,
  shopDateUnix,
  shopTimezone,
} from '../../SellerAffiliatePanel/utils/sellerAffiliateUtils';
import { exportOrdersToCsv } from '../utils/orderExport';

export const DEFAULT_ORDER_FILTERS = {
  dateField: 'create_time',
  orderStatus: 'all',
  shippingType: 'all',
  warehouse: '',
  buyerCancellation: 'all',
  refundStatus: 'all',
  settlementStatus: 'all',
  carrier: '',
  productSku: '',
  settlementMin: '',
  settlementMax: '',
  deliveryIssue: 'all',
  attentionOnly: false,
  source: 'all',
};

export const useShopOrders = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const {
    currency: preferredCurrency,
    convertAmount,
    formatMoney: formatPreferredMoney,
  } = useMoneyFormatter(locale);

  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(getStoredSelectedShopId);
  const [orderPeriod, setOrderPeriod] = useState('30d');
  const [orderRange, setOrderRange] = useState(() => defaultStatisticsRange(30));
  const [orderFilterDraft, setOrderFilterDraft] = useState(DEFAULT_ORDER_FILTERS);
  const [orderFilters, setOrderFilters] = useState(DEFAULT_ORDER_FILTERS);
  const [orderOverview, setOrderOverview] = useState({});
  const [orderOverviewLoading, setOrderOverviewLoading] = useState(false);
  const [orderOverviewError, setOrderOverviewError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [data, setData] = useState({});
  const [pageTokens, setPageTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const selectedShop = useMemo(
    () => shops.find((shop) => String(shop.id) === String(shopId)),
    [shopId, shops],
  );

  const scopes = Array.isArray(selectedShop?.authorization?.granted_scopes)
    ? selectedShop.authorization.granted_scopes
    : [];
  const orderScopes = Array.isArray(selectedShop?.orderAuthorization?.granted_scopes)
    ? selectedShop.orderAuthorization.granted_scopes
    : [];

  const hasScope = scopes.includes(REQUIRED_SCOPE);
  const hasShopOrderScope = orderScopes.includes('seller.order.info') || scopes.includes('seller.order.info');
  const hasProductScope = scopes.includes(PRODUCT_SCOPE) || orderScopes.includes(PRODUCT_SCOPE);

  const currentPageToken = pageTokens.at(-1) || '';

  const orderRequestFilters = useMemo(() => ({
    startTime: shopDateUnix(orderRange.start, selectedShop?.region),
    endTime: shopDateUnix(shiftDateValue(orderRange.end, 1), selectedShop?.region),
    keyword: submittedKeyword,
    dateField: orderFilters.dateField,
    orderStatus: orderFilters.orderStatus === 'all' ? '' : orderFilters.orderStatus,
    shippingType: orderFilters.shippingType === 'all' ? '' : orderFilters.shippingType,
    warehouse: orderFilters.warehouse,
    buyerCancellation: orderFilters.buyerCancellation === 'all' ? '' : orderFilters.buyerCancellation,
    refundStatus: orderFilters.refundStatus === 'all' ? '' : orderFilters.refundStatus,
    settlementStatus: orderFilters.settlementStatus === 'all' ? '' : orderFilters.settlementStatus,
    carrier: orderFilters.carrier,
    productSku: orderFilters.productSku,
    settlementAmountMin: orderFilters.settlementMin,
    settlementAmountMax: orderFilters.settlementMax,
    deliveryIssue: orderFilters.deliveryIssue === 'all' ? '' : orderFilters.deliveryIssue,
    attentionOnly: orderFilters.attentionOnly ? 'yes' : '',
    contentType: orderFilters.source === 'all' ? '' : orderFilters.source,
  }), [orderFilters, orderRange.end, orderRange.start, selectedShop?.region, submittedKeyword]);

  const orderFiltersDirty = useMemo(
    () => JSON.stringify(orderFilterDraft) !== JSON.stringify(orderFilters),
    [orderFilterDraft, orderFilters],
  );

  const orderFilterError = useMemo(() => {
    const minimum = Number(orderFilterDraft.settlementMin);
    const maximum = Number(orderFilterDraft.settlementMax);
    if (orderFilterDraft.settlementMin !== '' && (!Number.isFinite(minimum) || minimum < 0)) return 'minimum';
    if (orderFilterDraft.settlementMax !== '' && (!Number.isFinite(maximum) || maximum < 0)) return 'maximum';
    if (orderFilterDraft.settlementMin !== '' && orderFilterDraft.settlementMax !== '' && minimum > maximum) return 'range';
    return '';
  }, [orderFilterDraft.settlementMax, orderFilterDraft.settlementMin]);

  const activeQuickTab = useMemo(() => {
    if (orderFilters.attentionOnly) return 'attention';
    if (orderFilters.refundStatus === 'yes') return 'refund';
    if (['AWAITING_SHIPMENT', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(orderFilters.orderStatus)) {
      return orderFilters.orderStatus;
    }
    return 'all';
  }, [orderFilters]);

  const handleQuickTabChange = useCallback((tabId) => {
    const patch = {
      attentionOnly: false,
      refundStatus: 'all',
      orderStatus: 'all',
    };
    if (tabId === 'attention') {
      patch.attentionOnly = true;
    } else if (tabId === 'refund') {
      patch.refundStatus = 'yes';
    } else if (tabId !== 'all') {
      patch.orderStatus = tabId;
    }
    setOrderFilterDraft((current) => ({ ...current, ...patch }));
    setOrderFilters((current) => ({ ...current, ...patch }));
    setPageTokens([]);
  }, []);

  const updateOrderFilter = useCallback((key, value) => {
    setOrderFilterDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const applyOrderFilters = useCallback((event) => {
    event?.preventDefault();
    if (orderFilterError) return;
    setOrderFilters({ ...orderFilterDraft });
    setPageTokens([]);
  }, [orderFilterDraft, orderFilterError]);

  const applyOrderFilterPatch = useCallback((patch) => {
    setOrderFilterDraft((current) => ({ ...current, ...patch }));
    setOrderFilters((current) => ({ ...current, ...patch }));
    setPageTokens([]);
  }, []);

  const resetOrderFilters = useCallback(() => {
    setOrderFilterDraft(DEFAULT_ORDER_FILTERS);
    setOrderFilters(DEFAULT_ORDER_FILTERS);
    setPageTokens([]);
  }, []);

  const submitSearch = useCallback((event) => {
    event?.preventDefault();
    setSubmittedKeyword(keyword.trim());
    setPageTokens([]);
  }, [keyword]);

  const orderPeriodOptions = useMemo(() => [
    { value: '7d', label: t('shopAnalytics.period7d') },
    { value: '30d', label: t('shopAnalytics.period30d') },
    { value: '90d', label: t('shopAnalytics.period90d') },
    { value: 'custom', label: t('shopAnalytics.periodCustom') },
  ], [t]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchTikTokShops(controller.signal)
      .then((items) => {
        const list = Array.isArray(items) ? items : [];
        setShops(list);
        setShopId((current) => {
          const preferred = current || getStoredSelectedShopId();
          return resolveSelectedShopId(list, preferred);
        });
      })
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return subscribeSelectedShop((event) => {
      const nextId = event?.detail ?? getStoredSelectedShopId();
      if (!nextId) return;
      setShopId((current) => {
        if (String(nextId) === String(current)) return current;
        if (shops.length && !shops.some((shop) => String(shop.id) === String(nextId))) return current;
        setPageTokens([]);
        setData({});
        return String(nextId);
      });
    });
  }, [shops]);

  const load = useCallback(async (signal) => {
    if (!shopId || !hasScope) {
      setData({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setOrderOverviewLoading(true);
    setOrderOverviewError('');

    try {
      const activeFilters = {
        ...orderRequestFilters,
        source: 'db',
        pageSize: PAGE_SIZE,
        pageToken: currentPageToken,
        orderId: '',
      };

      const [ordersResult, overviewResult] = await Promise.allSettled([
        fetchTikTokSellerAffiliateOrders(shopId, { signal, ...activeFilters }),
        fetchTikTokSellerAffiliateOrderOverview(shopId, { signal, ...orderRequestFilters }),
      ]);

      if (ordersResult.status === 'rejected') throw ordersResult.reason;
      if (!signal?.aborted) setData(ordersResult.value || {});

      if (overviewResult.status === 'fulfilled') {
        if (!signal?.aborted) setOrderOverview(overviewResult.value || {});
      } else if (overviewResult.reason?.name !== 'AbortError' && !signal?.aborted) {
        setOrderOverviewError(overviewResult.reason?.message || t('sellerAffiliate.loadError'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || t('sellerAffiliate.loadError'));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setOrderOverviewLoading(false);
      }
    }
  }, [currentPageToken, hasScope, orderRequestFilters, shopId, t]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const rows = useMemo(() => data.orders || data.affiliate_orders || [], [data]);

  const currentPage = pageTokens.length + 1;
  const totalPages = Math.max(
    Math.ceil(Number(data.total_count || 0) / Number(data.page_size || PAGE_SIZE)),
    1,
  );

  const changePage = useCallback((targetPage) => {
    const target = Math.min(totalPages, Math.max(1, Number(targetPage) || 1));
    if (target === currentPage) return;
    setPageTokens(Array.from(
      { length: target - 1 },
      (_, index) => String((index + 1) * PAGE_SIZE),
    ));
  }, [currentPage, totalPages]);

  const formatTime = useCallback((timestamp) => {
    if (!timestamp) return '—';
    const numeric = Number(timestamp);
    const date = Number.isFinite(numeric)
      ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
      : new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: shopTimezone(selectedShop?.region),
    }).format(date);
  }, [locale, selectedShop?.region]);

  const fallbackCurrency = selectedShop?.region === 'VN' ? 'VND' : 'MYR';

  const formatMoney = useCallback((value) => {
    if (!value) return '—';
    const amount = Number(typeof value === 'object' ? value?.amount : value);
    if (!Number.isFinite(amount)) return '—';
    const sourceCurrency = (typeof value === 'object' ? value?.currency : null) || fallbackCurrency;
    return formatPreferredMoney(amount, sourceCurrency);
  }, [fallbackCurrency, formatPreferredMoney]);

  const formatMoneyValues = useCallback((values) => {
    const moneyValues = (Array.isArray(values) ? values : [values])
      .filter((money) => money && (typeof money === 'object' ? money.amount !== undefined && money.amount !== null && money.amount !== '' : Number.isFinite(Number(money))));
    if (!moneyValues.length) return '—';
    const converted = moneyValues.map((money) => {
      const amount = Number(typeof money === 'object' ? money?.amount : money);
      const sourceCurrency = (typeof money === 'object' ? money?.currency : null) || fallbackCurrency;
      return convertAmount(amount, sourceCurrency);
    });
    if (converted.every(Number.isFinite)) {
      const totalInPreferred = converted.reduce((sum, amount) => sum + amount, 0);
      return formatPreferredMoney(totalInPreferred, preferredCurrency);
    }
    return moneyValues.map(formatMoney).join(' + ');
  }, [convertAmount, fallbackCurrency, formatMoney, formatPreferredMoney, preferredCurrency]);

  const formatNumber = useCallback((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toLocaleString(locale) : '0';
  }, [locale]);

  const exportOrders = useCallback(() => {
    const filename = `orders_${selectedShop?.name || shopId}_${orderRange.start}_${orderRange.end}.csv`;
    return exportOrdersToCsv(rows, filename, t, locale);
  }, [locale, orderRange.end, orderRange.start, rows, selectedShop?.name, shopId, t]);

  const advancedFilterKeys = [
    'warehouse', 'buyerCancellation', 'settlementStatus',
    'carrier', 'productSku', 'settlementMin', 'settlementMax',
    'deliveryIssue', 'source',
  ];

  const activeAdvancedFilterCount = advancedFilterKeys.filter((key) => {
    const value = orderFilters[key];
    return value !== '' && value !== 'all' && value !== false;
  }).length;

  const hasActiveOrderFilters = orderFilters.attentionOnly
    || orderFilters.dateField !== 'create_time'
    || orderFilters.orderStatus !== 'all'
    || orderFilters.shippingType !== 'all'
    || orderFilters.refundStatus !== 'all'
    || activeAdvancedFilterCount > 0;

  return {
    activeAdvancedFilterCount,
    activeQuickTab,
    applyOrderFilterPatch,
    applyOrderFilters,
    changePage,
    currentPage,
    data,
    error,
    exportOrders,
    formatMoneyValues,
    formatNumber,
    formatTime,
    handleQuickTabChange,
    hasActiveOrderFilters,
    hasProductScope,
    hasScope,
    hasShopOrderScope,
    keyword,
    loading,
    locale,
    orderFilterDraft,
    orderFilterError,
    orderFilters,
    orderFiltersDirty,
    orderOverview,
    orderOverviewError,
    orderOverviewLoading,
    orderPeriod,
    orderPeriodOptions,
    orderRange,
    resetOrderFilters,
    rows,
    selectedOrder,
    selectedShop,
    setKeyword,
    setOrderFilterDraft,
    setOrderPeriod,
    setOrderRange,
    setPageTokens,
    setSelectedOrder,
    setShopId,
    shopId,
    shops,
    showAdvancedFilters,
    setShowAdvancedFilters,
    submitSearch,
    t,
    totalPages,
    updateOrderFilter,
  };
};

export default useShopOrders;
