const { TikTokCreatorContactHistory } = require('../models');
const { normalizeCreatorProfile } = require('./tiktokCreatorProfileService');

const recordCreatorContact = async (shopId, creator, _type, {
  contactedAt = new Date(),
  model = TikTokCreatorContactHistory,
} = {}) => {
  const profile = normalizeCreatorProfile(creator);
  if (!profile.username) return null;
  const existing = await model.findOne({ where: { shop_id: shopId, username: profile.username } });
  const values = {
    shop_id: shopId,
    creator_open_id: profile.creator_open_id,
    username: profile.username,
    last_invited_at: contactedAt,
    updated_at: contactedAt,
  };
  if (!existing) return model.create(values);
  existing.creator_open_id = profile.creator_open_id || existing.creator_open_id;
  existing.last_invited_at = contactedAt;
  existing.updated_at = contactedAt;
  return existing.save();
};

module.exports = { recordCreatorContact };
