import { getStoredSession } from './session.js';

export const SELECTED_SHOP_STORAGE_KEY = 'content_report_selected_shop_id';
export const SELECTED_SHOP_CHANGE_EVENT = 'content-report-selected-shop-change';

function preferenceKey() {
  const session = getStoredSession();
  const userKey = session?.user?.id || session?.user?.email || session?.id || session?.email;
  return userKey ? `${SELECTED_SHOP_STORAGE_KEY}:${userKey}` : SELECTED_SHOP_STORAGE_KEY;
}

export function getStoredSelectedShopId() {
  try {
    if (typeof localStorage === 'undefined') return '';
    const scopedKey = preferenceKey();
    const stored = localStorage.getItem(scopedKey);
    if (stored) return stored;
    if (scopedKey !== SELECTED_SHOP_STORAGE_KEY) {
      const legacy = localStorage.getItem(SELECTED_SHOP_STORAGE_KEY);
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

export function setStoredSelectedShopId(shopId) {
  const nextShopId = shopId !== null && shopId !== undefined && String(shopId).trim() !== ''
    ? String(shopId).trim()
    : '';

  try {
    if (typeof localStorage !== 'undefined') {
      const scopedKey = preferenceKey();
      if (nextShopId) {
        localStorage.setItem(scopedKey, nextShopId);
      } else {
        localStorage.removeItem(scopedKey);
      }
    }
  } catch {
    // Ignore storage failures and keep event flow working
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SELECTED_SHOP_CHANGE_EVENT, {
      detail: nextShopId,
    }));
  }
}

export function resolveSelectedShopId(shops, preferredShopId = getStoredSelectedShopId()) {
  if (!Array.isArray(shops) || shops.length === 0) return '';
  const stringPreferred = preferredShopId !== null && preferredShopId !== undefined ? String(preferredShopId) : '';
  if (stringPreferred) {
    const found = shops.find((shop) => String(shop.id) === stringPreferred);
    if (found) return String(found.id);
  }
  return shops[0]?.id ? String(shops[0].id) : '';
}

export function subscribeSelectedShop(listener) {
  if (typeof window === 'undefined') return () => {};

  const handler = (event) => {
    listener(event);
  };

  window.addEventListener('storage', handler);
  window.addEventListener(SELECTED_SHOP_CHANGE_EVENT, handler);
  window.addEventListener('content-report-session-change', handler);

  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(SELECTED_SHOP_CHANGE_EVENT, handler);
    window.removeEventListener('content-report-session-change', handler);
  };
}
