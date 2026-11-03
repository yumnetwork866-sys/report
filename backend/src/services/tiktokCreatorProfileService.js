const { Op } = require('sequelize');
const { TikTokCreatorProfile } = require('../models');
const { cacheCreatorAvatars } = require('./creatorAvatarStorageService');

const normalizeUsername = (value) => String(value || '').trim().replace(/^@/, '').toLowerCase();

const normalizeCreatorProfile = (creator = {}) => ({
  creator_open_id: creator.creator_open_id || creator.creator_user_open_id || creator.user_id || null,
  username: normalizeUsername(creator.username),
  nickname: creator.nickname || null,
  avatar_url: creator.avatar_url || creator.avatar?.url || null,
  follower_count: Number(creator.follower_count ?? creator.followers) || 0,
});

const mergeProfile = (profile, existing = {}) => ({
  creator_open_id: profile.creator_open_id || existing.creator_open_id || null,
  username: profile.username,
  nickname: profile.nickname || existing.nickname || null,
  avatar_url: profile.avatar_url || existing.avatar_url || null,
  follower_count: profile.follower_count || Number(existing.follower_count) || 0,
});

const describeIdentityChange = (profile, existing = {}) => {
  const previousName = existing.nickname || null;
  const currentName = profile.nickname || null;
  const previousAvatar = existing.avatar_url || null;
  const currentAvatar = profile.avatar_url || null;
  const nameChanged = currentName !== previousName;
  const avatarChanged = currentAvatar !== previousAvatar;
  return {
    username: profile.username,
    previousName,
    currentName,
    nameChanged,
    avatarChanged,
    avatarAction: !avatarChanged
      ? (currentAvatar ? 'unchanged' : 'missing')
      : (previousAvatar ? 'refreshed' : 'added'),
  };
};

const profileMap = (profiles) => {
  const map = new Map();
  for (const profile of profiles) {
    const value = profile.toJSON ? profile.toJSON() : profile;
    if (value.username) map.set(`username:${normalizeUsername(value.username)}`, value);
    if (value.creator_open_id) map.set(`open:${value.creator_open_id}`, value);
  }
  return map;
};

const loadCreatorProfiles = async (shopId, creators = []) => {
  const normalized = creators.map(normalizeCreatorProfile);
  const usernames = [...new Set(normalized.map((profile) => profile.username).filter(Boolean))];
  const openIds = [...new Set(normalized.map((profile) => profile.creator_open_id).filter(Boolean))];
  if (!usernames.length && !openIds.length) return new Map();
  const or = [];
  if (usernames.length) or.push({ username: { [Op.in]: usernames } });
  if (openIds.length) or.push({ creator_open_id: { [Op.in]: openIds } });
  const profiles = await TikTokCreatorProfile.findAll({ where: { shop_id: shopId, [Op.or]: or } });
  return profileMap(profiles);
};

const saveCreatorProfiles = async (shopId, creators = [], source = 'unknown', {
  logger = console,
} = {}) => {
  const cacheLocally = ['marketplace_discovery', 'performance'].includes(source);
  const localizedCreators = cacheLocally
    ? await cacheCreatorAvatars(shopId, creators, { logger })
    : creators;
  const profiles = localizedCreators.map(normalizeCreatorProfile).filter((profile) => profile.username);
  if (!profiles.length) return new Map();
  const existingMap = await loadCreatorProfiles(shopId, profiles);
  const unique = new Map();
  const existingByUsername = new Map();
  for (const profile of profiles) {
    const existing = existingMap.get(`open:${profile.creator_open_id}`)
      || existingMap.get(`username:${profile.username}`)
      || unique.get(profile.username)
      || {};
    if (!existingByUsername.has(profile.username)) existingByUsername.set(profile.username, existing);
    unique.set(profile.username, mergeProfile(profile, existing));
  }
  const now = new Date();
  await TikTokCreatorProfile.bulkCreate(
    [...unique.values()].map((profile) => ({
      shop_id: shopId,
      ...profile,
      source,
      refreshed_at: now,
      updated_at: now,
    })),
    {
      conflictAttributes: ['shop_id', 'username'],
      updateOnDuplicate: [
        'creator_open_id', 'nickname', 'avatar_url', 'follower_count',
        'source', 'refreshed_at', 'updated_at',
      ],
    },
  );
  const identityChanges = [...unique.values()].map((profile) => (
    describeIdentityChange(profile, existingByUsername.get(profile.username))
  ));
  for (const change of identityChanges.filter((item) => item.nameChanged || item.avatarChanged)) {
    logger?.info?.('[Creator Profile] Identity persisted', {
      shopId,
      source,
      username: change.username,
      nameChanged: change.nameChanged,
      previousName: change.previousName,
      currentName: change.currentName,
      avatarChanged: change.avatarChanged,
      avatarAction: change.avatarAction,
    });
  }
  logger?.info?.('[Creator Profile] Batch persisted', {
    shopId,
    source,
    received: creators.length,
    persisted: unique.size,
    identityUpdates: identityChanges.filter((item) => item.nameChanged || item.avatarChanged).length,
    nameUpdates: identityChanges.filter((item) => item.nameChanged).length,
    avatarUpdates: identityChanges.filter((item) => item.avatarChanged).length,
  });
  return loadCreatorProfiles(shopId, profiles);
};

const sharedProfileFor = (creator, map) => {
  const normalized = normalizeCreatorProfile(creator);
  return map.get(`open:${normalized.creator_open_id}`) || map.get(`username:${normalized.username}`) || null;
};

const hydrateCreatorRows = async (shopId, rows = []) => {
  const map = await loadCreatorProfiles(shopId, rows);
  return rows.map((row) => {
    const shared = sharedProfileFor(row, map);
    if (!shared) return row;
    return {
      ...row,
      creator_open_id: shared.creator_open_id || row.creator_open_id || null,
      username: shared.username || row.username,
      nickname: shared.nickname || row.nickname || null,
      avatar_url: shared.avatar_url || row.avatar_url || null,
      followers: Number(shared.follower_count) || Number(row.followers) || 0,
    };
  });
};

module.exports = {
  normalizeUsername,
  normalizeCreatorProfile,
  describeIdentityChange,
  loadCreatorProfiles,
  saveCreatorProfiles,
  hydrateCreatorRows,
};
