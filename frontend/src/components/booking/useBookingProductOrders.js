import { useEffect, useRef, useState } from 'react';
import { fetchTikTokSellerAffiliateOrders } from '../../lib/api';
import {
  PRODUCT_ORDERS_CACHE_TTL_MS,
  bookingProductsOf,
  orderRangeForPeriod,
  persistProductOrdersCache,
  productOrdersCacheSession,
} from '../../lib/bookingMetrics';

export default function useBookingProductOrders({
  bookings,
  bookingTab,
  selectedMonth,
  customRange,
  t,
}) {
  const [ordersByShop, setOrdersByShop] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cacheRef = useRef(null);
  if (cacheRef.current === null) cacheRef.current = productOrdersCacheSession();

  useEffect(() => {
    const shopIds = [...new Set(bookings
      .filter((booking) => bookingProductsOf(booking).length)
      .map((booking) => String(booking.target_shop_id || ''))
      .filter(Boolean))].sort();
    const needsOrders = bookings.some(
      (booking) => bookingProductsOf(booking).length > 0 && !booking.product_performance,
    );
    if (!shopIds.length || !needsOrders || bookingTab !== 'product') {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const range = orderRangeForPeriod(selectedMonth, customRange);
    const cacheKey = `${range.startTime || 'all'}:${range.endTime || 'all'}:${shopIds.join(',')}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < PRODUCT_ORDERS_CACHE_TTL_MS) {
      setOrdersByShop(cached.ordersByShop);
      setError('');
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError('');
    Promise.all(shopIds.map(async (shopId) => {
      const orders = [];
      let pageToken = '';
      for (let page = 0; page < 100; page += 1) {
        const payload = await fetchTikTokSellerAffiliateOrders(shopId, {
          signal: controller.signal,
          source: 'db',
          pageSize: 200,
          pageToken,
          ...(range.startTime ? { startTime: range.startTime } : {}),
          ...(range.endTime ? { endTime: range.endTime } : {}),
        });
        orders.push(...(payload?.orders || payload?.affiliate_orders || []));
        const nextPageToken = String(payload?.next_page_token || '');
        if (!nextPageToken || nextPageToken === pageToken) break;
        pageToken = nextPageToken;
      }
      return [shopId, orders];
    })).then((entries) => {
      if (controller.signal.aborted) return;
      const nextOrdersByShop = Object.fromEntries(entries);
      cacheRef.current.set(cacheKey, { ordersByShop: nextOrdersByShop, fetchedAt: Date.now() });
      persistProductOrdersCache(cacheRef.current);
      setOrdersByShop(nextOrdersByShop);
    }).catch((requestError) => {
      if (requestError.name !== 'AbortError') setError(requestError.message || t('booking.productOrdersError'));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });

    return () => controller.abort();
  }, [bookingTab, bookings, customRange, selectedMonth, t]);

  return { productOrdersByShop: ordersByShop, productOrdersLoading: loading, productOrdersError: error };
}
