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
  fallbackProfile,
}) => {
  const normalizedShopId = Number(shopId);
  const collaborationId = String(collaborationIdValue || '').trim();
  const creatorOpenId = String(creatorOpenIdValue || '').trim();
  const rawUsername = String(creatorUsernameValue || '').trim();
  const creatorUsername = rawUsername.replace(/^@+/, '');
  const requestedWindow = String(performanceWindowValue || '').trim().toUpperCase();
  const performanceWindow = PERFORMANCE_WINDOWS.has(requestedWindow) ? requestedWindow : null;
  if (!Number.isInteger(normalizedShopId) || (!creatorOpenId && !creatorUsername)) return null;

  // 1. Search target shop's collaborations
  const snapshots = await bookingRepository.findTargetCollaborations({
    shopId: normalizedShopId,
    collaborationId,
  });
  for (const snapshot of snapshots) {
    const collaboration = snapshot.toJSON ? snapshot.toJSON() : snapshot;
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
      performance: await enrichPerformanceViews(performance?.toJSON ? performance.toJSON() : performance || null),
    };
  }

  // 2. Search target shop's creator performance
  const profilePerformance = await bookingRepository.findCreatorPerformance({
    shopId: normalizedShopId,
    creatorOpenId,
    username: creatorUsername,
    preferDefaultWindows: true,
  });
  if (profilePerformance) {
    const profileData = profilePerformance.toJSON ? profilePerformance.toJSON() : profilePerformance;
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
      performance: await enrichPerformanceViews(selectedPerformance?.toJSON ? selectedPerformance.toJSON() : selectedPerformance || null),
    };
  }

  // 3. Creator exists in another shop (cross-shop creator, e.g. booking for a new shop before syncing)
  if (collaborationId) {
    const crossShopSnapshots = await bookingRepository.findTargetCollaborations({
      collaborationId,
    });
    for (const snapshot of crossShopSnapshots) {
      const collaboration = snapshot.toJSON ? snapshot.toJSON() : snapshot;
      const raw = collaboration.raw_data || {};
      const creator = (raw.creators || []).find((item) => {
        const profile = normalizeCreatorProfile(item);
        return (creatorOpenId && String(profile.creator_open_id || '') === creatorOpenId)
          || (creatorUsername && String(profile.username || '').toLowerCase() === creatorUsername.toLowerCase());
      });
      if (!creator) continue;
      const profile = normalizeCreatorProfile(creator);
      return {
        shopId: normalizedShopId,
        collaboration: null,
        raw: null,
        profile: {
          creator_open_id: profile.creator_open_id || null,
          username: profile.username,
          nickname: profile.nickname || profile.username,
          avatar_url: profile.avatar_url || null,
        },
        performance: null,
      };
    }
  }

  // Check creator performance across ANY shop
  const anyShopPerformance = await bookingRepository.findCreatorPerformance({
    creatorOpenId,
    username: creatorUsername,
    preferDefaultWindows: true,
  });
  if (anyShopPerformance) {
    const profileData = anyShopPerformance.toJSON ? anyShopPerformance.toJSON() : anyShopPerformance;
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
      performance: null,
    };
  }

  // Check stored TikTokCreatorProfile if available
  if (bookingRepository.findCreatorProfile) {
    const storedProfile = await bookingRepository.findCreatorProfile({
      creatorOpenId,
      username: creatorUsername,
    });
    if (storedProfile) {
      const data = storedProfile.toJSON ? storedProfile.toJSON() : storedProfile;
      return {
        shopId: normalizedShopId,
        collaboration: null,
        raw: null,
        profile: {
          creator_open_id: data.creator_open_id || null,
          username: data.username,
          nickname: data.nickname || data.username,
          avatar_url: data.avatar_url || null,
        },
        performance: null,
      };
    }
  }

  // 4. Fallback for completely new creator / new shop (e.g. booked before any sync or video posted)
  const effectiveUsername = creatorUsername || creatorOpenId;
  return {
    shopId: normalizedShopId,
    collaboration: null,
    raw: null,
    profile: {
      creator_open_id: creatorOpenId || null,
      username: effectiveUsername,
      nickname: fallbackProfile?.nickname || effectiveUsername,
      avatar_url: fallbackProfile?.avatar_url || null,
    },
    performance: null,
  };
};

module.exports = { findTargetCreator };
