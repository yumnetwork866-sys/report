import { useEffect, useMemo, useState } from 'react';
import { fetchTikTokShopAnalytics, syncTikTokShopAnalytics } from '../../../lib/api.js';
import { moneyValue, numericValue, totalsFor } from '../shopAnalyticsUtils.js';

export const canLoadShopAnalytics = ({
  invalidRange, managementOnly, missingAnalyticsScope, selectedShopId, tokenExpired, videoOnly,
}) => (
  !managementOnly && !videoOnly && Boolean(selectedShopId)
  && !invalidRange && !missingAnalyticsScope && !tokenExpired
);

const useShopAnalyticsData = ({
  currency,
  endDate,
  invalidRange,
  managementOnly,
  missingAnalyticsScope,
  onError,
  selectedShopId,
  startDate,
  t,
  tokenExpired,
  videoOnly,
}) => {
  const [snapshot, setSnapshot] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    if (!canLoadShopAnalytics({
      invalidRange, managementOnly, missingAnalyticsScope, selectedShopId, tokenExpired, videoOnly,
    })) {
      setSnapshot(null);
      setAnalyticsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setAnalyticsLoading(true);
    onError('');
    const loadRange = async () => {
      try {
        const payload = await fetchTikTokShopAnalytics(selectedShopId, {
          signal: controller.signal, startDate, endDate, currency,
        });
        let nextSnapshot = payload?.snapshots?.[0] || null;
        const syncedAt = Date.parse(nextSnapshot?.synced_at || '');
        const stale = !Number.isFinite(syncedAt) || Date.now() - syncedAt > 12 * 60 * 60 * 1000;
        if (!nextSnapshot || !Array.isArray(nextSnapshot?.metrics?.comparison_intervals) || stale) {
          const syncPayload = await syncTikTokShopAnalytics(selectedShopId, {
            start_date: startDate, end_date: endDate, currency,
          }, controller.signal);
          nextSnapshot = syncPayload?.snapshot || null;
        }
        if (!controller.signal.aborted) setSnapshot(nextSnapshot);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setSnapshot(null);
          onError(error.message || t('shopAnalytics.loadError'));
        }
      } finally {
        if (!controller.signal.aborted) setAnalyticsLoading(false);
      }
    };
    loadRange();
    return () => controller.abort();
  }, [currency, endDate, invalidRange, managementOnly, missingAnalyticsScope, onError,
    selectedShopId, startDate, t, tokenExpired, videoOnly]);

  const intervals = useMemo(
    () => Array.isArray(snapshot?.metrics?.intervals) ? snapshot.metrics.intervals : [],
    [snapshot],
  );
  const comparisonIntervals = useMemo(
    () => Array.isArray(snapshot?.metrics?.comparison_intervals) ? snapshot.metrics.comparison_intervals : [],
    [snapshot],
  );
  const totals = useMemo(() => totalsFor(intervals), [intervals]);
  const comparisonTotals = useMemo(() => totalsFor(comparisonIntervals), [comparisonIntervals]);
  const chartData = useMemo(() => intervals.map((row) => ({
    date: row.start_date,
    gmv: moneyValue(row.gmv),
    orders: numericValue(row.orders),
    unitsSold: numericValue(row.units_sold),
    buyers: numericValue(row.buyers),
  })), [intervals]);

  return {
    analyticsLoading,
    chartData,
    comparisonTotals,
    hasComparison: comparisonIntervals.length > 0,
    hasData: intervals.length > 0,
    intervals,
    setSnapshot,
    snapshot,
    totals,
  };
};

export default useShopAnalyticsData;
