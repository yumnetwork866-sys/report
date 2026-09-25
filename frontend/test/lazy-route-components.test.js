import assert from 'node:assert/strict';
import test from 'node:test';

import { recoverDynamicImportError } from '../src/routes/lazyRouteRecovery.js';

const fakeBrowser = () => {
  const values = new Map();
  let reloads = 0;
  return {
    storage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    location: {
      pathname: '/',
      reload: () => { reloads += 1; },
    },
    reloads: () => reloads,
  };
};

test('dynamic route import failure reloads once and guards against a reload loop', () => {
  const browser = fakeBrowser();
  const options = { storage: browser.storage, location: browser.location, windowObject: {}, now: 100_000 };

  assert.equal(recoverDynamicImportError(new TypeError(
    'error loading dynamically imported module: /src/components/HomePage.jsx',
  ), options), true);
  assert.equal(browser.reloads(), 1);

  assert.equal(recoverDynamicImportError(new TypeError(
    'error loading dynamically imported module: /src/components/HomePage.jsx',
  ), { ...options, now: 100_100 }), false);
  assert.equal(browser.reloads(), 1);
});

test('ordinary render errors never trigger route recovery', () => {
  const browser = fakeBrowser();
  assert.equal(recoverDynamicImportError(new Error('Cannot read property x'), {
    storage: browser.storage,
    location: browser.location,
    windowObject: {},
    now: 100_000,
  }), false);
  assert.equal(browser.reloads(), 0);
});
