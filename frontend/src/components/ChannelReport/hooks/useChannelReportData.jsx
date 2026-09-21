import { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchChannelReport,
  fetchChannelReportMemberDetail,
  fetchChannelReportVideoDailyRevenue,
} from '../../../lib/api';
import { useMoneyFormatter } from '../../../lib/currency';
import { useI18n } from '../../../lib/language';
import {
  currentMonthValue,
  formatMonth,
  monthIndex,
  monthRange,
  previousCustomRange,
  previousMonthValue,
} from '../utils/reportUtils';

export const useChannelReportData = () => {
  const { language } = useI18n();
  const [report, setReport] = useState(null);
  const [revenueReport, setRevenueReport] = useState(null);
  const [previousReport, setPreviousReport] = useState(null);
  const [previousRevenueReport, setPreviousRevenueReport] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [periodMode, setPeriodMode] = useState('month');
  const initialRange = monthRange(currentMonthValue());
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [selectedTeamIds, setSelectedTeamIds] = useState('all');
  const [selectedChannelId, setSelectedChannelId] = useState('all');
  const [activeReportTab, setActiveReportTab] = useState('teams');
  const [productTeamFilter, setProductTeamFilter] = useState('all');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [expandedMemberIds, setExpandedMemberIds] = useState(() => new Set());
  const [tableSort, setTableSort] = useState({ key: null, direction: 'desc' });
  const [memberDetails, setMemberDetails] = useState({});
  const [memberTabs, setMemberTabs] = useState({});
  const memberRequestRef = useRef(new Map());
  const videoRevenueRequestRef = useRef(null);
  const [videoRevenueDetail, setVideoRevenueDetail] = useState(null);
  const [expandedRevenueDates, setExpandedRevenueDates] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const formatNumber = (value) => Number(value || 0).toLocaleString(locale);
  const formatPublishedDate = (value) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
    : '—';
  const formatPublishedTime = (value) => value
    ? new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(new Date(value))
    : '—';
  const formatDailyDate = (value) => value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`))
    : '—';
  const { formatMoney: formatRevenue } = useMoneyFormatter(locale);
  useEffect(() => {
    if (periodMode === 'custom' && (!startDate || !endDate || startDate > endDate)) {
      setLoading(false);
      setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      return undefined;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const period = periodMode === 'month'
          ? { month: selectedMonth }
          : { startDate, endDate };
        const previousPeriod = periodMode === 'month'
          ? { month: previousMonthValue(selectedMonth) }
          : previousCustomRange(startDate, endDate);
        const requestOptions = {
          teamIds: activeReportTab === 'comparison'
            ? 'all'
            : (Array.isArray(selectedTeamIds) ? (selectedTeamIds.length ? selectedTeamIds : 'none') : (selectedTeamIds || 'all')),
          channelId: selectedChannelId,
          page: 1,
          pageSize: 20,
        };
        const [contentPayload, revenuePayload, previousContentPayload, previousRevenuePayload] = await Promise.all([
          fetchChannelReport({ ...period, ...requestOptions, metric: 'content', signal: controller.signal }),
          fetchChannelReport({ ...period, ...requestOptions, metric: 'revenue', signal: controller.signal }),
          fetchChannelReport({ ...previousPeriod, ...requestOptions, metric: 'content', signal: controller.signal }),
          fetchChannelReport({ ...previousPeriod, ...requestOptions, metric: 'revenue', signal: controller.signal }),
        ]);
        setReport(contentPayload);
        setRevenueReport(revenuePayload);
        setPreviousReport(previousContentPayload);
        setPreviousRevenueReport(previousRevenuePayload);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Không tải được báo cáo.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [activeReportTab, endDate, periodMode, selectedChannelId, selectedMonth, selectedTeamIds, startDate]);
  
  useEffect(() => {
    if (!report) return;
    const availableTeams = report.filters?.teams || [];
    if (!availableTeams.length || selectedTeamIds === 'all') return;
    if (Array.isArray(selectedTeamIds)) {
      const valid = selectedTeamIds.filter((id) => availableTeams.some((team) => String(team.id) === String(id)));
      if (valid.length !== selectedTeamIds.length) {
        setSelectedTeamIds(valid.length ? valid : 'all');
      }
    }
  }, [report, selectedTeamIds]);
  
  useEffect(() => {
    if (selectedChannelId !== 'all'
      && report
      && !report.filters?.channels?.some((channel) => String(channel.id) === selectedChannelId)) {
      setSelectedChannelId('all');
    }
  }, [report, selectedChannelId]);
  
  useEffect(() => {
    memberRequestRef.current.forEach((controller) => controller.abort());
    memberRequestRef.current.clear();
    setExpandedMemberIds(new Set());
    setMemberDetails({});
    setMemberTabs({});
    videoRevenueRequestRef.current?.abort();
    setVideoRevenueDetail(null);
    setExpandedRevenueDates(new Set());
  }, [activeReportTab, endDate, periodMode, selectedChannelId, selectedMonth, selectedTeamIds, startDate]);
  
  useEffect(() => () => videoRevenueRequestRef.current?.abort(), []);
  
  useEffect(() => {
    setTableSort({ key: null, direction: 'desc' });
  }, [activeReportTab]);
  
  useEffect(() => {
    if (!videoRevenueDetail) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        videoRevenueRequestRef.current?.abort();
        setVideoRevenueDetail(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [videoRevenueDetail]);
  
  const monthOptions = useMemo(() => {
    const selectedIndex = monthIndex(selectedMonth);
    const currentIndex = monthIndex(currentMonthValue());
    const firstIndex = Math.min(selectedIndex, currentIndex) - 11;
    const lastIndex = Math.max(selectedIndex, currentIndex);
  
    return Array.from({ length: lastIndex - firstIndex + 1 }, (_, offset) => {
      const value = lastIndex - offset;
      const year = Math.floor(value / 12);
      const month = value % 12 + 1;
      const normalizedValue = `${year}-${String(month).padStart(2, '0')}`;
      return { value: normalizedValue, label: formatMonth(normalizedValue) };
    });
  }, [selectedMonth]);
  
  const teams = useMemo(() => report?.filters?.teams || [], [report?.filters?.teams]);
  const channels = report?.filters?.channels || [];
  const groups = report?.revenue?.teams || [];
  const revenueGroups = revenueReport?.revenue?.teams || [];
  const isAllTeams = selectedTeamIds === 'all' || !Array.isArray(selectedTeamIds);
  const selectedTeamSet = useMemo(() => {
    if (isAllTeams) return new Set(teams.map((t) => String(t.id)));
    return new Set(selectedTeamIds.map(String));
  }, [isAllTeams, selectedTeamIds, teams]);
  const currentGroups = activeReportTab === 'revenue' ? revenueGroups : groups;
  const visibleGroups = isAllTeams ? currentGroups : currentGroups.filter((group) => selectedTeamSet.has(group.key));
  
  const allTeamOrders = useMemo(() => {
    const targetReport = activeReportTab === 'revenue' ? revenueReport : report;
    const teamsList = targetReport?.revenue?.teams || [];
    return teamsList.reduce((sum, t) => sum + Number(t.orders || 0), 0);
  }, [activeReportTab, report, revenueReport]);
  
  const teamProductsData = useMemo(() => {
    const targetReport = activeReportTab === 'revenue' ? revenueReport : report;
    if (!targetReport?.revenue) return [];
  
    let list = [];
    if (productTeamFilter === 'all') {
      if (Array.isArray(targetReport.revenue.products) && targetReport.revenue.products.length) {
        list = targetReport.revenue.products;
      } else {
        const map = new Map();
        const teamsList = targetReport.revenue.teams || [];
        for (const t of teamsList) {
          for (const p of (t.products || [])) {
            const existing = map.get(p.id);
            if (!existing) {
              map.set(p.id, {
                ...p,
                teams: [{ team_id: t.key, team_name: t.label, orders: Number(p.orders || 0), quantity: Number(p.quantity || 0), revenue: Number(p.revenue || 0) }],
              });
            } else {
              existing.orders += Number(p.orders || 0);
              existing.quantity += Number(p.quantity || 0);
              existing.revenue += Number(p.revenue || 0);
              existing.teams.push({ team_id: t.key, team_name: t.label, orders: Number(p.orders || 0), quantity: Number(p.quantity || 0), revenue: Number(p.revenue || 0) });
            }
          }
        }
        list = [...map.values()];
      }
    } else {
      const matchedTeam = (targetReport.revenue.teams || []).find((t) => String(t.key) === String(productTeamFilter));
      list = matchedTeam?.products || [];
    }
  
    if (productSearchQuery.trim()) {
      const q = productSearchQuery.trim().toLowerCase();
      list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || String(p.id || '').toLowerCase().includes(q));
    }
  
    return [...list].sort((a, b) => (Number(b.orders || 0) - Number(a.orders || 0)) || (Number(b.revenue || 0) - Number(a.revenue || 0)));
  }, [activeReportTab, productSearchQuery, productTeamFilter, report, revenueReport]);
  
  const teamProductsSummary = useMemo(() => {
    let totalOrders = 0;
    let totalItems = 0;
    let totalRevenue = 0;
    let currency = null;
    for (const p of teamProductsData) {
      totalOrders += Number(p.orders || 0);
      totalItems += Number(p.quantity || 0);
      totalRevenue += Number(p.revenue || 0);
      if (!currency && p.currency) currency = p.currency;
    }
    return {
      totalOrders,
      totalItems,
      totalRevenue,
      currency,
      productCount: teamProductsData.length,
    };
  }, [teamProductsData]);
  const compactNumber = (value) => Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
  
  const previousGroups = useMemo(() => previousReport?.revenue?.teams || [], [previousReport?.revenue?.teams]);
  const previousRevenueGroups = useMemo(() => previousRevenueReport?.revenue?.teams || [], [previousRevenueReport?.revenue?.teams]);
  const changePercent = (current, previous) => {
    const currentValue = Number(current || 0);
    const previousValue = Number(previous || 0);
    if (!previousValue) return null;
    return (currentValue - previousValue) / Math.abs(previousValue) * 100;
  };
  const renderMetricChange = (current, previous, available = true) => {
    const change = available ? changePercent(current, previous) : null;
    if (change === null) return <small className="channel-report-metric-change channel-report-metric-change--neutral">— so với kỳ trước</small>;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
    return <small className={`channel-report-metric-change channel-report-metric-change--${direction}`}>{change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change).toLocaleString(locale, { maximumFractionDigits: 1 })}% so với kỳ trước</small>;
  };
  
  const mergedMembers = useMemo(() => {
    const list = [];
    for (const group of visibleGroups) {
      for (const member of (group.members || [])) {
        list.push({
          ...member,
          teamKey: group.key,
          teamName: group.label,
          videos: Number(member.videos || 0),
          views: Number(member.views || 0),
          revenue: Number(member.revenue || 0),
          revenueAvailable: Boolean(member.revenueAvailable),
          currency: member.currency,
          orders: Number(member.orders || 0),
        });
      }
    }
    return list;
  }, [visibleGroups]);
  
  const mergedMetrics = useMemo(() => {
    let videos = 0;
    let views = 0;
    let orders = 0;
    let revenue = 0;
    let revenueAvailable = false;
    let currency = null;
  
    for (const m of mergedMembers) {
      videos += Number(m.videos || 0);
      views += Number(m.views || 0);
      orders += Number(m.orders || 0);
      revenue += Number(m.revenue || 0);
      if (m.revenueAvailable) revenueAvailable = true;
      if (!currency && m.currency) currency = m.currency;
    }
  
    if (!videos && !views && !orders && !revenue) {
      for (const group of visibleGroups) {
        videos += Number(group.videos || 0);
        views += Number(group.views || 0);
        orders += Number(group.orders || 0);
        revenue += Number(group.revenue || 0);
        if (group.revenueAvailable) revenueAvailable = true;
        if (!currency && group.currency) currency = group.currency;
      }
    }
  
    const currentPreviousGroups = activeReportTab === 'revenue' ? previousRevenueGroups : previousGroups;
    let prevVideos = 0;
    let prevViews = 0;
    let prevOrders = 0;
    let prevRevenue = 0;
    let prevRevenueAvailable = false;
  
    for (const group of visibleGroups) {
      const prevG = currentPreviousGroups.find((item) => item.key === group.key);
      if (prevG) {
        const pMems = prevG.members || [];
        if (pMems.length) {
          for (const pm of pMems) {
            prevVideos += Number(pm.videos || 0);
            prevViews += Number(pm.views || 0);
            prevOrders += Number(pm.orders || 0);
            prevRevenue += Number(pm.revenue || 0);
            if (pm.revenueAvailable) prevRevenueAvailable = true;
          }
        } else {
          prevVideos += Number(prevG.videos || 0);
          prevViews += Number(prevG.views || 0);
          prevOrders += Number(prevG.orders || 0);
          prevRevenue += Number(prevG.revenue || 0);
          if (prevG.revenueAvailable) prevRevenueAvailable = true;
        }
      }
    }
  
    return {
      videos,
      views,
      orders,
      revenue,
      revenueAvailable: revenueAvailable || revenue > 0,
      currency,
      prevVideos,
      prevViews,
      prevOrders,
      prevRevenue,
      prevRevenueAvailable,
    };
  }, [activeReportTab, mergedMembers, previousGroups, previousRevenueGroups, visibleGroups]);
  
  const changePeriodMode = (nextMode) => {
    if (nextMode === 'custom') {
      const range = monthRange(selectedMonth);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
    setPeriodMode(nextMode);
  };
  
  const loadMemberDetail = async (memberId, page = 1, append = false) => {
    memberRequestRef.current.get(memberId)?.abort();
    const controller = new AbortController();
    memberRequestRef.current.set(memberId, controller);
    setMemberDetails((current) => ({
      ...current,
      [memberId]: { ...current[memberId], loading: true, error: '' },
    }));
    try {
      const payload = await fetchChannelReportMemberDetail(memberId, {
        ...(periodMode === 'month' ? { month: selectedMonth } : { startDate, endDate }),
        teamIds: selectedTeamIds,
        channelId: selectedChannelId,
        metric: activeReportTab === 'revenue' ? 'revenue' : 'content',
        page,
        pageSize: 10,
        signal: controller.signal,
      });
      setMemberDetails((current) => {
        const previousItems = append ? current[memberId]?.data?.videos?.items || [] : [];
        return {
          ...current,
          [memberId]: {
            loading: false,
            error: '',
            data: {
              ...payload,
              videos: {
                ...payload.videos,
                items: [...previousItems, ...(payload.videos?.items || [])],
              },
            },
          },
        };
      });
    } catch (loadError) {
      if (loadError.name === 'AbortError') return;
      setMemberDetails((current) => ({
        ...current,
        [memberId]: {
          ...current[memberId],
          loading: false,
          error: loadError.message || 'Không tải được chi tiết thành viên.',
        },
      }));
    }
  };
  
  const toggleMember = (member) => {
    const memberId = String(member.key);
    const isExpanded = expandedMemberIds.has(memberId);
    if (isExpanded) {
      memberRequestRef.current.get(memberId)?.abort();
      setExpandedMemberIds((current) => {
        const next = new Set(current);
        next.delete(memberId);
        return next;
      });
      return;
    }
    setExpandedMemberIds((current) => new Set(current).add(memberId));
    setMemberTabs((current) => ({ ...current, [memberId]: current[memberId] || 'videos' }));
    if (!memberDetails[memberId]?.data) loadMemberDetail(memberId);
  };
  
  const closeVideoRevenueDetail = () => {
    videoRevenueRequestRef.current?.abort();
    videoRevenueRequestRef.current = null;
    setVideoRevenueDetail(null);
    setExpandedRevenueDates(new Set());
  };
  
  const openVideoRevenueDetail = async (video) => {
    if (!video.platform_video_id) return;
    videoRevenueRequestRef.current?.abort();
    const controller = new AbortController();
    videoRevenueRequestRef.current = controller;
    setExpandedRevenueDates(new Set());
    setVideoRevenueDetail({ video, loading: true, error: '', data: null });
    try {
      const data = await fetchChannelReportVideoDailyRevenue(video.platform_video_id, {
        ...(periodMode === 'month' ? { month: selectedMonth } : { startDate, endDate }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setVideoRevenueDetail({ video, loading: false, error: '', data });
      }
    } catch (loadError) {
      if (loadError.name !== 'AbortError') {
        setVideoRevenueDetail({
          video,
          loading: false,
          error: loadError.message || 'Không tải được doanh thu theo ngày.',
          data: null,
        });
      }
    } finally {
      if (videoRevenueRequestRef.current === controller) videoRevenueRequestRef.current = null;
    }
  };

  return {
    activeReportTab,
    allTeamOrders,
    channels,
    changePeriodMode,
    closeVideoRevenueDetail,
    compactNumber,
    endDate,
    error,
    expandedMemberIds,
    expandedRevenueDates,
    formatDailyDate,
    formatNumber,
    formatPublishedDate,
    formatPublishedTime,
    formatRevenue,
    groups,
    isAllTeams,
    loadMemberDetail,
    loading,
    memberDetails,
    memberTabs,
    mergedMembers,
    mergedMetrics,
    monthOptions,
    openVideoRevenueDetail,
    periodMode,
    previousGroups,
    previousRevenueGroups,
    productSearchQuery,
    productTeamFilter,
    renderMetricChange,
    report,
    revenueGroups,
    selectedChannelId,
    selectedMonth,
    selectedTeamIds,
    setActiveReportTab,
    setEndDate,
    setExpandedRevenueDates,
    setMemberTabs,
    setProductSearchQuery,
    setProductTeamFilter,
    setSelectedChannelId,
    setSelectedMonth,
    setSelectedTeamIds,
    setStartDate,
    setTableSort,
    startDate,
    tableSort,
    teamProductsData,
    teamProductsSummary,
    teams,
    toggleMember,
    videoRevenueDetail,
    visibleGroups,
  };
};
