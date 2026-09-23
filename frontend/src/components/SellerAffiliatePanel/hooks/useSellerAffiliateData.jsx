import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTikTokSellerAffiliateOrders,
  fetchTikTokSellerAffiliateOrderOverview,
  fetchTikTokSellerAffiliateCreators,
  fetchTikTokSellerSampleApplicationFulfillments,
  fetchTikTokSellerMarketplaceCreators,
  inviteTikTokSellerMarketplaceCreator,
  addTikTokSellerCreatorToInvitation,
  fetchTikTokSellerCreatorContentDetails,
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokSellerOpenCollaborationSettings,
  fetchTikTokSellerTargetCollaborations,
  fetchTikTokCreatorPerformance,
  fetchTikTokShops,
  startTikTokShopOauth,
} from '../../../lib/api';
import { useI18n } from '../../../lib/language';
import { useMoneyFormatter } from '../../../lib/currency';
import {
  getCreatorMetric,
  getCreatorVideoEngagementRate,
  normalizeEngagementPercentage,
} from '../../../lib/sellerAffiliate';
import {
  getStoredSelectedShopId,
  resolveSelectedShopId,
  subscribeSelectedShop,
} from '../../../lib/shopSelection';
import AppAvatar from '../../AppAvatar';
import {
  AFFILIATE_WRITE_SCOPE,
  MARKETPLACE_SCOPE,
  PAGE_SIZE,
  PRODUCT_SCOPE,
  REQUIRED_SCOPE,
} from '../constants';
import {
  defaultInvitationEndDate,
  defaultStatisticsRange,
  formatStatus,
  internationalPhone,
  shopDateUnix,
  shopTimezone,
  normalizeCreatorSearchKeyword,
  shiftDateValue,
  waitForMarketplacePoll,
} from '../utils/sellerAffiliateUtils';

export const useSellerAffiliateData = ({ initialSection, ordersOnly }) => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const {
    currency: preferredCurrency,
    convertAmount,
    formatMoney: formatPreferredMoney,
  } = useMoneyFormatter(locale);
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(getStoredSelectedShopId);
  const [section, setSection] = useState(ordersOnly ? 'orders' : initialSection);
  const [orderPeriod, setOrderPeriod] = useState('30d');
  const [orderRange, setOrderRange] = useState(() => defaultStatisticsRange(30));
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderSourceFilter, setOrderSourceFilter] = useState('all');
  const [orderOverview, setOrderOverview] = useState({});
  const [orderOverviewLoading, setOrderOverviewLoading] = useState(false);
  const [orderOverviewError, setOrderOverviewError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [searchVersion, setSearchVersion] = useState(0);
  const [status, setStatus] = useState('ONGOING');
  const [data, setData] = useState({});
  const [settings, setSettings] = useState(null);
  const [pageTokens, setPageTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCreatorApplication, setSelectedCreatorApplication] = useState(null);
  const [creatorContent, setCreatorContent] = useState(null);
  const [creatorDetailLoading, setCreatorDetailLoading] = useState(false);
  const [creatorBreakdownMetric, setCreatorBreakdownMetric] = useState('gmv');
  const [performanceWindow, setPerformanceWindow] = useState('PAST_7_DAYS');
  const [profileRefreshing, setProfileRefreshing] = useState(false);
  const [inviteCreator, setInviteCreator] = useState(null);
  const [inviteProducts, setInviteProducts] = useState([]);
  const [inviteTab, setInviteTab] = useState('ongoing');
  const [ongoingInvitations, setOngoingInvitations] = useState([]);
  const [selectedInvitationId, setSelectedInvitationId] = useState('');
  const [invitationSearch, setInvitationSearch] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    products: [],
    endDate: defaultInvitationEndDate(),
    whatsappCountry: '+84',
    whatsapp: '',
    facebook: '',
    telegramCountry: '+84',
    telegram: '',
    message: '',
    contentType: 'ANY',
    hasFreeSample: false,
    sampleApprovalExempt: false,
  });
  const [contactNotice, setContactNotice] = useState(null);
  const marketplaceSearchKey = useRef('');
  const resetMarketplaceSearch = useCallback(() => {
    marketplaceSearchKey.current = '';
  }, []);
  
  const selectedShop = useMemo(() => shops.find((shop) => String(shop.id) === String(shopId)), [shopId, shops]);
  const scopes = Array.isArray(selectedShop?.authorization?.granted_scopes) ? selectedShop.authorization.granted_scopes : [];
  const orderScopes = Array.isArray(selectedShop?.orderAuthorization?.granted_scopes) ? selectedShop.orderAuthorization.granted_scopes : [];
  const hasScope = scopes.includes(REQUIRED_SCOPE);
  const hasShopOrderScope = orderScopes.includes('seller.order.info') || scopes.includes('seller.order.info');
  const hasMarketplaceScope = scopes.includes(MARKETPLACE_SCOPE);
  const hasProductScope = scopes.includes(PRODUCT_SCOPE);
  const hasAffiliateWriteScope = scopes.includes(AFFILIATE_WRITE_SCOPE);
  const currentPageToken = pageTokens.at(-1) || '';

  const connectCustomApp = useCallback(async () => {
    try {
      const { authorizeUrl } = await startTikTokShopOauth('/shop/orders', 'custom');
      if (authorizeUrl) window.location.assign(authorizeUrl);
    } catch (e) {
      console.error(e);
    }
  }, []);
  
  const orderPeriodOptions = useMemo(() => [
    { value: '7d', label: t('shopAnalytics.period7d') },
    { value: '30d', label: t('shopAnalytics.period30d') },
    { value: '90d', label: t('shopAnalytics.period90d') },
    { value: 'custom', label: t('shopAnalytics.periodCustom') },
  ], [t]);

  const targetStatusOptions = useMemo(() => [
    'ONGOING',
    'EXPIRING',
    'VALID',
    'CANCELING',
    'COMPLETED',
  ].map((value) => ({
    value,
    label: formatStatus(value, t),
  })), [t]);
  
  const creatorStatusOptions = useMemo(() => [
    { value: '', label: t('sellerAffiliate.allStatuses') },
    ...['PENDING', 'AWAITING_SHIPMENT', 'SHIPPED', 'CONTENT_PENDING', 'COMPLETED', 'REJECT_CANCELLED'].map((value) => ({
      value,
      label: formatStatus(value, t),
    })),
  ], [t]);
  
  const performanceWindowOptions = useMemo(() => [
    { value: 'PAST_24H', label: t('sellerAffiliate.past24h') },
    { value: 'PAST_7_DAYS', label: t('sellerAffiliate.past7Days') },
    { value: 'PAST_30_DAYS', label: t('sellerAffiliate.past30Days') },
  ], [t]);
  
  const creatorBreakdownMetricOptions = useMemo(() => [
    { value: 'gmv', label: t('sellerAffiliate.creatorGmv') },
    { value: 'samplesShipped', label: t('sellerAffiliate.samplesShipped') },
    { value: 'postedContent', label: t('sellerAffiliate.creatorsPosted') },
    { value: 'withSales', label: t('sellerAffiliate.creatorsWithSales') },
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
          const resolved = resolveSelectedShopId(list, preferred);
          return resolved;
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
        resetMarketplaceSearch();
        setPageTokens([]);
        setData({});
        return String(nextId);
      });
    });
  }, [resetMarketplaceSearch, shops]);
  
  const load = useCallback(async (signal) => {
    // searchVersion intentionally participates in this request so submitting the
    // same keyword again refreshes Marketplace data and creator details.
    void searchVersion;
    if (!shopId || !hasScope || (section === 'discover' && !hasMarketplaceScope)) {
      setData({});
      setSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const loadingOrders = ordersOnly && section === 'orders';
    if (loadingOrders) {
      setOrderOverviewLoading(true);
      setOrderOverviewError('');
      setOrderOverview({});
    }
    try {
      const orderFilters = loadingOrders ? {
        startTime: shopDateUnix(orderRange.start, selectedShop?.region),
        endTime: shopDateUnix(shiftDateValue(orderRange.end, 1), selectedShop?.region),
        keyword: submittedKeyword,
        settlementStatus: orderStatusFilter === 'all' ? '' : orderStatusFilter,
        contentType: orderSourceFilter === 'all' ? '' : orderSourceFilter,
      } : null;
      const filters = {
        signal,
        pageSize: PAGE_SIZE,
        pageToken: currentPageToken,
        keyword: submittedKeyword,
        ...(orderFilters ? {
          ...orderFilters,
          source: 'db',
        } : {}),
        ...(section === 'discover' && marketplaceSearchKey.current
          ? { searchKey: marketplaceSearchKey.current }
          : {}),
      };
      let result;
      if (section === 'open') {
        [result] = await Promise.all([
          fetchTikTokSellerOpenCollaborations(shopId, filters),
          fetchTikTokSellerOpenCollaborationSettings(shopId, signal).then(setSettings).catch(() => setSettings(null)),
        ]);
      } else if (section === 'target') {
        result = await fetchTikTokSellerTargetCollaborations(shopId, { ...filters, status });
      } else if (section === 'performance') {
        result = await fetchTikTokCreatorPerformance(shopId, {
          ...filters,
          windowType: performanceWindow,
          planType: 'ALL',
          page: pageTokens.length + 1,
        });
      } else if (section === 'creators') {
        result = await fetchTikTokSellerAffiliateCreators(shopId, { ...filters, status });
      } else if (section === 'discover') {
        for (let pollCount = 0; pollCount < 60; pollCount += 1) {
          result = await fetchTikTokSellerMarketplaceCreators(shopId, filters);
          if (result?.search_key) marketplaceSearchKey.current = result.search_key;
          if (submittedKeyword && Array.isArray(result?.creators)) {
            const normalizedKeyword = normalizeCreatorSearchKeyword(submittedKeyword).toLocaleLowerCase();
            const matchingCreators = result.creators.filter((creator) => (
              [creator.username, creator.nickname].some((value) => (
                String(value || '').toLocaleLowerCase().replace(/^@/, '').includes(normalizedKeyword)
              ))
            ));
            const exactMatches = matchingCreators.filter((creator) => (
              [creator.username, creator.nickname].some((value) => (
                String(value || '').toLocaleLowerCase().replace(/^@/, '') === normalizedKeyword
              ))
            ));
            const displayedCreators = exactMatches.length ? exactMatches : matchingCreators;
            result = {
              ...result,
              creators: displayedCreators,
              total_count: displayedCreators.length,
              next_page_token: '',
            };
          }
          if (!signal?.aborted) {
            setData(result || {});
            setLoading(false);
          }
          if (result?.search_pending) {
            await waitForMarketplacePoll(Math.max(60_000, Number(result.search_poll_after_ms) || 60_000), signal);
            continue;
          }
          if (!result?.detail_refresh?.pending) break;
          await waitForMarketplacePoll(Math.max(1000, Number(result.detail_refresh.poll_after_ms) || 2000), signal);
        }
        return;
      } else if (loadingOrders) {
        const [ordersResult, overviewResult] = await Promise.allSettled([
          fetchTikTokSellerAffiliateOrders(shopId, { ...filters, orderId: '' }),
          fetchTikTokSellerAffiliateOrderOverview(shopId, { signal, ...orderFilters }),
        ]);
        if (ordersResult.status === 'rejected') throw ordersResult.reason;
        result = ordersResult.value;
        if (overviewResult.status === 'fulfilled') {
          if (!signal?.aborted) setOrderOverview(overviewResult.value || {});
        } else if (overviewResult.reason?.name !== 'AbortError' && !signal?.aborted) {
          setOrderOverviewError(overviewResult.reason?.message || t('sellerAffiliate.loadError'));
        }
      } else {
        result = await fetchTikTokSellerAffiliateOrders(shopId, {
          ...filters,
          orderId: ordersOnly ? '' : submittedKeyword,
        });
      }
      if (!signal?.aborted) setData(result || {});
      if (section === 'performance') setProfileRefreshing(result?.profile_refresh?.status === 'PROCESSING');
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || t('sellerAffiliate.loadError'));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        if (loadingOrders) setOrderOverviewLoading(false);
      }
    }
  }, [currentPageToken, hasMarketplaceScope, hasScope, orderRange, orderSourceFilter, orderStatusFilter, ordersOnly, pageTokens.length, performanceWindow, searchVersion, section, selectedShop?.region, shopId, status, submittedKeyword, t]);
  
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);
  
  useEffect(() => {
    if (section !== 'performance' || (data.export?.status !== 'PROCESSING' && data.base_export?.status !== 'PROCESSING') || !shopId) return undefined;
    const controller = new AbortController();
    const interval = window.setInterval(() => {
      fetchTikTokCreatorPerformance(shopId, {
        signal: controller.signal,
        windowType: performanceWindow,
        planType: 'ALL',
        page: pageTokens.length + 1,
        pageSize: PAGE_SIZE,
        keyword: submittedKeyword,
      }).then(setData).catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      });
    }, 5000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [data.base_export?.status, data.export?.status, pageTokens.length, performanceWindow, section, shopId, submittedKeyword]);
  
  useEffect(() => {
    if (!profileRefreshing || section !== 'performance' || !shopId) return undefined;
    const controller = new AbortController();
    const refresh = () => fetchTikTokCreatorPerformance(shopId, {
      signal: controller.signal,
      windowType: performanceWindow,
      planType: 'ALL',
      page: pageTokens.length + 1,
      pageSize: PAGE_SIZE,
      keyword: submittedKeyword,
    }).then((result) => {
      setData(result);
      if (result.profile_refresh && result.profile_refresh.status !== 'PROCESSING') {
        setProfileRefreshing(false);
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    const interval = window.setInterval(refresh, 60 * 1000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [pageTokens.length, performanceWindow, profileRefreshing, section, shopId, submittedKeyword]);
  
  const rows = useMemo(() => section === 'open'
    ? (data.open_collaborations || [])
    : section === 'target'
      ? (data.target_collaborations || [])
      : section === 'creators'
        ? (data.sample_applications || [])
        : section === 'discover'
          ? (data.creators || [])
        : section === 'performance'
          ? (data.creators || [])
        : (data.orders || data.affiliate_orders || []), [data, section]);
  const creatorSummaries = useMemo(() => {
    const grouped = new Map();
    for (const application of data.sample_applications || []) {
      const creator = application.creator || {};
      const key = creator.user_id || creator.username || application.id;
      const current = grouped.get(key) || {
        key,
        name: creator.nickname || creator.username || key,
        gmv: 0,
        currency: creator.gmv?.currency || 'USD',
        samplesShipped: 0,
          postedContent: false,
        hasSales: false,
      };
      current.gmv = Math.max(current.gmv, Number(creator.gmv?.amount || 0));
      current.currency = creator.gmv?.currency || current.currency;
      current.samplesShipped += ['SHIPPED', 'CONTENT_PENDING', 'COMPLETED', 'OPS_COMPLETED'].includes(application.status) ? 1 : 0;
      current.postedContent ||= Number(application.sample_content_count || 0) > 0;
      current.hasSales ||= Number(creator.gmv?.amount || 0) > 0;
      grouped.set(key, current);
    }
    return [...grouped.values()];
  }, [data.sample_applications]);
  const creatorBreakdown = useMemo(() => {
    if (creatorBreakdownMetric === 'gmv') {
      return creatorSummaries.filter((creator) => creator.gmv > 0).map((creator) => ({ name: creator.name, value: creator.gmv }));
    }
    if (creatorBreakdownMetric === 'samplesShipped') {
      return creatorSummaries.filter((creator) => creator.samplesShipped > 0).map((creator) => ({ name: creator.name, value: creator.samplesShipped }));
    }
    const positive = creatorSummaries.filter((creator) => (
      creatorBreakdownMetric === 'postedContent' ? creator.postedContent : creator.hasSales
    )).length;
    return [
      { name: t(creatorBreakdownMetric === 'postedContent' ? 'sellerAffiliate.posted' : 'sellerAffiliate.withSales'), value: positive },
      { name: t(creatorBreakdownMetric === 'postedContent' ? 'sellerAffiliate.notPosted' : 'sellerAffiliate.withoutSales'), value: creatorSummaries.length - positive },
    ].filter((item) => item.value > 0);
  }, [creatorBreakdownMetric, creatorSummaries, t]);
  const creatorBreakdownTotal = creatorBreakdown.reduce((total, item) => total + item.value, 0);
  const creatorBreakdownCurrency = creatorSummaries.find((creator) => creator.currency)?.currency || 'USD';
  const performanceBreakdown = section === 'performance'
    ? rows.slice(0, 10).filter((creator) => Number(creator.affiliate_gmv) > 0)
      .map((creator) => ({ name: creator.nickname || creator.username, value: Number(creator.affiliate_gmv) }))
    : [];
  const performanceBreakdownTotal = performanceBreakdown.reduce((total, item) => total + item.value, 0);
  const nextPageToken = section === 'performance'
    ? ((data.page || 1) * (data.page_size || PAGE_SIZE) < (data.total_count || 0) ? 'next' : '')
    : data.next_page_token || '';
  const currentPage = pageTokens.length + 1;
  const supportsNumberedPagination = section === 'performance'
    || section === 'discover'
    || (section === 'target' && data.source === 'DATABASE_SNAPSHOT')
    || (ordersOnly && section === 'orders');
  const totalPages = Math.max(
    currentPage + (nextPageToken ? 1 : 0),
    supportsNumberedPagination
      ? Math.ceil(Number(data.total_count || 0) / Number(data.page_size || PAGE_SIZE))
      : 1,
    1,
  );
  const changePage = async (targetPage) => {
    const target = Math.min(totalPages, Math.max(1, Number(targetPage) || 1));
    if (target === currentPage) return;
  
    if (target < currentPage) {
      setPageTokens((tokens) => tokens.slice(0, target - 1));
      return;
    }
  
    if (section === 'performance') {
      setPageTokens(Array.from({ length: target - 1 }, () => 'next'));
      return;
    }
  
    if (section === 'discover') {
      setPageTokens(Array.from(
        { length: target - 1 },
        (_, index) => String((index + 1) * PAGE_SIZE),
      ));
      return;
    }
    if (section === 'target' && data.source === 'DATABASE_SNAPSHOT') {
      setPageTokens(Array.from(
        { length: target - 1 },
        (_, index) => String((index + 1) * PAGE_SIZE),
      ));
      return;
    }
    if (ordersOnly && section === 'orders') {
      setPageTokens(Array.from(
        { length: target - 1 },
        (_, index) => String((index + 1) * PAGE_SIZE),
      ));
      return;
    }
  
    setLoading(true);
    setError('');
    try {
      const tokens = [...pageTokens];
      let cursor = nextPageToken;
      while (tokens.length < target - 1 && cursor) {
        tokens.push(cursor);
        if (tokens.length >= target - 1) break;
  
        const filters = {
          pageSize: PAGE_SIZE,
          pageToken: cursor,
          keyword: submittedKeyword,
        };
        let intermediate;
        if (section === 'open') {
          intermediate = await fetchTikTokSellerOpenCollaborations(shopId, filters);
        } else if (section === 'target') {
          intermediate = await fetchTikTokSellerTargetCollaborations(shopId, { ...filters, status });
        } else if (section === 'creators') {
          intermediate = await fetchTikTokSellerAffiliateCreators(shopId, { ...filters, status });
        } else {
          intermediate = await fetchTikTokSellerAffiliateOrders(shopId, {
            ...filters,
            orderId: submittedKeyword,
            ...(ordersOnly ? {
              startTime: shopDateUnix(orderRange.start, selectedShop?.region),
              endTime: shopDateUnix(shiftDateValue(orderRange.end, 1), selectedShop?.region),
            } : {}),
          });
        }
        cursor = intermediate?.next_page_token || '';
      }
      if (tokens.length === pageTokens.length) {
        setLoading(false);
      } else {
        setPageTokens(tokens);
      }
    } catch (err) {
      setError(err.message || t('sellerAffiliate.loadError'));
      setLoading(false);
    }
  };
  const openCollaborationSettings = settings?.open_collaboration_settings || settings;
  const selectedPerformanceExport = data.snapshot_export;
  const formatNumber = (value) => Number(value || 0).toLocaleString(locale);
  const formatCompactNumber = (value) => new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
  const formatRate = (value) => value === undefined || value === null ? '—' : `${(Number(value) / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  const formatTime = (value) => {
    if (!value) return '—';
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      timeZone: shopTimezone(selectedShop?.region),
    }).formatToParts(new Date(Number(value) * 1000));
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${values.day}/${values.month}/${values.year} ${values.hour}:${values.minute}:${values.second}`;
  };
  const formatMoney = (money) => {
    if (money?.amount === undefined || money?.amount === null || money.amount === '') return '—';
    return formatPreferredMoney(money.amount, money.currency || 'USD');
  };
  const formatMoneyValues = (values) => {
    const moneyValues = (Array.isArray(values) ? values : [])
      .filter((money) => money?.amount !== undefined && money?.amount !== null && money.amount !== '');
    if (!moneyValues.length) return '—';
    const converted = moneyValues.map((money) => convertAmount(money.amount, money.currency || 'USD'));
    if (converted.every(Number.isFinite)) {
      return formatPreferredMoney(
        converted.reduce((sum, amount) => sum + amount, 0),
        preferredCurrency,
      );
    }
    return moneyValues.map((money) => formatPreferredMoney(money.amount, money.currency || 'USD')).join(' + ');
  };
  const formatCreatorGmv = (creator) => {
    const money = creator.gmv || creator.local_gmv;
    if (money?.amount !== undefined && money?.amount !== null && money.amount !== '') {
      return formatPreferredMoney(money.amount, money.currency || 'USD', { compact: true });
    }
    const range = creator.local_gmv_range || creator.gmv_range;
    const minimum = range?.minimum_amount ?? range?.min_amount ?? range?.minimum ?? range?.min;
    const maximum = range?.maximum_amount ?? range?.max_amount ?? range?.maximum ?? range?.max;
    if (minimum !== undefined || maximum !== undefined) {
      const sourceCurrency = range?.currency || 'MYR';
      const minimumLabel = minimum === undefined ? null : formatPreferredMoney(minimum, sourceCurrency, { compact: true });
      const maximumLabel = maximum === undefined ? null : formatPreferredMoney(maximum, sourceCurrency, { compact: true });
      return minimumLabel && maximumLabel ? `${minimumLabel}–${maximumLabel}` : minimumLabel || maximumLabel;
    }
    return range?.formatted_range
      ? range.formatted_range
      : '—';
  };
  const formatCreatorCount = (creator, names) => {
    const value = getCreatorMetric(creator, names);
    return value === null ? '—' : formatCompactNumber(value);
  };
  const formatUnitsSold = (creator) => {
    const exactValue = getCreatorMetric(creator, ['units_sold', 'items_sold']);
    if (exactValue !== null) return formatCompactNumber(exactValue);
    const range = getCreatorMetric(creator, ['units_sold_range', 'items_sold_range']);
    if (!range) return '—';
    if (typeof range === 'string') return range;
    if (range.formatted_range) return range.formatted_range;
    const minimum = range.minimum_amount ?? range.minimum ?? range.min;
    const maximum = range.maximum_amount ?? range.maximum ?? range.max;
    if (minimum === undefined && maximum === undefined) return '—';
    if (minimum === undefined) return formatCompactNumber(maximum);
    if (maximum === undefined) return `${formatCompactNumber(minimum)}+`;
    if (Number(minimum) === Number(maximum)) return formatCompactNumber(minimum);
    return `${formatCompactNumber(minimum)}–${formatCompactNumber(maximum)}`;
  };
  const formatEngagementRate = (creator) => {
    const rate = getCreatorVideoEngagementRate(creator, { scope: 'shoppable' });
    if (Number.isFinite(rate)) return `${rate.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
    const range = getCreatorMetric(creator, [
      'video_engagement_rate_range',
      'engagement_rate_range',
    ]);
    if (!range) return '—';
    if (typeof range === 'string') return range.includes('%') ? range : `${range}%`;
    if (range.formatted_range) return range.formatted_range;
    const minimum = normalizeEngagementPercentage(range.minimum_rate ?? range.minimum_amount ?? range.minimum);
    const maximum = normalizeEngagementPercentage(range.maximum_rate ?? range.maximum_amount ?? range.maximum);
    if (minimum === null && maximum === null) return '—';
    if (maximum === null || minimum === maximum) return `${minimum.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
    if (minimum === null) return `${maximum.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
    return `${minimum.toLocaleString(locale, { maximumFractionDigits: 2 })}%–${maximum.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  };
  const performanceCreatorCell = (row) => <td><div className="creator-identity"><AppAvatar src={row.avatar_url} name={row.nickname || row.username || 'Creator'} /><span><strong>{row.nickname || row.username}</strong><span className="row-subtitle">@{row.username}</span></span></div></td>;
  const renderPerformanceMetric = (row, sourceHeaders, formatter) => {
    const rawMetrics = row.raw_metrics || {};
    return sourceHeaders.some((header) => Object.prototype.hasOwnProperty.call(rawMetrics, header))
      ? formatter()
      : '—';
  };
  const performanceColumns = [
    {
      key: 'creatorName',
      render: (row) => <div className="creator-identity"><AppAvatar src={row.avatar_url} name={row.nickname || row.username || 'Creator'} /><span><strong>{row.nickname || row.username}</strong><span className="row-subtitle">@{row.username}</span></span></div>,
    },
    { key: 'creatorAttributedGmv', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate GMV', 'Creator-attributed GMV'], () => formatMoney({ amount: row.affiliate_gmv, currency: row.currency })) },
    { key: 'refunds', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate refunded GMV', 'Refunds'], () => formatMoney({ amount: row.refunded_gmv, currency: row.currency })) },
    { key: 'attributedOrders', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate orders', 'Attributed orders'], () => formatNumber(row.affiliate_orders)) },
    { key: 'creatorAttributedItemsSold', numeric: true, render: (row) => renderPerformanceMetric(row, ['Items sold', 'Creator-attributed items sold'], () => formatNumber(row.items_sold)) },
    { key: 'itemsRefunded', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate items refunded', 'Items refunded'], () => formatNumber(row.items_refunded)) },
    { key: 'aov', numeric: true, tooltipKey: 'aovTooltip', render: (row) => renderPerformanceMetric(row, ['Avg. order value', 'AOV'], () => formatMoney({ amount: row.average_order_value, currency: row.currency })) },
    { key: 'liveStreams', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate LIVE streams', 'LIVE streams'], () => formatNumber(row.live_streams)) },
    { key: 'videos', numeric: true, render: (row) => renderPerformanceMetric(row, ['Affiliate shoppable videos', 'Videos'], () => formatNumber(row.shoppable_videos)) },
    { key: 'samplesShipped', numeric: true, render: (row) => renderPerformanceMetric(row, ['Samples shipped'], () => formatNumber(row.samples_shipped)) },
    { key: 'estimatedCommission', numeric: true, render: (row) => renderPerformanceMetric(row, ['Est. commission'], () => formatMoney({ amount: row.estimated_commission, currency: row.currency })) },
  ];
  const tableColumnCount = {
    open: 4,
    target: 5,
    discover: 5,
    performance: performanceColumns.length,
    creators: 7,
    orders: 4,
  }[section] || 1;
  const baseSnapshot = data.base_snapshot;
  const creatorTotals = data.totals;
  const summaryCurrency = baseSnapshot?.currency || rows.find((row) => row.currency)?.currency || 'MYR';
  const summaryValues = baseSnapshot ? {
    creatorGmv: baseSnapshot.creator_attributed_gmv,
    itemsSold: baseSnapshot.creator_attributed_items_sold,
    refundedGmv: baseSnapshot.refunds,
    estimatedCommission: baseSnapshot.estimated_commission,
    videos: baseSnapshot.videos,
    lives: baseSnapshot.live_streams,
    samplesShipped: baseSnapshot.samples_shipped,
    itemsRefunded: baseSnapshot.items_refunded,
    averageOrderValue: baseSnapshot.average_order_value,
  } : creatorTotals ? {
    creatorGmv: creatorTotals.affiliate_gmv,
    itemsSold: creatorTotals.items_sold,
    refundedGmv: creatorTotals.refunded_gmv,
    estimatedCommission: creatorTotals.estimated_commission,
    videos: creatorTotals.videos,
    lives: creatorTotals.live_streams,
    samplesShipped: creatorTotals.samples_shipped,
    itemsRefunded: creatorTotals.items_refunded,
    averageOrderValue: creatorTotals.average_order_value,
  } : null;
  const moneySummaryMetrics = new Set(['creatorGmv', 'refundedGmv', 'estimatedCommission', 'averageOrderValue']);
  const baseMetrics = summaryValues
    ? Object.entries(summaryValues)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [
        key,
        moneySummaryMetrics.has(key)
          ? formatMoney({ amount: value, currency: summaryCurrency })
          : formatNumber(value),
      ])
    : [];
  const changeSection = (value) => { resetMarketplaceSearch(); setSection(value); setStatus(value === 'target' ? 'ONGOING' : ''); setKeyword(''); setSubmittedKeyword(''); setPageTokens([]); setData({}); setError(''); };
  const submitSearch = (event) => {
    event.preventDefault();
    resetMarketplaceSearch();
    setPageTokens([]);
    setSubmittedKeyword(section === 'discover' ? normalizeCreatorSearchKeyword(keyword) : keyword.trim());
    setSearchVersion((version) => version + 1);
  };
  const markCreatorContacted = (creatorId) => {
    setData((current) => ({
      ...current,
      creators: (current.creators || []).map((creator) => (
        String(creator.creator_open_id) === String(creatorId)
          ? { ...creator, previously_invited: true, previously_invited_at: new Date().toISOString() }
          : creator
      )),
    }));
  };
  const openInvite = async (creator) => {
    setContactNotice(null);
    if (!hasAffiliateWriteScope) {
      setContactNotice({ type: 'error', text: t('sellerAffiliate.inviteScopeMissing') });
      return;
    }
    setInviteCreator(creator);
    setInviteTab('ongoing');
    setInviteLoading(true);
    setInviteProducts([]);
    setOngoingInvitations([]);
    setSelectedInvitationId('');
    setInvitationSearch('');
    setInviteForm({
      name: `${t('sellerAffiliate.invitationFor')} ${creator.nickname || creator.username || ''}`.trim(),
      products: [],
      endDate: defaultInvitationEndDate(),
      whatsappCountry: '+84',
      whatsapp: '',
      facebook: '',
      telegramCountry: '+84',
      telegram: '',
      message: '',
      contentType: 'ANY',
      hasFreeSample: false,
      sampleApprovalExempt: false,
    });
    try {
      const [targetResult, productResult] = await Promise.all([
        fetchTikTokSellerTargetCollaborations(shopId, { pageSize: 20, status: 'ONGOING' }),
        fetchTikTokSellerOpenCollaborations(shopId, { pageSize: 100 }),
      ]);
      const invitations = (targetResult.target_collaborations || []).slice(0, 5);
      const products = (productResult.open_collaborations || []).filter((item) => item.product?.id);
      setOngoingInvitations(invitations);
      setSelectedInvitationId(invitations[0]?.id ? String(invitations[0].id) : '');
      setInviteProducts(products);
      if (products[0]) {
        setInviteForm((current) => ({
          ...current,
          products: [{
            id: String(products[0].product.id),
            commission: String(Number(products[0].current_commission?.rate || products[0].commission_rate || 1000) / 100),
          }],
        }));
      }
    } catch (err) {
      setContactNotice({ type: 'error', text: err.message });
      setInviteCreator(null);
    } finally {
      setInviteLoading(false);
    }
  };
  const submitExistingInvite = async (event) => {
    event.preventDefault();
    if (!inviteCreator || !selectedInvitationId) return;
    setInviteLoading(true);
    setContactNotice(null);
    try {
      await addTikTokSellerCreatorToInvitation(
        shopId,
        inviteCreator.creator_open_id,
        selectedInvitationId,
      );
      markCreatorContacted(inviteCreator.creator_open_id);
      setContactNotice({ type: 'success', text: t('sellerAffiliate.inviteSuccess') });
      setInviteCreator(null);
    } catch (err) {
      setContactNotice({ type: 'error', text: err.message });
    } finally {
      setInviteLoading(false);
    }
  };
  const toggleInviteProduct = (item) => {
    const productId = String(item.product.id);
    setInviteForm((current) => ({
      ...current,
      products: current.products.some((product) => String(product.id) === productId)
        ? current.products.filter((product) => String(product.id) !== productId)
        : [...current.products, {
          id: productId,
          commission: String(Number(item.current_commission?.rate || item.commission_rate || 1000) / 100),
        }].slice(0, 100),
    }));
  };
  const submitInvite = async (event) => {
    event.preventDefault();
    if (!inviteCreator) return;
    setInviteLoading(true);
    setContactNotice(null);
    try {
      const preference = inviteForm.contentType === 'VIDEO'
        ? t('sellerAffiliate.shoppableVideos')
        : inviteForm.contentType === 'LIVE'
          ? t('sellerAffiliate.liveSessions')
          : '';
      const message = [
        inviteForm.message.trim(),
        inviteForm.facebook.trim() ? `Facebook: ${inviteForm.facebook.trim()}` : '',
        preference ? `${t('sellerAffiliate.preferredContentType')}: ${preference}` : '',
      ].filter(Boolean).join('\n\n');
      await inviteTikTokSellerMarketplaceCreator(shopId, inviteCreator.creator_open_id, {
        name: inviteForm.name.trim(),
        message,
        end_time: Math.floor(new Date(`${inviteForm.endDate}T23:59:59`).getTime() / 1000),
        whatsapp: internationalPhone(inviteForm.whatsappCountry, inviteForm.whatsapp),
        telegram: internationalPhone(inviteForm.telegramCountry, inviteForm.telegram),
        products: inviteForm.products.map((product) => ({
          id: product.id,
          target_commission_rate: Math.round(Number(product.commission) * 100),
        })),
        has_free_sample: inviteForm.hasFreeSample,
        is_sample_approval_exempt: inviteForm.hasFreeSample && inviteForm.sampleApprovalExempt,
      });
      markCreatorContacted(inviteCreator.creator_open_id);
      setContactNotice({ type: 'success', text: t('sellerAffiliate.inviteSuccess') });
      setInviteCreator(null);
    } catch (err) {
      setContactNotice({ type: 'error', text: err.message });
    } finally {
      setInviteLoading(false);
    }
  };
  const openCreatorDetail = async (application) => {
    setSelectedCreatorApplication({
      ...application,
      status: formatStatus(application.status, t),
      fulfillment_status: formatStatus(application.fulfillment_status, t),
    });
    setCreatorContent(null);
    const productId = application.product?.id;
    try {
      setCreatorDetailLoading(true);
      const [contentResult, fulfillmentResult] = await Promise.allSettled([
        productId
          ? fetchTikTokSellerCreatorContentDetails(shopId, { productId })
          : Promise.resolve(null),
        application.sample_content_status === 'PENDING_SYNC'
          ? fetchTikTokSellerSampleApplicationFulfillments(shopId, application.id)
          : Promise.resolve(null),
      ]);
      if (contentResult.status === 'fulfilled' && contentResult.value) {
        const details = contentResult.value.creator_content_details || [];
        const username = String(application.creator?.username || '').replace(/^@/, '');
        const content = details.find((item) => String(item.creator_profile?.username || '').replace(/^@/, '') === username) || details[0] || null;
        setCreatorContent(content ? { ...content, promotion_status: formatStatus(content.promotion_status, t) } : null);
      }
      if (fulfillmentResult.status === 'fulfilled' && fulfillmentResult.value) {
        const enriched = { ...application, ...fulfillmentResult.value };
        setSelectedCreatorApplication({
          ...enriched,
          status: formatStatus(enriched.status, t),
          fulfillment_status: formatStatus(enriched.fulfillment_status, t),
        });
        setData((current) => ({
          ...current,
          sample_applications: (current.sample_applications || []).map((item) => (
            String(item.id) === String(application.id) ? { ...item, ...fulfillmentResult.value } : item
          )),
        }));
      } else if (fulfillmentResult.status === 'rejected') {
        setSelectedCreatorApplication((current) => current ? {
          ...current,
          sample_content_status: 'UNAVAILABLE',
        } : current);
      }
    } finally {
      setCreatorDetailLoading(false);
    }
  };
  const closeCreatorDetail = () => { setSelectedCreatorApplication(null); setCreatorContent(null); };

  return {
    baseMetrics,
    changePage,
    changeSection,
    closeCreatorDetail,
    contactNotice,
    creatorBreakdown,
    creatorBreakdownCurrency,
    creatorBreakdownMetric,
    creatorBreakdownMetricOptions,
    creatorBreakdownTotal,
    creatorContent,
    creatorDetailLoading,
    creatorStatusOptions,
    currentPage,
    data,
    error,
    formatCreatorCount,
    formatCreatorGmv,
    formatEngagementRate,
    formatMoney,
    formatMoneyValues,
    formatNumber,
    formatRate,
    formatTime,
    formatUnitsSold,
    hasMarketplaceScope,
    hasProductScope,
    hasScope,
    hasShopOrderScope,
    connectCustomApp,
    invitationSearch,
    inviteCreator,
    inviteForm,
    inviteLoading,
    inviteProducts,
    inviteTab,
    keyword,
    loading,
    locale,
    ongoingInvitations,
    openCollaborationSettings,
    openCreatorDetail,
    openInvite,
    orderOverview,
    orderOverviewError,
    orderOverviewLoading,
    orderPeriod,
    orderPeriodOptions,
    orderRange,
    orderSourceFilter,
    orderStatusFilter,
    performanceBreakdown,
    performanceBreakdownTotal,
    performanceColumns,
    performanceCreatorCell,
    performanceWindow,
    performanceWindowOptions,
    resetMarketplaceSearch,
    rows,
    section,
    selectedCreatorApplication,
    selectedInvitationId,
    selectedPerformanceExport,
    selectedShop,
    setContactNotice,
    setCreatorBreakdownMetric,
    setData,
    setInvitationSearch,
    setInviteCreator,
    setInviteForm,
    setInviteTab,
    setKeyword,
    setOrderPeriod,
    setOrderRange,
    setOrderSourceFilter,
    setOrderStatusFilter,
    setPageTokens,
    setPerformanceWindow,
    setSelectedInvitationId,
    setShopId,
    setStatus,
    shopId,
    shops,
    status,
    submitExistingInvite,
    submitInvite,
    submitSearch,
    submittedKeyword,
    t,
    tableColumnCount,
    targetStatusOptions,
    toggleInviteProduct,
    totalPages,
  };
};
