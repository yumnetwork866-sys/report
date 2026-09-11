import { diffInDays, formatDateOnly, getTodayDateString } from './date.js';

export function computeBookingTimeline({
  startDate,
  deadlineDate,
  postedVideos = [],
  firstPostedDate,
  committedVideos = 1,
  videoCount: explicitVideoCount,
  status,
  t,
  today = getTodayDateString(),
}) {
  const isCancelled = status === 'cancelled';
  let badge = null;

  const targetVideos = Math.max(1, Number(committedVideos) || 1);
  const videoList = Array.isArray(postedVideos) ? postedVideos : [];
  const count = explicitVideoCount !== undefined
    ? Number(explicitVideoCount) || 0
    : (videoList.length || (firstPostedDate ? 1 : 0));
  const isCompleted = count >= targetVideos;

  // Identify earliest posted video and completion video (the video that fulfilled the target)
  const earliestVideoDate = videoList[0]?.posted_at || firstPostedDate || null;
  const completionVideo = videoList[targetVideos - 1] || videoList[videoList.length - 1] || null;
  const completionDate = completionVideo?.posted_at || firstPostedDate || null;

  const dateParts = [];
  if (startDate) dateParts.push(`📅 ${t ? t('booking.bookDate') : 'Book'}: ${formatDateOnly(startDate)}`);
  if (deadlineDate) dateParts.push(`⏰ ${t ? t('booking.deadline') : 'Hạn'}: ${formatDateOnly(deadlineDate)}`);
  if (isCompleted && completionDate) {
    dateParts.push(`🎬 ${t ? t('booking.completedAt', 'Hoàn thành') : 'Hoàn thành'}: ${formatDateOnly(completionDate)}`);
  } else if (earliestVideoDate) {
    dateParts.push(`🎬 ${t ? t('booking.firstPosted', 'Video đầu') : 'Video đầu'}: ${formatDateOnly(earliestVideoDate)}`);
  }
  dateParts.push(`🎯 ${count}/${targetVideos} video`);
  const detailsSuffix = ` (${dateParts.join(' · ')})`;

  if (isCancelled) {
    badge = {
      type: 'cancelled',
      label: t ? t('booking.statusCancelled') : 'Đã hủy',
      tooltip: (t ? t('booking.statusCancelled') : 'Đã hủy') + detailsSuffix,
    };
  } else if (isCompleted) {
    if (completionDate && deadlineDate) {
      const diff = diffInDays(completionDate, deadlineDate);
      if (diff > 0) {
        badge = {
          type: 'late',
          label: t ? t('booking.lateByDays', { count: diff }) : `Muộn ${diff} ngày`,
          tooltip: (t ? t('booking.lateTooltip', { count: diff, deadline: formatDateOnly(deadlineDate) }) : `Đăng muộn ${diff} ngày`) + detailsSuffix,
        };
      } else if (diff < 0) {
        badge = {
          type: 'early',
          label: t ? t('booking.earlyByDays', { count: Math.abs(diff) }) : `Sớm ${Math.abs(diff)} ngày`,
          tooltip: (t ? t('booking.earlyTooltip', { count: Math.abs(diff), deadline: formatDateOnly(deadlineDate) }) : `Đăng sớm ${Math.abs(diff)} ngày`) + detailsSuffix,
        };
      } else {
        badge = {
          type: 'ontime',
          label: t ? t('booking.onTime') : 'Đúng hạn',
          tooltip: (t ? t('booking.onTimeTooltip') : 'Đăng đúng hạn') + detailsSuffix,
        };
      }
    }
  } else if (deadlineDate) {
    const overdueDiff = diffInDays(today, deadlineDate);
    if (overdueDiff > 0) {
      badge = {
        type: 'overdue',
        label: t ? t('booking.overdueByDays', { count: overdueDiff }) : `Quá hạn ${overdueDiff} ngày`,
        tooltip: (t ? t('booking.overdueTooltip', { count: overdueDiff, deadline: formatDateOnly(deadlineDate) }) : `Quá hạn ${overdueDiff} ngày chưa nộp đủ video`) + detailsSuffix,
      };
    } else if (overdueDiff === 0) {
      badge = {
        type: 'due-today',
        label: t ? t('booking.dueToday') : 'Hạn hôm nay',
        tooltip: (t ? t('booking.dueTodayTooltip') : 'Hôm nay là hạn chót') + detailsSuffix,
      };
    } else {
      badge = {
        type: 'remaining',
        label: t ? t('booking.daysRemaining', { count: Math.abs(overdueDiff) }) : `Còn ${Math.abs(overdueDiff)} ngày`,
        tooltip: (t ? t('booking.remainingTooltip', { count: Math.abs(overdueDiff), deadline: formatDateOnly(deadlineDate) }) : `Còn ${Math.abs(overdueDiff)} ngày tới hạn`) + detailsSuffix,
      };
    }
  }

  return {
    startDate,
    deadlineDate,
    firstPostedDate: earliestVideoDate,
    completionDate,
    badge,
  };
}
