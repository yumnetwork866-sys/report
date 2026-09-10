const { Op, QueryTypes } = require('sequelize');
const {
  Booking, BookingVideo, BookingVideoPerformanceSnapshot, TikTokShop, User, sequelize,
} = require('../models');
const { loadCreatorProfiles } = require('../services/tiktokCreatorProfileService');

const MAX_PERIOD_DAYS = 366;
const dateOnly = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};
const shiftDate = (value, days) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};
const daysBetween = (start, end) => Math.max(0, Math.round(
  (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000,
));
const normalizeCurrency = (value, fallback = 'MYR') => String(value || fallback).trim().toUpperCase() || fallback;
const productIdsOfBooking = (booking) => new Set([
  ...(booking.evaluation_snapshot?.product_ids || []),
  ...(booking.evaluation_snapshot?.products || []).map((product) => product?.id || product?.product_id),
].map((value) => String(value || '').trim()).filter(Boolean));
const addMoney = (totals, currency, amount) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return;
  const key = normalizeCurrency(currency);
  totals.set(key, (totals.get(key) || 0) + numeric);
};
const moneyBreakdown = (totals) => [...totals.entries()]
  .map(([currency, amount]) => ({ currency, amount }))
  .sort((left, right) => left.currency.localeCompare(right.currency));
const normalizedUsername = (value) => String(value || '').trim().replace(/^@+/, '').toLowerCase();

const hydrateCreatorAvatars = async (bookings = []) => {
  const bookingsByShop = new Map();
  for (const booking of bookings) {
    const shopId = Number(booking.target_shop_id);
    if (!Number.isInteger(shopId)) continue;
    const rows = bookingsByShop.get(shopId) || [];
    rows.push(booking);
    bookingsByShop.set(shopId, rows);
  }
  await Promise.all([...bookingsByShop].map(async ([shopId, rows]) => {
    const profiles = await loadCreatorProfiles(shopId, rows.map((booking) => ({
      creator_open_id: booking.creator_open_id,
      username: booking.creator_username,
    })));
    for (const booking of rows) {
      const creatorOpenId = String(booking.creator_open_id || '').trim();
      const username = normalizedUsername(booking.creator_username);
      const profile = (creatorOpenId && profiles.get(`open:${creatorOpenId}`))
        || (username && profiles.get(`username:${username}`));
      const value = profile?.toJSON ? profile.toJSON() : profile;
      if (value?.avatar_url) booking.creator_avatar_url = value.avatar_url;
    }
  }));
  return bookings;
};
const latestSnapshot = (video) => [...(video.performance_snapshots || [])]
  .sort((left, right) => String(right.snapshot_date || '').localeCompare(String(left.snapshot_date || ''))
    || new Date(right.synced_at || 0) - new Date(left.synced_at || 0))[0] || null;

const summarizeOrderRows = (rows, selectedProductIds) => {
  const selected = selectedProductIds.size
    ? rows.filter((row) => selectedProductIds.has(String(row.product_id || '')))
    : rows;
  const orderIds = new Set();
  const gmvByCurrency = new Map();
  for (const row of selected) {
    if (row.order_id) orderIds.add(`${row.shop_id}:${row.order_id}`);
    addMoney(gmvByCurrency, row.currency, row.gmv);
  }
  return { orderIds, gmvByCurrency };
};
const createStaffBucket = (booking) => ({
  staff_id: booking.staff_id || null,
  staff_name: booking.staff?.name || booking.staff_name || 'Chưa phân công',
  email: booking.staff?.email || null,
  total_bookings: 0,
  due_deliverables: 0,
  completed_deliverables: 0,
  on_time_deliverables: 0,
  late_deliverables: 0,
  overdue_deliverables: 0,
  carryover_overdue: 0,
  videos_aired_in_period: 0,
  period_orders: 0,
  overdue_days_total: 0,
  costTotals: new Map(),
  gmvTotals: new Map(),
  seenAiredVideoIds: new Set(),
  seenRevenueVideoIds: new Set(),
  seenOrderIds: new Set(),
  items: [],
});
const finishStaffBucket = (staff) => {
  const result = {
    ...staff,
    completion_rate: staff.due_deliverables
      ? Math.round((staff.completed_deliverables / staff.due_deliverables) * 1000) / 10 : null,
    on_time_rate: staff.due_deliverables
      ? Math.round((staff.on_time_deliverables / staff.due_deliverables) * 1000) / 10 : null,
    avg_overdue_days: staff.overdue_deliverables
      ? Math.round((staff.overdue_days_total / staff.overdue_deliverables) * 10) / 10 : 0,
    cost_by_currency: moneyBreakdown(staff.costTotals),
    period_gmv_by_currency: moneyBreakdown(staff.gmvTotals),
  };
  for (const key of ['costTotals', 'gmvTotals', 'seenAiredVideoIds', 'seenRevenueVideoIds', 'seenOrderIds']) delete result[key];
  return result;
};

const evaluateStaffBookings = ({ bookings, orderRows = [], startDate, endDate }) => {
  const videoOccurrences = new Map();
  for (const booking of bookings) {
    for (const video of booking.booking_videos || []) {
      const id = String(video.platform_video_id || '').trim();
      if (!id) continue;
      const occurrences = videoOccurrences.get(id) || [];
      occurrences.push({ bookingId: booking.id, staffId: booking.staff_id || null });
      videoOccurrences.set(id, occurrences);
    }
  }
  const duplicateVideoIds = new Set([...videoOccurrences.entries()]
    .filter(([, occurrences]) => new Set(occurrences.map((item) => item.bookingId)).size > 1)
    .map(([id]) => id));
  const rowsByShopAndVideo = new Map();
  for (const row of orderRows) {
    const key = `${row.shop_id}:${row.video_id}`;
    const rows = rowsByShopAndVideo.get(key) || [];
    rows.push(row);
    rowsByShopAndVideo.set(key, rows);
  }

  const staffMap = new Map();
  const shopMap = new Map();
  let relevantBookingsWithoutDeadline = 0;
  for (const booking of bookings) {
    const videos = booking.booking_videos || [];
    const createdAt = dateOnly(booking.created_at);
    const bookingStartDate = dateOnly(booking.start_date || booking.created_at);
    const deadline = dateOnly(booking.end_date || booking.deadline);
    const validVideos = videos.filter((video) => {
      const id = String(video.platform_video_id || '').trim();
      return id && !duplicateVideoIds.has(id);
    });
    const videosInPeriod = validVideos.filter((video) => {
      const postedAt = dateOnly(video.posted_at);
      return postedAt && postedAt >= startDate && postedAt <= endDate;
    });
    const completionVideo = [...validVideos]
      .filter((video) => {
        const postedAt = dateOnly(video.posted_at);
        return postedAt && postedAt <= endDate;
      })
      .sort((left, right) => dateOnly(left.posted_at).localeCompare(dateOnly(right.posted_at)))[0] || null;
    const completedAt = dateOnly(completionVideo?.posted_at);
    const dueInPeriod = Boolean(deadline && deadline >= startDate && deadline <= endDate);
    const carryoverOverdue = Boolean(deadline && deadline < startDate && !completedAt);
    const completedInPeriod = Boolean(completedAt && completedAt >= startDate && completedAt <= endDate);
    const createdInPeriod = Boolean(createdAt && createdAt >= startDate && createdAt <= endDate);
    const overlapsPeriod = deadline
      ? Boolean((!bookingStartDate || bookingStartDate <= endDate) && (deadline >= startDate || !completedAt || completedInPeriod))
      : createdInPeriod || videosInPeriod.length > 0;
    if (!overlapsPeriod && !dueInPeriod && !carryoverOverdue && !videosInPeriod.length) continue;
    if (!deadline) relevantBookingsWithoutDeadline += 1;

    const staffKey = String(booking.staff_id || 'unassigned');
    if (!staffMap.has(staffKey)) staffMap.set(staffKey, createStaffBucket(booking));
    const staff = staffMap.get(staffKey);
    if (overlapsPeriod) staff.total_bookings += 1;
    if (booking.target_shop?.id) {
      shopMap.set(String(booking.target_shop.id), {
        id: booking.target_shop.id,
        name: booking.target_shop.name || booking.target_shop.code || `Shop #${booking.target_shop.id}`,
      });
    }
    for (const video of videosInPeriod) {
      const id = String(video.platform_video_id);
      if (!staff.seenAiredVideoIds.has(id)) {
        staff.seenAiredVideoIds.add(id);
        staff.videos_aired_in_period += 1;
      }
    }

    let status = 'NO_DEADLINE';
    let daysLate = 0;
    if (dueInPeriod) {
      staff.due_deliverables += 1;
      addMoney(staff.costTotals, booking.currency, booking.total_cost ?? booking.booking_cost ?? 0);
      if (completedAt) {
        staff.completed_deliverables += 1;
        if (completedAt <= deadline) {
          staff.on_time_deliverables += 1;
          status = 'ON_TIME';
        } else {
          staff.late_deliverables += 1;
          daysLate = daysBetween(deadline, completedAt);
          status = 'LATE';
        }
      } else {
        staff.overdue_deliverables += 1;
        daysLate = daysBetween(deadline, endDate);
        staff.overdue_days_total += daysLate;
        status = 'OVERDUE';
      }
    } else if (carryoverOverdue) {
      staff.carryover_overdue += 1;
      daysLate = daysBetween(deadline, endDate);
      status = 'CARRYOVER_OVERDUE';
    } else if (deadline && deadline < startDate && completedInPeriod) {
      daysLate = daysBetween(deadline, completedAt);
      status = 'LATE_CARRYOVER';
    }

    const bookingGmv = new Map();
    for (const video of validVideos) {
      const videoId = String(video.platform_video_id);
      if (staff.seenRevenueVideoIds.has(videoId)) continue;
      staff.seenRevenueVideoIds.add(videoId);
      const orderSummary = summarizeOrderRows(
        rowsByShopAndVideo.get(`${booking.target_shop_id}:${videoId}`) || [],
        productIdsOfBooking(booking),
      );
      for (const orderId of orderSummary.orderIds) staff.seenOrderIds.add(orderId);
      for (const [currency, amount] of orderSummary.gmvByCurrency) {
        addMoney(staff.gmvTotals, currency, amount);
        addMoney(bookingGmv, currency, amount);
      }
    }
    staff.period_orders = staff.seenOrderIds.size;
    const snapshot = completionVideo ? latestSnapshot(completionVideo) : null;
    const serializedVideos = (booking.booking_videos || []).map((v) => {
      const snap = latestSnapshot(v);
      const rawMetrics = snap?.raw_metrics?.video || snap?.raw_metrics || {};
      const listVideo = rawMetrics.list || rawMetrics;
      const traffic = rawMetrics?.detail?.performance?.intervals?.[0]?.traffic || {};
      return {
        id: v.id,
        platform_video_id: v.platform_video_id,
        video_url: v.video_url,
        title: v.title,
        posted_at: v.posted_at,
        creator_username: v.creator_username || booking.creator_username,
        thumbnail_url: v.thumbnail_url || listVideo.thumbnail_url || listVideo.cover_image_url || listVideo.cover_url || null,
        views: Number(snap?.views ?? listVideo.views ?? traffic.views ?? 0),
        likes: Number(traffic.likes ?? listVideo.likes ?? rawMetrics.likes ?? 0),
        comments: Number(traffic.comments ?? listVideo.comments ?? rawMetrics.comments ?? 0),
        shares: Number(traffic.shares ?? listVideo.shares ?? rawMetrics.shares ?? 0),
        gross_gmv: Number(snap?.gross_gmv || 0),
        items_sold: Number(snap?.items_sold || 0),
        currency: snap?.currency || normalizeCurrency(booking.currency),
      };
    });
    staff.items.push({
      booking_id: booking.id,
      target_shop_id: booking.target_shop_id,
      booking_status: booking.status || null,
      creator_name: booking.creator_name || booking.creator_username || 'KOC',
      creator_username: booking.creator_username || null,
      creator_avatar_url: booking.creator_avatar_url || null,
      shop_name: booking.target_shop?.name || null,
      start_date: bookingStartDate,
      end_date: deadline,
      deadline,
      posted_at: completedAt,
      cost: Number(booking.total_cost ?? booking.booking_cost ?? 0),
      currency: normalizeCurrency(booking.currency),
      status,
      is_due_in_period: dueInPeriod,
      days_late: daysLate,
      video_count: validVideos.length,
      duplicate_video_count: videos.length - validVideos.length,
      period_gmv_by_currency: moneyBreakdown(bookingGmv),
      video: completionVideo ? {
        platform_video_id: completionVideo.platform_video_id,
        video_url: completionVideo.video_url,
        title: completionVideo.title,
        views: Number(snapshot?.views || 0),
      } : null,
      booking_videos: serializedVideos,
    });
  }

  return {
    staffRankings: [...staffMap.values()].map(finishStaffBucket).sort((left, right) =>
      (right.completion_rate ?? -1) - (left.completion_rate ?? -1)
      || (right.on_time_rate ?? -1) - (left.on_time_rate ?? -1)
      || right.videos_aired_in_period - left.videos_aired_in_period
      || left.staff_name.localeCompare(right.staff_name)),
    shops: [...shopMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
    dataQuality: {
      duplicate_video_count: duplicateVideoIds.size,
      bookings_without_deadline: relevantBookingsWithoutDeadline,
      methodology: 'ONE_BOOKING_ONE_DELIVERABLE',
    },
  };
};

const summarizeStaff = (staffRankings) => {
  const costTotals = new Map();
  const gmvTotals = new Map();
  for (const staff of staffRankings) {
    for (const item of staff.cost_by_currency) addMoney(costTotals, item.currency, item.amount);
    for (const item of staff.period_gmv_by_currency) addMoney(gmvTotals, item.currency, item.amount);
  }
  const totalDue = staffRankings.reduce((sum, staff) => sum + staff.due_deliverables, 0);
  const totalCompleted = staffRankings.reduce((sum, staff) => sum + staff.completed_deliverables, 0);
  const totalOnTime = staffRankings.reduce((sum, staff) => sum + staff.on_time_deliverables, 0);
  return {
    total_staff: staffRankings.length,
    total_bookings: staffRankings.reduce((sum, staff) => sum + staff.total_bookings, 0),
    total_due: totalDue,
    total_completed: totalCompleted,
    total_on_time: totalOnTime,
    total_late: staffRankings.reduce((sum, staff) => sum + staff.late_deliverables, 0),
    total_overdue: staffRankings.reduce((sum, staff) => sum + staff.overdue_deliverables, 0),
    total_carryover_overdue: staffRankings.reduce((sum, staff) => sum + staff.carryover_overdue, 0),
    total_videos_aired: staffRankings.reduce((sum, staff) => sum + staff.videos_aired_in_period, 0),
    total_period_orders: staffRankings.reduce((sum, staff) => sum + staff.period_orders, 0),
    completion_rate: totalDue ? Math.round((totalCompleted / totalDue) * 1000) / 10 : null,
    on_time_rate: totalDue ? Math.round((totalOnTime / totalDue) * 1000) / 10 : null,
    cost_by_currency: moneyBreakdown(costTotals),
    period_gmv_by_currency: moneyBreakdown(gmvTotals),
  };
};

const getStaffEvaluationsBeta = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const suppliedStartDate = req.query.startDate;
    const suppliedEndDate = req.query.endDate;
    const startDate = dateOnly(suppliedStartDate) || shiftDate(today, -89);
    const endDate = dateOnly(suppliedEndDate) || today;
    const periodDays = daysBetween(startDate, endDate) + 1;
    if ((suppliedStartDate && !dateOnly(suppliedStartDate))
      || (suppliedEndDate && !dateOnly(suppliedEndDate))
      || startDate > endDate || endDate > today || periodDays > MAX_PERIOD_DAYS) {
      return res.status(400).json({ message: `Kỳ đánh giá phải hợp lệ, không vượt quá hôm nay và tối đa ${MAX_PERIOD_DAYS} ngày.` });
    }
    const requestedStaffId = Number(req.query.staffId);
    const requestedShopId = Number(req.query.shopId);
    const bookings = await Booking.findAll({
      where: {
        status: { [Op.ne]: 'cancelled' },
        evaluation_snapshot: { [Op.not]: null },
      },
      include: [
        { model: User, as: 'staff', attributes: ['id', 'name', 'email'] },
        { model: TikTokShop, as: 'target_shop', attributes: ['id', 'name', 'code', 'region'] },
        { model: BookingVideo, as: 'booking_videos', required: false,
          include: [{ model: BookingVideoPerformanceSnapshot, as: 'performance_snapshots', required: false }] },
      ],
      order: [['deadline', 'ASC'], ['id', 'DESC']],
    });
    const allBookings = await hydrateCreatorAvatars(
      bookings.map((booking) => typeof booking.toJSON === 'function' ? booking.toJSON() : booking),
    );
    const allShops = [...new Map(allBookings.filter((booking) => booking.target_shop?.id).map((booking) => [
      String(booking.target_shop.id),
      { id: booking.target_shop.id, name: booking.target_shop.name || booking.target_shop.code || `Shop #${booking.target_shop.id}` },
    ])).values()].sort((left, right) => left.name.localeCompare(right.name));
    const plainBookings = Number.isInteger(requestedShopId) && requestedShopId > 0
      ? allBookings.filter((booking) => Number(booking.target_shop_id) === requestedShopId)
      : allBookings;
    const videoIds = [...new Set(plainBookings.flatMap((booking) =>
      (booking.booking_videos || []).map((video) => String(video.platform_video_id || '').trim())).filter(Boolean))];
    const orderRows = videoIds.length ? await sequelize.query(`
      SELECT s.shop_id, s.content_id AS video_id, s.product_id,
        COALESCE(s.currency, 'MYR') AS currency, s.order_id,
        SUM(s.quantity * COALESCE(s.price, 0))::numeric AS gmv
      FROM tiktok_affiliate_order_skus s
      JOIN tiktok_affiliate_orders o ON o.id = s.affiliate_order_id
      WHERE s.content_id IN (:videoIds)
        AND o.create_time >= :startDateTime
        AND o.create_time < :endDateTime
      GROUP BY s.shop_id, s.content_id, s.product_id, COALESCE(s.currency, 'MYR'), s.order_id
    `, {
      replacements: { videoIds, startDateTime: `${startDate}T00:00:00.000Z`, endDateTime: `${shiftDate(endDate, 1)}T00:00:00.000Z` },
      type: QueryTypes.SELECT,
    }) : [];
    const evaluated = evaluateStaffBookings({ bookings: plainBookings, orderRows, startDate, endDate });
    const allStaff = evaluated.staffRankings.map((staff) => ({ id: staff.staff_id, name: staff.staff_name, total_bookings: staff.total_bookings }));
    const visibleStaff = Number.isInteger(requestedStaffId) && requestedStaffId > 0
      ? evaluated.staffRankings.filter((staff) => Number(staff.staff_id) === requestedStaffId)
      : evaluated.staffRankings;
    return res.json({
      period: { startDate, endDate, days: periodDays },
      summary: summarizeStaff(visibleStaff),
      staff_rankings: visibleStaff,
      filter_options: { staff: allStaff, shops: allShops },
      data_quality: evaluated.dataQuality,
    });
  } catch (error) {
    console.error('[Staff Evaluation Beta] Error', error);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { getStaffEvaluationsBeta, __test: { evaluateStaffBookings, summarizeStaff } };
