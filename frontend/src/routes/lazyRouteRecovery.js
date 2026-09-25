const DYNAMIC_IMPORT_ERROR_PATTERN = /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Outdated Optimize Dep/i;
const RELOAD_MARKER_PREFIX = 'report_dynamic_import_reload';
const RELOAD_GUARD_MS = 30_000;

const browserContext = (options = {}) => {
  const browserWindow = options.windowObject || (typeof window !== 'undefined' ? window : null);
  if (!browserWindow) return null;
  const storage = options.storage || browserWindow.sessionStorage;
  const location = options.location || browserWindow.location;
  return {
    location,
    storage,
    markerKey: `${RELOAD_MARKER_PREFIX}:${location.pathname || '/'}`,
  };
};

export const clearDynamicImportRecovery = (options = {}) => {
  const context = browserContext(options);
  if (!context) return;
  try {
    context.storage.removeItem(context.markerKey);
  } catch {
    // Storage may be disabled; successful module loading needs no recovery.
  }
};

export const recoverDynamicImportError = (error, options = {}) => {
  if (!DYNAMIC_IMPORT_ERROR_PATTERN.test(String(error?.message || error))) return false;
  const context = browserContext(options);
  if (!context) return false;
  const now = options.now ?? Date.now();
  try {
    const previousAttempt = Number(context.storage.getItem(context.markerKey)) || 0;
    if (now - previousAttempt < RELOAD_GUARD_MS) {
      context.storage.removeItem(context.markerKey);
      return false;
    }
    context.storage.setItem(context.markerKey, String(now));
  } catch {
    return false;
  }
  context.location.reload();
  return true;
};
