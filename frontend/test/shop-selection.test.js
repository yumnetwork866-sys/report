import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SELECTED_SHOP_CHANGE_EVENT,
  SELECTED_SHOP_STORAGE_KEY,
  getStoredSelectedShopId,
  resolveSelectedShopId,
  setStoredSelectedShopId,
  subscribeSelectedShop,
} from '../src/lib/shopSelection.js';

function createStorage(initialEntries = {}) {
  const values = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    value(key) {
      return values.get(key);
    },
  };
}

async function withBrowser(storage, callback) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const browserWindow = new EventTarget();

  Object.defineProperty(globalThis, 'window', { configurable: true, value: browserWindow });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });

  try {
    await callback(browserWindow);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage);
    else delete globalThis.localStorage;
  }
}

test('resolving selected shop id returns matched id or falls back to first shop', () => {
  assert.equal(SELECTED_SHOP_STORAGE_KEY, 'content_report_selected_shop_id');
  assert.equal(SELECTED_SHOP_CHANGE_EVENT, 'content-report-selected-shop-change');

  const shops = [
    { id: 1, name: 'Actiscar Malaysia' },
    { id: 7, name: 'Follicas Malaysia' },
  ];

  assert.equal(resolveSelectedShopId([], '7'), '');
  assert.equal(resolveSelectedShopId(shops, '7'), '7');
  assert.equal(resolveSelectedShopId(shops, 7), '7');
  assert.equal(resolveSelectedShopId(shops, '1'), '1');
  assert.equal(resolveSelectedShopId(shops, '999'), '1');
  assert.equal(resolveSelectedShopId(shops, ''), '1');
});

test('reading and writing stored shop id synchronizes with storage and events', async () => {
  const storage = createStorage();

  await withBrowser(storage, async () => {
    assert.equal(getStoredSelectedShopId(), '');

    let eventFired = false;
    let detail = null;
    const unsubscribe = subscribeSelectedShop((event) => {
      eventFired = true;
      detail = event?.detail;
    });

    setStoredSelectedShopId('7');
    assert.equal(getStoredSelectedShopId(), '7');
    assert.equal(eventFired, true);
    assert.equal(detail, '7');

    eventFired = false;
    setStoredSelectedShopId('');
    assert.equal(getStoredSelectedShopId(), '');
    assert.equal(eventFired, true);
    assert.equal(detail, '');

    unsubscribe();
  });
});

test('reading and writing stored shop id isolates preferences per user session', async () => {
  const storage = createStorage();

  await withBrowser(storage, () => {
    const payload1 = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 60_000 })).toString('base64url');
    storage.setItem('content_report_session', JSON.stringify({
      token: `${payload1}.1`,
      user: { id: 'user_1' },
    }));
    setStoredSelectedShopId('7');
    assert.equal(getStoredSelectedShopId(), '7');
    assert.equal(storage.getItem('content_report_selected_shop_id:user_1'), '7');

    const payload2 = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 60_000 })).toString('base64url');
    storage.setItem('content_report_session', JSON.stringify({
      token: `${payload2}.2`,
      user: { id: 'user_2' },
    }));
    assert.equal(getStoredSelectedShopId(), '');
    setStoredSelectedShopId('1');
    assert.equal(getStoredSelectedShopId(), '1');
    assert.equal(storage.getItem('content_report_selected_shop_id:user_2'), '1');
    assert.equal(storage.getItem('content_report_selected_shop_id:user_1'), '7');
  });
});
