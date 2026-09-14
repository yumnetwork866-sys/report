import { getStoredSession } from './session.js';

export const SELECTED_CHANNEL_STORAGE_KEY = 'content_report_selected_channel_id';
export const SELECTED_CHANNEL_CHANGE_EVENT = 'content-report-selected-channel-change';

function preferenceKey() {
  const session = getStoredSession();
  const userKey = session?.user?.id || session?.user?.email || session?.id || session?.email;
  return userKey ? `${SELECTED_CHANNEL_STORAGE_KEY}:${userKey}` : SELECTED_CHANNEL_STORAGE_KEY;
}

export function getStoredSelectedChannelId() {
  try {
    if (typeof localStorage === 'undefined') return '';
    const scopedKey = preferenceKey();
    const stored = localStorage.getItem(scopedKey);
    if (stored) return stored;
    if (scopedKey !== SELECTED_CHANNEL_STORAGE_KEY) {
      const legacy = localStorage.getItem(SELECTED_CHANNEL_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(scopedKey, legacy);
        return legacy;
      }
    }
    return '';
  } catch {
    return '';
  }
}

export function setStoredSelectedChannelId(channelId) {
  const nextChannelId = channelId !== null && channelId !== undefined && String(channelId).trim() !== ''
    ? String(channelId).trim()
    : '';

  try {
    if (typeof localStorage !== 'undefined') {
      const scopedKey = preferenceKey();
      if (nextChannelId) {
        localStorage.setItem(scopedKey, nextChannelId);
      } else {
        localStorage.removeItem(scopedKey);
      }
    }
  } catch {
    // Ignore storage failures
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SELECTED_CHANNEL_CHANGE_EVENT, {
      detail: nextChannelId,
    }));
  }
}

export function resolveSelectedChannelId(channels, preferredChannelId = getStoredSelectedChannelId()) {
  if (!Array.isArray(channels) || channels.length === 0) return '';
  const stringPreferred = preferredChannelId !== null && preferredChannelId !== undefined ? String(preferredChannelId) : '';
  if (stringPreferred) {
    const found = channels.find((channel) => String(channel.id) === stringPreferred);
    if (found) return String(found.id);
  }
  return channels[0]?.id ? String(channels[0].id) : '';
}

export function subscribeSelectedChannel(listener) {
  if (typeof window === 'undefined') return () => {};

  const handler = (event) => {
    listener(event);
  };

  window.addEventListener('storage', handler);
  window.addEventListener(SELECTED_CHANNEL_CHANGE_EVENT, handler);
  window.addEventListener('content-report-session-change', handler);

  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(SELECTED_CHANNEL_CHANGE_EVENT, handler);
    window.removeEventListener('content-report-session-change', handler);
  };
}

