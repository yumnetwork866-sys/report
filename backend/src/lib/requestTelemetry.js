const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');

const requestStorage = new AsyncLocalStorage();

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

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

const colorizeStatus = (statusCode, useColor = true) => {
  const code = Number(statusCode) || 0;
  const codeStr = String(statusCode);
  if (!useColor) return codeStr;
  if (code >= 500) return `${ANSI.red}${codeStr}${ANSI.reset}`;
  if (code >= 400) return `${ANSI.yellow}${codeStr}${ANSI.reset}`;
  if (code >= 300) return `${ANSI.cyan}${codeStr}${ANSI.reset}`;
  if (code >= 200) return `${ANSI.green}${codeStr}${ANSI.reset}`;
  return codeStr;
};

const formatResponseSize = (bytes) => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const formatHttpLogLine = ({
  method,
  path,
  statusCode,
  durationMs,
  responseBytes,
  dbQueryCount = 0,
  dbDurationMs = 0,
  isSlow = false,
  useColor = true,
}) => {
  const slowPrefix = isSlow ? '⚠️ ' : '';
  const statusFormatted = colorizeStatus(statusCode, useColor);
  const durationFormatted = `${Number(durationMs).toFixed(1)}ms`;
  const sizeFormatted = formatResponseSize(responseBytes);
  const dbFormatted = `DB: ${dbQueryCount}q (${Number(dbDurationMs).toFixed(1)}ms)`;

  return `[HTTP] ${slowPrefix}${method} ${path} ${statusFormatted} ${durationFormatted} | ${sizeFormatted} | ${dbFormatted}`;
};

const formatDbSlowQueryLine = ({
  durationMs,
  requestId = null,
  processRole = 'unknown',
  query = null,
  useColor = true,
}) => {
  const durationNum = Number(durationMs);
  const durationFormatted = Number.isFinite(durationNum) ? `${durationNum.toFixed(1)}ms` : `${durationMs}ms`;
  const color = Number.isFinite(durationNum) && durationNum >= 1000 ? ANSI.red : ANSI.yellow;
  const coloredDuration = useColor ? `${color}${durationFormatted}${ANSI.reset}` : durationFormatted;
  const reqPart = requestId ? `req: ${requestId}` : 'req: -';
  const rolePart = `process: ${processRole || 'unknown'}`;
  let line = `[DB] ⚠️ Slow query: ${coloredDuration} | ${reqPart} | ${rolePart}`;
  if (query) {
    line += ` | sql: ${query}`;
  }
  return line;
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
    if (process.env.DB_LOG_FORMAT === 'json' || process.env.HTTP_LOG_FORMAT === 'json') {
      console.warn(JSON.stringify({ type: 'slow_query', ...details }));
    } else {
      const shouldColorize = process.env.NO_COLOR === undefined
        && (Boolean(process.stdout?.isTTY) || process.env.FORCE_COLOR !== '0');
      const line = formatDbSlowQueryLine({
        durationMs: details.duration_ms,
        requestId: details.request_id,
        processRole: details.process_role,
        query: details.query,
        useColor: shouldColorize,
      });
      console.warn(line);
    }
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
      const isSlow = durationMs >= slowRequestThresholdMs();
      const log = isSlow || res.statusCode >= 500 ? console.warn : console.info;

      if (process.env.HTTP_LOG_FORMAT === 'json') {
        const details = {
          request_id: requestId,
          method: req.method,
          path: req.originalUrl || req.url,
          status: res.statusCode,
          duration_ms: Number(durationMs.toFixed(1)),
          db_queries: context.dbQueryCount,
          db_duration_ms: Number(context.dbDurationMs.toFixed(1)),
          response_bytes: Number.isFinite(contentLength) ? contentLength : null,
          is_slow: isSlow,
        };
        log(JSON.stringify(details));
      } else {
        const shouldColorize = process.env.NO_COLOR === undefined
          && (Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR !== '0');
        const line = formatHttpLogLine({
          method: req.method,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs,
          responseBytes: Number.isFinite(contentLength) ? contentLength : null,
          dbQueryCount: context.dbQueryCount,
          dbDurationMs: context.dbDurationMs,
          isSlow,
          useColor: shouldColorize,
        });
        log(line);
      }
    });
    next();
  });
};

module.exports = {
  requestTelemetry,
  recordDatabaseQuery,
  requestStorage,
  normalizeRequestId,
  colorizeStatus,
  formatResponseSize,
  formatHttpLogLine,
  formatDbSlowQueryLine,
  ANSI,
};
