const { normalizeCreatorProfile } = require('../tiktokCreatorProfileService');
const bookingRepository = require('../../repositories/bookingRepository');
const { enrichPerformanceViews } = require('./bookingPerformanceService');

const PERFORMANCE_WINDOWS = new Set([
  'LIFETIME', 'PAST_7_DAYS', 'PAST_30_DAYS', 'PAST_60_DAYS', 'PAST_90_DAYS',
  'PAST_120_DAYS', 'PAST_150_DAYS', 'PAST_180_DAYS', 'CUSTOM',
]);

const findTargetCreator = async ({
  shopId,
  collaborationId: collaborationIdValue,
  creatorOpenId: creatorOpenIdValue,
  creatorUsername: creatorUsernameValue,
  performanceWindow: performanceWindowValue,
}) => {
  const normalizedShopId = Number(shopId);
  const collaborationId = String(collaborationIdValue || '').trim();
  const creatorOpenId = String(creatorOpenIdValue || '').trim();
  const creatorUsername = String(creatorUsernameValue || '').trim();
  const requestedWindow = String(performanceWindowValue || '').trim().toUpperCase();
  const performanceWindow = PERFORMANCE_WINDOWS.has(requestedWindow) ? requestedWindow : null;
  if (!Number.isInteger(normalizedShopId) || (!creatorOpenId && !creatorUsername)) return null;

  const snapshots = await bookingRepository.findTargetCollaborations({
    shopId: normalizedShopId,
    collaborationId,
  });
  for (const snapshot of snapshots) {
    const collaboration = snapshot.toJSON();
    const raw = collaboration.raw_data || {};
    const creator = (raw.creators || []).find((item) => {
      const profile = normalizeCreatorProfile(item);
      return (creatorOpenId && String(profile.creator_open_id || '') === creatorOpenId)
        || (creatorUsername && String(profile.username || '').toLowerCase() === creatorUsername.toLowerCase());
    });
    if (!creator) continue;
    const profile = normalizeCreatorProfile(creator);
    const performance = await bookingRepository.findCreatorPerformance({
      shopId: normalizedShopId,
      creatorOpenId: profile.creator_open_id,
      username: profile.username,
      windowType: performanceWindow,
      preferDefaultWindows: !performanceWindow,
    });
    return {
      shopId: normalizedShopId,
      collaboration,
      raw,
      profile,
      performance: await enrichPerformanceViews(performance?.toJSON() || null),
    };
  }

  const profilePerformance = await bookingRepository.findCreatorPerformance({
    shopId: normalizedShopId,
    creatorOpenId,
    username: creatorUsername,
    preferDefaultWindows: true,
  });
  if (!profilePerformance) return null;
  const profileData = profilePerformance.toJSON();
  const selectedPerformance = performanceWindow
    ? await bookingRepository.findCreatorPerformance({
      shopId: normalizedShopId,
      creatorOpenId,
      username: creatorUsername,
      windowType: performanceWindow,
    })
    : profilePerformance;
  return {
    shopId: normalizedShopId,
    collaboration: null,
    raw: null,
    profile: {
      creator_open_id: profileData.creator_open_id || null,
      username: profileData.username,
      nickname: profileData.nickname || profileData.username,
      avatar_url: profileData.avatar_url || null,
    },
    performance: await enrichPerformanceViews(selectedPerformance?.toJSON() || null),
  };
};

module.exports = { findTargetCreator };
