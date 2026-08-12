import { clearStoredSessionIfTokenMatches, getStoredSession, getStoredFacebookChatbotToken } from './session.js';

const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function apiRequest(path, options = {}) {
  const body = options.body && typeof options.body !== 'string'
    ? JSON.stringify(options.body)
    : options.body;

  const sessionToken = getStoredSession()?.token || null;
  const {
    signal,
    facebookToken: facebookChatbotToken = null,
    ...restOptions
  } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(facebookChatbotToken ? { 'X-FB-Chatbot-Token': facebookChatbotToken } : {}),
      ...(restOptions.headers || {}),
    },
    ...restOptions,
    body,
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let payload = null;

    try {
      payload = await response.json();
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // Ignore JSON parse failures and keep the generic error.
    }

    if (response.status === 401 && path !== '/auth/login') {
      clearStoredSessionIfTokenMatches(sessionToken);
    }

    const error = new Error(message);
    error.status = response.status;
    error.tiktokCode = payload?.tiktok_code ?? null;
    error.requestId = payload?.request_id ?? null;
    throw error;
  }

  return response.json();
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function fetchUsers(signal) {
  return apiRequest('/users', { signal });
}

export function fetchRoles(signal) {
  return apiRequest('/roles', { signal });
}

export function fetchContentTeams(signal) {
  return apiRequest('/content-teams', { signal });
}

export function fetchBookings(signal, { windowType, startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (windowType) params.set('window_type', windowType);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const query = params.toString();
  return apiRequest(`/bookings${query ? `?${query}` : ''}`, { signal });
}

export function fetchBookingTargetKocs({ keyword, page = 1, pageSize = 20, signal } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (keyword) params.set('keyword', keyword);
  return apiRequest(`/bookings/target-kocs?${params.toString()}`, { signal });
}

export function fetchBookingTargetKocDetail({
  shopId, creatorOpenId, username, collaborationId, windowType, signal,
} = {}) {
  const params = new URLSearchParams({ shop_id: String(shopId) });
  if (creatorOpenId) params.set('creator_open_id', creatorOpenId);
  if (username) params.set('username', username);
  if (collaborationId) params.set('collaboration_id', collaborationId);
  if (windowType) params.set('window_type', windowType);
  return apiRequest(`/bookings/target-kocs/detail?${params.toString()}`, { signal });
}

export function fetchTikTokPartnerCollaborations({ creatorId, signal, pageToken, keyword } = {}) {
  const params = new URLSearchParams();
  params.set('creator_id', creatorId);
  if (pageToken) params.set('page_token', pageToken);
  if (keyword) params.set('keyword', keyword);
  const query = params.toString();
  return apiRequest(`/bookings/tiktok-partner/collaborations${query ? `?${query}` : ''}`, { signal });
}

export function fetchTikTokPartnerStatuses(signal) {
  return apiRequest('/bookings/tiktok-partner/status', { signal });
}

export function startTikTokPartnerOauth(returnPath = '/bookings', { creatorId, createKoc = false } = {}) {
  const params = new URLSearchParams({ return_path: returnPath });
  if (creatorId) params.set('creator_id', creatorId);
  if (createKoc) params.set('create_koc', 'true');
  return apiRequest(`/bookings/tiktok-partner/oauth/start?${params.toString()}`);
}

export function startTikTokShopOauth(returnPath) {
  const params = new URLSearchParams();
  if (returnPath) params.set('return_path', returnPath);
  const query = params.toString();
  return apiRequest(`/tiktok-shop/oauth/start${query ? `?${query}` : ''}`);
}

export function fetchTikTokShopConnections(signal) {
  return apiRequest('/tiktok-shop/connections', { signal });
}

export function fetchTikTokShops(signal) {
  return apiRequest('/tiktok-shop/shops', { signal });
}

export function fetchExchangeRates(signal) {
  return apiRequest('/tiktok-shop/exchange-rates', { signal });
}

export function fetchTikTokShopAnalytics(shopId, { signal, startDate, endDate, currency } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (currency) params.set('currency', currency);
  const query = params.toString();
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/analytics${query ? `?${query}` : ''}`, { signal });
}

export function syncTikTokShopAnalytics(shopId, payload, signal) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/analytics/sync`, { method: 'POST', body: payload, signal });
}

export function fetchTikTokShopVideoAnalytics(shopId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('start_date', filters.startDate);
  if (filters.endDate) params.set('end_date', filters.endDate);
  if (filters.currency) params.set('currency', filters.currency);
  if (filters.accountType) params.set('account_type', filters.accountType);
  if (filters.sortField) params.set('sort_field', filters.sortField);
  if (filters.sortOrder) params.set('sort_order', filters.sortOrder);
  if (filters.pageSize) params.set('page_size', filters.pageSize);
  if (filters.pageToken) params.set('page_token', filters.pageToken);
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/video-analytics?${params.toString()}`, {
    signal: filters.signal,
  });
}

export function syncTikTokShopVideoPerformance(shopId, payload = {}, signal) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/video-performance/sync`, {
    method: 'POST',
    body: payload,
    signal,
  });
}

export function fetchTikTokShopVideoPerformance(shopId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('start_date', filters.startDate);
  if (filters.endDate) params.set('end_date', filters.endDate);
  if (filters.currency) params.set('currency', filters.currency);
  if (filters.exportId) params.set('export_id', filters.exportId);
  if (filters.page) params.set('page', filters.page);
  if (filters.pageSize) params.set('page_size', filters.pageSize);
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/video-performance?${params.toString()}`, {
    signal: filters.signal,
  });
}

export function importTikTokShopVideoExport(shopId, payload = {}) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/video-export/import`, {
    method: 'POST',
    body: payload,
  });
}

export function fetchTikTokShopVideoExport(shopId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.exportId) params.set('export_id', filters.exportId);
  if (filters.page) params.set('page', filters.page);
  if (filters.pageSize) params.set('page_size', filters.pageSize);
  const query = params.toString();
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/video-export${query ? `?${query}` : ''}`, {
    signal: filters.signal,
  });
}

export function fetchTikTokShopVideoThumbnail(shopId, videoId, username, signal) {
  const params = new URLSearchParams({ username });
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/video-thumbnails/${encodeURIComponent(videoId)}?${params.toString()}`, {
    signal,
  });
}

export function fetchSchedules(signal) {
  return apiRequest('/schedules', { signal });
}

export function updateSchedule(jobKey, payload) {
  return apiRequest(`/schedules/${encodeURIComponent(jobKey)}`, { method: 'PUT', body: payload });
}

export function runScheduleNow(jobKey) {
  return apiRequest(`/schedules/${encodeURIComponent(jobKey)}/run`, { method: 'POST' });
}

export function stopScheduleNow(jobKey) {
  return apiRequest(`/schedules/${encodeURIComponent(jobKey)}/stop`, { method: 'POST' });
}

function fetchTikTokSellerAffiliate(shopId, resource, filters = {}) {
  const params = new URLSearchParams();
  if (filters.pageToken) params.set('page_token', filters.pageToken);
  if (filters.pageSize) params.set('page_size', filters.pageSize);
  if (filters.keyword) params.set('keyword', filters.keyword);
  if (filters.searchKey) params.set('search_key', filters.searchKey);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.status) params.set('status', filters.status);
  if (filters.startTime) params.set('create_time_ge', filters.startTime);
  if (filters.endTime) params.set('create_time_lt', filters.endTime);
  if (filters.programId) params.set('program_id', filters.programId);
  if (filters.productId) params.set('product_id', filters.productId);
  if (filters.creatorUsername) params.set('creator_username', filters.creatorUsername);
  if (filters.categoryId) params.set('category_id', filters.categoryId);
  const query = params.toString();
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/affiliate/${resource}${query ? `?${query}` : ''}`, { signal: filters.signal });
}

export const fetchTikTokSellerOpenCollaborations = (shopId, filters) => fetchTikTokSellerAffiliate(shopId, 'open-collaborations', filters);
export const fetchTikTokSellerTargetCollaborations = (shopId, filters) => fetchTikTokSellerAffiliate(shopId, 'target-collaborations', filters);
export const fetchTikTokSellerAffiliateOrders = (shopId, filters) => fetchTikTokSellerAffiliate(shopId, 'orders', filters);
export const fetchTikTokSellerAffiliateOrderStatistics = (shopId, filters) => fetchTikTokSellerAffiliate(shopId, 'order-statistics', filters);
export function fetchOrderProductCategories(shopId, signal) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/order-management/categories`, { signal });
}
export function createOrderProductCategory(shopId, name) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/order-management/categories`, {
    method: 'POST',
    body: { name },
  });
}
export function deleteOrderProductCategory(shopId, categoryId) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/order-management/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' });
}
export function assignOrderProductCategory(shopId, productId, payload) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/order-management/products/${encodeURIComponent(productId)}/category`, {
    method: 'PUT',
    body: payload,
  });
}
export function unassignOrderProductCategory(shopId, productId) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/order-management/products/${encodeURIComponent(productId)}/category`, { method: 'DELETE' });
}
export const fetchTikTokSellerAffiliateCreators = (shopId, filters) => fetchTikTokSellerAffiliate(shopId, 'creators', filters);
export function fetchTikTokSellerSampleApplicationFulfillments(shopId, applicationId, signal) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/affiliate/creators/${encodeURIComponent(applicationId)}/fulfillments`, { signal });
}
export const fetchTikTokSellerMarketplaceCreators = (shopId, filters) => fetchTikTokSellerAffiliate(shopId, 'marketplace-creators', filters);
export function fetchTikTokSellerMarketplaceCreator(shopId, creatorId, signal) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/affiliate/marketplace-creators/${encodeURIComponent(creatorId)}`, { signal });
}
export function inviteTikTokSellerMarketplaceCreator(shopId, creatorId, payload) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/affiliate/marketplace-creators/${encodeURIComponent(creatorId)}/invitations`, {
    method: 'POST',
    body: payload,
  });
}
export function addTikTokSellerCreatorToInvitation(shopId, creatorId, collaborationId) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/affiliate/marketplace-creators/${encodeURIComponent(creatorId)}/invitations/${encodeURIComponent(collaborationId)}/creators`, {
    method: 'POST',
  });
}
export function fetchTikTokSellerCreatorConversation(shopId, creatorId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.pageToken) params.set('page_token', filters.pageToken);
  if (filters.pageSize) params.set('page_size', filters.pageSize);
  const query = params.toString();
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/affiliate/marketplace-creators/${encodeURIComponent(creatorId)}/conversation${query ? `?${query}` : ''}`, {
    signal: filters.signal,
  });
}
export function sendTikTokSellerCreatorMessage(shopId, creatorId, text) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/affiliate/marketplace-creators/${encodeURIComponent(creatorId)}/conversation/messages`, {
    method: 'POST',
    body: { text },
  });
}
export const fetchTikTokSellerCreatorContentDetails = (shopId, filters) => fetchTikTokSellerAffiliate(shopId, 'creator-content-details', filters);
export const fetchTikTokSellerOpenCollaborationSettings = (shopId, signal) => fetchTikTokSellerAffiliate(shopId, 'open-collaboration-settings', { signal });

export function fetchTikTokCreatorPerformance(shopId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.windowType) params.set('window_type', filters.windowType);
  if (filters.endDay) params.set('end_day', filters.endDay.replaceAll('-', ''));
  if (filters.planType) params.set('plan_type', filters.planType);
  if (filters.keyword) params.set('keyword', filters.keyword);
  if (filters.page) params.set('page', filters.page);
  if (filters.pageSize) params.set('page_size', filters.pageSize);
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/creator-performance?${params.toString()}`, { signal: filters.signal });
}

export function syncTikTokCreatorPerformance(shopId, payload) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}/creator-performance/sync`, {
    method: 'POST',
    body: {
      window_type: payload.windowType,
      ...(payload.endDay ? { end_day: payload.endDay.replaceAll('-', '') } : {}),
      plan_type: payload.planType || 'ALL',
    },
  });
}

export function disconnectTikTokShopAuthorization(authorizationId) {
  return apiRequest(`/tiktok-shop/connections/${encodeURIComponent(authorizationId)}`, { method: 'DELETE' });
}

export function disconnectTikTokShop(shopId) {
  return apiRequest(`/tiktok-shop/shops/${encodeURIComponent(shopId)}`, { method: 'DELETE' });
}

export function disconnectTikTokPartner(creatorId) {
  return apiRequest(`/bookings/tiktok-partner/${encodeURIComponent(creatorId)}`, { method: 'DELETE' });
}

export function fetchTikTokPartnerCreatorOverview(creatorId, signal) {
  return apiRequest(`/bookings/tiktok-partner/creators/${encodeURIComponent(creatorId)}/overview`, { signal });
}

const videoQuery = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', filters.page);
  if (filters.pageSize) params.set('page_size', filters.pageSize);
  if (filters.startDate) params.set('start_date', filters.startDate);
  if (filters.endDate) params.set('end_date', filters.endDate);
  if (filters.channelId) params.set('channel_id', filters.channelId);
  const query = params.toString();
  return `/videos${query ? `?${query}` : ''}`;
};

export function fetchVideoPage(filters = {}) {
  return apiRequest(videoQuery(filters), { signal: filters.signal });
}

export async function fetchVideos(signalOrFilters) {
  const filters = signalOrFilters && typeof signalOrFilters === 'object' && 'aborted' in signalOrFilters
    ? { signal: signalOrFilters }
    : (signalOrFilters || {});
  const payload = await fetchVideoPage({ pageSize: 100, ...filters });
  return Array.isArray(payload) ? payload : payload.items || [];
}

export function fetchChannelReport({
  month, startDate, endDate, teamId, userId, channelId, metric, page = 1, pageSize = 20, signal,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (startDate || endDate) {
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
  } else if (month) {
    params.set('month', month);
  }
  if (teamId && teamId !== 'all') params.set('team_id', teamId);
  if (userId && userId !== 'all') params.set('user_id', userId);
  if (channelId && channelId !== 'all') params.set('channel_ids', channelId);
  if (metric) params.set('metric', metric);
  return apiRequest(`/reports/channel?${params.toString()}`, { signal });
}

export function fetchChannelReportMemberDetail(userId, {
  month, startDate, endDate, teamId, channelId, page = 1, pageSize = 20, signal,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (startDate || endDate) {
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
  } else if (month) {
    params.set('month', month);
  }
  if (teamId && teamId !== 'all') params.set('team_id', teamId);
  if (channelId && channelId !== 'all') params.set('channel_ids', channelId);
  return apiRequest(`/reports/channel/members/${encodeURIComponent(userId)}?${params.toString()}`, { signal });
}

export function fetchVideoOptions(signal) {
  return apiRequest('/videos/options', { signal });
}

export function fetchReports(signal) {
  return apiRequest('/reports', { signal });
}

export function fetchPublicReport(token, signal) {
  return apiRequest(`/public/reports/${encodeURIComponent(token)}`, { signal });
}

export function fetchKpis(signal, role, filters = {}) {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (filters.startDate) params.set('start_date', filters.startDate);
  if (filters.endDate) params.set('end_date', filters.endDate);
  const query = params.toString();
  return apiRequest(`/reports/kpis${query ? `?${query}` : ''}`, { signal });
}

export function fetchDashboard({
  signal,
  channelId,
  startDate,
  endDate,
  userId,
  metric,
  page,
  pageSize,
} = {}) {
  const params = new URLSearchParams();
  if (channelId) params.set('channel_id', channelId);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (userId) params.set('user_id', userId);
  if (metric) params.set('metric', metric);
  if (page) params.set('page', page);
  if (pageSize) params.set('page_size', pageSize);
  const query = params.toString();
  return apiRequest(`/reports/dashboard${query ? `?${query}` : ''}`, { signal });
}

export function fetchKocDetail(creatorId, { signal, startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const query = params.toString();
  return apiRequest(`/reports/koc/${encodeURIComponent(creatorId)}/detail${query ? `?${query}` : ''}`, { signal });
}

export function chatWithAssistant(message) {
  return apiRequest('/assistant/chat', {
    method: 'POST',
    body: { message },
  });
}

export async function streamAssistant(message, { onDelta, signal } = {}) {
  const sessionToken = getStoredSession()?.token || null;
  const response = await fetch(`${API_BASE_URL}/assistant/chat/stream`, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'include',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message) errorMessage = payload.message;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(errorMessage);
  }

  if (!response.body) throw new Error('Streaming is not supported by this browser');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeLine = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'delta' && event.delta) onDelta?.(event.delta);
    if (event.type === 'error') throw new Error(event.message || 'Assistant stream failed');
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(consumeLine);
    if (done) break;
  }

  if (buffer.trim()) consumeLine(buffer);
}

export function fetchChannels(signal) {
  return apiRequest('/channels', { signal });
}

export function deleteChannel(channelId) {
  return apiRequest(`/channels/${channelId}`, {
    method: 'DELETE',
  });
}

export function syncChannelVideos(channelId) {
  return apiRequest(`/channels/${channelId}/sync-videos`, {
    method: 'POST',
  });
}

export function revokeChannelAuthorization(channelId) {
  return apiRequest(`/channels/${channelId}/revoke`, {
    method: 'POST',
  });
}

export function fetchProducts(signal) {
  return apiRequest('/products', { signal });
}

export function fetchAssignments(signal) {
  return apiRequest('/assignments', { signal });
}

export function createUser(payload) {
  return apiRequest('/users', {
    method: 'POST',
    body: payload,
  });
}

export function createRole(payload) {
  return apiRequest('/roles', { method: 'POST', body: payload });
}

export function createContentTeam(payload) {
  return apiRequest('/content-teams', {
    method: 'POST',
    body: payload,
  });
}

export function updateContentTeam(teamId, payload) {
  return apiRequest(`/content-teams/${encodeURIComponent(teamId)}`, {
    method: 'PUT',
    body: payload,
  });
}

export function deleteContentTeam(teamId) {
  return apiRequest(`/content-teams/${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
  });
}

export function updateRole(roleKey, payload) {
  return apiRequest(`/roles/${encodeURIComponent(roleKey)}`, { method: 'PUT', body: payload });
}

export function deleteRole(roleKey) {
  return apiRequest(`/roles/${encodeURIComponent(roleKey)}`, { method: 'DELETE' });
}

export function createBooking(payload) {
  return apiRequest('/bookings', {
    method: 'POST',
    body: payload,
  });
}

export function updateBooking(bookingId, payload) {
  return apiRequest(`/bookings/${bookingId}`, {
    method: 'PUT',
    body: payload,
  });
}

export function matchBookingVideo(bookingId, { videoId, videoUrl } = {}) {
  return apiRequest(`/bookings/${encodeURIComponent(bookingId)}/video-match`, {
    method: 'POST',
    body: {
      ...(videoId ? { video_id: videoId } : {}),
      ...(videoUrl ? { video_url: videoUrl } : {}),
    },
  });
}

export function deleteBooking(bookingId) {
  return apiRequest(`/bookings/${bookingId}`, {
    method: 'DELETE',
  });
}

export function updateUser(userId, payload) {
  return apiRequest(`/users/${userId}`, {
    method: 'PUT',
    body: payload,
  });
}

export function deleteUser(userId) {
  return apiRequest(`/users/${userId}`, {
    method: 'DELETE',
  });
}

export function createChannel(payload) {
  return apiRequest('/channels', {
    method: 'POST',
    body: payload,
  });
}

export function updateChannel(channelId, payload) {
  return apiRequest(`/channels/${encodeURIComponent(channelId)}`, {
    method: 'PUT',
    body: payload,
  });
}

export function createVideo(payload) {
  return apiRequest('/videos', {
    method: 'POST',
    body: payload,
  });
}

export function createAssignment(payload) {
  return apiRequest('/assignments', {
    method: 'POST',
    body: payload,
  });
}

export function generateWeeklyReport(payload) {
  return apiRequest('/reports/generate', {
    method: 'POST',
    body: payload,
  });
}

export function shareReport(reportId) {
  return apiRequest(`/reports/${encodeURIComponent(reportId)}/share`, { method: 'POST' });
}

export function deleteReport(reportId) {
  return apiRequest(`/reports/${encodeURIComponent(reportId)}`, { method: 'DELETE' });
}

export function loginAdmin(payload) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: payload,
  });
}

export function getTikTokOauthUrl() {
  return apiRequest('/channels/oauth/tiktok/start').then((response) => response.authorizeUrl);
}

export function getFacebookOauthUrl() {
  return apiRequest('/chatbot/facebook/start').then((response) => response.authorizeUrl);
}

export function fetchChatbotFacebookMe(signal) {
  return apiRequest('/chatbot/facebook/me', { signal, facebookToken: getStoredFacebookChatbotToken() });
}

export function logoutChatbotFacebook() {
  return apiRequest('/chatbot/facebook/logout', { method: 'POST', facebookToken: getStoredFacebookChatbotToken() });
}

export function revokeChatbotFacebookAccount() {
  return apiRequest('/chatbot/facebook/revoke', { method: 'POST', facebookToken: getStoredFacebookChatbotToken() });
}

export function revokeChatbotFacebookAccountByUser(userId) {
  return apiRequest(`/chatbot/facebook/users/${encodeURIComponent(userId)}/revoke`, {
    method: 'POST',
    facebookToken: getStoredFacebookChatbotToken(),
  });
}

export function fetchFacebookManagedPages(signal) {
  return apiRequest('/chatbot/facebook/me/pages', { signal, facebookToken: getStoredFacebookChatbotToken() });
}

export function connectFacebookPage(pageId) {
  return apiRequest(`/chatbot/pages/${pageId}/connect`, { method: 'POST', facebookToken: getStoredFacebookChatbotToken() });
}

export function disconnectFacebookPage(pageId) {
  return apiRequest(`/chatbot/pages/${pageId}`, { method: 'DELETE', facebookToken: getStoredFacebookChatbotToken() });
}

export function fetchChatbotPages(signal) {
  return apiRequest('/chatbot/pages', { signal });
}

export function fetchChatbotStats(signal) {
  return apiRequest('/chatbot/stats', { signal });
}

export function fetchChatbotConversations(signal) {
  return apiRequest('/chatbot/conversations', { signal });
}

export function fetchChatbotMessages(senderId, pageId, signal) {
  const params = new URLSearchParams({ senderId });
  if (pageId) params.set('pageId', pageId);
  return apiRequest(`/chatbot/messages?${params.toString()}`, { signal });
}

export function sendChatbotMessage(payload) {
  return apiRequest('/chatbot/send', { method: 'POST', body: payload });
}

export function fetchChatbotOrders(signal) {
  return apiRequest('/chatbot/orders', { signal });
}

export function updateChatbotOrder(orderId, payload) {
  return apiRequest(`/chatbot/orders/${orderId}`, { method: 'PATCH', body: payload });
}

export function fetchChatbotKnowledgeDocs(signal) {
  return apiRequest('/chatbot/kb', { signal });
}

export function createChatbotKnowledgeDoc(payload) {
  return apiRequest('/chatbot/kb', { method: 'POST', body: payload });
}

export function deleteChatbotKnowledgeDoc(docId) {
  return apiRequest(`/chatbot/kb/${docId}`, { method: 'DELETE' });
}

export function fetchChatbotSettings(signal) {
  return apiRequest('/chatbot/settings', { signal });
}

export function fetchChatbotOllamaModels(signal) {
  return apiRequest('/chatbot/ollama/models', { signal });
}

export function updateChatbotSettings(payload) {
  return apiRequest('/chatbot/settings', {
    method: 'PUT',
    body: payload,
  });
}
