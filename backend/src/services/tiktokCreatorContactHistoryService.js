const { Op } = require('sequelize');
const { TikTokCreatorContactHistory } = require('../models');
const { normalizeCreatorProfile } = require('./tiktokCreatorProfileService');

const ACTIVE_INVITATION_STATUSES = new Set(['ONGOING', 'VALID', 'EXPIRING', 'CANCELING']);
const INVITATION_TIME_FIELDS = [
  'invitation_time', 'invite_time', 'created_time', 'create_time', 'start_time',
];

const contactDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' || /^\d+$/.test(String(value || ''))) {
    const numeric = Number(value);
    const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const invitationDate = (collaboration, observedAt) => {
  for (const field of INVITATION_TIME_FIELDS) {
    const parsed = contactDate(collaboration?.[field]);
    if (parsed) return parsed;
  }
  const status = String(collaboration?.status || collaboration?.collaboration_status || '').toUpperCase();
  return ACTIVE_INVITATION_STATUSES.has(status) ? observedAt : null;
};

const recordTargetCollaborationInvites = async (shopId, collaborations = [], {
  observedAt = new Date(),
  model = TikTokCreatorContactHistory,
} = {}) => {
  const contacts = new Map();
  for (const collaboration of collaborations) {
    const invitedAt = invitationDate(collaboration, observedAt);
    if (!invitedAt) continue;
    for (const creator of collaboration.creators || []) {
      const profile = normalizeCreatorProfile(creator);
      if (!profile.username) continue;
      const existing = contacts.get(profile.username);
      if (!existing || invitedAt > existing.last_invited_at) {
        contacts.set(profile.username, {
          shop_id: shopId,
          creator_open_id: profile.creator_open_id,
          username: profile.username,
          last_invited_at: invitedAt,
          updated_at: observedAt,
        });
      }
    }
  }
  if (!contacts.size) return 0;
  const usernames = [...contacts.keys()];
  const existingRows = typeof model.findAll === 'function'
    ? await model.findAll({ where: { shop_id: shopId, username: { [Op.in]: usernames } } })
    : [];
  for (const row of existingRows) {
    const value = row.toJSON ? row.toJSON() : row;
    const contact = contacts.get(value.username);
    if (contact && value.last_invited_at && new Date(value.last_invited_at) > contact.last_invited_at) {
      contact.last_invited_at = new Date(value.last_invited_at);
    }
  }
  await model.bulkCreate([...contacts.values()], {
    conflictAttributes: ['shop_id', 'username'],
    updateOnDuplicate: ['creator_open_id', 'last_invited_at', 'updated_at'],
  });
  return contacts.size;
};

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

module.exports = {
  contactDate,
  invitationDate,
  recordTargetCollaborationInvites,
  recordCreatorContact,
};
