import { useCallback, useMemo } from 'react';
import {
  bookingPerformanceSortValue,
  bookingProductOrderPerformance,
  bookingVideoLinkCountForBookings,
  countPaidBookingKocs,
  bookingVideoMatchesHashtags,
  bookingVideoPerformanceForVideos,
  bookingVideosByRevenue,
  bookingVideosOf,
  filterVideosByPeriod,
  finiteNumber,
  isBookingInPeriod,
  orderRangeForPeriod,
  uniqueBookingVideosForBookings,
} from '../../lib/bookingMetrics';

const performanceForBooking = (booking, bookingTab, productPerformanceByBooking, videoPerformanceByBooking) => (
  bookingTab === 'product'
    ? productPerformanceByBooking.get(String(booking.id))
    : (videoPerformanceByBooking.get(String(booking.id))?.performance || booking.actual_performance)
);

const videoCountForBooking = (booking, bookingTab, performance, videoPerformanceByBooking) => {
  if (bookingTab === 'product') return finiteNumber(performance?.affiliate_orders);
  const videoData = videoPerformanceByBooking.get(String(booking.id));
  return videoData?.videoCount
    ?? (bookingVideosOf(booking).length || Number(booking.actual_performance?.video_count || 0));
};

const uniqueVideoSummary = (bookings, videoPerformanceByBooking, productOrdersByShop, convertAmount) => {
  const videos = uniqueBookingVideosForBookings(bookings, videoPerformanceByBooking);
  const videosByShop = new Map();
  for (const video of videos) {
    const shopId = String(video._booking_shop_id || 'no-shop');
    if (!videosByShop.has(shopId)) videosByShop.set(shopId, []);
    videosByShop.get(shopId).push(video);
  }
  const result = [...videosByShop.entries()].reduce((summary, [shopId, shopVideos]) => {
    const performance = bookingVideoPerformanceForVideos(
      shopVideos,
      null,
      productOrdersByShop[String(shopId)] || [],
    );
    summary.views += finiteNumber(performance.views ?? performance.video_views);
    summary.videoCount += shopVideos.length;
    return summary;
  }, { revenue: 0, views: 0, videoCount: 0 });
  for (const booking of bookings) {
    const performance = videoPerformanceByBooking.get(String(booking.id))?.performance
      || booking.actual_performance;
    const rawRevenue = finiteNumber(performance?.gross_gmv ?? performance?.affiliate_gmv);
    result.revenue += convertAmount(rawRevenue, performance?.currency || booking.currency) ?? rawRevenue;
  }
  return result;
};

export default function useBookingAnalytics({
  bookings,
  users,
  canManageUsers,
  sessionUserId,
  bookingTab,
  selectedMonth,
  customRange,
  hashtagFilterEnabled,
  productOrdersByShop,
  selectedManagerKey,
  overviewSort,
  bookingSort,
  collator,
  convertAmount,
  t,
}) {
  const productPerformanceByBooking = useMemo(() => {
    const activeRange = orderRangeForPeriod(selectedMonth, customRange);
    return new Map(bookings.map((booking) => [
      String(booking.id),
      booking.product_performance
      || bookingProductOrderPerformance(booking, productOrdersByShop[String(booking.target_shop_id)] || [], activeRange),
    ]));
  }, [bookings, customRange, productOrdersByShop, selectedMonth]);

  const hashtagsByUserId = useMemo(() => new Map(users.map((user) => [
    String(user.id),
    Array.isArray(user.content_attribution?.hashtags) ? user.content_attribution.hashtags : [],
  ])), [users]);

  const videoPerformanceByBooking = useMemo(() => {
    const activeRange = orderRangeForPeriod(selectedMonth, customRange);
    return new Map(bookings.map((booking) => {
      const allVideos = bookingVideosOf(booking);
      const periodVideos = filterVideosByPeriod(allVideos, activeRange);
      const staffHashtags = hashtagsByUserId.get(String(booking.staff_id || booking.staff?.id || '')) || [];
      const filteredVideos = hashtagFilterEnabled
        ? periodVideos.filter((video) => bookingVideoMatchesHashtags(video, staffHashtags))
        : periodVideos;
      if (!activeRange.startDate && !activeRange.endDate && !hashtagFilterEnabled) {
        return [String(booking.id), {
          videos: bookingVideosByRevenue(allVideos),
          performance: booking.actual_performance,
          videoCount: allVideos.length || Number(booking.actual_performance?.video_count || 0),
        }];
      }
      return [String(booking.id), {
        videos: bookingVideosByRevenue(filteredVideos),
        performance: bookingVideoPerformanceForVideos(
          filteredVideos,
          booking.actual_performance,
          productOrdersByShop[String(booking.target_shop_id)] || [],
        ),
        videoCount: filteredVideos.length,
      }];
    }));
  }, [bookings, customRange, hashtagFilterEnabled, hashtagsByUserId, productOrdersByShop, selectedMonth]);

  const bookingInPeriodById = useMemo(() => {
    const activeRange = orderRangeForPeriod(selectedMonth, customRange);
    return new Map(bookings.map((booking) => [
      String(booking.id),
      isBookingInPeriod(booking, activeRange),
    ]));
  }, [bookings, customRange, selectedMonth]);

  const stats = useMemo(() => {
    const visibleBookings = bookings.filter((booking) => bookingInPeriodById.get(String(booking.id)));
    const result = visibleBookings.reduce((summary, booking) => {
      const rawCost = finiteNumber(booking.total_cost ?? booking.booking_cost);
      const convertedCost = convertAmount(rawCost, booking.currency) ?? rawCost;
      const performance = performanceForBooking(
        booking,
        bookingTab,
        productPerformanceByBooking,
        videoPerformanceByBooking,
      );
      const rawRevenue = finiteNumber(bookingTab === 'product' ? performance?.affiliate_gmv : performance?.gross_gmv);
      summary.total += 1;
      summary.totalCost += convertedCost;
      if (bookingTab === 'product') {
        summary.totalRevenue += convertAmount(rawRevenue, performance?.currency) ?? rawRevenue;
        summary.videoCount += videoCountForBooking(booking, bookingTab, performance, videoPerformanceByBooking);
      }
      return summary;
    }, { total: 0, totalCost: 0, totalRevenue: 0, videoCount: 0 });
    if (bookingTab === 'video') {
      const videoSummary = uniqueVideoSummary(
        visibleBookings,
        videoPerformanceByBooking,
        productOrdersByShop,
        convertAmount,
      );
      result.totalRevenue = videoSummary.revenue;
      result.videoCount = videoSummary.videoCount;
    }
    return result;
  }, [bookingInPeriodById, bookingTab, bookings, convertAmount, productOrdersByShop, productPerformanceByBooking, videoPerformanceByBooking]);

  const bookingGroups = useMemo(() => {
    const usersById = new Map(users.map((user) => [String(user.id), user]));
    const groups = new Map();
    const accessibleBookings = canManageUsers
      ? bookings
      : bookings.filter((booking) => String(booking.staff_id || '') === sessionUserId);
    const visibleBookings = accessibleBookings.filter((booking) => (
      bookingInPeriodById.get(String(booking.id))
    ));

    for (const booking of visibleBookings) {
      const staffId = booking.staff_id ? String(booking.staff_id) : '';
      const staffName = String(booking.staff_name || booking.staff?.name || '').trim();
      const key = staffId ? `id:${staffId}` : staffName ? `name:${staffName.toLocaleLowerCase()}` : 'unassigned';
      if (!groups.has(key)) {
        const user = usersById.get(staffId) || booking.staff || null;
        groups.set(key, {
          key,
          manager: {
            name: user?.name || staffName || t('booking.unassigned'),
            email: user?.email || null,
            avatar_url: user?.avatar_url || null,
          },
          bookings: [],
          totalCost: 0,
          totalRevenue: 0,
          videoCount: 0,
          totalViews: 0,
        });
      }
      const group = groups.get(key);
      const rawCost = finiteNumber(booking.total_cost ?? booking.booking_cost);
      const performance = performanceForBooking(
        booking,
        bookingTab,
        productPerformanceByBooking,
        videoPerformanceByBooking,
      );
      const rawRevenue = finiteNumber(bookingTab === 'product' ? performance?.affiliate_gmv : performance?.gross_gmv);
      group.bookings.push(booking);
      group.totalCost += convertAmount(rawCost, booking.currency) ?? rawCost;
      if (bookingTab === 'product') {
        group.totalRevenue += convertAmount(rawRevenue, performance?.currency) ?? rawRevenue;
        group.videoCount += videoCountForBooking(booking, bookingTab, performance, videoPerformanceByBooking);
      }
    }

    const revenueOf = (booking) => {
      const performance = performanceForBooking(
        booking,
        bookingTab,
        productPerformanceByBooking,
        videoPerformanceByBooking,
      );
      const revenue = finiteNumber(bookingTab === 'product'
        ? performance?.affiliate_gmv
        : (performance?.gross_gmv ?? performance?.affiliate_gmv));
      return convertAmount(revenue, performance?.currency) ?? revenue;
    };
    const costOf = (booking) => {
      if (!bookingInPeriodById.get(String(booking.id))) return 0;
      const raw = finiteNumber(booking.total_cost ?? booking.booking_cost);
      return convertAmount(raw, booking.currency) ?? raw;
    };
    for (const group of groups.values()) {
      if (bookingTab === 'video') {
        const videoSummary = uniqueVideoSummary(
          group.bookings,
          videoPerformanceByBooking,
          productOrdersByShop,
          convertAmount,
        );
        group.totalRevenue = videoSummary.revenue;
        group.videoCount = bookingVideoLinkCountForBookings(group.bookings, videoPerformanceByBooking);
        group.totalViews = videoSummary.views;
      }
      group.kocCount = bookingTab === 'video'
        ? countPaidBookingKocs(
          group.bookings,
          (booking) => bookingInPeriodById.get(String(booking.id)),
        )
        : group.bookings.length;
      const defaultSortOf = bookingTab === 'video' ? costOf : revenueOf;
      group.bookings.sort((left, right) => (
        defaultSortOf(right) - defaultSortOf(left)
        || revenueOf(right) - revenueOf(left)
        || Number(right.id || 0) - Number(left.id || 0)
      ));
    }
    return [...groups.values()].sort((left, right) => {
      if (left.key === 'unassigned') return 1;
      if (right.key === 'unassigned') return -1;
      return collator.compare(left.manager.name, right.manager.name);
    });
  }, [bookingInPeriodById, bookingTab, bookings, canManageUsers, collator, convertAmount, productOrdersByShop, productPerformanceByBooking, sessionUserId, t, users, videoPerformanceByBooking]);

  const activeBookingGroup = bookingGroups.find((group) => group.key === selectedManagerKey)
    || bookingGroups[0]
    || null;
  const showAllBookingGroups = canManageUsers && selectedManagerKey === 'all';
  const bookingGroupsToRender = useMemo(() => (
    showAllBookingGroups ? bookingGroups : activeBookingGroup ? [activeBookingGroup] : []
  ), [activeBookingGroup, bookingGroups, showAllBookingGroups]);
  const bookingManagerFilterValue = showAllBookingGroups ? 'all' : activeBookingGroup?.key || '';

  const sortedBookingGroupsToRender = useMemo(() => {
    const list = [...bookingGroupsToRender];
    if (!overviewSort.key) return list;
    const { key, direction } = overviewSort;
    const factor = direction === 'desc' ? -1 : 1;
    return list.sort((a, b) => {
      if (key === 'staff') return factor * collator.compare(a.manager.name, b.manager.name);
      const value = (group) => {
        if (key === 'koc') return group.kocCount;
        if (key === 'videos') return group.videoCount;
        if (key === 'views') return group.totalViews;
        if (key === 'cost') return group.totalCost;
        if (key === 'revenue') return group.totalRevenue;
        if (key === 'ratio') return group.totalRevenue > 0
          ? group.totalCost / group.totalRevenue
          : (group.totalCost > 0 ? Infinity : 0);
        return 0;
      };
      const valA = value(a);
      const valB = value(b);
      if (valA !== valB) {
        return factor * (valA > valB ? 1 : -1);
      }
      if (key === 'ratio' || key === 'cost') {
        const revDiff = b.totalRevenue - a.totalRevenue;
        if (revDiff !== 0) return revDiff;
      }
      return collator.compare(a.manager.name, b.manager.name);
    });
  }, [bookingGroupsToRender, collator, overviewSort]);

  const sortedBookingsOfGroup = useCallback((bookingsList) => {
    const list = [...bookingsList];
    if (!bookingSort.key) return list;
    const { key, direction } = bookingSort;
    const factor = direction === 'desc' ? -1 : 1;
    const performanceOf = (booking) => performanceForBooking(
      booking,
      bookingTab,
      productPerformanceByBooking,
      videoPerformanceByBooking,
    );
    const revenueOf = (booking) => {
      const performance = performanceOf(booking);
      const raw = finiteNumber(bookingTab === 'product'
        ? performance?.affiliate_gmv
        : (performance?.gross_gmv ?? performance?.affiliate_gmv));
      return convertAmount(raw, performance?.currency) ?? raw;
    };
    const costOf = (booking) => {
      if (!bookingInPeriodById.get(String(booking.id))) return 0;
      const raw = finiteNumber(booking.total_cost ?? booking.booking_cost);
      return convertAmount(raw, booking.currency) ?? raw;
    };
    const value = (booking) => {
      if (key === 'revenue') return revenueOf(booking);
      if (key === 'cost') return costOf(booking);
      if (key === 'videos') return videoCountForBooking(booking, bookingTab, performanceOf(booking), videoPerformanceByBooking);
      if (key === 'views') {
        const videoPerformance = videoPerformanceByBooking.get(String(booking.id))?.performance
          || booking.actual_performance;
        return bookingPerformanceSortValue(videoPerformance, key);
      }
      if (key === 'ratio') {
        const revenue = revenueOf(booking);
        return revenue > 0 ? costOf(booking) / revenue : (costOf(booking) > 0 ? Infinity : 0);
      }
      return bookingPerformanceSortValue(performanceOf(booking), key);
    };

    return list.sort((a, b) => {
      if (key === 'koc') {
        const diff = collator.compare(
          String(a.creator_name || a.creator_username || '').trim(),
          String(b.creator_name || b.creator_username || '').trim(),
        );
        return diff !== 0 ? factor * diff : Number(b.id || 0) - Number(a.id || 0);
      }
      const valA = value(a);
      const valB = value(b);
      if (valA !== valB) {
        return factor * (valA > valB ? 1 : -1);
      }
      if (key === 'cost') {
        const revDiff = revenueOf(b) - revenueOf(a);
        if (revDiff !== 0) return revDiff;
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [bookingInPeriodById, bookingSort, bookingTab, collator, convertAmount, productPerformanceByBooking, videoPerformanceByBooking]);

  return {
    stats,
    bookingGroups,
    bookingGroupsToRender,
    bookingManagerFilterValue,
    sortedBookingGroupsToRender,
    sortedBookingsOfGroup,
    productPerformanceByBooking,
    videoPerformanceByBooking,
    bookingInPeriodById,
  };
}
