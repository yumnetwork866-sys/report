const { AsyncLocalStorage } = require('node:async_hooks');

const context = new AsyncLocalStorage();
const SECRET_KEY = /token|secret|authorization|cookie|password|(^|[_-])(sign|signature|app_key|client_key|api_key|cipher|auth_code)($|[_-])/i;
const OMIT_KEY = /^(base64|file_content|binary|bytes)$/i;
const MAX_BYTES = 65536;
const safeText = (value, secrets = []) => {
  let text = String(value ?? '');
  for (const secret of secrets) {
    if (String(secret).length >= 4) text = text.split(String(secret)).join('[REDACTED]');
  }
  return text.replace(/(Bearer\s+)[\w.+/=-]+/gi, '$1[REDACTED]')
    .replace(/((?:access_token|refresh_token|app_secret|client_secret|signature|sign|auth_code)=)[^\s&"']+/gi, '$1[REDACTED]');
};

const sanitizePayload = (input, { secrets = [] } = {}) => {
  let truncated = false;
  let remaining = MAX_BYTES;
  const seen = new WeakSet();
  const visit = (value, depth = 0, key = '') => {
    if (SECRET_KEY.test(key)) return '[REDACTED]';
    if (OMIT_KEY.test(key)) { truncated = true; return { omitted: 'binary content', characters: typeof value === 'string' ? value.length : null }; }
    if (remaining <= 0 || depth > 12) { truncated = true; return '[TRUNCATED]'; }
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    if (typeof value === 'string') {
      let safe = safeText(value, secrets);
      if (/^https?:\/\//i.test(safe)) {
        try {
          const url = new URL(safe);
          url.username = ''; url.password = '';
          for (const name of [...url.searchParams.keys()]) if (SECRET_KEY.test(name)) url.searchParams.set(name, '[REDACTED]');
          safe = url.toString();
        } catch { /* A non-URL string is still scrubbed above. */ }
      }
      const limit = Math.max(0, Math.min(4000, Math.floor(remaining / 4)));
      if (safe.length > limit) { safe = `${safe.slice(0, limit)}…[TRUNCATED]`; truncated = true; }
      remaining -= Buffer.byteLength(safe) + 8;
      return safe;
    }
    if (typeof value !== 'object') { remaining -= 24; return typeof value === 'bigint' ? String(value) : value; }
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    if (Array.isArray(value)) {
      const rows = [];
      for (const item of value.slice(0, 100)) {
        if (remaining <= 0) break;
        rows.push(visit(item, depth + 1));
      }
      if (rows.length < value.length) { truncated = true; rows.push({ omitted_items: value.length - rows.length }); }
      return rows;
    }
    const result = {};
    const entries = Object.entries(value);
    for (const [name, item] of entries.slice(0, 100)) {
      if (remaining <= 0) { truncated = true; result._truncated = true; break; }
      remaining -= Buffer.byteLength(name) + 8;
      Object.defineProperty(result, name, { value: visit(item, depth + 1, name), enumerable: true });
    }
    if (entries.length > 100) { truncated = true; result._omitted_keys = entries.length - 100; }
    return result;
  };
  const data = visit(input);
  const encoded = JSON.stringify(data);
  if (Buffer.byteLength(encoded || '') > MAX_BYTES) return { data: { preview: encoded.slice(0, MAX_BYTES / 4), _truncated: true }, truncated: true };
  return { data, truncated };
};

const defaultWriter = async (fields, id) => {
  const { ScheduledJobRunEvent } = require('../models');
  if (id) {
    await ScheduledJobRunEvent.update(fields, { where: { id, run_id: context.getStore()?.run_id } });
    return id;
  }
  return (await ScheduledJobRunEvent.create(fields)).id;
};
const write = async (fields, id) => {
  const current = context.getStore();
  if (!current?.run_id) return null;
  try {
    const { writer = defaultWriter, run_id, shop_id, shop_name, channel_id, module_type, window_type, end_day, attempt, task_id } = current;
    const values = { run_id, shop_id, shop_name, channel_id, module_type, window_type, end_day, attempt, task_id, ...fields, updated_at: new Date() };
    return await writer(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)), id);
  } catch (error) {
    // Observability must never change API/job behavior when its storage fails.
    console.warn('[Run Monitor] Event could not be stored', safeText(error.message).slice(0, 500));
    return null;
  }
};
const withMonitorContext = (fields, operation) => context.run({ ...context.getStore(), ...fields }, operation);
const recordRunEvent = (event_type, fields = {}) => {
  if (!context.getStore()?.run_id) return Promise.resolve(null);
  const safe = sanitizePayload(fields);
  return write({ status: 'INFO', completed_at: new Date(), ...safe.data, event_type, payload_truncated: safe.truncated });
};
const withRunMonitor = async (fields, operation) => {
  if (!fields.run_id || String(context.getStore()?.run_id) === String(fields.run_id)) return operation();
  return withMonitorContext(fields, async () => {
    await recordRunEvent('RUN_STARTED', { status: 'PROCESSING' });
    try {
      const result = await operation();
      const status = result?.status || (result?.pending ? 'RETRY_PENDING' : result?.failed ? 'FAILED' : 'SUCCEEDED');
      await recordRunEvent('RUN_FINISHED', { status });
      return result;
    } catch (error) {
      await recordRunEvent('RUN_FINISHED', { status: error.name === 'AbortError' ? 'CANCELLED' : 'FAILED', message: safeText(error.message) });
      throw error;
    }
  });
};

const headerValue = (headers, name) => headers?.get?.(name)
  || Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || null;
const readRequestBody = (body, headers) => {
  if (body == null) return null;
  if (typeof body !== 'string') return { omitted: 'non-text request body' };
  let parsed;
  try { parsed = JSON.parse(body); }
  catch {
    if (!String(headerValue(headers, 'content-type')).includes('application/x-www-form-urlencoded')) return { omitted: 'unparsed request body', characters: body.length };
    parsed = Object.fromEntries(new URLSearchParams(body));
  }
  if (parsed?.grant_type === 'authorization_code' && parsed.code) parsed.code = '[REDACTED]';
  return parsed;
};

const monitoredFetch = async (input, options = {}, fetchImpl = fetch) => {
  if (!context.getStore()?.run_id) return fetchImpl(input, options);
  const url = new URL(String(input));
  const query = Object.fromEntries(url.searchParams);
  const body = readRequestBody(options.body, options.headers);
  const secretValues = [];
  for (const source of [query, options.headers || {}, body || {}]) {
    for (const [key, value] of Object.entries(source)) if (SECRET_KEY.test(key) && typeof value === 'string') {
      secretValues.push(value);
      if (/^Bearer /i.test(value)) secretValues.push(value.slice(7));
    }
  }
  const request = sanitizePayload({ query, body, headers: options.headers || {} }, { secrets: secretValues });
  const started = Date.now();
  const id = await write({
    event_type: 'API_REQUEST', status: 'IN_FLIGHT', started_at: new Date(started),
    method: options.method || 'GET', endpoint: `${url.origin}${url.pathname}`,
    module_type: body?.module_type || context.getStore()?.module_type,
    window_type: body?.window_type || context.getStore()?.window_type,
    end_day: Number(body?.end_day) || context.getStore()?.end_day,
    request_data: request.data, payload_truncated: request.truncated,
  });
  const sentAt = Date.now();
  const finish = async (fields) => {
    if (!id) return;
    await write({ ...fields, completed_at: new Date(), duration_ms: Math.min(2147483647, fields.duration_ms ?? Date.now() - sentAt) }, id);
  };
  let response;
  try { response = await fetchImpl(input, options); }
  catch (error) {
    await finish({ status: 'NETWORK_ERROR', message: safeText(error.message, secretValues) });
    throw error;
  }
  const receiveDuration = Date.now() - sentAt;
  const headers = Object.fromEntries(['content-type', 'content-length', 'retry-after', 'x-request-id', 'x-tt-trace-id', 'x-tt-logid']
    .map((name) => [name, headerValue(response.headers, name)]).filter(([, value]) => value != null));
  const common = {
    http_status: Number(response.status) || null, response_headers: headers,
    retry_after: headers['retry-after'] || null,
    request_id: headers['x-request-id'] || headers['x-tt-logid'] || null,
  };
  if (id) await write({ ...common, status: 'RECEIVED' }, id);
  if (response.status === 204) await finish({ ...common, status: response.ok ? 'SUCCEEDED' : 'FAILED' });
  // Preserve the original response/JSON contract, including test fetch adapters.
  // Reading the body here would consume it before the API client can use it.
  return new Proxy(response, {
    get(target, property) {
      if (property === 'json') return async () => {
        let payload;
        const parseStarted = Date.now();
        try { payload = await target.json(); }
        catch (error) {
          await finish({ ...common, status: 'INVALID_RESPONSE', message: 'Response body could not be parsed as JSON.' });
          throw error;
        }
        const captured = sanitizePayload(payload, { secrets: secretValues });
        const code = payload?.code ?? payload?.error?.code ?? payload?.error?.error_code ?? payload?.error?.status;
        const success = response.ok && payload != null && (code == null || ['0', 'ok'].includes(String(code).toLowerCase()));
        await finish({
          ...common, status: success ? 'SUCCEEDED' : 'FAILED',
          duration_ms: receiveDuration + Date.now() - parseStarted,
          tiktok_code: code == null ? null : String(code).slice(0, 64),
          request_id: payload?.request_id || payload?.error?.log_id || common.request_id,
          task_id: payload?.data?.task?.id || payload?.data?.task_id || context.getStore()?.task_id || null,
          message: safeText(payload?.message || payload?.error?.message || '', secretValues).slice(0, 4000),
          response_data: captured.data, payload_truncated: captured.truncated || request.truncated,
        });
        return payload;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

module.exports = { withMonitorContext, withRunMonitor, recordRunEvent, monitoredFetch, sanitizePayload };
