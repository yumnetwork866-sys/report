const {
  User,
  Role,
  ContentTeam,
  UserContentAttribution,
  sequelize,
} = require('../models');
const { hashPassword } = require('../lib/password');
const MIN_PASSWORD_LENGTH = 8;

const roleExists = async (role) => Boolean(await Role.findByPk(role));

const serializeUser = (user) => {
  const safeUser = user.get({ plain: true });
  delete safeUser.password_hash;
  return safeUser;
};

const userInclude = [{
  model: UserContentAttribution,
  as: 'content_attribution',
  required: false,
  include: [{
    model: ContentTeam,
    as: 'team',
    required: false,
    attributes: ['id', 'name'],
  }],
}];

const normalizeHashtags = (value) => [...new Set(
  (Array.isArray(value) ? value : String(value || '').split(/[\s,]+/))
    .map((hashtag) => String(hashtag || '').trim().toLocaleLowerCase('en'))
    .filter(Boolean)
    .map((hashtag) => hashtag.startsWith('#') ? hashtag : `#${hashtag}`),
)].slice(0, 20);

const normalizeTeamId = (value) => {
  if (value === null || value === '' || value === undefined) return null;
  const teamId = Number(value);
  return Number.isInteger(teamId) && teamId > 0 ? teamId : NaN;
};

const validateTeamId = async (value) => {
  const teamId = normalizeTeamId(value);
  if (Number.isNaN(teamId)) throw new Error('Invalid content team.');
  if (teamId && !(await ContentTeam.findByPk(teamId))) throw new Error('Content team not found.');
  return teamId;
};

const saveContentAttribution = async (userId, body, transaction) => {
  const teamId = await validateTeamId(body.content_team_id);
  const hashtags = normalizeHashtags(body.content_hashtags);
  await UserContentAttribution.upsert({
    user_id: userId,
    team_id: teamId,
    hashtags,
    updated_at: new Date(),
  }, { transaction });
};

// Get all users
const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      include: userInclude,
      order: [['id', 'ASC']],
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    const isSelf = Number(req.session?.sub) === targetUserId;
    const canManageUsers = !req.session
      || req.session.role === 'admin'
      || (Array.isArray(req.session.permissions) && req.session.permissions.includes('users'));

    if (!isSelf && !canManageUsers) {
      return res.status(403).json({ message: 'Không có quyền truy cập' });
    }

    const user = await User.findByPk(req.params.id, { include: userInclude });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create new user
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    if (role && !(await roleExists(role))) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    let avatarUrl = null;
    if (typeof req.body.avatar_url === 'string' && req.body.avatar_url.trim()) {
      avatarUrl = req.body.avatar_url.trim();
      if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(avatarUrl) || avatarUrl.length > 90_000) {
        return res.status(400).json({ message: 'Avatar image is invalid or too large' });
      }
    }

    const user = await sequelize.transaction(async (transaction) => {
      const createdUser = await User.create({
        name,
        email,
        role,
        avatar_url: avatarUrl,
        password_hash: await hashPassword(password),
      }, { transaction });
      if (
        Object.prototype.hasOwnProperty.call(req.body, 'content_team_id')
        || Object.prototype.hasOwnProperty.call(req.body, 'content_hashtags')
      ) {
        await saveContentAttribution(createdUser.id, req.body, transaction);
      }
      return createdUser;
    });
    const createdUser = await User.findByPk(user.id, { include: userInclude });
    res.status(201).json(serializeUser(createdUser));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    const targetUserId = Number(req.params.id);
    const isSelf = Number(req.session?.sub) === targetUserId;
    const canManageUsers = !req.session
      || req.session.role === 'admin'
      || (Array.isArray(req.session.permissions) && req.session.permissions.includes('users'));

    if (!isSelf && !canManageUsers) {
      return res.status(403).json({ message: 'Không có quyền truy cập' });
    }

    const hasAttributionUpdate = Object.prototype.hasOwnProperty.call(req.body, 'content_team_id')
      || Object.prototype.hasOwnProperty.call(req.body, 'content_hashtags');

    if (!canManageUsers) {
      if (req.body.role !== undefined) {
        return res.status(403).json({ message: 'Không có quyền thay đổi vai trò' });
      }
      if (req.body.is_active !== undefined) {
        return res.status(403).json({ message: 'Không có quyền thay đổi trạng thái kích hoạt' });
      }
      if (req.body.name !== undefined) {
        return res.status(403).json({ message: 'Không có quyền thay đổi tên người dùng' });
      }
      if (req.body.email !== undefined) {
        return res.status(403).json({ message: 'Không có quyền thay đổi email' });
      }
      if (hasAttributionUpdate) {
        return res.status(403).json({ message: 'Không có quyền thay đổi phân công nhóm nội dung' });
      }
    }

    if (req.body.role && !(await roleExists(req.body.role))) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const payload = {};

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      payload.name = req.body.name.trim();
    }

    if (typeof req.body.email === 'string' && req.body.email.trim()) {
      payload.email = req.body.email.trim();
    }

    if (typeof req.body.role === 'string' && req.body.role.trim()) {
      payload.role = req.body.role.trim();
    }

    if (typeof req.body.is_active === 'boolean') {
      payload.is_active = req.body.is_active;
    }

    if (typeof req.body.avatar_url === 'string') {
      const avatarUrl = req.body.avatar_url.trim();
      if (avatarUrl) {
        if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(avatarUrl) || avatarUrl.length > 90_000) {
          return res.status(400).json({ message: 'Avatar image is invalid or too large' });
        }
        payload.avatar_url = avatarUrl;
      } else {
        payload.avatar_url = null;
      }
    }

    if (typeof req.body.password === 'string' && req.body.password.trim()) {
      if (req.body.password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      payload.password_hash = await hashPassword(req.body.password);
    }

    if (!Object.keys(payload).length && !hasAttributionUpdate) {
      return res.status(400).json({ message: 'No update fields provided' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await sequelize.transaction(async (transaction) => {
      if (Object.keys(payload).length) {
        await user.update(payload, { validate: true, transaction });
      }
      if (hasAttributionUpdate) {
        const currentAttribution = await UserContentAttribution.findByPk(user.id, { transaction });
        await saveContentAttribution(user.id, {
          content_team_id: Object.prototype.hasOwnProperty.call(req.body, 'content_team_id')
            ? req.body.content_team_id
            : currentAttribution?.team_id,
          content_hashtags: Object.prototype.hasOwnProperty.call(req.body, 'content_hashtags')
            ? req.body.content_hashtags
            : currentAttribution?.hashtags || [],
        }, transaction);
      }
    });
    const updatedUser = await User.findByPk(req.params.id, { include: userInclude });
    res.json(serializeUser(updatedUser));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const deleted = await User.destroy({
      where: { id: req.params.id }
    });
    if (deleted) {
      res.json({ message: 'User deleted successfully' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
