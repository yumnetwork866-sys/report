const THUMBNAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const thumbnailCache = new Map();

export const cachedThumbnail = (key, load) => {
  const cached = thumbnailCache.get(key);
  if (cached && Date.now() - cached.createdAt < THUMBNAIL_CACHE_TTL_MS) return cached.promise;
  const promise = Promise.resolve().then(load).catch((error) => {
    thumbnailCache.delete(key);
    throw error;
  });
  thumbnailCache.set(key, { createdAt: Date.now(), promise });
  return promise;
};

export const thumbnailFrom = (video, snapshot) => {
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
