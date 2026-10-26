const { Op } = require('sequelize');
const { User, Role } = require('../models');
const { verifyPassword } = require('../lib/password');
const { createSessionToken } = require('../lib/session');
const { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, normalizePermissions } = require('../lib/permissions');

const login = async (req, res) => {
  try {
    const identifier = (req.body.identifier || req.body.email || req.body.username || '').trim();
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }

    const user = await User.unscoped().findOne({
      where: {
        [Op.or]: [
          { email: { [Op.iLike]: identifier } },
          { name: { [Op.iLike]: identifier } },
        ],
      },
    });

    const passwordIsValid = user?.password_hash
      ? await verifyPassword(password, user.password_hash)
      : Boolean(adminPassword) && password === adminPassword;

    if (!user || !passwordIsValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.is_active === false) {
      return res.status(403).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
    }

    const roleRecord = typeof Role?.findByPk === 'function' ? await Role.findByPk(user.role) : null;
    // Normalize so removed permissions (e.g. 'chatbots') are no longer served to existing roles.
    const permissions = user.role === 'admin'
      ? ALL_PERMISSIONS
      : Array.isArray(roleRecord?.permissions)
        ? normalizePermissions(roleRecord.permissions)
        : DEFAULT_PERMISSIONS;

    const safeUser = user.get({ plain: true });
    delete safeUser.password_hash;
    safeUser.permissions = permissions;

    res.json({
      token: createSessionToken(user, permissions),
      user: safeUser,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  login,
};
