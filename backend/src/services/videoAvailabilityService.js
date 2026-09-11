const { TikTokChannel } = require('../models');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks a video's public availability on TikTok via oEmbed.
 * Returns { available: boolean, status: 'active' | 'unavailable', thumbnail_url: string | null, title: string | null }
 */
const checkVideoAvailability = async (video) => {
  const channel = video.channel || (video.channel_id ? await TikTokChannel.findByPk(video.channel_id) : null);
  const username = channel?.username || video.channel_username;
  const rawVideoUrl = video.video_url || (username ? `https://www.tiktok.com/@${username.replace(/^@/, '')}/video/${video.platform_video_id}` : null);

  if (!rawVideoUrl) {
    return { available: true, status: video.status || 'active' };
  }

  const videoUrl = rawVideoUrl.split('?')[0];

  try {
    const url = new URL('https://www.tiktok.com/oembed');
    url.searchParams.set('url', videoUrl);

    const response = await fetch(url, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
      },
      ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(8000) } : {}),
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    // TikTok returns HTTP 200 with JSON payload when video exists and is public
    if (response.ok && isJson) {
      const payload = await response.json().catch(() => null);
      return {
        available: true,
        status: 'active',
        thumbnail_url: payload?.thumbnail_url || null,
        title: payload?.title || null,
      };
    }

    // TikTok returns HTTP 400 or 404 with JSON when video is deleted, private, or not found
    if (isJson && [400, 404].includes(response.status)) {
      return { available: false, status: 'unavailable', thumbnail_url: null, title: null };
    }

    // Any other response (e.g. 403 HTML from Akamai WAF, 429 rate limit, 5xx server errors):
    // Do NOT assume the video is deleted or private. Keep current status.
    return { available: true, status: video.status || 'active' };
  } catch (error) {
    // Network / timeout error: do not assume video is gone
    return { available: true, status: video.status || 'active' };
  }
};

/**
 * Runs a concurrency-limited batch check over an array of videos with throttling.
 */
const batchCheckVideosAvailability = async (videos, { concurrency = 2, delayBetweenMs = 150, onProgress } = {}) => {
  let currentIndex = 0;
  const results = [];

  const workers = Array.from({ length: Math.min(concurrency, videos.length) }, async () => {
    while (currentIndex < videos.length) {
      const index = currentIndex;
      currentIndex += 1;
      const video = videos[index];
      const result = await checkVideoAvailability(video);
      results[index] = { videoId: video.id, ...result };
      if (typeof onProgress === 'function') {
        await onProgress({ index, total: videos.length, video, result });
      }
      if (delayBetweenMs > 0) {
        await sleep(delayBetweenMs);
      }
    }
  });

  await Promise.all(workers);
  return results;
};

module.exports = {
  checkVideoAvailability,
  batchCheckVideosAvailability,
};
