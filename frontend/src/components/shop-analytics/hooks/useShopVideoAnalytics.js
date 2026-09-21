import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTikTokSellerOpenCollaborations,
  fetchTikTokShopVideoAnalytics,
  fetchTikTokShopVideoPerformance,
} from '../../../lib/api.js';
import {
  VIDEO_EXPORT_PAGE_SIZE,
  creatorForVideo,
  moneyValue,
  numericValue,
} from '../shopAnalyticsUtils.js';

export const canLoadShopVideos = ({
  invalidRange, managementOnly, missingAnalyticsScope, selectedShopId, tokenExpired, videoOnly,
}) => Boolean(videoOnly && !managementOnly && selectedShopId
  && !invalidRange && !missingAnalyticsScope && !tokenExpired);

export const creatorOptionsForVideos = (rows, locale) => {
  const creators = new Map();
  rows.forEach((video) => {
    const creator = creatorForVideo(video);
    if (!creator.key) return;
    const current = creators.get(creator.key);
    if (!current || (!current.avatarUrl && creator.avatarUrl)) {
      creators.set(creator.key, { ...creator, value: creator.key });
    }
  });
  return [...creators.values()].sort((left, right) => left.label.localeCompare(right.label, locale));
};

export const filterVideoRows = ({ creatorKey, locale, rows, search, videoExportOnly }) => {
  const creatorRows = videoExportOnly && creatorKey
    ? rows.filter((video) => creatorForVideo(video).key === creatorKey)
    : rows;
  const terms = search.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  if (!videoExportOnly || !terms.length) return creatorRows;
  return creatorRows.filter((video) => {
    const source = video.raw_metrics?.list || {};
    const creator = source.creator || video.creator || {};
    const haystack = [
      video.video_title, video.title, video.video_id, video.creator_name,
      video.creator_username, video.username, creator.nick_name, creator.nickname,
      creator.user_name, video.product_id,
      ...(Array.isArray(source.products)
        ? source.products.flatMap((product) => [product?.name, product?.title]) : []),
    ].filter(Boolean).join(' ').toLocaleLowerCase(locale);
    return terms.every((term) => haystack.includes(term));
  });
};

export const videoTotalsFor = (rows) => rows.reduce((total, video) => ({
  gmv: total.gmv + moneyValue(video.gmv),
  views: total.views + numericValue(video.views ?? video.video_views),
  orders: total.orders + numericValue(video.sku_orders ?? video.orders),
  itemsSold: total.itemsSold + numericValue(video.items_sold ?? video.units_sold),
}), { gmv: 0, views: 0, orders: 0, itemsSold: 0 });

export const videoRequestOptions = ({
  accountType, currency, endDate, signal, sortField, startDate,
}) => ({
  signal,
  startDate,
  endDate,
  currency,
  accountType,
  sortField,
  sortOrder: 'DESC',
  pageSize: 100,
});

const mapApiPayload = (payload) => ({
  ...payload,
  videos: (payload.videos || []).map((row) => ({
    ...row,
    id: row.video_id,
    title: row.video_title,
    creator: {
      ...(row.raw_metrics?.list?.creator || {}),
      ...(row.creator_username ? { user_name: row.creator_username } : {}),
      ...(row.creator_avatar_url ? { avatar_url: row.creator_avatar_url } : {}),
    },
    username: row.creator_username || row.raw_metrics?.list?.username || row.creator_name,
    video_post_time: row.post_date,
    video_url: row.video_link,
    gmv: {
      amount: row.creator_attributed_gmv,
      currency: row.raw_metrics?.list?.gmv?.currency
        || row.raw_metrics?.detail?.performance?.intervals?.[0]?.sales?.overall?.gmv?.currency,
    },
    views: row.video_views,
    sku_orders: row.attributed_orders,
    items_sold: row.attributed_items_sold,
    click_through_rate: row.ctr,
  })),
});

const useShopVideoAnalytics = ({
  currency, endDate, invalidRange, locale, managementOnly, missingAnalyticsScope,
  onError, selectedShopId, startDate, t, tokenExpired, videoExportOnly, videoOnly,
}) => {
  const [videoAnalytics, setVideoAnalytics] = useState(null);
  const [videoAnalyticsLoading, setVideoAnalyticsLoading] = useState(false);
  const [videoReloadKey, setVideoReloadKey] = useState(0);
  const [videoPage, setVideoPage] = useState(1);
  const [videoSearch, setVideoSearch] = useState('');
  const [videoCreator, setVideoCreator] = useState('');
  const [videoProductMetadata, setVideoProductMetadata] = useState({});
  const [videoAccountType, setVideoAccountType] = useState('LINKED_ACCOUNTS');
  const [videoSortField, setVideoSortField] = useState('gmv');
  const productRequestsRef = useRef(new Set());

  useEffect(() => {
    if (!canLoadShopVideos({ invalidRange, managementOnly, missingAnalyticsScope, selectedShopId, tokenExpired, videoOnly })) {
      if (!selectedShopId) setVideoAnalytics(null);
      setVideoAnalyticsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setVideoAnalyticsLoading(true);
    onError('');
    if (!videoExportOnly) {
      fetchTikTokShopVideoAnalytics(selectedShopId, videoRequestOptions({
        signal: controller.signal, startDate, endDate, currency,
        accountType: videoAccountType, sortField: videoSortField,
      })).then((payload) => {
        if (!controller.signal.aborted) setVideoAnalytics(payload);
      }).catch((error) => {
        if (error.name !== 'AbortError') {
          setVideoAnalytics(null);
          onError(error.message || t('shopAnalytics.videoLoadError'));
        }
      }).finally(() => {
        if (!controller.signal.aborted) setVideoAnalyticsLoading(false);
      });
      return () => controller.abort();
    }

    const loadExport = async () => {
      let exportId;
      let payload;
      for (let poll = 0; poll < 300; poll += 1) {
        payload = await fetchTikTokShopVideoPerformance(selectedShopId, {
          signal: controller.signal, startDate, endDate, currency, exportId, pageSize: 100,
        });
        if (controller.signal.aborted) return;
        if (!payload.export) {
          setVideoAnalytics({ videos: [], total_count: 0, export: null });
          setVideoPage(1);
          return;
        }
        exportId = payload.export.id;
        if (payload.export.status === 'FAILED') throw new Error(payload.export.error || t('shopAnalytics.videoLoadError'));
        if (payload.export.status === 'SUCCEEDED') break;
        setVideoAnalytics({ ...payload, videos: [] });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (controller.signal.aborted) return;
      if (payload?.export?.status !== 'SUCCEEDED') throw new Error(t('shopAnalytics.videoSyncTimeout'));
      const totalPages = Math.ceil(Number(payload.total_count || 0) / 100);
      const remainingPages = totalPages > 1
        ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => (
          fetchTikTokShopVideoPerformance(selectedShopId, {
            signal: controller.signal, startDate, endDate, currency, exportId,
            page: index + 2, pageSize: 100,
          })
        ))) : [];
      if (controller.signal.aborted) return;
      setVideoAnalytics(mapApiPayload({
        ...payload,
        videos: [...(payload.videos || []), ...remainingPages.flatMap((page) => page.videos || [])],
      }));
      setVideoPage(1);
    };
    loadExport().catch((error) => {
      if (error.name !== 'AbortError') {
        setVideoAnalytics(null);
        onError(error.message || t('shopAnalytics.videoLoadError'));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setVideoAnalyticsLoading(false);
    });
    return () => controller.abort();
  }, [currency, endDate, invalidRange, managementOnly, missingAnalyticsScope, onError,
    selectedShopId, startDate, t, tokenExpired, videoAccountType, videoExportOnly,
    videoOnly, videoReloadKey, videoSortField]);

  const videoRows = useMemo(() => Array.isArray(videoAnalytics?.videos) ? videoAnalytics.videos : [], [videoAnalytics]);
  const videoCreatorOptions = useMemo(() => creatorOptionsForVideos(videoRows, locale), [locale, videoRows]);
  useEffect(() => {
    if (videoCreator && !videoCreatorOptions.some((option) => option.value === videoCreator)) {
      setVideoCreator('');
      setVideoPage(1);
    }
  }, [videoCreator, videoCreatorOptions]);
  const creatorFilteredVideoRows = useMemo(() => filterVideoRows({
    creatorKey: videoCreator, locale, rows: videoRows, search: '', videoExportOnly,
  }), [locale, videoCreator, videoExportOnly, videoRows]);
  const filteredVideoRows = useMemo(() => filterVideoRows({
    creatorKey: videoCreator, locale, rows: videoRows, search: videoSearch, videoExportOnly,
  }), [locale, videoCreator, videoExportOnly, videoRows, videoSearch]);
  const videoTotals = useMemo(() => videoTotalsFor(creatorFilteredVideoRows), [creatorFilteredVideoRows]);
  const videoPageCount = Math.max(1, Math.ceil(filteredVideoRows.length / VIDEO_EXPORT_PAGE_SIZE));
  const paginatedVideoRows = useMemo(() => videoExportOnly
    ? filteredVideoRows.slice((videoPage - 1) * VIDEO_EXPORT_PAGE_SIZE, videoPage * VIDEO_EXPORT_PAGE_SIZE)
    : videoRows, [filteredVideoRows, videoExportOnly, videoPage, videoRows]);

  useEffect(() => {
    productRequestsRef.current.clear();
    setVideoProductMetadata({});
    setVideoCreator('');
    setVideoPage(1);
  }, [selectedShopId]);
  useEffect(() => {
    if (!videoExportOnly || !videoRows.length) return;
    const metadata = {};
    videoRows.forEach((video) => {
      const products = Array.isArray(video?.raw_metrics?.list?.products)
        ? video.raw_metrics.list.products
        : [];
      products.forEach((product) => {
        const id = String(product?.id || '').trim();
        if (id) metadata[id] = {
          id, name: product.name || product.title || null,
          main_image_url: product.main_image_url || product.thumbnail_url || null,
        };
      });
    });
    if (Object.keys(metadata).length) setVideoProductMetadata((current) => ({ ...metadata, ...current }));
  }, [videoExportOnly, videoRows]);
  useEffect(() => {
    if (!videoExportOnly || !selectedShopId || !paginatedVideoRows.length) return undefined;
    const requested = productRequestsRef.current;
    const productIds = [...new Set(paginatedVideoRows.flatMap((video) => {
      const products = Array.isArray(video?.raw_metrics?.list?.products)
        ? video.raw_metrics.list.products
        : [];
      return [
        ...products.map((product) => product?.id),
        ...String(video?.product_id || '').split(','),
      ];
    }).map((id) => String(id || '').trim()).filter(Boolean))].filter((id) => !requested.has(id));
    if (!productIds.length) return undefined;
    productIds.forEach((id) => requested.add(id));
    const controller = new AbortController();
    const completed = new Set();
    let cursor = 0;
    const worker = async () => {
      while (cursor < productIds.length && !controller.signal.aborted) {
        const id = productIds[cursor++];
        try {
          const payload = await fetchTikTokSellerOpenCollaborations(selectedShopId, {
            signal: controller.signal, pageSize: 20, keyword: id,
          });
          const row = (payload?.open_collaborations || []).find((item) => String(item?.product?.id) === id);
          if (row?.product) setVideoProductMetadata((current) => ({
            ...current,
            [id]: {
              id,
              name: row.product.title || current[id]?.name || null,
              main_image_url: row.product.main_image_url || current[id]?.main_image_url || null,
            },
          }));
          completed.add(id);
        } catch (error) {
          requested.delete(id);
          if (error.name === 'AbortError') return;
        }
      }
    };
    Promise.all(Array.from({ length: Math.min(6, productIds.length) }, worker));
    return () => {
      controller.abort();
      productIds.forEach((id) => { if (!completed.has(id)) requested.delete(id); });
    };
  }, [paginatedVideoRows, selectedShopId, videoExportOnly]);

  const resetVideoSelection = () => {
    setVideoCreator('');
    setVideoPage(1);
  };

  return {
    creatorFilteredVideoRows, filteredVideoRows, paginatedVideoRows, resetVideoSelection,
    setVideoAccountType, setVideoAnalytics, setVideoAnalyticsLoading, setVideoCreator,
    setVideoPage, setVideoReloadKey, setVideoSearch, setVideoSortField, videoAccountType,
    videoAnalytics, videoAnalyticsLoading, videoCreator, videoCreatorOptions, videoPage,
    videoPageCount, videoProductMetadata, videoRows, videoSearch, videoSortField, videoTotals,
  };
};

export default useShopVideoAnalytics;
