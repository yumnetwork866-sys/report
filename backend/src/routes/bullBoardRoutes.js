const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { getQueue } = require('../lib/queue');
const { TIKTOK_SYNC_QUEUE } = require('../workers/tiktokSyncWorker');
const { requireAdmin } = require('../lib/session');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(getQueue(TIKTOK_SYNC_QUEUE)),
  ],
  serverAdapter,
});

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  const list = {};
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
};

/**
 * Admin role authentication for Bull-Board dashboard UI:
 * Verifies admin session token via Header, ?token= query parameter, or HttpOnly cookie.
 * No Basic Auth popup.
 */
const bullBoardAuth = (req, res, next) => {
  // Allow free access in test or dev override
  if (process.env.NODE_ENV === 'development' && process.env.BULL_BOARD_DEV_NO_AUTH === 'true') {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);
  const rawToken = req.query?.token
    || req.get('authorization')?.replace(/^Bearer\s+/i, '')
    || cookies.bull_admin_token
    || null;

  if (!rawToken) {
    return res.status(401).send(
      '<html><body style="font-family:sans-serif;padding:40px;text-align:center;">'
      + '<h2>Yêu cầu quyền Quản trị viên (Admin)</h2>'
      + '<p>Vui lòng đăng nhập tài khoản Quản trị viên từ hệ thống để truy cập bảng điều khiển hàng đợi.</p>'
      + '</body></html>',
    );
  }

  req.headers.authorization = `Bearer ${rawToken}`;

  return requireAdmin(req, res, () => {
    if (req.session?.role !== 'admin') {
      return res.status(403).send('Forbidden: Quyền Quản trị viên (Admin) là bắt buộc.');
    }

    // Set cookie on main page load with ?token= so subsequent asset/API requests within the iframe are automatically authenticated
    if (req.query?.token) {
      res.setHeader('Set-Cookie', `bull_admin_token=${encodeURIComponent(req.query.token)}; Path=/admin/queues; HttpOnly; SameSite=Lax`);
    }

    return next();
  });
};

module.exports = {
  serverAdapter,
  bullBoardAuth,
};
