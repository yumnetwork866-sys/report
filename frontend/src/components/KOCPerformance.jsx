import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  disconnectTikTokPartner,
  fetchKocDetail,
  fetchKpis,
  fetchTikTokPartnerCollaborations,
  fetchTikTokPartnerCreatorOverview,
  fetchTikTokPartnerStatuses,
  startTikTokPartnerOauth,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import Pagination from './Pagination';
import AppAvatar from './AppAvatar';
import DatePickerInput from './DatePickerInput';

const REQUIRED_CREATOR_SCOPES = ['creator.affiliate.info', 'creator.affiliate_collaboration.read', 'creator.showcase.read'];
const PAGE_SIZE = 10;
const OAUTH_UI_STATE_KEY = 'koc-performance-oauth-ui-state';
const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.24)',
  color: '#0f172a',
};
const CHART_TICK = { fill: '#64748b', fontSize: 12 };
const displayKocName = (name) => String(name || '').replace(/\s*\(?\s*KOC(?:\s*(?:nữ|nam))?\s*\)?$/iu, '').trim();
const dateOnly = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

const KOCPerformance = ({ heroTitle }) => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const { formatMoney } = useMoneyFormatter(locale);
  const [activeTab, setActiveTab] = useState('performance');
  const [kpis, setKpis] = useState(null);
  const [partnerStatuses, setPartnerStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [connectionFilter, setConnectionFilter] = useState('all');
  const [showcaseFilter, setShowcaseFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [minViews, setMinViews] = useState('');
  const [periodPreset, setPeriodPreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [chartMetric, setChartMetric] = useState('totalViews');
  const [sort, setSort] = useState({ key: 'totalViews', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [showExtraColumns, setShowExtraColumns] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [selectedKoc, setSelectedKoc] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState(null);
  const [drawerOverview, setDrawerOverview] = useState(null);
  const [drawerCollaborations, setDrawerCollaborations] = useState([]);
  const [drawerError, setDrawerError] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [oauthHydratingId, setOauthHydratingId] = useState(null);
  const closeDrawerRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const oauthRestoreRef = useRef(new URLSearchParams(window.location.search).has('partner_oauth_status'));
  const pendingScrollRef = useRef(null);

  const formatNumber = (value) => Number(value || 0).toLocaleString(locale);
  const formatDate = (value) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value)) : t('common.noData');
  const formatDateTime = (value) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : t('common.noData');
  const formatPercent = (value) => value === null || value === undefined ? t('common.noData') : `${Number(value).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;

  const loadPageData = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const [kpiResult, statusResult] = await Promise.allSettled([
        fetchKpis(signal, 'koc', { startDate, endDate }),
        fetchTikTokPartnerStatuses(signal),
      ]);
      if (kpiResult.status === 'rejected') throw kpiResult.reason;
      setKpis(kpiResult.value);
      setPartnerStatuses(statusResult.status === 'fulfilled' ? statusResult.value : []);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || t('koc.errorLoad'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [endDate, startDate, t]);

  useEffect(() => {
    const controller = new AbortController();
    loadPageData(controller.signal);
    return () => controller.abort();
  }, [loadPageData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('partner_oauth_status');
    if (!oauthStatus) return;
    let restored = null;
    try { restored = JSON.parse(sessionStorage.getItem(OAUTH_UI_STATE_KEY) || 'null'); } catch { restored = null; }
    if (restored?.filters) {
      setSearch(restored.filters.search || '');
      setConnectionFilter(restored.filters.connectionFilter || 'all');
      setShowcaseFilter(restored.filters.showcaseFilter || 'all');
      setRegionFilter(restored.filters.regionFilter || 'all');
      setMinViews(restored.filters.minViews || '');
      setPeriodPreset(restored.filters.periodPreset || 'all');
      setStartDate(restored.filters.startDate || '');
      setEndDate(restored.filters.endDate || '');
    }
    setActiveTab('creator');
    const creatorId = Number(params.get('creator_id')) || null;
    if (oauthStatus === 'success') {
      setToast({ type: 'info', message: t('koc.oauthLoadingProfile') });
      setOauthHydratingId(creatorId);
    } else {
      setToast({ type: 'error', message: params.get('partner_oauth_message') || t('koc.partnerError'), retryId: creatorId });
    }
    if (restored?.scrollY !== undefined) pendingScrollRef.current = restored.scrollY;
    sessionStorage.removeItem(OAUTH_UI_STATE_KEY);
    window.history.replaceState({}, '', window.location.pathname);
  }, [t]);

  useEffect(() => {
    if (oauthRestoreRef.current) return;
    try {
      sessionStorage.setItem(OAUTH_UI_STATE_KEY, JSON.stringify({
        filters: { search, connectionFilter, showcaseFilter, regionFilter, minViews, periodPreset, startDate, endDate },
      }));
    } catch {
      // OAuth still works when session storage is unavailable; only UI restoration is skipped.
    }
  }, [connectionFilter, endDate, minViews, periodPreset, regionFilter, search, showcaseFilter, startDate]);

  useEffect(() => {
    if (!oauthHydratingId) return undefined;
    let active = true;
    const hydrate = async () => {
      try {
        await fetchTikTokPartnerCreatorOverview(oauthHydratingId);
        const statuses = await fetchTikTokPartnerStatuses();
        if (!active) return;
        setPartnerStatuses(statuses);
        setToast({ type: 'success', message: t('koc.partnerConnected') });
        setHighlightId(oauthHydratingId);
      } catch (err) {
        if (active) setToast({ type: 'error', message: err.message || t('koc.partnerError'), retryId: oauthHydratingId });
      } finally {
        if (active) setOauthHydratingId(null);
      }
    };
    hydrate();
    return () => { active = false; };
  }, [oauthHydratingId, t]);

  useEffect(() => {
    if (oauthRestoreRef.current) { oauthRestoreRef.current = false; return; }
    if (periodPreset === 'custom') return;
    if (periodPreset === 'all') { setStartDate(''); setEndDate(''); return; }
    const end = new Date();
    const start = new Date(end);
    if (periodPreset === '7d') start.setDate(end.getDate() - 6);
    if (periodPreset === '30d') start.setDate(end.getDate() - 29);
    if (periodPreset === 'quarter') start.setMonth(Math.floor(end.getMonth() / 3) * 3, 1);
    setStartDate(dateOnly(start));
    setEndDate(dateOnly(end));
  }, [periodPreset]);

  useEffect(() => {
    if (loading || pendingScrollRef.current === null) return;
    window.scrollTo({ top: pendingScrollRef.current });
    pendingScrollRef.current = null;
  }, [loading]);

  useEffect(() => {
    if (!selectedKoc) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSelectedKoc(null); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    requestAnimationFrame(() => closeDrawerRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      requestAnimationFrame(() => lastFocusedRef.current?.focus?.());
    };
  }, [selectedKoc]);

  const statusById = useMemo(() => new Map(partnerStatuses.map((item) => [String(item.creator_id), item])), [partnerStatuses]);
  const kocRows = useMemo(() => (kpis?.users || []).filter((user) => user.role === 'koc'), [kpis]);
  const regionOptions = useMemo(() => [...new Set(partnerStatuses.map((item) => item.register_region).filter(Boolean))].sort(), [partnerStatuses]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = kocRows.filter((user) => {
      const partner = statusById.get(String(user.id));
      const status = partner?.status || (partner?.connected ? 'connected' : 'disconnected');
      const matchesQuery = !query || [user.name, user.email, partner?.username].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
      const matchesShowcase = showcaseFilter === 'all'
        || (showcaseFilter === 'with' && Number(partner?.showcase_count || 0) > 0)
        || (showcaseFilter === 'without' && Number(partner?.showcase_count || 0) === 0);
      const matchesRegion = regionFilter === 'all' || partner?.register_region === regionFilter;
      const matchesViews = minViews === '' || Number(user.totalViews || 0) >= Number(minViews);
      if (String(user.id) === String(highlightId)) return true;
      return matchesQuery && matchesShowcase && matchesRegion && matchesViews
        && (connectionFilter === 'all' || connectionFilter === status);
    });
    const direction = sort.direction === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const partnerA = statusById.get(String(a.id));
      const partnerB = statusById.get(String(b.id));
      const values = {
        name: [displayKocName(a.name), displayKocName(b.name)],
        creator: [partnerA?.username || '', partnerB?.username || ''],
        videoCount: [Number(a.videoCount || 0), Number(b.videoCount || 0)],
        totalViews: [Number(a.totalViews || 0), Number(b.totalViews || 0)],
        avgViewsPerVideo: [Number(a.avgViewsPerVideo || 0), Number(b.avgViewsPerVideo || 0)],
        over10kRate: [Number(a.over10kRate || 0), Number(b.over10kRate || 0)],
        showcase: [Number(partnerA?.showcase_count || 0), Number(partnerB?.showcase_count || 0)],
        engagement: [
          Number(a.totalViews || 0) ? (Number(a.totalLikes || 0) + Number(a.totalComments || 0) + Number(a.totalShares || 0)) / Number(a.totalViews) * 100 : 0,
          Number(b.totalViews || 0) ? (Number(b.totalLikes || 0) + Number(b.totalComments || 0) + Number(b.totalShares || 0)) / Number(b.totalViews) * 100 : 0,
        ],
        status: [partnerA?.status || 'disconnected', partnerB?.status || 'disconnected'],
      };
      const [left, right] = values[sort.key] || values.totalViews;
      return (typeof left === 'string' ? left.localeCompare(right) : left - right) * direction;
    });
  }, [connectionFilter, highlightId, kocRows, minViews, regionFilter, search, showcaseFilter, sort, statusById]);

  useEffect(() => setPage(1), [connectionFilter, search, showcaseFilter, regionFilter, minViews, sort, startDate, endDate]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pagedRows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (!highlightId) return undefined;
    const highlightedIndex = visibleRows.findIndex((user) => String(user.id) === String(highlightId));
    const highlightedPage = highlightedIndex >= 0 ? Math.floor(highlightedIndex / PAGE_SIZE) + 1 : 1;
    if (page !== highlightedPage) { setPage(highlightedPage); return undefined; }
    const row = document.getElementById(`koc-row-${highlightId}`) || document.getElementById(`koc-card-${highlightId}`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(() => setHighlightId(null), 5000);
    return () => window.clearTimeout(timer);
  }, [highlightId, page, partnerStatuses, visibleRows]);

  const summary = useMemo(() => {
    const totalVideos = visibleRows.reduce((sum, row) => sum + Number(row.videoCount || 0), 0);
    const totalViews = visibleRows.reduce((sum, row) => sum + Number(row.totalViews || 0), 0);
    const interactions = visibleRows.reduce((sum, row) => sum + Number(row.totalLikes || 0) + Number(row.totalComments || 0) + Number(row.totalShares || 0), 0);
    const previousViews = visibleRows.reduce((sum, row) => sum + Number(row.previousPeriodViews || 0), 0);
    const currentViews = visibleRows.reduce((sum, row) => sum + Number(row.currentPeriodViews || 0), 0);
    return {
      totalUsers: visibleRows.length,
      totalVideos,
      totalViews,
      avgViews: totalVideos ? Math.round(totalViews / totalVideos) : 0,
      engagement: totalViews ? interactions / totalViews * 100 : null,
      growth: previousViews ? (currentViews - previousViews) / previousViews * 100 : null,
      showcase: partnerStatuses.reduce((sum, item) => sum + Number(item.showcase_count || 0), 0),
    };
  }, [partnerStatuses, visibleRows]);

  const topChartData = useMemo(() => [...visibleRows].sort((a, b) => {
    const metric = (user) => chartMetric === 'engagement'
      ? (Number(user.totalViews || 0) ? (Number(user.totalLikes || 0) + Number(user.totalComments || 0) + Number(user.totalShares || 0)) / Number(user.totalViews) * 100 : 0)
      : Number(user[chartMetric] || 0);
    return metric(b) - metric(a);
  }).slice(0, 10).map((user) => ({
    id: user.id,
    name: displayKocName(user.name),
    value: chartMetric === 'engagement'
      ? (Number(user.totalViews || 0) ? (Number(user.totalLikes || 0) + Number(user.totalComments || 0) + Number(user.totalShares || 0)) / Number(user.totalViews) * 100 : 0)
      : Number(user[chartMetric] || 0),
  })), [chartMetric, visibleRows]);

  const activeFilters = useMemo(() => [
    search ? { key: 'search', label: `${t('common.search')}: ${search}` } : null,
    periodPreset !== 'all' ? { key: 'period', label: t(`koc.period_${periodPreset}`) } : null,
    connectionFilter !== 'all' ? { key: 'connection', label: t(`koc.partnerStatus${connectionFilter.charAt(0).toUpperCase()}${connectionFilter.slice(1)}`) } : null,
    showcaseFilter !== 'all' ? { key: 'showcase', label: t(showcaseFilter === 'with' ? 'koc.hasShowcase' : 'koc.noShowcase') } : null,
    regionFilter !== 'all' ? { key: 'region', label: `${t('koc.partnerRegion')}: ${regionFilter}` } : null,
    minViews !== '' ? { key: 'views', label: `${t('koc.minViews')}: ${Number(minViews || 0).toLocaleString(locale)}` } : null,
  ].filter(Boolean), [connectionFilter, locale, minViews, periodPreset, regionFilter, search, showcaseFilter, t]);

  const clearFilter = (key) => {
    if (key === 'search') setSearch('');
    if (key === 'period') setPeriodPreset('all');
    if (key === 'connection') setConnectionFilter('all');
    if (key === 'showcase') setShowcaseFilter('all');
    if (key === 'region') setRegionFilter('all');
    if (key === 'views') setMinViews('');
  };
  const clearAllFilters = () => {
    setSearch(''); setPeriodPreset('all'); setConnectionFilter('all'); setShowcaseFilter('all'); setRegionFilter('all'); setMinViews('');
  };

  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));
  const sortMark = (key) => sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '';

  const connectPartner = async ({ creatorId, createKoc = false } = {}) => {
    try {
      sessionStorage.setItem(OAUTH_UI_STATE_KEY, JSON.stringify({
        scrollY: window.scrollY,
        filters: { search, connectionFilter, showcaseFilter, regionFilter, minViews, periodPreset, startDate, endDate },
      }));
      setToast({ type: 'info', message: t('koc.oauthRedirecting') });
      const { authorizeUrl } = await startTikTokPartnerOauth('/manage/koc-performance', { creatorId, createKoc });
      window.location.assign(authorizeUrl);
    } catch (err) { setToast({ type: 'error', message: err.message || t('koc.partnerError') }); }
  };

  const refreshStatuses = async () => setPartnerStatuses(await fetchTikTokPartnerStatuses());
  const syncPartner = async (creatorId, event) => {
    event?.stopPropagation();
    try {
      setActionId(creatorId);
      await fetchTikTokPartnerCreatorOverview(creatorId);
      await refreshStatuses();
      setToast({ type: 'success', message: t('koc.partnerSyncSuccess') });
      if (selectedKoc?.id === creatorId) await openDrawer(selectedKoc);
    } catch (err) { setToast({ type: 'error', message: err.message || t('koc.partnerError'), retryId: creatorId }); }
    finally { setActionId(null); }
  };

  const disconnectPartner = async (creatorId, event) => {
    event?.stopPropagation();
    if (!window.confirm(t('koc.partnerDisconnectConfirm'))) return;
    try {
      await disconnectTikTokPartner(creatorId);
      await refreshStatuses();
      if (selectedKoc?.id === creatorId) setSelectedKoc(null);
    } catch (err) { setError(err.message || t('koc.partnerError')); }
  };

  const openDrawer = async (user) => {
    lastFocusedRef.current = document.activeElement;
    setSelectedKoc(user);
    setDrawerLoading(true);
    setDrawerError('');
    setDrawerData(null);
    setDrawerOverview(null);
    setDrawerCollaborations([]);
    const partner = statusById.get(String(user.id));
    const requests = [fetchKocDetail(user.id, { startDate, endDate })];
    if (partner?.connected) {
      requests.push(fetchTikTokPartnerCreatorOverview(user.id));
      requests.push(fetchTikTokPartnerCollaborations({ creatorId: user.id }));
    }
    const results = await Promise.allSettled(requests);
    if (results[0].status === 'fulfilled') setDrawerData(results[0].value);
    else setDrawerError(results[0].reason?.message || t('koc.detailError'));
    if (results[1]?.status === 'fulfilled') setDrawerOverview(results[1].value);
    if (results[2]?.status === 'fulfilled') setDrawerCollaborations(results[2].value?.collaborations || []);
    setDrawerLoading(false);
  };

  const closeDrawer = () => setSelectedKoc(null);
  const chartPoints = useMemo(() => {
    const rows = drawerData?.dailyViews || [];
    if (!rows.length) return '';
    const max = Math.max(1, ...rows.map((row) => Number(row.views || 0)));
    return rows.map((row, index) => `${rows.length === 1 ? 50 : index / (rows.length - 1) * 100},${100 - Number(row.views || 0) / max * 86}`).join(' ');
  }, [drawerData]);

  const renderSortHeader = (key, label, className = '') => (
    <th className={className}><button className="table-sort" type="button" onClick={() => toggleSort(key)}>{label}{sortMark(key)}</button></th>
  );

  return (
    <div className="page">
      <section className="page__hero koc-hero">
        <div>
          <h1 className="page__title">{t('koc.heroTitle') || heroTitle}</h1>
        </div>
        <div className="koc-tabs" role="tablist" aria-label={t('koc.tabsLabel')}>
          <button id="performance-tab" aria-controls="performance-panel" className={activeTab === 'performance' ? 'is-active' : ''} role="tab" aria-selected={activeTab === 'performance'} tabIndex={activeTab === 'performance' ? 0 : -1} onClick={() => setActiveTab('performance')}>{t('koc.performanceTab')}</button>
          <button id="creator-tab" aria-controls="creator-panel" className={activeTab === 'creator' ? 'is-active' : ''} role="tab" aria-selected={activeTab === 'creator'} tabIndex={activeTab === 'creator' ? 0 : -1} onClick={() => setActiveTab('creator')}>{t('koc.creatorTab')}</button>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}
      {toast ? <div className={`koc-toast koc-toast--${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-live="polite"><span>{toast.type === 'info' ? <span className="loading-dot" aria-hidden="true" /> : null}{toast.message}</span><div className="actions actions--inline">{toast.retryId ? <button className="button button--small" type="button" onClick={(event) => syncPartner(toast.retryId, event)}>{t('koc.retry')}</button> : null}<button className="koc-toast__close" type="button" aria-label={t('common.close')} onClick={() => setToast(null)}>×</button></div></div> : null}

      <section className="section-card koc-filters" aria-labelledby="koc-filters-title">
        <div className="section-card__header"><div><h2 className="section-card__title" id="koc-filters-title">{t('koc.filters')}</h2></div>{activeFilters.length ? <button className="button button--ghost" type="button" onClick={clearAllFilters}>{t('koc.clearAll')}</button> : null}</div>
        <div className="koc-filter-grid">
          <div className="field"><label htmlFor="koc-search">{t('common.search')}</label><input id="koc-search" type="search" value={search} placeholder={t('koc.searchExtendedPlaceholder')} onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="field"><label htmlFor="period-preset">{t('koc.period')}</label><select id="period-preset" value={periodPreset} onChange={(event) => setPeriodPreset(event.target.value)}><option value="all">{t('koc.period_all')}</option><option value="7d">{t('koc.period_7d')}</option><option value="30d">{t('koc.period_30d')}</option><option value="quarter">{t('koc.period_quarter')}</option><option value="custom">{t('koc.period_custom')}</option></select></div>
          <div className="field"><label htmlFor="connection-status">{t('koc.connectionStatus')}</label><select id="connection-status" value={connectionFilter} onChange={(event) => setConnectionFilter(event.target.value)}><option value="all">{t('koc.statusAll')}</option><option value="connected">{t('koc.partnerStatusConnected')}</option><option value="disconnected">{t('koc.partnerStatusDisconnected')}</option><option value="expired">{t('koc.partnerStatusExpired')}</option></select></div>
          <div className="field"><label htmlFor="showcase-status">{t('koc.showcaseFilter')}</label><select id="showcase-status" value={showcaseFilter} onChange={(event) => setShowcaseFilter(event.target.value)}><option value="all">{t('koc.showcaseAll')}</option><option value="with">{t('koc.hasShowcase')}</option><option value="without">{t('koc.noShowcase')}</option></select></div>
          <div className="field"><label htmlFor="creator-region">{t('koc.partnerRegion')}</label><select id="creator-region" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="all">{t('koc.regionAll')}</option>{regionOptions.map((region) => <option value={region} key={region}>{region}</option>)}</select></div>
          <div className="field"><label htmlFor="min-views">{t('koc.minViews')}</label><input id="min-views" type="number" min="0" step="1000" value={minViews} placeholder="10000" onChange={(event) => setMinViews(event.target.value)} /></div>
          {periodPreset === 'custom' ? <><div className="field"><label htmlFor="koc-start-date">{t('koc.startDate')}</label><DatePickerInput id="koc-start-date" label={t('koc.startDate')} value={startDate} max={endDate || undefined} onChange={setStartDate} /></div><div className="field"><label htmlFor="koc-end-date">{t('koc.endDate')}</label><DatePickerInput id="koc-end-date" label={t('koc.endDate')} value={endDate} min={startDate || undefined} onChange={setEndDate} /></div></> : null}
        </div>
        {activeFilters.length ? <div className="active-filter-row" aria-label={t('koc.activeFilters')}>{activeFilters.map((filter) => <button className="filter-chip" type="button" key={filter.key} onClick={() => clearFilter(filter.key)} aria-label={`${t('koc.removeFilter')} ${filter.label}`}>{filter.label}<span aria-hidden="true">×</span></button>)}</div> : null}
      </section>

      {activeTab === 'performance' ? (
        <div id="performance-panel" role="tabpanel" aria-labelledby="performance-tab" className="koc-tab-panel">
          <section className="page__stats page__stats--four">
            {[['totalKoc', summary.totalUsers], ['totalViews', summary.totalViews], ['videos', summary.totalVideos], ['avgViewsPerVideo', summary.avgViews]].map(([key, value]) => (
              <article className="stat-card" key={key}><p className="stat-card__label">{t(`koc.${key}`)}</p><p className="stat-card__value">{formatNumber(value)}</p></article>
            ))}
          </section>
          <section className="page__stats page__stats--four">
            <article className="stat-card"><p className="stat-card__label">{t('koc.engagementRate')}</p><p className="stat-card__value">{formatPercent(summary.engagement)}</p></article>
            <article className="stat-card"><p className="stat-card__label">{t('koc.periodGrowth')}</p><p className="stat-card__value">{formatPercent(summary.growth)}</p></article>
            <article className="stat-card"><p className="stat-card__label">{t('koc.totalShowcaseProducts')}</p><p className="stat-card__value">{formatNumber(summary.showcase)}</p></article>
          </section>
          <section className="koc-chart-grid">
            <article className="section-card koc-chart-card" aria-labelledby="top-koc-chart-title">
              <div className="section-card__header"><div><h2 className="section-card__title" id="top-koc-chart-title">{t('koc.top10Chart')}</h2><p className="section-card__meta">{t('koc.top10ChartMeta')}</p></div><div className="field chart-metric-field"><label htmlFor="chart-metric">{t('koc.metric')}</label><select id="chart-metric" value={chartMetric} onChange={(event) => setChartMetric(event.target.value)}><option value="totalViews">{t('koc.totalViews')}</option><option value="videoCount">{t('koc.videos')}</option><option value="engagement">{t('koc.engagementRate')}</option></select></div></div>
              {topChartData.length ? <div className="koc-chart" role="img" aria-label={`${t('koc.top10Chart')} · ${t(chartMetric === 'engagement' ? 'koc.engagementRate' : chartMetric === 'videoCount' ? 'koc.videos' : 'koc.totalViews')}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={topChartData} margin={{ top: 8, right: 8, bottom: 46, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" angle={-32} textAnchor="end" interval="preserveStartEnd" minTickGap={18} height={70} axisLine={false} tickLine={false} tick={CHART_TICK} /><YAxis width={56} axisLine={false} tickLine={false} tick={CHART_TICK} tickFormatter={(value) => chartMetric === 'engagement' ? `${value}%` : Intl.NumberFormat(locale, { notation: 'compact' }).format(value)} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(0, 242, 234, 0.08)' }} formatter={(value) => chartMetric === 'engagement' ? formatPercent(value) : formatNumber(value)} /><Bar dataKey="value" fill="var(--color-social-cyan-strong)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="empty-state">{t('koc.noData')}</div>}
            </article>
            <article className="section-card koc-chart-card" aria-labelledby="weekly-chart-title">
              <div className="section-card__header"><div><h2 className="section-card__title" id="weekly-chart-title">{t('koc.weeklyViews')}</h2><p className="section-card__meta">{t('koc.weeklyViewsMeta')}</p></div></div>
              {kpis?.weeklyViews?.length ? <div className="koc-chart" role="img" aria-label={t('koc.weeklyViews')}><ResponsiveContainer width="100%" height="100%"><LineChart data={kpis.weeklyViews} margin={{ top: 8, right: 16, bottom: 12, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="week" axisLine={false} tickLine={false} tick={CHART_TICK} tickFormatter={(value) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(value))} /><YAxis width={56} axisLine={false} tickLine={false} tick={CHART_TICK} tickFormatter={(value) => Intl.NumberFormat(locale, { notation: 'compact' }).format(value)} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelFormatter={(value) => formatDate(value)} formatter={(value) => formatNumber(value)} /><Line type="monotone" dataKey="views" stroke="var(--color-social-magenta)" strokeWidth={3} dot={{ r: 3, fill: '#ffffff', strokeWidth: 2 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div> : <div className="empty-state">{t('koc.noWeeklyViews')}</div>}
            </article>
          </section>
          <section className="section-card">
            <div className="section-card__header"><div><h2 className="section-card__title">{t('koc.topVideo')}</h2><p className="section-card__meta">{t('koc.topVideoRichMeta')}</p></div></div>
            <div className="top-video-grid">{(kpis?.topVideos || []).map((video) => <article className="top-video-card" key={video.id}>{video.thumbnailUrl ? <a href={video.videoUrl || '#'} target={video.videoUrl ? '_blank' : undefined} rel="noreferrer"><img src={video.thumbnailUrl} alt="" loading="lazy" /></a> : <div className="top-video-card__placeholder" aria-hidden="true">▶</div>}<div className="top-video-card__body"><h3>{video.videoUrl ? <a href={video.videoUrl} target="_blank" rel="noreferrer">{video.title}</a> : video.title}</h3><span className="row-subtitle">{video.creatorNames || t('common.unknown')}</span><div className="top-video-card__meta"><strong>{formatNumber(video.views)} {t('common.views')}</strong><span>{formatDate(video.publishedAt)}</span></div>{video.videoUrl ? <a className="top-video-card__link" href={video.videoUrl} target="_blank" rel="noreferrer" aria-label={`${t('koc.openTikTok')}: ${video.title}`}>{t('koc.openTikTok')} ↗</a> : null}</div></article>)}{!kpis?.topVideos?.length ? <div className="empty-state">{t('koc.noVideoData')}</div> : null}</div>
          </section>
        </div>
      ) : (
        <div id="creator-panel" role="tabpanel" aria-labelledby="creator-tab" className="koc-tab-panel">
          <section className="section-card">
            <div className="section-card__header">
              <div><h2 className="section-card__title">{t('koc.creatorTableTitle')}</h2></div>
              <div className="actions"><button className="button" type="button" onClick={() => connectPartner({ createKoc: true })}>{t('koc.addFromTikTok')}</button><button className="button button--ghost koc-column-toggle" type="button" onClick={() => setShowExtraColumns((value) => !value)}>{t(showExtraColumns ? 'koc.hideExtraColumns' : 'koc.showExtraColumns')}</button></div>
            </div>
            <div className="table-wrap koc-table-wrap">
              <table className={`data-table koc-table ${showExtraColumns ? 'koc-table--expanded' : ''}`}>
                <thead><tr>{renderSortHeader('name', t('koc.koc'))}{renderSortHeader('creator', t('koc.creator'))}{renderSortHeader('videoCount', t('koc.videos'), 'cell-number koc-col--secondary')}{renderSortHeader('totalViews', t('koc.totalViews'), 'cell-number')}{renderSortHeader('avgViewsPerVideo', t('koc.avgViewsPerVideo'), 'cell-number koc-col--secondary')}{renderSortHeader('over10kRate', t('koc.over10kRate'), 'cell-number koc-col--secondary')}{renderSortHeader('showcase', t('koc.partnerShowcaseProducts'), 'cell-number')}{renderSortHeader('status', t('koc.connectionStatus'))}<th>{t('koc.actions')}</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={9}><div className="empty-state"><div className="loading-dot" />{t('koc.loading')}</div></td></tr> : pagedRows.map((user) => {
                    const partner = statusById.get(String(user.id));
                    const status = partner?.status || (partner?.connected ? 'connected' : 'disconnected');
                    return <tr id={`koc-row-${user.id}`} className={`koc-table__row ${String(highlightId) === String(user.id) ? 'is-highlighted' : ''}`} key={user.id} tabIndex="0" aria-label={`${displayKocName(user.name)} · ${t(`koc.partnerStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`)}`} onClick={() => openDrawer(user)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDrawer(user); } }}>
                      <td><div className="creator-identity"><AppAvatar src={partner?.avatar_url} name={displayKocName(user.name)} seed={partner?.creator_open_id || partner?.username || user.id} /><span className="row-title">{displayKocName(user.name)}</span></div></td>
                      <td>{partner?.username ? <><span className="row-title">@{partner.username.replace(/^@/, '')}</span><span className="row-subtitle">{partner.register_region || ''}</span></> : <span className="row-subtitle">{t('koc.partnerManualUser')}</span>}</td>
                      <td className="cell-number koc-col--secondary">{formatNumber(user.videoCount)}</td><td className="cell-number">{formatNumber(user.totalViews)}</td><td className="cell-number koc-col--secondary">{formatNumber(user.avgViewsPerVideo)}</td><td className="cell-number koc-col--secondary">{user.over10kRate}%</td><td className="cell-number">{formatNumber(partner?.showcase_count)}</td>
                      <td><span className={`chip creator-status--${status}`}>{t(`koc.partnerStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`)}</span>{partner?.last_sync_status === 'failed' ? <span className="chip chip--amber">{t('koc.syncFailed')}</span> : null}<span className="row-subtitle">{partner?.connected ? `${t('koc.partnerLastSync')}: ${formatDateTime(partner.last_synced_at)}` : ''}</span></td>
                      <td onClick={(event) => event.stopPropagation()}>{partner?.connected ? <div className="actions actions--inline"><button className="button button--small" type="button" aria-label={`${t('koc.partnerView')} ${displayKocName(user.name)}`} onClick={() => openDrawer(user)}>{t('koc.partnerView')}</button><button className="button button--small button--ghost" type="button" aria-label={`${t('koc.partnerSync')} ${displayKocName(user.name)}`} disabled={String(actionId) === String(user.id)} onClick={(event) => syncPartner(user.id, event)}>{String(actionId) === String(user.id) ? t('common.loading') : t('koc.partnerSync')}</button><details className="action-menu"><summary className="button button--small button--ghost" aria-label={`${t('koc.partnerMoreActions')} ${displayKocName(user.name)}`}>•••</summary><div className="action-menu__panel"><button type="button" onClick={() => connectPartner({ creatorId: user.id })}>{t('koc.partnerReconnect')}</button><button className="action-menu__danger" type="button" onClick={(event) => disconnectPartner(user.id, event)}>{t('koc.partnerDisconnect')}</button></div></details></div> : <button className="button button--small" type="button" onClick={() => connectPartner({ creatorId: user.id })}>{t('koc.partnerConnect')}</button>}</td>
                    </tr>;
                  })}
                  {!loading && !pagedRows.length ? <tr><td colSpan={9}><div className="empty-state">{t('koc.noMatch')}</div></td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="koc-mobile-list">
              {loading ? <div className="empty-state"><div className="loading-dot" />{t('koc.loading')}</div> : pagedRows.map((user) => {
                const partner = statusById.get(String(user.id));
                const status = partner?.status || (partner?.connected ? 'connected' : 'disconnected');
                return <article id={`koc-card-${user.id}`} className={`koc-mobile-card ${String(highlightId) === String(user.id) ? 'is-highlighted' : ''}`} key={user.id}>
                  <div className="koc-mobile-card__header"><button className="creator-identity koc-mobile-card__open" type="button" aria-label={`${t('koc.partnerView')} ${displayKocName(user.name)}`} onClick={() => openDrawer(user)}><AppAvatar src={partner?.avatar_url} name={displayKocName(user.name)} seed={partner?.creator_open_id || partner?.username || user.id} /><span><strong>{displayKocName(user.name)}</strong><span className="row-subtitle">{partner?.username ? `@${partner.username.replace(/^@/, '')}` : t('koc.partnerManualUser')}</span></span></button><details className="action-menu action-menu--mobile"><summary className="button button--ghost" aria-label={`${t('koc.partnerMoreActions')} ${displayKocName(user.name)}`}>•••</summary><div className="action-menu__panel"><button type="button" onClick={() => openDrawer(user)}>{t('koc.partnerView')}</button>{partner?.connected ? <><button type="button" disabled={String(actionId) === String(user.id)} onClick={(event) => syncPartner(user.id, event)}>{t('koc.partnerSync')}</button><button type="button" onClick={() => connectPartner({ creatorId: user.id })}>{t('koc.partnerReconnect')}</button><button className="action-menu__danger" type="button" onClick={(event) => disconnectPartner(user.id, event)}>{t('koc.partnerDisconnect')}</button></> : <button type="button" onClick={() => connectPartner({ creatorId: user.id })}>{t('koc.partnerConnect')}</button>}</div></details></div>
                  <div className="koc-mobile-card__status"><span className={`chip creator-status--${status}`}>{t(`koc.partnerStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`)}</span>{partner?.last_sync_status === 'failed' ? <span className="chip chip--amber">{t('koc.syncFailed')}</span> : null}</div>
                  <dl><div><dt>{t('koc.totalViews')}</dt><dd>{formatNumber(user.totalViews)}</dd></div><div><dt>{t('koc.videos')}</dt><dd>{formatNumber(user.videoCount)}</dd></div><div><dt>{t('koc.partnerShowcaseProducts')}</dt><dd>{formatNumber(partner?.showcase_count)}</dd></div></dl>
                </article>;
              })}
              {!loading && !pagedRows.length ? <div className="empty-state">{t('koc.noMatch')}</div> : null}
            </div>
            <Pagination currentPage={page} totalPages={pageCount} onPageChange={setPage} previousLabel={t('koc.previous')} nextLabel={t('koc.next')} ariaLabel={t('koc.pageOf').replace('{{page}}', page).replace('{{total}}', pageCount)} />
          </section>
        </div>
      )}

      {selectedKoc ? <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}><aside className="koc-drawer" role="dialog" aria-modal="true" aria-labelledby="koc-detail-title"><div className="koc-drawer__header"><div><h2 id="koc-detail-title">{displayKocName(selectedKoc.name)}</h2><p>{selectedKoc.email}</p></div><button ref={closeDrawerRef} className="button button--ghost" type="button" onClick={closeDrawer} aria-label={t('common.close')}>×</button></div>{drawerLoading ? <div className="empty-state"><div className="loading-dot" />{t('koc.detailLoading')}</div> : <div className="koc-drawer__body">{drawerError ? <div className="empty-state">{drawerError}</div> : null}<CreatorDetail partner={statusById.get(String(selectedKoc.id))} overview={drawerOverview} detail={drawerData} collaborations={drawerCollaborations} chartPoints={chartPoints} formatNumber={formatNumber} formatMoney={formatMoney} formatDate={formatDate} t={t} requiredScopes={REQUIRED_CREATOR_SCOPES} /> </div>}</aside></div> : null}
    </div>
  );
};

const CreatorDetail = ({ partner, overview, detail, collaborations, chartPoints, formatNumber, formatMoney, formatDate, t, requiredScopes }) => {
  const permissions = partner?.granted_scopes || [];
  const missingScopes = requiredScopes.filter((scope) => !permissions.includes(scope));
  const products = overview?.showcase?.products || [];
  return <>
    <section className="drawer-section"><h3>{t('koc.creatorInfo')}</h3><div className="drawer-profile"><AppAvatar src={partner?.avatar_url} name={partner?.username || 'KOC'} seed={partner?.creator_open_id || partner?.username} /><div><strong>{partner?.username ? `@${partner.username.replace(/^@/, '')}` : t('koc.partnerStatusDisconnected')}</strong><span>{partner?.register_region || t('common.noData')}</span></div></div><div className="drawer-meta"><span>{t('koc.partnerShowcaseProducts')}: <strong>{formatNumber(partner?.showcase_count)}</strong></span><span>{t('koc.partnerLastSync')}: <strong>{formatDate(partner?.last_synced_at)}</strong></span></div></section>
    <section className="drawer-section"><h3>{t('koc.viewsTimeline')}</h3>{chartPoints ? <div className="koc-line-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={t('koc.viewsTimeline')}><polyline points={chartPoints} /></svg><div className="koc-line-chart__labels"><span>{formatDate(detail?.dailyViews?.[0]?.date)}</span><span>{formatDate(detail?.dailyViews?.at(-1)?.date)}</span></div></div> : <div className="empty-state empty-state--compact">{t('koc.noTimeline')}</div>}</section>
    <section className="drawer-section"><h3>{t('koc.topVideo')}</h3>{detail?.videos?.[0] ? <div className="drawer-top-video">{detail.videos[0].thumbnailUrl ? <img src={detail.videos[0].thumbnailUrl} alt="" /> : null}<div><strong>{detail.videos[0].videoUrl ? <a href={detail.videos[0].videoUrl} target="_blank" rel="noreferrer">{detail.videos[0].title}</a> : detail.videos[0].title}</strong><span>{formatNumber(detail.videos[0].views)} {t('common.views')} · {formatDate(detail.videos[0].publishedAt)}</span></div></div> : <div className="empty-state empty-state--compact">{t('koc.noVideo')}</div>}</section>
    <section className="drawer-section"><h3>{t('koc.partnerShowcaseProducts')}</h3><div className="drawer-list">{products.slice(0, 10).map((product) => <div className="drawer-list__item" key={product.id}><strong>{product.title || product.name || product.id}</strong><span>{product.shop?.name || ''}</span></div>)}{!products.length ? <div className="empty-state empty-state--compact">{t('koc.partnerNoProducts')}</div> : null}</div></section>
    <section className="drawer-section"><h3>{t('koc.permissions')}</h3><div className="chip-row">{permissions.map((scope) => <span className="chip chip--positive" key={scope}>{scope}</span>)}{missingScopes.map((scope) => <span className="chip chip--amber" key={scope}>{t('koc.missing')}: {scope}</span>)}</div></section>
    <section className="drawer-section"><h3>{t('koc.syncHistory')}</h3><div className="drawer-list">{(detail?.syncHistory || []).map((record) => <div className={`sync-record sync-record--${record.status}`} key={record.id}><strong>{record.status === 'failed' ? t('koc.syncFailed') : t('koc.syncSuccess')}</strong><span>{formatDate(record.syncedAt)}</span>{record.error ? <p>{record.error}</p> : null}</div>)}{!detail?.syncHistory?.length ? <div className={`sync-record sync-record--${partner?.last_sync_status || 'idle'}`}><strong>{partner?.last_sync_status === 'failed' ? t('koc.syncFailed') : t('koc.syncSuccess')}</strong><span>{formatDate(partner?.last_synced_at)}</span>{partner?.last_sync_error ? <p>{partner.last_sync_error}</p> : null}</div> : null}</div></section>
    <section className="drawer-section"><h3>{t('koc.relatedBookings')}</h3><div className="drawer-list">{(detail?.bookings || []).map((booking) => <div className="drawer-list__item" key={booking.id}><strong>#{booking.id} · {booking.status}</strong><span>{formatDate(booking.createdAt || booking.created_at || booking.deadline)} · {formatMoney(booking.bookingCost, booking.currency)}</span></div>)}{!detail?.bookings?.length ? <div className="empty-state empty-state--compact">{t('koc.noBookings')}</div> : null}</div></section>
    <section className="drawer-section"><h3>{t('koc.relatedCollaborations')}</h3><div className="drawer-list">{collaborations.slice(0, 10).map((item, index) => <div className="drawer-list__item" key={item.id || index}><strong>{item.name || item.title || item.id}</strong><span>{formatNumber(item.products?.length)} {t('koc.partnerProduct')}</span></div>)}{!collaborations.length ? <div className="empty-state empty-state--compact">{t('koc.noCollaborations')}</div> : null}</div></section>
  </>;
};

export default KOCPerformance;
