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
