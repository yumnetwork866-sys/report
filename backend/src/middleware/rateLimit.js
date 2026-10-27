const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const createFixedWindowRateLimit = ({
  windowMs = 15 * 60 * 1000,
  max = 10,
  key = (req) => req.ip || req.socket?.remoteAddress || 'unknown',
} = {}) => {
  const counters = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [counterKey, entry] of counters) {
      if (entry.resetAt <= now) counters.delete(counterKey);
    }
  }, Math.min(windowMs, 60_000));
  cleanup.unref();

  return (req, res, next) => {
    const now = Date.now();
    const counterKey = String(key(req));
    let entry = counters.get(counterKey);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      counters.set(counterKey, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count <= max) return next();

    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      message: 'Too many requests. Please try again later.',
      request_id: req.requestId,
    });
  };
};

const loginRateLimit = createFixedWindowRateLimit({
  windowMs: positiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: positiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 10),
});

module.exports = { createFixedWindowRateLimit, loginRateLimit };
