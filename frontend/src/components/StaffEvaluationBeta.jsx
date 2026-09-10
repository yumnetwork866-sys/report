import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink, Plus, TrendingUp } from 'lucide-react';
import { fetchStaffEvaluationsBeta } from '../lib/api';
import { useMoneyFormatter } from '../lib/currency';
import { useI18n } from '../lib/language';
import AppAvatar from './AppAvatar';
import BookingVideoThumbnail from './BookingVideoThumbnail';
import DatePickerInput from './DatePickerInput';
import BookingManagement from './BookingManagement';

const dateValue = (date) => date.toISOString().slice(0, 10);
const shiftDays = (value, days) => {
  const date = new Date(`${typeof value === 'string' ? value : dateValue(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateValue(date);
};
const formatNumber = (value, locale) => new Intl.NumberFormat(locale).format(Number(value) || 0);
const formatDate = (value, locale) => value
  ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`))
  : '—';
const rateText = (value) => value === null || value === undefined ? '—' : `${value}%`;

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

const copy = {
  vi: {
    period: 'Kỳ đánh giá', custom: 'Tùy chỉnh', from: 'Từ ngày', to: 'Đến ngày',
    staff: 'Nhân viên', shop: 'Shop', allStaff: 'Tất cả nhân viên', allShops: 'Tất cả shop',
    presets: { 30: '30 ngày', 90: '3 tháng', 180: '6 tháng' },
    bookings: 'Booking phụ trách', bookingsHint: 'Có thời gian quản lý giao với kỳ',
    due: 'Đầu việc đến hạn', dueHint: 'Tạm tính 1 booking = 1 đầu việc', aired: 'Video air trong kỳ', airedHint: 'Theo ngày đăng, đã loại video trùng',
    completion: 'Tỷ lệ hoàn thành', onTime: 'Tỷ lệ đúng hạn', overdue: 'Chưa hoàn thành quá hạn',
    carryover: 'Tồn từ trước kỳ', commercial: 'Hiệu quả chi phí trong kỳ',
    cost: 'Chi phí booking đến hạn', costHint: 'Toàn bộ chi phí booking có deadline trong kỳ',
    revenue: 'GMV phát sinh trong kỳ', revenueHint: 'Đơn gắn với video và sản phẩm của booking', orders: 'đơn', roas: 'ROAS tham chiếu',
    ranking: 'So sánh nhân viên', employee: 'Nhân viên', completed: 'Hoàn thành', ontime: 'Đúng hạn', detail: 'Mở rộng', close: 'Thu gọn',
    createBooking: 'Tạo booking', detailBooking: 'Chi tiết',
    empty: 'Không có booking phù hợp trong kỳ đã chọn.', loading: 'Đang tải dữ liệu…',
    methodology: 'Bản beta đang dùng một deadline của booking như một đầu việc. Hợp đồng nhiều tháng chưa có lịch giao từng video nên completion rate là chỉ số tạm tính.',
    duplicate: (count) => `${count} video đang gắn vào nhiều booking đã bị loại khỏi số video, GMV và trạng thái hoàn thành.`,
    noDeadline: (count) => `${count} booking chưa có deadline nên không tham gia completion rate và tỷ lệ đúng hạn.`,
    booking: 'Booking', creator: 'KOC', deadline: 'Deadline', posted: 'Ngày air', status: 'Trạng thái', video: 'Video',
    noVideo: 'Chưa có video được ghép', itemsSold: 'Đã bán', views: 'Lượt xem',
    statuses: { ON_TIME: 'Đúng hạn', LATE: 'Hoàn thành trễ', OVERDUE: 'Quá hạn', CARRYOVER_OVERDUE: 'Tồn từ trước kỳ', LATE_CARRYOVER: 'Xử lý tồn trễ', NO_DEADLINE: 'Chưa có deadline' },
  },
  en: {
    period: 'Evaluation period', custom: 'Custom', from: 'From', to: 'To',
    staff: 'Staff', shop: 'Shop', allStaff: 'All staff', allShops: 'All shops',
    presets: { 30: '30 days', 90: '3 months', 180: '6 months' },
    bookings: 'Managed bookings', bookingsHint: 'Management period overlaps the report',
    due: 'Due deliverables', dueHint: 'Currently 1 booking = 1 deliverable', aired: 'Videos aired', airedHint: 'By post date, duplicates excluded',
    completion: 'Completion rate', onTime: 'On-time rate', overdue: 'Overdue incomplete', carryover: 'Prior-period backlog',
    commercial: 'Period cost efficiency', cost: 'Cost of due bookings', costHint: 'Full cost of bookings due in the period',
    revenue: 'GMV generated in period', revenueHint: 'Orders matched to booking videos and products', orders: 'orders', roas: 'Reference ROAS',
    ranking: 'Staff comparison', employee: 'Staff', completed: 'Completed', ontime: 'On time', detail: 'Expand', close: 'Collapse',
    createBooking: 'Create booking', detailBooking: 'Details',
    empty: 'No matching bookings in the selected period.', loading: 'Loading…',
    methodology: 'This beta treats the booking deadline as one deliverable. Multi-month contracts do not yet have per-video schedules, so completion rate is provisional.',
    duplicate: (count) => `${count} videos linked to multiple bookings were excluded from video, GMV and completion metrics.`,
    noDeadline: (count) => `${count} bookings have no deadline and are excluded from completion and on-time rates.`,
    booking: 'Booking', creator: 'Creator', deadline: 'Deadline', posted: 'Aired on', status: 'Status', video: 'Video',
    noVideo: 'No matched videos yet', itemsSold: 'Sold', views: 'Views',
    statuses: { ON_TIME: 'On time', LATE: 'Completed late', OVERDUE: 'Overdue', CARRYOVER_OVERDUE: 'Prior-period backlog', LATE_CARRYOVER: 'Late backlog completed', NO_DEADLINE: 'No deadline' },
  },
};

const StaffEvaluationBeta = ({ heroTitle }) => {
  const { isEnglish } = useI18n();
  const labels = isEnglish ? copy.en : copy.vi;
  const locale = isEnglish ? 'en-US' : 'vi-VN';
  const { currency, convertAmount, formatMoney } = useMoneyFormatter(locale);
  const today = useMemo(() => dateValue(new Date()), []);
  const [preset, setPreset] = useState(90);
  const [startDate, setStartDate] = useState(() => shiftDays(today, -89));
  const [endDate, setEndDate] = useState(today);
  const [staffId, setStaffId] = useState('all');
  const [shopId, setShopId] = useState('all');
  const [expandedStaffId, setExpandedStaffId] = useState(null);
  const [expandedBookingId, setExpandedBookingId] = useState(null);
  const [bookingOverlay, setBookingOverlay] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback((signal) => {
    setLoading(true);
    setError('');
    return fetchStaffEvaluationsBeta({
      startDate,
      endDate,
      staffId: staffId === 'all' ? null : staffId,
      shopId: shopId === 'all' ? null : shopId,
      signal,
    }).then(setData).catch((requestError) => {
      if (requestError.name !== 'AbortError') setError(requestError.message || 'Không thể tải dữ liệu đánh giá.');
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, [endDate, shopId, staffId, startDate]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const selectPreset = (days) => {
    setPreset(days);
    setEndDate(today);
    setStartDate(shiftDays(today, -(days - 1)));
  };
  const sumMoney = useCallback((breakdown = []) => {
    let total = 0;
    for (const item of breakdown) {
      const converted = convertAmount(item.amount, item.currency);
      if (converted === null) return null;
      total += converted;
    }
    return total;
  }, [convertAmount]);
  const moneyText = useCallback((breakdown = []) => {
    const total = sumMoney(breakdown);
    if (total !== null) return formatMoney(total, currency);
    return breakdown.length ? breakdown.map((item) => formatMoney(item.amount, item.currency)).join(' + ') : formatMoney(0, currency);
  }, [currency, formatMoney, sumMoney]);
  const rows = useMemo(() => (data?.staff_rankings || []).map((staff) => {
    const cost = sumMoney(staff.cost_by_currency);
    const gmv = sumMoney(staff.period_gmv_by_currency);
    return { ...staff, displayCost: cost, displayGmv: gmv, roas: cost > 0 && gmv !== null ? gmv / cost : null };
  }), [data, sumMoney]);
  const summaryCost = sumMoney(data?.summary?.cost_by_currency);
  const summaryGmv = sumMoney(data?.summary?.period_gmv_by_currency);
  const summaryRoas = summaryCost > 0 && summaryGmv !== null ? summaryGmv / summaryCost : null;
  const _expanded = rows.find((staff) => String(staff.staff_id ?? 'unassigned') === expandedStaffId) || null;
  const summary = data?.summary || {};
  const quality = data?.data_quality || {};

  return (
    <div className="staff-evaluation-page">
      <section className="section-card staff-evaluation-hero">
        <div>
          <span className="staff-evaluation-beta-label">BETA</span>
          <h2>{isEnglish ? 'Staff Evaluation (Beta)' : heroTitle || 'Đánh giá nhân viên (Beta)'}</h2>
        </div>
        <div className="staff-evaluation-hero__actions">
          <button className="button" type="button" onClick={() => setBookingOverlay({ mode: 'create', staffId: staffId === 'all' ? '' : staffId })}><Plus size={16} />{labels.createBooking}</button>
        </div>
      </section>

      <section className="section-card staff-evaluation-filters" aria-label={labels.period}>
        <div className="staff-evaluation-presets">
          <span>{labels.period}</span>
          {[30, 90, 180].map((days) => <button key={days} type="button" className={preset === days ? 'is-active' : ''} onClick={() => selectPreset(days)}>{labels.presets[days]}</button>)}
          <button type="button" className={preset === 'custom' ? 'is-active' : ''} onClick={() => setPreset('custom')}>{labels.custom}</button>
        </div>
        <label><span>{labels.from}</span><DatePickerInput id="staff-evaluation-start" value={startDate} max={endDate} label={labels.from} onChange={(value) => { setPreset('custom'); setStartDate(value); }} /></label>
        <label><span>{labels.to}</span><DatePickerInput id="staff-evaluation-end" value={endDate} min={startDate} max={today} label={labels.to} onChange={(value) => { setPreset('custom'); setEndDate(value); }} /></label>
        <label><span>{labels.staff}</span><select value={staffId} onChange={(event) => { setStaffId(event.target.value); setExpandedStaffId(null); }}><option value="all">{labels.allStaff}</option>{(data?.filter_options?.staff || []).filter((staff) => staff.id).map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></label>
        <label><span>{labels.shop}</span><select value={shopId} onChange={(event) => { setShopId(event.target.value); setStaffId('all'); setExpandedStaffId(null); }}><option value="all">{labels.allShops}</option>{(data?.filter_options?.shops || []).map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
      </section>

      {error ? <div className="staff-evaluation-notice is-error"><AlertTriangle size={18} /><span>{error}</span></div> : null}
      <div className="staff-evaluation-notice"><AlertTriangle size={18} /><span>{labels.methodology}{quality.duplicate_video_count ? ` ${labels.duplicate(quality.duplicate_video_count)}` : ''}{quality.bookings_without_deadline ? ` ${labels.noDeadline(quality.bookings_without_deadline)}` : ''}</span></div>

      <section className="staff-evaluation-metrics" aria-busy={loading}>
        <article><span>{labels.bookings}</span><strong>{formatNumber(summary.total_bookings, locale)}</strong><small>{labels.bookingsHint}</small></article>
        <article><span>{labels.due}</span><strong>{formatNumber(summary.total_due, locale)}</strong><small>{labels.dueHint}</small></article>
        <article><span>{labels.aired}</span><strong>{formatNumber(summary.total_videos_aired, locale)}</strong><small>{labels.airedHint}</small></article>
        <article><span>{labels.completion}</span><strong>{rateText(summary.completion_rate)}</strong><small>{formatNumber(summary.total_completed, locale)} / {formatNumber(summary.total_due, locale)}</small></article>
        <article><span>{labels.onTime}</span><strong>{rateText(summary.on_time_rate)}</strong><small>{formatNumber(summary.total_on_time, locale)} / {formatNumber(summary.total_due, locale)}</small></article>
        <article className={summary.total_overdue ? 'is-danger' : ''}><span>{labels.overdue}</span><strong>{formatNumber(summary.total_overdue, locale)}</strong><small>{labels.carryover}: {formatNumber(summary.total_carryover_overdue, locale)}</small></article>
      </section>

      <section className="section-card staff-evaluation-commercial">
        <header><TrendingUp size={19} /><div><h3>{labels.commercial}</h3><p>{formatDate(startDate, locale)} – {formatDate(endDate, locale)}</p></div></header>
        <div><article><span>{labels.cost}</span><strong>{moneyText(summary.cost_by_currency)}</strong><small>{labels.costHint}</small></article><article><span>{labels.revenue}</span><strong>{moneyText(summary.period_gmv_by_currency)}</strong><small>{formatNumber(summary.total_period_orders, locale)} {labels.orders} · {labels.revenueHint}</small></article><article><span>{labels.roas}</span><strong>{summaryRoas === null ? '—' : `${summaryRoas.toFixed(2)}x`}</strong><small>GMV / {labels.cost.toLocaleLowerCase(locale)}</small></article></div>
      </section>

      <section className="section-card staff-evaluation-ranking">
        <header><div><h3>{labels.ranking}</h3><p>{formatNumber(summary.total_staff, locale)} {labels.staff.toLocaleLowerCase(locale)}</p></div></header>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>{labels.employee}</th><th className="cell-number">Booking</th><th className="cell-number">{labels.due}</th><th className="cell-number">{labels.completed}</th><th className="cell-number">{labels.ontime}</th><th className="cell-number">{labels.overdue}</th><th className="cell-number">Video air</th><th className="cell-number">{labels.cost}</th><th className="cell-number">GMV</th><th className="cell-number">ROAS</th><th /></tr></thead>
          <tbody>{!rows.length ? <tr className="table-state-row"><td className="table-state-cell" colSpan={11}><div className="staff-evaluation-empty">{loading ? labels.loading : labels.empty}</div></td></tr> : rows.map((staff) => {
            const key = String(staff.staff_id ?? 'unassigned');
            const isExpanded = expandedStaffId === key;
            return <React.Fragment key={key}>
              <tr className={isExpanded ? 'staff-evaluation-staff-row is-expanded' : 'staff-evaluation-staff-row'} onClick={() => setExpandedStaffId(isExpanded ? null : key)}>
                <td><strong>{staff.staff_name}</strong>{staff.email ? <small>{staff.email}</small> : null}</td>
                <td className="cell-number">{staff.total_bookings}</td><td className="cell-number">{staff.due_deliverables}</td>
                <td className="cell-number"><span className="staff-evaluation-rate">{rateText(staff.completion_rate)}</span><small>{staff.completed_deliverables}/{staff.due_deliverables}</small></td>
                <td className="cell-number"><span className="staff-evaluation-rate">{rateText(staff.on_time_rate)}</span><small>{staff.on_time_deliverables}/{staff.due_deliverables}</small></td>
                <td className="cell-number"><span className={staff.overdue_deliverables ? 'staff-evaluation-danger' : ''}>{staff.overdue_deliverables}</span></td>
                <td className="cell-number">{staff.videos_aired_in_period}</td><td className="cell-number">{moneyText(staff.cost_by_currency)}</td>
                <td className="cell-number">{moneyText(staff.period_gmv_by_currency)}</td><td className="cell-number"><strong>{staff.roas === null ? '—' : `${staff.roas.toFixed(2)}x`}</strong></td>
                <td className="cell-actions"><button type="button" className="staff-evaluation-expand" aria-expanded={isExpanded} onClick={(event) => { event.stopPropagation(); setExpandedStaffId(isExpanded ? null : key); }}><span>{isExpanded ? labels.close : labels.detail}</span><ChevronDown size={16} /></button></td>
              </tr>
              {isExpanded ? <tr className="staff-evaluation-bookings-row"><td colSpan={11}>
                <div className="staff-evaluation-bookings">
                  <div className="staff-evaluation-bookings__header">
                    <div><strong>{staff.staff_name}</strong></div>
                    <button className="button button--small" type="button" onClick={() => setBookingOverlay({ mode: 'create', staffId: staff.staff_id })}>
                      <Plus size={14} />{labels.createBooking}
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{labels.creator}</th>
                          <th>Shop</th>
                          <th>{labels.deadline}</th>
                          <th>{labels.posted}</th>
                          <th>{labels.status}</th>
                          <th className="cell-number">Video</th>
                          <th className="cell-number">{labels.cost}</th>
                          <th className="cell-number">GMV</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {staff.items.map((item) => {
                          const isBookingExpanded = expandedBookingId === item.booking_id;
                          const videos = item.booking_videos || [];
                          return (
                            <React.Fragment key={item.booking_id}>
                              <tr
                                className={isBookingExpanded ? 'staff-evaluation-booking-row is-expanded' : 'staff-evaluation-booking-row'}
                                onClick={(event) => {
                                  if (event.target.closest('button, a, input, select, textarea, label')) return;
                                  setExpandedBookingId((curr) => (curr === item.booking_id ? null : item.booking_id));
                                }}
                              >
                                <td className="booking-koc-column">
                                  <div className="booking-koc-identity">
                                    <AppAvatar src={item.creator_avatar_url} name={item.creator_name || item.creator_username || 'KOC'} />
                                    <span>
                                      <strong>{item.creator_name}</strong>
                                      {item.creator_username ? <small>@{item.creator_username}</small> : null}
                                    </span>
                                  </div>
                                </td>
                                <td>{item.shop_name || '—'}</td>
                                <td>
                                  {item.start_date ? <small style={{ display: 'block', color: 'var(--muted, #64748b)' }}>{formatDate(item.start_date, locale)}</small> : null}
                                  <span>{formatDate(item.end_date || item.deadline, locale)}</span>
                                </td>
                                <td>{formatDate(item.posted_at, locale)}</td>
                                <td>
                                  <span className={`staff-evaluation-status is-${item.status.toLowerCase()}`}>
                                    {labels.statuses[item.status] || item.status}
                                  </span>
                                  {item.days_late ? <small>{item.days_late} {isEnglish ? 'days' : 'ngày'}</small> : null}
                                </td>
                                <td className="cell-number">{item.video_count}</td>
                                <td className="cell-number">{formatMoney(item.cost, item.currency)}</td>
                                <td className="cell-number">{moneyText(item.period_gmv_by_currency)}</td>
                                <td className="cell-actions">
                                  <div className="staff-evaluation-booking-actions">
                                    {item.video?.video_url ? (
                                      <a href={item.video.video_url} target="_blank" rel="noreferrer" aria-label="TikTok" onClick={(event) => event.stopPropagation()}>
                                        <ExternalLink size={14} />
                                      </a>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="button button--ghost button--small"
                                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setBookingOverlay({ mode: 'detail', bookingId: item.booking_id });
                                      }}
                                    >
                                      {labels.detailBooking}
                                    </button>
                                  </div>
                                  {item.duplicate_video_count ? <small className="staff-evaluation-danger">{item.duplicate_video_count} duplicate</small> : null}
                                </td>
                              </tr>
                              {isBookingExpanded ? (
                                <tr className="booking-video-detail-row">
                                  <td colSpan={9}>
                                    <div className="booking-video-expansion">
                                      {videos.length ? (
                                        <div className="booking-video-expansion__list">
                                          {videos.map((video, videoIndex) => (
                                            <article className="booking-video-expansion__item" key={video.id || video.platform_video_id}>
                                              <div className="booking-video-expansion__identity">
                                                <div className="booking-video-expansion__title">
                                                  <BookingVideoThumbnail shopId={item.target_shop_id} video={video} index={videoIndex} />
                                                  <div>
                                                    {video.video_url ? (
                                                      <a href={video.video_url} target="_blank" rel="noreferrer">
                                                        <strong>{video.title || video.platform_video_id}</strong>
                                                        <span aria-hidden="true"> ↗</span>
                                                      </a>
                                                    ) : (
                                                      <strong>{video.title || video.platform_video_id}</strong>
                                                    )}
                                                    <small>{labels.posted}: {formatDate(video.posted_at, locale)}</small>
                                                    <span className="booking-video-expansion__social">
                                                      <span title={`${labels.views}: ${formatNumber(video.views, locale)}`}><BookingVideoIcon name="views" />{formatNumber(video.views, locale)}</span>
                                                      <span title={`Likes: ${formatNumber(video.likes, locale)}`}><BookingVideoIcon name="likes" />{formatNumber(video.likes, locale)}</span>
                                                      <span title={`Comments: ${formatNumber(video.comments, locale)}`}><BookingVideoIcon name="comments" />{formatNumber(video.comments, locale)}</span>
                                                      <span title={`Shares: ${formatNumber(video.shares, locale)}`}><BookingVideoIcon name="shares" />{formatNumber(video.shares, locale)}</span>
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>
                                              <div className="booking-video-expansion__metrics">
                                                <div><span>GMV</span><strong>{formatMoney(video.gross_gmv, video.currency)}</strong></div>
                                                <div><span>{labels.itemsSold}</span><strong>{formatNumber(video.items_sold, locale)}</strong></div>
                                              </div>
                                            </article>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="booking-video-expansion__empty">
                                          <p>{labels.noVideo}</p>
                                        </div>
                                      )}
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
                </div>
              </td></tr> : null}
            </React.Fragment>;
          })}</tbody></table></div>
      </section>
      {bookingOverlay ? <BookingManagement embeddedMode={bookingOverlay.mode} embeddedBookingId={bookingOverlay.bookingId} initialStaffId={bookingOverlay.staffId} onEmbeddedClose={() => setBookingOverlay(null)} onEmbeddedChanged={() => loadData()} /> : null}
    </div>
  );
};

export default StaffEvaluationBeta;
