const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');

const requestStorage = new AsyncLocalStorage();

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const slowRequestThresholdMs = () => positiveNumber(process.env.HTTP_SLOW_REQUEST_MS, 250);
const slowQueryThresholdMs = () => positiveNumber(process.env.DB_SLOW_QUERY_MS, 200);

const normalizeRequestId = (value) => {
  const candidate = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{1,100}$/.test(candidate) ? candidate : randomUUID();
};

const recordDatabaseQuery = (elapsedMs, sql = '') => {
  const durationMs = Number(elapsedMs);
  if (!Number.isFinite(durationMs)) return;
  const context = requestStorage.getStore();
  if (context) {
    context.dbQueryCount += 1;
    context.dbDurationMs += durationMs;
  }
  if (durationMs >= slowQueryThresholdMs()) {
    const details = {
      duration_ms: Number(durationMs.toFixed(1)),
      request_id: context?.requestId || null,
      process_role: process.env.PROCESS_ROLE || 'unknown',
    };
    if (process.env.DB_LOG_SLOW_QUERY_TEXT === 'true') {
      details.query = String(sql).replace(/\s+/g, ' ').trim().slice(0, 500);
    }
    console.warn('[DB] Slow query', details);
  }
};

const requestTelemetry = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const requestId = normalizeRequestId(req.get('x-request-id'));
  const context = { requestId, dbQueryCount: 0, dbDurationMs: 0 };
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  requestStorage.run(context, () => {
    res.once('finish', () => {
      if (process.env.NODE_ENV === 'test' || process.env.HTTP_REQUEST_LOG_ENABLED === 'false') return;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const contentLength = Number(res.getHeader('content-length'));
      const details = {
        request_id: requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        duration_ms: Number(durationMs.toFixed(1)),
        db_queries: context.dbQueryCount,
        db_duration_ms: Number(context.dbDurationMs.toFixed(1)),
        response_bytes: Number.isFinite(contentLength) ? contentLength : null,
      };
      const isSlow = durationMs >= slowRequestThresholdMs();
      const log = isSlow || res.statusCode >= 500 ? console.warn : console.info;
      log(isSlow ? '[HTTP] Slow request' : '[HTTP] Request', details);
    });
    next();
  });
};

module.exports = {
  requestTelemetry,
  recordDatabaseQuery,
  requestStorage,
  normalizeRequestId,
};
