import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBookingTimeline } from '../src/lib/bookingTimeline.js';

test('detects late video submission when target is met late', () => {
  const result = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-08-20',
    postedVideos: [{ posted_at: '2026-08-26' }],
    committedVideos: 1,
    status: 'video_posted',
  });
  assert.equal(result.badge.type, 'late');
  assert.equal(result.badge.label, 'Muộn 6 ngày');
});

test('detects on-time and early video submission when target is met', () => {
  const ontime = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-08-20',
    postedVideos: [{ posted_at: '2026-08-20' }],
    committedVideos: 1,
    status: 'video_posted',
  });
  assert.equal(ontime.badge.type, 'ontime');
  assert.equal(ontime.badge.label, 'Đúng hạn');

  const early = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-08-20',
    postedVideos: [{ posted_at: '2026-08-18' }],
    committedVideos: 1,
    status: 'video_posted',
  });
  assert.equal(early.badge.type, 'early');
  assert.equal(early.badge.label, 'Sớm 2 ngày');
});

test('handles multi-video progress (e.g. 5/6 videos)', () => {
  // 5 out of 6 videos posted, deadline in future: should show remaining days, NOT early
  const partialRemaining = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-09-15',
    postedVideos: [
      { posted_at: '2026-08-20' },
      { posted_at: '2026-08-22' },
      { posted_at: '2026-08-25' },
      { posted_at: '2026-08-28' },
      { posted_at: '2026-09-01' },
    ],
    committedVideos: 6,
    status: 'waiting_video',
    today: '2026-09-11',
  });
  assert.equal(partialRemaining.badge.type, 'remaining');
  assert.equal(partialRemaining.badge.label, 'Còn 4 ngày');

  // 5 out of 6 videos posted, deadline passed: should show overdue, NOT late by posted date
  const partialOverdue = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-09-08',
    postedVideos: [
      { posted_at: '2026-08-20' },
      { posted_at: '2026-08-22' },
      { posted_at: '2026-08-25' },
      { posted_at: '2026-08-28' },
      { posted_at: '2026-09-01' },
    ],
    committedVideos: 6,
    status: 'waiting_video',
    today: '2026-09-11',
  });
  assert.equal(partialOverdue.badge.type, 'overdue');
  assert.equal(partialOverdue.badge.label, 'Quá hạn 3 ngày');

  // 6 out of 6 videos posted, 6th video posted early on 2026-09-10 before deadline 2026-09-15
  const fullyCompletedEarly = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-09-15',
    postedVideos: [
      { posted_at: '2026-08-20' },
      { posted_at: '2026-08-22' },
      { posted_at: '2026-08-25' },
      { posted_at: '2026-08-28' },
      { posted_at: '2026-09-01' },
      { posted_at: '2026-09-10' },
    ],
    committedVideos: 6,
    status: 'done',
    today: '2026-09-11',
  });
  assert.equal(fullyCompletedEarly.badge.type, 'early');
  assert.equal(fullyCompletedEarly.badge.label, 'Sớm 5 ngày');
});

test('detects overdue when no video is posted', () => {
  const overdue = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-08-20',
    postedVideos: [],
    committedVideos: 1,
    status: 'booked',
    today: '2026-09-11',
  });
  assert.equal(overdue.badge.type, 'overdue');
  assert.equal(overdue.badge.label, 'Quá hạn 22 ngày');

  const dueToday = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-09-11',
    postedVideos: [],
    committedVideos: 1,
    status: 'booked',
    today: '2026-09-11',
  });
  assert.equal(dueToday.badge.type, 'due-today');
  assert.equal(dueToday.badge.label, 'Hạn hôm nay');

  const upcoming = computeBookingTimeline({
    startDate: '2026-08-14',
    deadlineDate: '2026-09-15',
    postedVideos: [],
    committedVideos: 1,
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
