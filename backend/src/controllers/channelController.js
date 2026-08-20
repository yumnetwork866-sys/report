const crypto = require('crypto');
const { literal, Op } = require('sequelize');
const { decryptToken, encryptToken } = require('../lib/tokenEncryption');
const {
  TikTokChannel,
  User,
  Video,
  VideoAssignment,
  VideoProduct,
  VideoDailyStats,
  sequelize,
} = require('../models');
const { delByPattern } = require('../lib/redis');

const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
const TIKTOK_USER_INFO_FIELDS = [
  'open_id',
  'union_id',
  'display_name',
  'avatar_url',
  'avatar_large_url',
  'username',
  'bio_description',
  'is_verified',
  'follower_count',
  'following_count',
  'likes_count',
  'video_count',
].join(',');
const TIKTOK_USER_INFO_URL = `https://open.tiktokapis.com/v2/user/info/?fields=${TIKTOK_USER_INFO_FIELDS}`;
const TIKTOK_VIDEO_LIST_URL = 'https://open.tiktokapis.com/v2/video/list/';
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3005';
const DEFAULT_OAUTH_RETURN_PATH = process.env.TIKTOK_OAUTH_RETURN_PATH || '/manage/channels';
const TIKTOK_VIDEO_LIST_FIELDS = process.env.TIKTOK_VIDEO_LIST_FIELDS
  || 'id,title,create_time,cover_image_url,share_url,video_description,duration,view_count,like_count,comment_count,share_count';
const TIKTOK_VIDEO_SYNC_LIMIT = Number(process.env.TIKTOK_VIDEO_SYNC_LIMIT || 20);
const TIKTOK_VIDEO_SYNC_MAX_PAGES = Number(process.env.TIKTOK_VIDEO_SYNC_MAX_PAGES || 10);
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const LEGACY_CONTENT_GROUP_NAMES = {
  CONTENT_MKT: 'Team Content MKT',
  CONTENT_AI: 'Content AI',
  NEWS: 'Team Tin tức',
};

const normalizeContentAttributionRules = (rules) => {
  if (!Array.isArray(rules)) throw new Error('Content attribution rules must be an array.');
  return rules.slice(0, 100).map((rule, index) => {
    if (rule?.type === 'settings') {
      return {
        id: 'content-attribution-settings',
        type: 'settings',
        group: 'SETTINGS',
        team_name: '',
        user_id: null,
        member: '',
        hashtags: [],
      };
    }
    const group = String(rule?.group || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,80}$/.test(group)) throw new Error(`Invalid content group at rule ${index + 1}.`);
    const userId = Number.isInteger(Number(rule?.user_id)) && Number(rule.user_id) > 0
      ? Number(rule.user_id)
      : null;
    const type = rule?.type === 'team' || (!rule?.type && !userId) ? 'team' : 'employee';
    const normalizedHashtags = [...new Set((Array.isArray(rule?.hashtags) ? rule.hashtags : [])
      .map((value) => String(value || '').trim().toLocaleLowerCase('en'))
      .filter(Boolean)
      .map((value) => value.startsWith('#') ? value : `#${value}`))]
      .slice(0, 20);
    if (type === 'employee' && !normalizedHashtags.length) {
      throw new Error(`At least one hashtag is required at rule ${index + 1}.`);
    }
    return {
      id: String(rule?.id || crypto.randomUUID()),
      type,
      group,
      team_name: type === 'team'
        ? String(rule?.team_name || LEGACY_CONTENT_GROUP_NAMES[group] || group).trim().slice(0, 120)
        : '',
      user_id: type === 'employee' ? userId : null,
      member: type === 'employee' ? String(rule?.member || '').trim().slice(0, 120) : '',
      hashtags: type === 'employee' ? normalizedHashtags : [],
    };
  });
};

const expiresAtFromSeconds = (seconds) => {
  const expiresIn = Number(seconds);
  return Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000)
    : null;
};

const buildOauthState = () => {
  const issuedAt = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${issuedAt}.${nonce}`;
  const signature = crypto
    .createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET || '')
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
};

const isValidOauthState = (state) => {
  const [issuedAt, nonce, signature] = String(state || '').split('.');
  const timestamp = Number(issuedAt);

  if (!issuedAt || !nonce || !signature || !Number.isFinite(timestamp) || Date.now() - timestamp > OAUTH_STATE_MAX_AGE_MS) {
    return false;
  }

  const payload = `${issuedAt}.${nonce}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET || '')
    .update(payload)
    .digest('base64url');

  return signature.length === expectedSignature.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

const buildTiktokOauthUrl = () => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  const scopes = (process.env.TIKTOK_SCOPES || 'user.info.basic')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(',');
  const authorizeBaseUrl = process.env.TIKTOK_OAUTH_AUTHORIZE_BASE_URL || 'https://www.tiktok.com/v2/auth/authorize/';

  if (!clientKey || !redirectUri) {
    return null;
  }

  const url = new URL(authorizeBaseUrl);
  url.searchParams.set('client_key', clientKey);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', buildOauthState());

  return url.toString();
};

const handleTiktokWebhook = async (req, res) => {
  try {
    const payload = req.body || {};

    // Keep the webhook lightweight for now. We log and acknowledge the event.
    console.log('TikTok webhook received:', JSON.stringify(payload));

    return res.status(200).json({
      ok: true,
      received_at: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const revokeTiktokAccessToken = async (accessToken) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    throw new Error('TikTok revoke is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.');
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    token: accessToken,
  });

  const response = await fetch(TIKTOK_REVOKE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    let errorMessage = `TikTok revoke failed with status ${response.status} ${response.statusText}`.trim();

    try {
      const payload = await response.json();
      errorMessage = buildTikTokErrorMessage(payload, errorMessage);
    } catch {
      // Keep the generic HTTP error message if the response is not JSON.
    }

    throw new Error(errorMessage);
  }

  return true;
};

const revokeTiktokChannelAuthorization = async (channel) => {
  if (!channel) {
    throw new Error('Channel not found');
  }

  if (!channel.access_token_encrypted) {
    return {
      alreadyRevoked: true,
    };
  }

  await revokeTiktokAccessToken(decryptToken(channel.access_token_encrypted));

  await channel.update({
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_expires_at: null,
    refresh_token_expires_at: null,
  });

  return {
    alreadyRevoked: false,
  };
};

const serializeChannel = (channel) => {
  const safeChannel = channel.get({ plain: true });
  safeChannel.is_connected = Boolean(safeChannel.access_token_encrypted || safeChannel.refresh_token_encrypted);
  delete safeChannel.access_token_encrypted;
  delete safeChannel.refresh_token_encrypted;
  return safeChannel;
};

const parseResponseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const stringifyForLog = (value) => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const buildTikTokErrorMessage = (payload, fallbackMessage) => {
  const candidates = [
    payload?.error_description,
    payload?.error && payload?.error?.code !== 'ok' ? payload.error.message : null,
    payload?.error && payload?.error?.code !== 'ok' ? payload.error.description : null,
    payload?.message,
    typeof payload?.error === 'string' ? payload.error : null,
    payload ? stringifyForLog(payload) : null,
    fallbackMessage,
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || fallbackMessage;
};

const buildFrontendRedirectUrl = (status, message) => {
  const url = new URL(DEFAULT_OAUTH_RETURN_PATH, DEFAULT_FRONTEND_URL);
  url.searchParams.set('oauth', 'tiktok');
  url.searchParams.set('oauth_status', status);
  if (message) {
    url.searchParams.set('oauth_message', message);
  }
  return url.toString();
};

const exchangeTiktokCodeForToken = async (code) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;

  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error('TikTok OAuth token exchange is not configured. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REDIRECT_URI.');
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const payload = await parseResponseJson(response);
  const payloadErrorCode = payload?.error?.code || payload?.error?.error_code || payload?.error?.status;

  if (!response.ok || (payload?.error && payloadErrorCode !== 'ok')) {
    const errorMessage = buildTikTokErrorMessage(
      payload,
      `TikTok token exchange failed with status ${response.status} ${response.statusText}`.trim(),
    );
    console.error('[TikTok OAuth] Token exchange error response', {
      status: response.status,
      statusText: response.statusText,
      payload,
    });
    throw new Error(errorMessage);
  }

  return payload;
};

const refreshTiktokAccessToken = async (refreshToken) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    throw new Error('TikTok token refresh is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.');
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const payload = await parseResponseJson(response);
  const payloadErrorCode = payload?.error?.code || payload?.error?.error_code || payload?.error?.status;

  if (!response.ok || (payload?.error && payloadErrorCode !== 'ok')) {
    const errorMessage = buildTikTokErrorMessage(
      payload,
      `TikTok token refresh failed with status ${response.status} ${response.statusText}`.trim(),
    );
    throw new Error(`TikTok authorization must be connected again: ${errorMessage}`);
  }

  const tokenData = payload?.data || payload;
  if (!tokenData?.access_token) {
    throw new Error('TikTok authorization must be connected again: refresh response did not contain an access token.');
  }

  return tokenData;
};

const getUsableTiktokAccessToken = async (channel) => {
  const tokenExpiresAt = channel.token_expires_at ? new Date(channel.token_expires_at).getTime() : NaN;
  const accessTokenIsUsable = channel.access_token_encrypted
    && Number.isFinite(tokenExpiresAt)
    && tokenExpiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS;

  if (accessTokenIsUsable) {
    return decryptToken(channel.access_token_encrypted);
  }

  if (!channel.refresh_token_encrypted) {
    throw new Error('TikTok authorization must be connected again because no refresh token is available.');
  }

  const refreshExpiresAt = channel.refresh_token_expires_at
    ? new Date(channel.refresh_token_expires_at).getTime()
    : NaN;
  if (Number.isFinite(refreshExpiresAt) && refreshExpiresAt <= Date.now()) {
    throw new Error('TikTok authorization must be connected again because the refresh token has expired.');
  }

  const tokenData = await refreshTiktokAccessToken(decryptToken(channel.refresh_token_encrypted));
  await channel.update({
    access_token_encrypted: encryptToken(tokenData.access_token),
    refresh_token_encrypted: encryptToken(tokenData.refresh_token) || channel.refresh_token_encrypted,
    token_expires_at: expiresAtFromSeconds(tokenData.expires_in),
    refresh_token_expires_at: expiresAtFromSeconds(tokenData.refresh_expires_in) || channel.refresh_token_expires_at,
  });

  console.info('[TikTok OAuth] Access token refreshed', { channelId: channel.id });
  return tokenData.access_token;
};

const fetchTiktokUserInfo = async (accessToken) => {
  const response = await fetch(TIKTOK_USER_INFO_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await parseResponseJson(response);
  const payloadErrorCode = payload?.error?.code || payload?.error?.error_code || payload?.error?.status;

  if (!response.ok || (payload?.error && payloadErrorCode !== 'ok')) {
    const errorMessage = buildTikTokErrorMessage(
      payload,
      `TikTok profile fetch failed with status ${response.status} ${response.statusText}`.trim(),
    );
    console.error('[TikTok OAuth] User info error response', {
      status: response.status,
      statusText: response.statusText,
      payload,
    });
    throw new Error(errorMessage);
  }

  return payload;
};

const fetchTiktokVideoList = async (accessToken, cursor) => {
  const maxCount = Number.isFinite(TIKTOK_VIDEO_SYNC_LIMIT) && TIKTOK_VIDEO_SYNC_LIMIT > 0
    ? TIKTOK_VIDEO_SYNC_LIMIT
    : 20;
  const url = new URL(TIKTOK_VIDEO_LIST_URL);
  url.searchParams.set('fields', TIKTOK_VIDEO_LIST_FIELDS);

  const body = new URLSearchParams({
    max_count: String(maxCount),
  });

  if (cursor !== null && cursor !== undefined && String(cursor).trim()) {
    body.set('cursor', String(cursor));
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const payload = await parseResponseJson(response);
  const payloadErrorCode = payload?.error?.code || payload?.error?.error_code || payload?.error?.status;

  if (!response.ok || (payload?.error && payloadErrorCode !== 'ok')) {
    const errorMessage = buildTikTokErrorMessage(
      payload,
      `TikTok video list fetch failed with status ${response.status} ${response.statusText}`.trim(),
    );
    console.error('[TikTok OAuth] Video list error response', {
      status: response.status,
      statusText: response.statusText,
      request: {
        fields: TIKTOK_VIDEO_LIST_FIELDS,
        max_count: maxCount,
        cursor: cursor || null,
      },
      payload,
    });
    throw new Error(errorMessage);
  }

  return payload;
};

const normalizeTiktokVideoItems = (payload) => {
  const data = payload?.data || payload;
  const items = data?.videos || data?.items || data?.list || payload?.videos || payload?.items || payload?.list || [];

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const platformVideoId = String(
        item?.id
        || item?.video_id
        || item?.platform_video_id
        || '',
      ).trim();

      if (!platformVideoId) {
        return null;
      }

      const title = String(item?.title || item?.video_description || `TikTok video ${platformVideoId}`).trim();
      const videoUrl = item?.share_url || item?.video_url || item?.embed_link || null;
      const thumbnailUrl = item?.cover_image_url || item?.thumbnail_url || item?.cover_url || null;
      const publishedAtRaw = item?.create_time || item?.published_at || item?.created_at || null;
      const publishedAt = publishedAtRaw
        ? new Date(Number.isFinite(Number(publishedAtRaw)) ? Number(publishedAtRaw) * 1000 : publishedAtRaw)
        : null;

      return {
        platform: 'tiktok',
        platform_video_id: platformVideoId,
        title,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        published_at: Number.isNaN(publishedAt?.getTime?.()) ? null : publishedAt,
        views: Number(item?.view_count || item?.views || 0),
        likes: Number(item?.like_count || item?.likes || 0),
        comments: Number(item?.comment_count || item?.comments || 0),
        shares: Number(item?.share_count || item?.shares || 0),
        duration: item?.duration != null ? Number(item.duration) : null,
      };
    })
    .filter(Boolean);
};

const extractTiktokCursor = (payload) => {
  const data = payload?.data || payload;
  return data?.cursor ?? data?.next_cursor ?? payload?.cursor ?? payload?.next_cursor ?? null;
};

const extractTiktokHasMore = (payload) => {
  const data = payload?.data || payload;
  const value = data?.has_more ?? payload?.has_more ?? data?.more ?? payload?.more;

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 1 || value === '1') {
    return true;
  }

  if (value === 0 || value === '0') {
    return false;
  }

  return null;
};

const syncTiktokVideosForChannel = async (channel, accessToken) => {
  let cursor = null;
  let pageCount = 0;
  let created = 0;
  let updated = 0;
  let total = 0;

  while (pageCount < (Number.isFinite(TIKTOK_VIDEO_SYNC_MAX_PAGES) && TIKTOK_VIDEO_SYNC_MAX_PAGES > 0
    ? TIKTOK_VIDEO_SYNC_MAX_PAGES
    : 10)) {
    pageCount += 1;
    const payload = await fetchTiktokVideoList(accessToken, cursor);
    const items = normalizeTiktokVideoItems(payload);

    if (!items.length) {
      break;
    }

    for (const item of items) {
      const [video, wasCreated] = await Video.findOrCreate({
        where: { platform_video_id: item.platform_video_id },
        defaults: {
          ...item,
          channel_id: channel.id,
          last_synced_at: new Date(),
        },
      });

      if (!wasCreated) {
        await video.update({
          ...item,
          channel_id: channel.id,
          last_synced_at: new Date(),
        });
      }

      await VideoDailyStats.upsert({
        video_id: video.id,
        date: new Date().toISOString().slice(0, 10),
        views: item.views,
        likes: item.likes,
        comments: item.comments,
        shares: item.shares,
      });

      if (wasCreated) {
        created += 1;
      } else {
        updated += 1;
      }
    }

    total += items.length;

    const nextCursor = extractTiktokCursor(payload);
    const hasMore = extractTiktokHasMore(payload);

    if (nextCursor === null || nextCursor === undefined || String(nextCursor).trim() === '') {
      if (hasMore === true) {
        console.info('[TikTok OAuth] Video list has_more=true but no cursor was returned, stopping pagination');
      }
      break;
    }

    cursor = nextCursor;

    if (hasMore === false) {
      break;
    }
  }

  return {
    created,
    updated,
    total,
    pages: pageCount,
  };
};

const syncTiktokChannel = async (channel) => {
  try {
    const accessToken = await getUsableTiktokAccessToken(channel);
    let profileUpdated = false;

    try {
      const profilePayload = await fetchTiktokUserInfo(accessToken);
      const profile = profilePayload?.data?.user || profilePayload?.data || profilePayload?.user || profilePayload;

      await channel.update({
        display_name: profile?.display_name || channel.display_name,
        username: String(profile?.username || channel.username).replace(/^@/, '').trim(),
        avatar_url: profile?.avatar_url || channel.avatar_url || null,
        avatar_large_url: profile?.avatar_large_url || channel.avatar_large_url || null,
        bio_description: profile?.bio_description || channel.bio_description || null,
        is_verified: profile?.is_verified ?? channel.is_verified ?? null,
        follower_count: profile?.follower_count ?? channel.follower_count ?? null,
        following_count: profile?.following_count ?? channel.following_count ?? null,
        likes_count: profile?.likes_count ?? channel.likes_count ?? null,
        video_count: profile?.video_count ?? channel.video_count ?? null,
      });
      profileUpdated = true;
    } catch (profileError) {
      console.warn('[TikTok Sync] Channel profile refresh failed; continuing video sync', {
        channelId: channel.id,
        message: profileError?.message || String(profileError),
      });
    }

    const summary = await syncTiktokVideosForChannel(channel, accessToken);

    await channel.update({
      last_sync_at: new Date(),
      last_sync_status: 'success',
      last_sync_error: null,
    });

    return { ...summary, profileUpdated };
  } catch (error) {
    await channel.update({
      last_sync_at: new Date(),
      last_sync_status: 'failed',
      last_sync_error: String(error.message || error).slice(0, 2000),
    });
    throw error;
  }
};

const handleTiktokOauthCallback = async (req, res) => {
  let stage = 'callback_received';
  try {
    const { code, error, error_description: errorDescription, state } = req.query || {};

    console.info('[TikTok OAuth] Callback received', {
      hasCode: Boolean(code),
      error: error || null,
      errorDescription: errorDescription || null,
    });

    if (error) {
      return res.redirect(buildFrontendRedirectUrl('error', errorDescription || error));
    }

    if (!isValidOauthState(state)) {
      return res.redirect(buildFrontendRedirectUrl('error', 'TikTok OAuth callback state is invalid or expired'));
    }

    if (!code) {
      return res.redirect(buildFrontendRedirectUrl('error', 'TikTok OAuth callback missing authorization code'));
    }

    stage = 'exchange_token';
    console.info('[TikTok OAuth] Exchanging authorization code for token');
    const tokenPayload = await exchangeTiktokCodeForToken(code);
    const tokenData = tokenPayload?.data || tokenPayload;

    console.info('[TikTok OAuth] Token exchange succeeded', {
      hasAccessToken: Boolean(tokenData?.access_token),
      hasRefreshToken: Boolean(tokenData?.refresh_token),
      expiresIn: tokenData?.expires_in ?? null,
      openId: tokenData?.open_id || null,
    });

    stage = 'fetch_user_info';
    console.info('[TikTok OAuth] Fetching user info');
    const profilePayload = await fetchTiktokUserInfo(tokenData.access_token);
    const profileData = profilePayload?.data?.user || profilePayload?.data || profilePayload?.user || profilePayload;
    const openId = profileData?.open_id || tokenData?.open_id;
    const displayName = String(profileData?.display_name || openId || 'TikTok').trim();
    const username = String(profileData?.username || openId || `tiktok_${crypto.randomBytes(6).toString('hex')}`)
      .replace(/^@/, '')
      .trim();
    const profileUrl = profileData?.username ? `https://www.tiktok.com/@${profileData.username}` : null;
    const tokenExpiresAt = expiresAtFromSeconds(tokenData?.expires_in);
    const refreshTokenExpiresAt = expiresAtFromSeconds(tokenData?.refresh_expires_in);

    const lookup = openId
      ? { tiktok_open_id: String(openId) }
      : { username };

    stage = 'save_channel';
    console.info('[TikTok OAuth] Saving channel', {
      lookup,
      username,
      openId: openId || null,
    });
    const [channel, created] = await TikTokChannel.findOrCreate({
      where: lookup,
      defaults: {
        platform: 'tiktok',
        tiktok_open_id: openId || null,
        username,
        display_name: displayName,
        avatar_url: profileData?.avatar_url || null,
        avatar_large_url: profileData?.avatar_large_url || null,
        bio_description: profileData?.bio_description || null,
        is_verified: profileData?.is_verified ?? null,
        follower_count: profileData?.follower_count ?? null,
        following_count: profileData?.following_count ?? null,
        likes_count: profileData?.likes_count ?? null,
        video_count: profileData?.video_count ?? null,
        profile_url: profileUrl,
        access_token_encrypted: encryptToken(tokenData.access_token),
        refresh_token_encrypted: encryptToken(tokenData.refresh_token),
        token_expires_at: tokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        sync_source: 'oauth',
      },
    });

    await channel.update({
      platform: 'tiktok',
      tiktok_open_id: openId || channel.tiktok_open_id,
      username,
      display_name: displayName,
      avatar_url: profileData?.avatar_url || channel.avatar_url || null,
      avatar_large_url: profileData?.avatar_large_url || channel.avatar_large_url || null,
      bio_description: profileData?.bio_description || channel.bio_description || null,
      is_verified: profileData?.is_verified ?? channel.is_verified ?? null,
      follower_count: profileData?.follower_count ?? channel.follower_count ?? null,
      following_count: profileData?.following_count ?? channel.following_count ?? null,
      likes_count: profileData?.likes_count ?? channel.likes_count ?? null,
      video_count: profileData?.video_count ?? channel.video_count ?? null,
      profile_url: profileUrl || channel.profile_url || null,
      access_token_encrypted: tokenData.access_token ? encryptToken(tokenData.access_token) : channel.access_token_encrypted || null,
      refresh_token_encrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : channel.refresh_token_encrypted || null,
      token_expires_at: tokenExpiresAt || channel.token_expires_at || null,
      refresh_token_expires_at: refreshTokenExpiresAt || channel.refresh_token_expires_at || null,
      sync_source: 'oauth',
    });

    console.info('[TikTok OAuth] Channel saved', {
      channelId: channel.id,
      created,
      username: channel.username,
      syncSource: channel.sync_source,
    });

    let videoSyncSummary = null;
    try {
      stage = 'sync_videos';
      console.info('[TikTok OAuth] Syncing videos for channel', {
        channelId: channel.id,
        openId: openId || null,
      });
      videoSyncSummary = await syncTiktokChannel(channel);
      console.info('[TikTok OAuth] Video sync completed', {
        channelId: channel.id,
        ...videoSyncSummary,
      });
    } catch (syncError) {
      console.error('[TikTok OAuth] Video sync failed', {
        channelId: channel.id,
        stage,
        message: syncError?.message || String(syncError),
      });
      console.error(syncError);
    }

    return res.redirect(
      buildFrontendRedirectUrl(
        'success',
        videoSyncSummary
          ? `TikTok channel connected. Synced ${videoSyncSummary.total} videos`
          : (created ? 'TikTok channel connected' : 'TikTok channel updated'),
      ),
    );
  } catch (error) {
    console.error('[TikTok OAuth] Callback failed', {
      stage,
      message: error?.message || String(error),
      name: error?.name || null,
    });
    console.error(error);
    return res.redirect(buildFrontendRedirectUrl('error', error.message || 'TikTok OAuth failed'));
  }
};

const startTiktokOauth = async (req, res) => {
  try {
    const authorizeUrl = buildTiktokOauthUrl();

    if (!authorizeUrl) {
      return res.status(501).json({
        message: 'TikTok OAuth is not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_REDIRECT_URI in backend/.env',
      });
    }

    return res.json({ authorizeUrl });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getChannels = async (req, res) => {
  try {
    const channels = await TikTokChannel.findAll({
      attributes: {
        exclude: ['video_count'],
        include: [[literal(`(
          SELECT COUNT(*)::int
          FROM videos
          WHERE videos.channel_id = "TikTokChannel"."id"
        )`), 'video_count']],
      },
      include: [{ model: User, as: 'creator', attributes: ['id', 'name', 'email', 'role'], required: false }],
      order: [['id', 'ASC']],
    });
    res.json(channels.map(serializeChannel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getChannelById = async (req, res) => {
  try {
    const channel = await TikTokChannel.findByPk(req.params.id, {
      attributes: {
        exclude: ['video_count'],
        include: [[literal(`(
          SELECT COUNT(*)::int
          FROM videos
          WHERE videos.channel_id = "TikTokChannel"."id"
        )`), 'video_count']],
      },
      include: [{ model: User, as: 'creator', attributes: ['id', 'name', 'email', 'role'], required: false }],
    });
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    res.json(serializeChannel(channel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createChannel = async (req, res) => {
  try {
    const channel = await TikTokChannel.create({
      platform: req.body.platform || 'tiktok',
      ...req.body,
    });
    res.status(201).json(serializeChannel(channel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateChannel = async (req, res) => {
  try {
    const channel = await TikTokChannel.findByPk(req.params.id);
    if (!channel) return res.status(404).json({ message: 'Channel not found' });
    let creatorId = channel.creator_id;
    if (Object.prototype.hasOwnProperty.call(req.body, 'creator_id')) {
      creatorId = req.body.creator_id === null || req.body.creator_id === '' ? null : Number(req.body.creator_id);
      if (creatorId !== null) {
        if (!Number.isInteger(creatorId) || creatorId <= 0) return res.status(400).json({ message: 'A valid KOC id is required.' });
        const creator = await User.findOne({ where: { id: creatorId, role: 'koc' }, attributes: ['id'] });
        if (!creator) return res.status(404).json({ message: 'KOC not found.' });
        const conflict = await TikTokChannel.findOne({ where: { creator_id: creatorId, id: { [Op.ne]: channel.id } }, attributes: ['id'] });
        if (conflict) return res.status(409).json({ message: 'This KOC is already linked to another TikTok Channel.' });
      }
    }
    const payload = { ...req.body, creator_id: creatorId };
    if (Object.prototype.hasOwnProperty.call(req.body, 'content_attribution_rules')) {
      payload.content_attribution_rules = normalizeContentAttributionRules(req.body.content_attribution_rules);
    }
    const [updated] = await TikTokChannel.update(payload, {
      where: { id: req.params.id },
    });
    if (!updated) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    await Promise.all([
      delByPattern('dashboard:*'),
      delByPattern('report:*'),
      delByPattern('videos:*'),
    ]).catch(() => {});

    const updatedChannel = await TikTokChannel.findByPk(req.params.id, {
      include: [{ model: User, as: 'creator', attributes: ['id', 'name', 'email', 'role'], required: false }],
    });
    res.json(serializeChannel(updatedChannel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const syncChannelVideos = async (req, res) => {
  try {
    const channel = await TikTokChannel.findByPk(req.params.id);

    console.info('[TikTok Sync] Sync requested', {
      channelId: req.params.id,
      hasChannel: Boolean(channel),
      hasAccessToken: Boolean(channel?.access_token_encrypted),
    });

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const summary = await syncTiktokChannel(channel);

    await Promise.all([
      delByPattern('dashboard:*'),
      delByPattern('report:*'),
      delByPattern('videos:*'),
    ]).catch(() => {});

    return res.json({
      message: `Synced ${summary.total} videos`,
      summary,
    });
  } catch (error) {
    const requiresReauthorization = error.message?.startsWith('TikTok authorization must be connected again');
    return res.status(requiresReauthorization ? 428 : 500).json({
      ...(requiresReauthorization ? { code: 'TIKTOK_REAUTHORIZATION_REQUIRED' } : {}),
      message: error.message,
    });
  }
};

const revokeChannelAuthorization = async (req, res) => {
  try {
    const channel = await TikTokChannel.findByPk(req.params.id);

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    const result = await revokeTiktokChannelAuthorization(channel);

    return res.json({
      message: result.alreadyRevoked
        ? 'Channel authorization was already revoked'
        : 'Channel authorization revoked successfully',
      alreadyRevoked: result.alreadyRevoked,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteChannel = async (req, res) => {
  try {
    const channelId = req.params.id;
    const channel = await TikTokChannel.findByPk(channelId);

    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    await sequelize.transaction(async (transaction) => {
      const videos = await Video.findAll({
        where: { channel_id: channelId },
        attributes: ['id'],
        transaction,
      });
      const videoIds = videos.map((video) => video.id);

      if (videoIds.length) {
        await VideoAssignment.destroy({
          where: { video_id: { [Op.in]: videoIds } },
          transaction,
        });
        await VideoProduct.destroy({
          where: { video_id: { [Op.in]: videoIds } },
          transaction,
        });
        await VideoDailyStats.destroy({
          where: { video_id: { [Op.in]: videoIds } },
          transaction,
        });
        await Video.destroy({
          where: { id: { [Op.in]: videoIds } },
          transaction,
        });
      }

      await channel.destroy({ transaction });
    });

    await Promise.all([
      delByPattern('dashboard:*'),
      delByPattern('report:*'),
      delByPattern('videos:*'),
    ]).catch(() => {});

    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  handleTiktokWebhook,
  handleTiktokOauthCallback,
  startTiktokOauth,
  getChannels,
  getChannelById,
  createChannel,
  updateChannel,
  syncChannelVideos,
  syncTiktokChannel,
  revokeChannelAuthorization,
  deleteChannel,
};
