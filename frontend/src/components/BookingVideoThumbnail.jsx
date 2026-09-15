import React, { useEffect, useState } from 'react';
import { fetchTikTokShopVideoThumbnail } from '../lib/api';
import { cachedThumbnail, thumbnailFrom } from '../lib/bookingVideoThumbnails';


const BookingVideoThumbnail = ({ shopId, video, snapshot, index, username: explicitUsername }) => {
  const directThumbnail = thumbnailFrom(video, snapshot);
  const [thumbnail, setThumbnail] = useState(directThumbnail);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setThumbnail(directThumbnail);
    setFailed(false);
    const videoId = String(video?.platform_video_id || video?.id || '').trim();
    const rawUsername = explicitUsername || video?.creator_username || '';
    const username = String(rawUsername).trim().replace(/^@+/, '');
    if (directThumbnail || !shopId || !videoId || !username) return undefined;
    let active = true;
    const cacheKey = `${shopId}:${videoId}:${username.toLowerCase()}`;
    cachedThumbnail(cacheKey, () => (
      fetchTikTokShopVideoThumbnail(shopId, videoId, username)
    ))
      .then((payload) => { if (active) setThumbnail(payload?.thumbnail_url || null); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [directThumbnail, explicitUsername, shopId, video?.creator_username, video?.id, video?.platform_video_id]);

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
