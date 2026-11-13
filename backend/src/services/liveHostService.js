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
      return { body: await select(`SELECT h.shop_id, h.session_id, h.comment, u.id, u.name, u.email, u.avatar_url
        FROM live_session_hosts h LEFT JOIN users u ON u.id = h.user_id
        WHERE (:shopId::int IS NULL OR h.shop_id = :shopId)`, { shopId: query.shop_id || null }) };
    }
    if (action !== 'save') throw new Error('Unknown Live Host action');
    const shopId = Number(params.shopId);
    const sessionId = params.sessionId;
    const shops = await select('SELECT id FROM tiktok_shops WHERE id = :shopId', { shopId });
    if (!shops.length) return { status: 404, body: { message: 'Shop not found.' } };

    const hasUserId = body.user_id !== undefined;
    const hasComment = body.comment !== undefined;
    const userId = body.user_id;
    const comment = hasComment ? (body.comment ? String(body.comment).trim() : null) : null;

    if (userId === null && (!hasComment || comment === null)) {
      await db.query('DELETE FROM live_session_hosts WHERE shop_id = :shopId AND session_id = :sessionId', {
        replacements: { shopId, sessionId },
      });
      return { body: { host: null, ...(hasComment ? { comment: null } : {}) } };
    }

    let user = null;
    if (userId) {
      const users = await select(`SELECT id, name, email, avatar_url FROM users
        WHERE id = :userId AND is_active = TRUE`, { userId });
      if (!users.length) return { status: 400, body: { message: 'Active user not found.' } };
      user = users[0];
    }

    if (hasComment) {
      await db.query(`INSERT INTO live_session_hosts (shop_id, session_id, user_id, comment)
        VALUES (:shopId, :sessionId, :userId, :comment)
        ON CONFLICT (shop_id, session_id) DO UPDATE SET
          user_id = CASE WHEN :hasUserId THEN EXCLUDED.user_id ELSE live_session_hosts.user_id END,
          comment = EXCLUDED.comment,
          updated_at = NOW()`, {
        replacements: { shopId, sessionId, userId: userId ?? null, comment, hasUserId },
      });
    } else {
      await db.query(`INSERT INTO live_session_hosts (shop_id, session_id, user_id)
        VALUES (:shopId, :sessionId, :userId)
        ON CONFLICT (shop_id, session_id) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()`, {
        replacements: { shopId, sessionId, userId },
      });
    }

    return { body: { host: user, ...(hasComment ? { comment } : {}) } };
  },
});

module.exports = { ...createLiveHostService(), createLiveHostService };
