const { Role, User } = require('../models');
const { ALL_PERMISSIONS, normalizePermissions } = require('../lib/permissions');

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;

const serializeRole = async (role) => {
  const value = role.get ? role.get({ plain: true }) : role;
  return {
    ...value,
    permissions: value.key === 'admin' ? ALL_PERMISSIONS : normalizePermissions(value.permissions),
    user_count: await User.count({ where: { role: value.key } }),
  };
};

const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({ order: [['is_system', 'DESC'], ['label', 'ASC']] });
    res.json(await Promise.all(roles.map(serializeRole)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createRole = async (req, res) => {
  try {
    const key = String(req.body.key || '').trim().toLowerCase();
    const label = String(req.body.label || '').trim();
    const description = String(req.body.description || '').trim() || null;

    if (!ROLE_KEY_PATTERN.test(key)) return res.status(400).json({ message: 'Mã role không hợp lệ' });
    if (!label) return res.status(400).json({ message: 'Tên role là bắt buộc' });

    if (ROLE_KEY_PATTERN.test(key) && label) {
      const role = await Role.create({
        key,
        label,
        description,
        is_system: false,
        permissions: normalizePermissions(req.body.permissions),
      });
      res.status(201).json(await serializeRole(role));
    }
  } catch (error) {
    res.status(400).json({ message: error.name === 'SequelizeUniqueConstraintError' ? 'Mã role đã tồn tại' : error.message });
  }
};

const updateRole = async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.key);
    if (!role) return res.status(404).json({ message: 'Không tìm thấy role' });

    const label = String(req.body.label || '').trim();
    if (!label) return res.status(400).json({ message: 'Tên role là bắt buộc' });

    const permissions = role.is_system ? ALL_PERMISSIONS : normalizePermissions(req.body.permissions);

    await role.update({ label, description: String(req.body.description || '').trim() || null, permissions, updated_at: new Date() });
    res.json(await serializeRole(role));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteRole = async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.key);
    if (!role) return res.status(404).json({ message: 'Không tìm thấy role' });
    if (role.is_system) return res.status(400).json({ message: 'Không thể xóa role hệ thống' });

    const userCount = await User.count({ where: { role: role.key } });
    if (userCount) return res.status(409).json({ message: `Role đang được dùng bởi ${userCount} tài khoản` });

    await role.destroy();
    res.json({ message: 'Đã xóa role' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getRoles, createRole, updateRole, deleteRole };
