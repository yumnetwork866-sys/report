const crypto = require('crypto');
const { ScheduledJob, ScheduledJobRun, ScheduledJobRunEvent } = require('../models');

const AUTH_JOB_KEY = 'tiktok_auth';

let cachedAuthJob = null;

const getOrCreateAuthJob = async () => {
  if (cachedAuthJob) return cachedAuthJob;
  let job = await ScheduledJob.findOne({ where: { job_key: AUTH_JOB_KEY } });
  if (!job) {
    try {
      job = await ScheduledJob.create({
        job_key: AUTH_JOB_KEY,
        name: 'Xác thực & Kết nối (OAuth)',
        description: 'Lịch sử ủy quyền OAuth Shop, Kênh, KOC và làm mới Token.',
        enabled: false,
        timezone: 'Asia/Ho_Chi_Minh',
        run_times: [],
      });
    } catch {
      job = await ScheduledJob.findOne({ where: { job_key: AUTH_JOB_KEY } });
    }
  }
  cachedAuthJob = job;
  return job;
};

const recordAuthLog = async ({
  authType = 'shop',
  status = 'SUCCEEDED',
  triggerType = 'OAUTH',
  startedAt = new Date(),
  completedAt = new Date(),
  error = null,
  app = null,
  shop = null,
  shops = [],
  channel = null,
  creator = null,
  scopes = [],
  openId = null,
  endpoint = null,
  httpStatus = null,
  details = null,
} = {}) => {
  try {
    const job = await getOrCreateAuthJob();
    if (!job) return null;

    const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
    const scheduledKey = `${triggerType}:${Date.now()}:${crypto.randomUUID()}`;

    const shopList = Array.isArray(shops) && shops.length > 0 ? shops : (shop ? [shop] : []);
    const results = [];

    if (shopList.length > 0) {
      for (const s of shopList) {
        results.push({
          status,
          shop_id: s.id,
          shop_name: s.name || s.code || `Shop ${s.id}`,
          shop_code: s.code || null,
          ...(scopes && scopes.length ? { scopes } : {}),
          ...(error ? { error: String(error.message || error) } : {}),
        });
      }
    } else if (channel) {
      results.push({
        status,
        channel_id: channel.id,
        channel_name: channel.display_name || channel.username || `Kênh ${channel.id}`,
        ...(error ? { error: String(error.message || error) } : {}),
      });
    } else if (creator) {
      results.push({
        status,
        creator_id: creator.id,
        creator_name: creator.name || `KOC ${creator.id}`,
        ...(error ? { error: String(error.message || error) } : {}),
      });
    } else {
      results.push({
        status,
        ...(app ? { app_name: app.name, app_id: app.id } : {}),
        ...(error ? { error: String(error.message || error) } : {}),
      });
    }

    const total = Math.max(1, results.length);
    const succeeded = status === 'SUCCEEDED' ? total : 0;
    const failed = status === 'FAILED' ? total : 0;

    const summary = {
      total,
      succeeded,
      failed,
      auth_type: authType,
      ...(app ? { app_id: app.id, app_name: app.name, app_key: app.app_key } : {}),
      ...(openId ? { open_id: openId } : {}),
      results,
    };

    const errorMessage = error ? String(error.message || error) : null;

    const run = await ScheduledJobRun.create({
      scheduled_job_id: job.id,
      trigger_type: triggerType,
      scheduled_key: scheduledKey,
      status,
      started_at: startedAt,
      completed_at: completedAt,
      summary,
      error: errorMessage,
    });

    const targetShop = shopList[0] || null;
    const defaultEndpoint = authType === 'channel'
      ? '/api/channels/oauth/tiktok/callback'
      : '/api/bookings/tiktok-partner/callback';

    await ScheduledJobRunEvent.create({
      run_id: run.id,
      event_type: 'API_REQUEST',
      status,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      shop_id: targetShop?.id || null,
      shop_name: targetShop?.name || null,
      channel_id: channel?.id || null,
      module_type: authType,
      method: 'GET',
      endpoint: endpoint || defaultEndpoint,
      http_status: httpStatus || (status === 'SUCCEEDED' ? 200 : 400),
      message: errorMessage || (status === 'SUCCEEDED' ? 'Ủy quyền kết nối thành công.' : 'Ủy quyền kết nối thất bại.'),
      request_data: {
        auth_type: authType,
        ...(app ? { app_id: app.id, app_name: app.name, app_type: app.app_type, region: app.region } : {}),
        ...(openId ? { open_id: openId } : {}),
        ...(details?.request ? details.request : {}),
      },
      response_data: {
        status,
        ...(scopes && scopes.length ? { granted_scopes: scopes } : {}),
        ...(shopList.length ? { shops: shopList.map((s) => ({ id: s.id, name: s.name, region: s.region, code: s.code })) } : {}),
        ...(channel ? { channel: { id: channel.id, username: channel.username, display_name: channel.display_name } } : {}),
        ...(creator ? { creator: { id: creator.id, name: creator.name } } : {}),
        ...(details?.response ? details.response : {}),
        ...(errorMessage ? { error: errorMessage } : {}),
      },
    }).catch((err) => {
      console.warn('[recordAuthLog] Event creation failed:', err.message);
    });

    return run;
  } catch (err) {
    console.error('[recordAuthLog] Failed to record auth log:', err.message);
    return null;
  }
};

const checkTokenHealth = async () => {
  const { TikTokShop, TikTokShopAuthorization, TikTokChannel } = require('../models');
  const [shops, channels] = await Promise.all([
    TikTokShop.findAll({ order: [['id', 'ASC']] }),
    TikTokChannel.findAll({ order: [['id', 'ASC']] }),
  ]);

  const results = [];
  const now = Date.now();

  for (const shop of shops) {
    const authId = shop.authorization_id || shop.order_authorization_id;
    let auth = null;
    if (authId) {
      auth = await TikTokShopAuthorization.findByPk(authId);
    }
    const isExpired = auth?.access_token_expires_at && new Date(auth.access_token_expires_at).getTime() < now;
    const isRefreshExpired = auth?.refresh_token_expires_at && new Date(auth.refresh_token_expires_at).getTime() < now;
    const status = isRefreshExpired ? 'FAILED' : (isExpired ? 'RETRY_PENDING' : 'SUCCEEDED');
    const error = isRefreshExpired ? 'Refresh token expired' : (isExpired ? 'Access token expired, needs refresh' : null);

    results.push({
      status,
      shop_id: shop.id,
      shop_name: shop.name || shop.code,
      shop_code: shop.code,
      scopes: Array.isArray(auth?.granted_scopes) ? auth.granted_scopes : [],
      ...(error ? { error } : {}),
    });
  }

  for (const channel of channels) {
    const isExpired = channel.token_expires_at && new Date(channel.token_expires_at).getTime() < now;
    const status = isExpired ? 'RETRY_PENDING' : 'SUCCEEDED';
    results.push({
      status,
      channel_id: channel.id,
      channel_name: channel.display_name || channel.username,
      ...(isExpired ? { error: 'Channel token expired' } : {}),
    });
  }

  const total = results.length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  const succeeded = total - failed;

  return {
    total,
    succeeded,
    failed,
    results,
  };
};

module.exports = {
  AUTH_JOB_KEY,
  getOrCreateAuthJob,
  recordAuthLog,
  checkTokenHealth,
};

