const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

const createLiveHostService = (db = sequelize) => ({
  async execute(action, { params = {}, query = {}, body = {} }) {
    const select = (sql, replacements = {}) => db.query(sql, { type: QueryTypes.SELECT, replacements });
    if (action === 'users') {
      return { body: await select(`SELECT id, name, email, avatar_url FROM users
        WHERE is_active = TRUE ORDER BY LOWER(name), id`) };
    }
    if (action === 'list') {
      return { body: await select(`SELECT h.shop_id, h.session_id, u.id, u.name, u.email, u.avatar_url
        FROM live_session_hosts h JOIN users u ON u.id = h.user_id
        WHERE (:shopId::int IS NULL OR h.shop_id = :shopId)`, { shopId: query.shop_id || null }) };
    }
    if (action !== 'save') throw new Error('Unknown Live Host action');
    const shopId = Number(params.shopId);
    const sessionId = params.sessionId;
    const userId = body.user_id;
    const shops = await select('SELECT id FROM tiktok_shops WHERE id = :shopId', { shopId });
    if (!shops.length) return { status: 404, body: { message: 'Shop not found.' } };
    if (userId === null) {
      await db.query('DELETE FROM live_session_hosts WHERE shop_id = :shopId AND session_id = :sessionId', {
        replacements: { shopId, sessionId },
      });
      return { body: { host: null } };
    }
    const users = await select(`SELECT id, name, email, avatar_url FROM users
      WHERE id = :userId AND is_active = TRUE`, { userId });
    if (!users.length) return { status: 400, body: { message: 'Active user not found.' } };
    await db.query(`INSERT INTO live_session_hosts (shop_id, session_id, user_id)
      VALUES (:shopId, :sessionId, :userId)
      ON CONFLICT (shop_id, session_id) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()`, {
      replacements: { shopId, sessionId, userId },
    });
    return { body: { host: users[0] } };
  },
});

module.exports = { ...createLiveHostService(), createLiveHostService };
