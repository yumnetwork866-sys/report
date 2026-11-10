export const isMonitorActive = (status) => ['PROCESSING', 'RETRY_PENDING'].includes(status);
export const mergeMonitorEvents = (current, incoming) => {
  const events = new Map(current.map((event) => [String(event.id), event]));
  incoming.forEach((event) => events.set(String(event.id), event));
  return [...events.values()].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : BigInt(a.id) < BigInt(b.id) ? 1 : 0);
};
export const formatMonitorDuration = (milliseconds) => {
  if (milliseconds == null) return '—';
  const ms = Math.max(0, Number(milliseconds) || 0);
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

export const monitorResultStatus = (status) => {
  const value = String(status || 'UNKNOWN').toUpperCase();
  return value === 'SUCCESS' ? 'SUCCEEDED' : value;
};

export const filterMonitorResults = (results, search = '', status = 'ALL') => {
  const term = search.trim().toLocaleLowerCase();
  return results.filter((item) => (status === 'ALL' || monitorResultStatus(item.status) === status)
    && (!term || [item.shop_name, item.shop_code, item.channel_name, item.channel_username,
      item.shop_id, item.channelId, item.channel_id, item.error]
      .some((value) => value != null && String(value).toLocaleLowerCase().includes(term))));
};

export const monitorVideoUrl = (video, username) => {
  if (video.video_url) {
    try {
      const url = new URL(video.video_url);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch { /* Fall back to the stable video ID. */ }
  }
  return username && /^\d+$/.test(String(video.video_id || ''))
    ? `https://www.tiktok.com/@${encodeURIComponent(username.replace(/^@/, ''))}/video/${video.video_id}` : null;
};
