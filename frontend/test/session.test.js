import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearStoredSession,
  clearStoredSessionIfTokenMatches,
  getSessionRole,
  getSessionSnapshot,
  getStoredSession,
  hasPermission,
  isAdminSession,
  saveStoredSession,
  subscribeSession,
} from '../src/lib/session.js';

const SESSION_STORAGE_KEY = 'content_report_session';

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

function createSession(id = 'session', ttlMs = 60_000) {
  const payload = Buffer.from(JSON.stringify({
    role: 'member',
    exp: Date.now() + ttlMs,
  })).toString('base64url');

  return {
    token: `${payload}.${id}`,
    user: { id },
  };
}

async function withBrowser(storage, callback) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const browserWindow = new EventTarget();
  browserWindow.setTimeout = (callback, delay) => setTimeout(callback, delay);
  browserWindow.clearTimeout = (timeoutId) => clearTimeout(timeoutId);

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

test('reading an empty or invalid session has no side effects', async () => {
  const storage = createStorage({ [SESSION_STORAGE_KEY]: '{invalid json' });

  await withBrowser(storage, (browserWindow) => {
    let changeCount = 0;
    browserWindow.addEventListener('content-report-session-change', () => { changeCount += 1; });

    assert.equal(getStoredSession(), null);
    assert.equal(changeCount, 0);
    assert.equal(storage.value(SESSION_STORAGE_KEY), '{invalid json');
  });
});

test('logout emits one change event and is idempotent', async () => {
  const session = createSession();
  const storage = createStorage({ [SESSION_STORAGE_KEY]: JSON.stringify(session) });

  await withBrowser(storage, (browserWindow) => {
    let changeCount = 0;
    browserWindow.addEventListener('content-report-session-change', () => { changeCount += 1; });

    assert.equal(clearStoredSession(), true);
    assert.equal(clearStoredSession(), false);
    assert.equal(changeCount, 1);
    assert.equal(getStoredSession(), null);
  });
});

test('a stale unauthorized response cannot clear a newer session', async () => {
  const storage = createStorage();
  const oldSession = createSession('old');
  const newSession = createSession('new');

  await withBrowser(storage, () => {
    saveStoredSession(oldSession);
    saveStoredSession(newSession);

    assert.equal(clearStoredSessionIfTokenMatches(oldSession.token), false);
    assert.equal(getStoredSession()?.token, newSession.token);
    assert.equal(clearStoredSessionIfTokenMatches(newSession.token), true);
    assert.equal(getStoredSession(), null);
  });
});

test('session subscription only reacts to relevant storage changes', async () => {
  const storage = createStorage();

  await withBrowser(storage, (browserWindow) => {
    let changeCount = 0;
    const unsubscribe = subscribeSession(() => { changeCount += 1; });
    const unrelatedEvent = new Event('storage');
    const sessionEvent = new Event('storage');
    Object.defineProperty(unrelatedEvent, 'key', { value: 'content_report_language' });
    Object.defineProperty(sessionEvent, 'key', { value: SESSION_STORAGE_KEY });

    browserWindow.dispatchEvent(unrelatedEvent);
    browserWindow.dispatchEvent(sessionEvent);
    unsubscribe();
    browserWindow.dispatchEvent(sessionEvent);

    assert.equal(changeCount, 1);
  });
});

test('blocked browser storage never crashes session reads or logout', async () => {
  const blockedStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };

  await withBrowser(blockedStorage, () => {
    assert.equal(getStoredSession(), null);
    assert.equal(clearStoredSession(), false);
    assert.throws(() => saveStoredSession(createSession()), /Không thể lưu phiên đăng nhập/);
  });
});

test('session expiration clears storage and notifies subscribers', async () => {
  const session = createSession('expiring', 20);
  const storage = createStorage({ [SESSION_STORAGE_KEY]: JSON.stringify(session) });

  await withBrowser(storage, async () => {
    let changeCount = 0;
    const unsubscribe = subscribeSession(() => { changeCount += 1; });

    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(getStoredSession(), null);
    assert.equal(storage.value(SESSION_STORAGE_KEY), undefined);
    assert.equal(changeCount, 1);
    unsubscribe();
  });
});

test('session snapshot changes when user data changes with the same token', async () => {
  const session = createSession('same-token');
  const storage = createStorage();

  await withBrowser(storage, () => {
    saveStoredSession(session);
    const firstSnapshot = getSessionSnapshot();
    saveStoredSession({ ...session, user: { id: 'same-token', name: 'Updated Admin' } });

    assert.notEqual(getSessionSnapshot(), firstSnapshot);
    assert.equal(getStoredSession()?.user?.name, 'Updated Admin');
  });
});

test('non-admin sessions are still treated as valid app sessions', async () => {
  const session = createSession('member-session');
  const storage = createStorage();

  await withBrowser(storage, () => {
    saveStoredSession(session);

    assert.equal(getStoredSession()?.token, session.token);
    assert.equal(getSessionSnapshot() !== null, true);
  });
});

test('session role helpers identify admin sessions', async () => {
  const adminSession = {
    token: 'token.admin',
    user: { id: 'admin', role: 'admin' },
  };
  const legacySession = {
    token: 'token.member',
    role: 'member',
  };

  assert.equal(getSessionRole(adminSession), 'admin');
  assert.equal(isAdminSession(adminSession), true);
  assert.equal(getSessionRole(legacySession), 'member');
  assert.equal(isAdminSession(legacySession), false);
  assert.equal(getSessionRole(null), null);
});

test('granular permissions support new roles, admins, and legacy sessions', () => {
  const granular = { user: { role: 'member', permissions: ['shop.bookings.video.view'] } };
  const legacy = { user: { role: 'member', permissions: ['tiktok'] } };
  const admin = { user: { role: 'admin', permissions: [] } };

  assert.equal(hasPermission(granular, 'shop.bookings.video.view'), true);
  assert.equal(hasPermission(granular, 'shop.orders.view'), false);
  assert.equal(hasPermission(granular, ['shop.orders.view', 'shop.bookings.video.view']), true);
  assert.equal(hasPermission(legacy, 'shop.orders.view'), true);
  assert.equal(hasPermission(admin, 'admin.queues.view'), true);

  const viewOnly = { user: { role: 'member', permissions: ['admin.users.view'] } };
  const legacyUsers = { user: { role: 'member', permissions: ['users'] } };
  assert.equal(hasPermission(viewOnly, 'admin.users.view'), true);
  assert.equal(hasPermission(viewOnly, 'admin.users.manage'), false);
  assert.equal(hasPermission(legacyUsers, 'admin.users.view'), true);
  assert.equal(hasPermission(legacyUsers, 'admin.users.manage'), true);
});
