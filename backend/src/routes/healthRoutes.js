const express = require('express');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { checkRedisHealth } = require('../lib/redis');

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const withTimeout = (promise, timeoutMs, dependency) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ dependency, ok: false, latency_ms: timeoutMs, reason: 'timeout' }), timeoutMs);
  const startedAt = process.hrtime.bigint();
  Promise.resolve(promise).then((value) => {
    clearTimeout(timer);
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    resolve({ dependency, ok: value !== false, latency_ms: Number(latencyMs.toFixed(1)) });
  }).catch(() => {
    clearTimeout(timer);
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    resolve({ dependency, ok: false, latency_ms: Number(latencyMs.toFixed(1)), reason: 'unavailable' });
  });
});

const createHealthRouter = ({ database = sequelize, redisHealth = checkRedisHealth } = {}) => {
  const router = express.Router();

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'api',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/ready', async (_req, res) => {
    const timeoutMs = positiveNumber(process.env.READINESS_TIMEOUT_MS, 2000);
    const checks = await Promise.all([
      withTimeout(database.query('SELECT 1', { type: QueryTypes.SELECT }), timeoutMs, 'postgres'),
      withTimeout(redisHealth(), timeoutMs, 'redis'),
    ]);
    const ready = checks.every((check) => check.ok);
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      service: 'api',
      checks: Object.fromEntries(checks.map(({ dependency, ...result }) => [dependency, result])),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
};

module.exports = { createHealthRouter, withTimeout };
