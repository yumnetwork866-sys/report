import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchChannelReport, fetchChannelReportMemberDetail } from '../lib/api';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import { formatDateOnly } from '../lib/date';
import DatePickerInput from './DatePickerInput';

const chartTick = { fill: 'var(--color-muted)', fontSize: 12 };

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const dateOnly = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const todayValue = () => dateOnly(new Date());

const monthRange = (value) => {
  const [year, month] = String(value || '').split('-').map(Number);
  const lastDay = dateOnly(new Date(year, month, 0));
  return {
    startDate: `${value}-01`,
    endDate: value === currentMonthValue() ? todayValue() : lastDay,
  };
};

const monthIndex = (value) => {
  const [year, month] = String(value || '').split('-').map(Number);
  return year && month ? year * 12 + month - 1 : null;
};

const formatMonth = (value) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : '';
};

const previousMonthValue = (value) => {
  const [year, month] = String(value || '').split('-').map(Number);
  if (!year || !month) return value;
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
};

const previousCustomRange = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const days = Math.round((end - start) / 86400000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - days + 1);
  return { startDate: dateOnly(previousStart), endDate: dateOnly(previousEnd) };
};

const compactProductName = (value) => {
  const name = String(value || '').trim();
  if (!name) return 'Chưa xác định sản phẩm';
  const brandCombo = name.match(/^([A-Z0-9]+)\s+(Kombo)\b/i);
  if (brandCombo) return `${brandCombo[1].toUpperCase()} ${brandCombo[2]}`;
  const headline = name.split(/\s+-\s+/)[0].trim();
  return headline.length > 42 ? `${headline.slice(0, 39).trim()}…` : headline;
};

const ChannelAvatar = ({ channel }) => {
  const [failed, setFailed] = useState(false);
  const avatarUrl = channel?.avatar_url || '';
  useEffect(() => setFailed(false), [avatarUrl]);
  return (
    <span className="channel-report-channel-picker__avatar" aria-hidden="true">
      {avatarUrl && !failed
        ? <img src={avatarUrl} alt="" onError={() => setFailed(true)} />
        : String(channel?.name || 'TK').trim().charAt(0).toUpperCase()}
    </span>
  );
};

const ChannelSelectDropdown = ({ channels, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedChannel = channels.find((channel) => String(channel.id) === String(value)) || null;
  const label = selectedChannel?.name || 'Tất cả kênh';

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape'
        || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
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

  const selectChannel = (channelId) => {
    onChange(String(channelId));
    setOpen(false);
  };

  return (
    <div className="channel-report-channel-picker" ref={rootRef}>
      <button
        id="channel-report-channel"
        className="channel-report-channel-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!channels.length}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-report-channel-picker__current">
          <ChannelAvatar channel={selectedChannel || { name: 'Tất cả' }} />
          <span title={label}>{channels.length ? label : 'Chưa có kênh'}</span>
        </span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="channel-report-channel-picker__menu" role="listbox">
          <button
            type="button"
            className={`channel-report-channel-picker__option${value === 'all' ? ' channel-report-channel-picker__option--active' : ''}`}
            role="option"
            aria-selected={value === 'all'}
            onClick={() => selectChannel('all')}
          >
            <span className="channel-report-channel-picker__copy">
              <ChannelAvatar channel={{ name: 'Tất cả' }} />
              <span><strong>Tất cả kênh</strong><small>{channels.length} kênh</small></span>
            </span>
          </button>
          {channels.map((channel) => {
            const selected = String(channel.id) === String(value);
            return (
              <button
                type="button"
                className={`channel-report-channel-picker__option${selected ? ' channel-report-channel-picker__option--active' : ''}`}
                role="option"
                aria-selected={selected}
                key={channel.id}
                onClick={() => selectChannel(channel.id)}
              >
                <span className="channel-report-channel-picker__copy">
                  <ChannelAvatar channel={channel} />
                  <span><strong>{channel.name || `Kênh #${channel.id}`}</strong></span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const TeamComparisonTooltip = ({ active, payload, formatNumber, formatRevenue }) => {
  const team = payload?.[0]?.payload;
  if (!active || !team) return null;

  return (
    <div className="dashboard-chart-tooltip team-comparison-tooltip">
      <strong>{team.name}</strong>
      <div><span>Video</span><b>{formatNumber(team.videos)}</b></div>
      <div><span>Lượt xem</span><b>{formatNumber(team.views)}</b></div>
      <div><span>Doanh số</span><b>{team.revenueAvailable ? formatRevenue(team.revenue, team.currency) : '—'}</b></div>
    </div>
  );
};

const ChannelReport = () => {
  const { language } = useI18n();
  const [report, setReport] = useState(null);
  const [previousReport, setPreviousReport] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [periodMode, setPeriodMode] = useState('month');
  const initialRange = monthRange(currentMonthValue());
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [selectedTeamId, setSelectedTeamId] = useState('all');
  const [selectedChannelId, setSelectedChannelId] = useState('all');
  const [activeReportTab, setActiveReportTab] = useState('teams');
  const [comparisonMetric, setComparisonMetric] = useState('views');
  const [expandedMemberId, setExpandedMemberId] = useState(null);
  const [memberDetails, setMemberDetails] = useState({});
  const [memberTabs, setMemberTabs] = useState({});
  const memberRequestRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const formatNumber = (value) => Number(value || 0).toLocaleString(locale);
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
          teamId: activeReportTab === 'comparison' || activeReportTab === 'revenue' ? 'all' : selectedTeamId,
          channelId: selectedChannelId,
          metric: activeReportTab === 'revenue' ? 'revenue' : 'content',
          page: 1,
          pageSize: 20,
        };
        const [payload, previousPayload] = await Promise.all([
          fetchChannelReport({ ...period, ...requestOptions, signal: controller.signal }),
          fetchChannelReport({ ...previousPeriod, ...requestOptions, signal: controller.signal }),
        ]);
        setReport(payload);
        setPreviousReport(previousPayload);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Không tải được báo cáo.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [activeReportTab, endDate, periodMode, selectedChannelId, selectedMonth, selectedTeamId, startDate]);

  useEffect(() => {
    if (activeReportTab !== 'teams' || !report) return;
    const availableTeams = report.filters?.teams || [];
    if (!availableTeams.length) return;
    if (!availableTeams.some((team) => String(team.id) === selectedTeamId)) {
      setSelectedTeamId(String(availableTeams[0].id));
    }
  }, [activeReportTab, report, selectedTeamId]);

  useEffect(() => {
    if (selectedChannelId !== 'all'
      && report
      && !report.filters?.channels?.some((channel) => String(channel.id) === selectedChannelId)) {
      setSelectedChannelId('all');
    }
  }, [report, selectedChannelId]);

  useEffect(() => {
    memberRequestRef.current?.abort();
    setExpandedMemberId(null);
    setMemberDetails({});
    setMemberTabs({});
  }, [activeReportTab, endDate, periodMode, selectedChannelId, selectedMonth, selectedTeamId, startDate]);

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

  const teams = report?.filters?.teams || [];
  const channels = report?.filters?.channels || [];
  const groups = report?.revenue?.teams || [];
  const resolvedSelectedTeamId = teams.some((team) => String(team.id) === selectedTeamId)
    ? selectedTeamId
    : teams[0] ? String(teams[0].id) : '';
  const visibleGroups = activeReportTab === 'revenue'
    ? groups
    : groups.filter((group) => group.key === resolvedSelectedTeamId);
  const selectedTeam = teams.find((team) => String(team.id) === resolvedSelectedTeamId);
  const topGroup = [...visibleGroups].sort((a, b) => b.views - a.views)[0];
  const comparisonData = groups.map((group) => ({
    name: group.label,
    videos: Number(group.videos || 0),
    views: Number(group.views || 0),
    revenue: Number(group.revenue || 0),
    revenueAvailable: Boolean(group.revenueAvailable),
    currency: group.currency,
  }));
  const comparisonMetricLabel = {
    videos: 'Video',
    views: 'Lượt xem',
    revenue: 'Doanh số',
  }[comparisonMetric];
  const compactNumber = (value) => Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
  const kpis = report?.kpis || {};
  const previousGroups = previousReport?.revenue?.teams || [];
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
  const periodLabel = periodMode === 'month'
    ? formatMonth(selectedMonth)
    : `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`;

  const changePeriodMode = (event) => {
    const nextMode = event.target.value;
    if (nextMode === 'custom') {
      const range = monthRange(selectedMonth);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
    setPeriodMode(nextMode);
  };

  const loadMemberDetail = async (memberId, page = 1, append = false) => {
    memberRequestRef.current?.abort();
    const controller = new AbortController();
    memberRequestRef.current = controller;
    setMemberDetails((current) => ({
      ...current,
      [memberId]: { ...current[memberId], loading: true, error: '' },
    }));
    try {
      const payload = await fetchChannelReportMemberDetail(memberId, {
        ...(periodMode === 'month' ? { month: selectedMonth } : { startDate, endDate }),
        teamId: selectedTeamId,
        channelId: selectedChannelId,
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
    if (expandedMemberId === memberId) {
      memberRequestRef.current?.abort();
      setExpandedMemberId(null);
      return;
    }
    setExpandedMemberId(memberId);
    setMemberTabs((current) => ({ ...current, [memberId]: current[memberId] || 'videos' }));
    if (!memberDetails[memberId]?.data) loadMemberDetail(memberId);
  };

  const renderMemberDetail = (member) => {
    const memberId = String(member.key);
    const detail = memberDetails[memberId] || {};
    const data = detail.data;
    const activeTab = memberTabs[memberId] || 'videos';
    const videos = data?.videos?.items || [];
    const products = data?.products || [];
    const pagination = data?.videos?.pagination;
    if (detail.loading && !data) {
      return <div className="member-detail__state"><span className="loading-dot" />Đang tải video và sản phẩm</div>;
    }
    if (detail.error && !data) {
      return (
        <div className="member-detail__state member-detail__state--error">
          <span>{detail.error}</span>
          <button className="button button--small button--ghost" type="button" onClick={() => loadMemberDetail(memberId)}>Thử lại</button>
        </div>
      );
    }
    return (
      <div className="member-detail">
        <div className="member-detail__tabs" role="tablist" aria-label={`Chi tiết ${member.name}`}>
          <button type="button" role="tab" aria-selected={activeTab === 'videos'} className={activeTab === 'videos' ? 'is-active' : ''} onClick={() => setMemberTabs((current) => ({ ...current, [memberId]: 'videos' }))}>
            Video <span>{formatNumber(pagination?.total)}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'products'} className={activeTab === 'products' ? 'is-active' : ''} onClick={() => setMemberTabs((current) => ({ ...current, [memberId]: 'products' }))}>
            Sản phẩm <span>{formatNumber(products.length)}</span>
          </button>
        </div>
        {activeTab === 'videos' ? (
          <div className="member-detail__videos">
            {videos.map((video) => (
              <article className="member-detail__video" key={video.id}>
                {video.thumbnail_url ? <img src={video.thumbnail_url} alt="" loading="lazy" /> : <div className="member-detail__video-placeholder">Video</div>}
                <div className="member-detail__video-copy">
                  {video.video_url
                    ? <a href={video.video_url} target="_blank" rel="noreferrer">{video.title || `Video ${video.platform_video_id}`}</a>
                    : <strong>{video.title || `Video ${video.platform_video_id}`}</strong>}
                  <small>{video.channel?.display_name || video.channel?.username || 'TikTok'} · {formatDateOnly(video.published_at, '—')}</small>
                  <div className="member-detail__product-tags">
                    {(video.products || []).slice(0, 2).map((product) => <span key={product.id} title={product.name}>{compactProductName(product.name)}</span>)}
                    {video.products?.length > 2 ? <span>+{video.products.length - 2}</span> : null}
                    {!video.products?.length ? <span>Chưa xác định sản phẩm</span> : null}
                  </div>
                </div>
                <div className="member-detail__video-metrics">
                  <span><small>Lượt xem</small><strong>{formatNumber(video.views)}</strong></span>
                  <span><small>GMV</small><strong>{video.revenue ? formatRevenue(video.revenue.amount, video.revenue.currency) : '—'}</strong></span>
                </div>
              </article>
            ))}
            {!videos.length ? <div className="member-detail__state">Không có video trong kỳ đã chọn.</div> : null}
            {pagination && pagination.page < pagination.total_pages ? (
              <button className="button button--small button--ghost member-detail__more" type="button" disabled={detail.loading} onClick={() => loadMemberDetail(memberId, pagination.page + 1, true)}>
                {detail.loading ? 'Đang tải...' : 'Xem thêm video'}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="table-wrap member-detail__products">
            <table className="data-table data-table--compact">
              <thead><tr><th>Sản phẩm</th><th className="cell-number">Video</th><th className="cell-number">Lượt xem</th><th className="cell-number">GMV</th></tr></thead>
              <tbody>{products.map((product) => (
                <tr key={product.id ?? 'unknown'}>
                  <td>
                    <strong className="member-detail__product-name" title={product.name}>{compactProductName(product.name)}</strong>
                  </td>
                  <td className="cell-number">{formatNumber(product.videos)}</td>
                  <td className="cell-number">{formatNumber(product.views)}</td>
                  <td className="cell-number">{product.revenue_available ? formatRevenue(product.revenue, product.currency) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            {!products.length ? <div className="member-detail__state">Không có sản phẩm trong kỳ đã chọn.</div> : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page channel-report-page">
      <section className="page__hero">
        <div>
          <h1 className="page__title">Báo cáo</h1>
        </div>
        <div className="koc-tabs channel-report-tabs" role="tablist" aria-label="Chế độ xem báo cáo">
          <button
            id="channel-report-teams-tab"
            type="button"
            role="tab"
            aria-selected={activeReportTab === 'teams'}
            aria-controls="channel-report-teams-panel"
            tabIndex={activeReportTab === 'teams' ? 0 : -1}
            className={activeReportTab === 'teams' ? 'is-active' : ''}
            onClick={() => setActiveReportTab('teams')}
          >
            Video và lượt xem
          </button>
          <button
            id="channel-report-comparison-tab"
            type="button"
            role="tab"
            aria-selected={activeReportTab === 'comparison'}
            aria-controls="channel-report-comparison-panel"
            tabIndex={activeReportTab === 'comparison' ? 0 : -1}
            className={activeReportTab === 'comparison' ? 'is-active' : ''}
            onClick={() => setActiveReportTab('comparison')}
          >
            Thống kê
          </button>
          <button
            id="channel-report-revenue-tab"
            type="button"
            role="tab"
            aria-selected={activeReportTab === 'revenue'}
            aria-controls="channel-report-revenue-panel"
            tabIndex={activeReportTab === 'revenue' ? 0 : -1}
            className={activeReportTab === 'revenue' ? 'is-active' : ''}
            onClick={() => setActiveReportTab('revenue')}
          >
            Doanh thu
          </button>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card content-performance">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">
              {activeReportTab === 'comparison' ? 'Thống kê' : activeReportTab === 'revenue' ? 'Doanh thu' : 'Video và lượt xem'}
            </h2>
            <p className="section-card__meta">
              {activeReportTab === 'comparison'
                ? `${comparisonMetricLabel} giữa các team trong ${periodLabel}.`
                : activeReportTab === 'revenue'
                ? `Doanh thu phát sinh trong ${periodLabel}.`
                : selectedTeam
                ? `${formatNumber(topGroup?.videos || 0)} video đã nhận diện của ${selectedTeam.name} trong ${periodLabel}.`
                : `${formatNumber(kpis.videos)} video trong ${periodLabel} từ ${formatNumber(kpis.channels)} kênh.`}
            </p>
          </div>
          <div className="channel-report-filters">
            {activeReportTab === 'teams' ? <div className="field channel-report-team">
              <label htmlFor="channel-report-team">Team</label>
              <select
                id="channel-report-team"
                value={resolvedSelectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
              >
                {teams.map((team) => (
                  <option value={String(team.id)} key={team.id}>{team.name}</option>
                ))}
              </select>
            </div> : null}
            <div className="field channel-report-channel">
              <label htmlFor="channel-report-channel">Kênh</label>
              <ChannelSelectDropdown
                channels={channels}
                value={selectedChannelId}
                onChange={setSelectedChannelId}
              />
            </div>
            <div className="field channel-report-month">
              <label htmlFor="channel-report-period-mode">Kỳ báo cáo</label>
              <select
                id="channel-report-period-mode"
                value={periodMode}
                onChange={changePeriodMode}
              >
                <option value="month">Theo tháng</option>
                <option value="custom">Tùy chỉnh</option>
              </select>
            </div>
            {periodMode === 'month' ? (
              <div className="field channel-report-month">
                <label htmlFor="channel-report-month">Tháng đánh giá</label>
                <select
                  id="channel-report-month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                >
                  {monthOptions.map((option) => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="field channel-report-date">
                  <label htmlFor="channel-report-start-date">Từ ngày</label>
                  <DatePickerInput id="channel-report-start-date" label="Chọn ngày bắt đầu" value={startDate} min="" max={endDate || todayValue()} onChange={setStartDate} />
                </div>
                <div className="field channel-report-date">
                  <label htmlFor="channel-report-end-date">Đến ngày</label>
                  <DatePickerInput id="channel-report-end-date" label="Chọn ngày kết thúc" value={endDate} min={startDate || undefined} max={todayValue()} onChange={setEndDate} />
                </div>
              </>
            )}

          </div>
        </div>

        {loading ? <div className="empty-state"><div className="loading-dot" />Đang tải báo cáo</div> : !teams.length ? (
          <div className="empty-state empty-state--compact">
            <strong>Chưa có team.</strong>
            <span>Hãy tạo team và gắn hashtag cho nhân viên trong trang Quản lý User.</span>
          </div>
        ) : (
          <>
            {activeReportTab === 'comparison' && comparisonData.length ? (
              <section
                id="channel-report-comparison-panel"
                className="team-comparison"
                role="tabpanel"
                aria-labelledby="channel-report-comparison-tab"
              >
                <div className="team-comparison__header">
                  <div>
                    <h3 id="team-comparison-title">Thống kê các team</h3>
                    <p>{comparisonMetricLabel} trong {periodLabel}</p>
                  </div>
                  <div className="field team-comparison__metric">
                    <label htmlFor="team-comparison-metric">Chỉ số</label>
                    <select
                      id="team-comparison-metric"
                      value={comparisonMetric}
                      onChange={(event) => setComparisonMetric(event.target.value)}
                    >
                      <option value="views">Lượt xem</option>
                      <option value="videos">Video</option>
                      <option value="revenue">Doanh số</option>
                    </select>
                  </div>
                </div>
                <div className="team-comparison__chart" role="img" aria-label={`Biểu đồ so sánh ${comparisonMetricLabel.toLowerCase()} giữa các team`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData} barSize={42} margin={{ top: 20, right: 12, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="name" height={44} interval={0} tickLine={false} axisLine={false} tick={chartTick} />
                      <YAxis width={62} tickLine={false} axisLine={false} allowDecimals={false} tick={chartTick} tickFormatter={compactNumber} />
                      <Tooltip
                        cursor={{ fill: 'var(--color-accent-soft)' }}
                        content={<TeamComparisonTooltip formatNumber={formatNumber} formatRevenue={formatRevenue} />}
                      />
                      <Bar dataKey={comparisonMetric} fill="var(--color-primary)" radius={[7, 7, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            ) : null}
            {activeReportTab === 'teams' || activeReportTab === 'revenue' ? <div
              id={activeReportTab === 'revenue' ? 'channel-report-revenue-panel' : 'channel-report-teams-panel'}
              className="content-performance__groups content-performance__groups--filtered"
              role="tabpanel"
              aria-labelledby={activeReportTab === 'revenue' ? 'channel-report-revenue-tab' : 'channel-report-teams-tab'}
            >
              {visibleGroups.map((group) => {
                const previousGroup = previousGroups.find((item) => item.key === group.key);
                return <article className="content-performance__group" key={group.key}>
                  <div className="content-performance__group-header">
                    <h3>{group.label}</h3>
                    <span>{formatNumber(group.members.length)} thành viên</span>
                  </div>
                  <div className="content-performance__metrics">
                    {activeReportTab === 'revenue' ? (
                      <span><small>Doanh thu phát sinh</small><strong>{group.revenueAvailable ? formatRevenue(group.revenue, group.currency) : '—'}</strong>{renderMetricChange(group.revenue, previousGroup?.revenue, group.revenueAvailable && previousGroup?.revenueAvailable)}</span>
                    ) : <>
                      <span><small>Video</small><strong>{formatNumber(group.videos)}</strong>{renderMetricChange(group.videos, previousGroup?.videos)}</span>
                      <span><small>Lượt xem</small><strong>{formatNumber(group.views)}</strong>{renderMetricChange(group.views, previousGroup?.views)}</span>
                      <span><small>Doanh số</small><strong>{group.revenueAvailable ? formatRevenue(group.revenue, group.currency) : '—'}</strong>{renderMetricChange(group.revenue, previousGroup?.revenue, group.revenueAvailable && previousGroup?.revenueAvailable)}</span>
                    </>}
                  </div>
                  {activeReportTab !== 'revenue' && group.members.length ? (
                    <div className="table-wrap">
                      <table className="data-table data-table--compact">
                        <thead>
                          <tr>
                            <th>Thành viên</th>
                            <th className="cell-number">Video</th>
                            <th className="cell-number">Lượt xem</th>
                            <th className="cell-number">TB lượt xem/video</th>
                            <th className="cell-number">Doanh số</th>
                            <th className="cell-number">TB doanh số/video</th>
                          </tr>
                        </thead>
                        <tbody>{group.members.map((member) => {
                          const expanded = expandedMemberId === String(member.key);
                          return (
                            <React.Fragment key={member.key}>
                              <tr className={expanded ? 'member-row member-row--expanded' : 'member-row'}>
                                <td>
                                  <button className="member-row__trigger" type="button" aria-expanded={expanded} onClick={() => toggleMember(member)}>
                                    <span className={`sidebar__chevron${expanded ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
                                    <strong>{member.name}</strong>
                                  </button>
                                </td>
                                <td className="cell-number">{formatNumber(member.videos)}</td>
                                <td className="cell-number">{formatNumber(member.views)}</td>
                                <td className="cell-number">{formatNumber(Math.round(member.views / Math.max(member.videos, 1)))}</td>
                                <td className="cell-number">{member.revenueAvailable ? formatRevenue(member.revenue, member.currency) : '—'}</td>
                                <td className="cell-number">{member.revenueAvailable ? formatRevenue(member.revenue / member.videos, member.currency) : '—'}</td>
                              </tr>
                              {expanded ? <tr className="member-detail-row"><td colSpan="6">{renderMemberDetail(member)}</td></tr> : null}
                            </React.Fragment>
                          );
                        })}</tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="content-performance__group-empty">
                      <strong>Team chưa có nhân viên</strong>
                      <span>Gắn nhân viên vào team để bắt đầu thống kê.</span>
                      <Link to="/manage/users">Quản lý nhân viên →</Link>
                    </div>
                  )}
                </article>;
              })}
            </div> : null}
          </>
        )}
      </section>

    </div>
  );
};

export default ChannelReport;
