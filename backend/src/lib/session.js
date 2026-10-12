const crypto = require('crypto');
const { expandLegacyPermissions } = require('./permissions');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const getSessionSecret = () => {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in .env');
  }

  return process.env.SESSION_SECRET;
};

const sign = (value) => crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url');

const createSessionToken = (user, permissions = []) => {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: user.role,
    permissions: Array.isArray(permissions) ? permissions : [],
    exp: Date.now() + SESSION_TTL_MS,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};

const requireAdmin = (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  const [payload, signature] = String(token || '').split('.');

  if (!payload || !signature || signature.length !== sign(payload).length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) {
    return res.status(401).json({ message: 'Authentication is required' });
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof session.role !== 'string' || !Number.isInteger(session.sub) || session.exp < Date.now()) {
      return res.status(401).json({ message: 'Session is invalid or expired' });
    }
    req.session = session;
    return next();
  } catch {
    return res.status(401).json({ message: 'Session is invalid' });
  }
};

const requirePermission = (permission) => (req, res, next) => {
  const session = req.session;
  if (!session) {
    return res.status(401).json({ message: 'Authentication is required' });
  }
  if (session.role === 'admin') {
    return next();
  }
  if (expandLegacyPermissions(session.permissions).includes(permission)) {
    return next();
  }
  return res.status(403).json({ message: 'Không có quyền truy cập' });
};

const requireAnyPermission = (permissions) => (req, res, next) => {
  const session = req.session;
  if (!session) return res.status(401).json({ message: 'Authentication is required' });
  if (session.role === 'admin') return next();
  const effectivePermissions = expandLegacyPermissions(session.permissions);
  if (permissions.some((permission) => effectivePermissions.includes(permission))) return next();
  return res.status(403).json({ message: 'Không có quyền truy cập' });
};

module.exports = { createSessionToken, requireAdmin, requirePermission, requireAnyPermission };
