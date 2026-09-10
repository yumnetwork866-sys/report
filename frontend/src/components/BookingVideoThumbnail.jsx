import React, { useEffect, useState } from 'react';
import { fetchTikTokShopVideoThumbnail } from '../lib/api';

const THUMBNAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const thumbnailCache = new Map();

const cachedThumbnail = (key, load) => {
  const cached = thumbnailCache.get(key);
  if (cached && Date.now() - cached.createdAt < THUMBNAIL_CACHE_TTL_MS) return cached.promise;
  const promise = Promise.resolve().then(load).catch((error) => {
    thumbnailCache.delete(key);
    throw error;
  });
  thumbnailCache.set(key, { createdAt: Date.now(), promise });
  return promise;
};

const thumbnailFrom = (video, snapshot) => {
  const rawVideo = snapshot?.raw_metrics?.video || snapshot?.raw_metrics || {};
  const listVideo = rawVideo?.list || rawVideo;
  return video?.thumbnail_url
    || listVideo?.thumbnail_url
    || listVideo?.cover_image_url
    || listVideo?.cover_url
    || rawVideo?.thumbnail_url
    || rawVideo?.cover_image_url
    || rawVideo?.cover_url
    || null;
};

const BookingVideoThumbnail = ({ shopId, video, snapshot, index }) => {
  const directThumbnail = thumbnailFrom(video, snapshot);
  const [thumbnail, setThumbnail] = useState(directThumbnail);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setThumbnail(directThumbnail);
    setFailed(false);
    if (directThumbnail || !shopId || !video?.platform_video_id || !video?.creator_username) return undefined;
    let active = true;
    const cacheKey = `${shopId}:${video.platform_video_id}:${video.creator_username}`;
    cachedThumbnail(cacheKey, () => (
      fetchTikTokShopVideoThumbnail(shopId, video.platform_video_id, video.creator_username)
    ))
      .then((payload) => { if (active) setThumbnail(payload?.thumbnail_url || null); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [directThumbnail, shopId, video?.creator_username, video?.platform_video_id]);

  const content = thumbnail && !failed
    ? <img src={thumbnail} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="booking-video-expansion__thumbnail-placeholder" aria-hidden="true">▶</span>;
  return (
    <span className="booking-video-expansion__thumbnail">
      {video?.video_url ? <a href={video.video_url} target="_blank" rel="noreferrer" tabIndex={-1}>{content}</a> : content}
      <span className="booking-video-expansion__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    </span>
  );
};

export default BookingVideoThumbnail;
