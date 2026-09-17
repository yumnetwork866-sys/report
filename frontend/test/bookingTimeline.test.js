import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBookingTimeline } from '../src/lib/bookingTimeline.js';

test('detects late video submission', () => {
  const result = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-08-20',
    postedVideos: [{ posted_at: '2026-08-26' }],
    status: 'video_posted',
  });
  assert.equal(result.badge.type, 'late');
  assert.equal(result.badge.label, 'Muộn 6 ngày');
});

test('detects on-time and early video submission', () => {
  const ontime = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-08-20',
    postedVideos: [{ posted_at: '2026-08-20' }],
    status: 'video_posted',
  });
  assert.equal(ontime.badge.type, 'ontime');
  assert.equal(ontime.badge.label, 'Đúng hạn');

  const early = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-08-20',
    postedVideos: [{ posted_at: '2026-08-18' }],
    status: 'video_posted',
  });
  assert.equal(early.badge.type, 'early');
  assert.equal(early.badge.label, 'Sớm 2 ngày');
});

test('uses the first posted video for deadline status without a video target', () => {
  const result = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-09-15',
    postedVideos: [
      { posted_at: '2026-08-20' },
      { posted_at: '2026-08-22' },
      { posted_at: '2026-08-25' },
      { posted_at: '2026-08-28' },
      { posted_at: '2026-09-01' },
    ],
    status: 'waiting_video',
    today: '2026-09-11',
  });
  assert.equal(result.badge.type, 'early');
  assert.equal(result.badge.label, 'Sớm 26 ngày');
  assert.match(result.badge.tooltip, /5 video/);
  assert.doesNotMatch(result.badge.tooltip, /🎯|5\/6/);
});

test('detects overdue when no video is posted', () => {
  const overdue = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-08-20',
    postedVideos: [],
    status: 'booked',
    today: '2026-09-11',
  });
  assert.equal(overdue.badge.type, 'overdue');
  assert.equal(overdue.badge.label, 'Quá hạn 22 ngày');

  const dueToday = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-09-11',
    postedVideos: [],
    status: 'booked',
    today: '2026-09-11',
  });
  assert.equal(dueToday.badge.type, 'due-today');
  assert.equal(dueToday.badge.label, 'Hạn hôm nay');

  const upcoming = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-09-15',
    postedVideos: [],
    status: 'booked',
    today: '2026-09-11',
  });
  assert.equal(upcoming.badge.type, 'remaining');
  assert.equal(upcoming.badge.label, 'Còn 4 ngày');
});

test('handles cancelled bookings', () => {
  const cancelled = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-08-20',
    postedVideos: [],
    status: 'cancelled',
    today: '2026-09-11',
  });
  assert.equal(cancelled.badge.type, 'cancelled');
  assert.equal(cancelled.badge.label, 'Đã hủy');
});

test('returns null badge when deadlineDate is null and booking is not cancelled', () => {
  const result = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: null,
    postedVideos: [{ posted_at: '2026-08-20' }],
    status: 'video_posted',
    today: '2026-09-11',
  });
  assert.equal(result.badge, null);
});
