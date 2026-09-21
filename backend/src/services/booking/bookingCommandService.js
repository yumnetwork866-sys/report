const bookingRepository = require('../../repositories/bookingRepository');
const { delByPattern } = require('../../lib/redis');
const { serializeBookings } = require('../../presenters/bookingPresenter');
const { upsertShopProducts } = require('../shopProductCatalogService');
const { BookingNotFoundError } = require('./bookingErrors');
const { findTargetCreator } = require('./bookingTargetService');
const { autoLinkCreatedBooking } = require('./bookingVideoService');

const ALLOWED_STATUSES = new Set(['draft', 'booked', 'waiting_video', 'video_posted', 'done', 'cancelled']);

const requestError = (message, status = 400) => Object.assign(new Error(message), { status });

const compactPayload = (payload) => Object.fromEntries(
  Object.entries(payload).filter(([, value]) => value !== undefined),
);

const normalizeBookingProducts = (products, productIds = []) => {
  const byId = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const id = String(product?.id || product?.product_id || '').trim();
    if (!id) continue;
    byId.set(id, {
      id,
      name: String(product?.name || product?.title || product?.product_name || id),
      image_url: String(product?.imageUrl || product?.image_url || product?.main_image_url || product?.thumbnail_url || '') || null,
    });
  }
  for (const value of Array.isArray(productIds) ? productIds : []) {
    const id = String(value || '').trim();
    if (id && !byId.has(id)) byId.set(id, { id, name: id, image_url: null });
  }
  return [...byId.values()];
};

const normalizeBookingVideoUrl = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const canManageUsers = (session) => !session
  || session.role === 'admin'
  || (Array.isArray(session.permissions) && session.permissions.includes('users'));

const clearBookingCaches = () => Promise.all([
  delByPattern('bookings:*'),
  delByPattern('dashboard:*'),
  delByPattern('report:*'),
]).catch(() => {});

const createBooking = async ({ body, session }) => {
  const cost = Number(body.total_cost ?? body.booking_cost);
  if (!Number.isFinite(cost) || cost < 0) {
    throw requestError('Total cost must be zero or greater.');
  }
  const requestedStaffId = canManageUsers(session)
    ? (body.staff_id === undefined || body.staff_id === null || body.staff_id === ''
      ? null
      : Number(body.staff_id))
    : session?.sub ?? null;
  if (requestedStaffId !== null && !Number.isInteger(requestedStaffId)) {
    throw requestError('Select a valid managing user.');
  }
  const staff = requestedStaffId === null
    ? null
    : await bookingRepository.findStaffById(requestedStaffId);
  if (requestedStaffId !== null && !staff) throw requestError('Managing user not found.');

  const targetCreator = await findTargetCreator({
    shopId: body.target_shop_id,
    collaborationId: body.target_collaboration_id,
    creatorOpenId: body.creator_open_id,
    creatorUsername: body.creator_username,
    performanceWindow: body.performance_window_type,
  });
  if (!targetCreator) {
    throw requestError('Select a KOC from synced Target Collaboration or Creator Performance data.');
  }

  const {
    shopId, collaboration, raw, profile, performance,
  } = targetCreator;
  const selectedProducts = normalizeBookingProducts(body.products, body.product_ids);
  const evaluationSnapshot = {
    recorded_at: new Date().toISOString(),
    products: selectedProducts,
    product_ids: selectedProducts.map((product) => product.id),
    collaboration: collaboration ? {
      id: collaboration.collaboration_id,
      name: collaboration.name,
      status: collaboration.status,
      start_at: collaboration.start_at,
      end_at: collaboration.end_at,
      products: Array.isArray(raw.products) ? raw.products : [],
      synced_at: collaboration.synced_at,
    } : null,
    performance,
  };
  const targetStartDate = body.start_date || null;
  const targetEndDate = body.end_date || body.deadline || null;
  const payload = compactPayload({
    staff_id: staff?.id || null,
    staff_name: staff?.name || null,
    creator_id: null,
    creator_open_id: profile.creator_open_id,
    creator_username: profile.username,
    creator_name: profile.nickname,
    creator_avatar_url: profile.avatar_url,
    target_shop_id: shopId,
    target_collaboration_id: collaboration?.collaboration_id || null,
    evaluation_snapshot: evaluationSnapshot,
    booking_cost: cost,
    total_cost: cost,
    cost_note: String(body.cost_note || '').trim() || null,
    currency: String(body.currency || performance?.currency || 'MYR').trim().toUpperCase(),
    status: 'draft',
    start_date: targetStartDate,
    end_date: targetEndDate,
    deadline: targetEndDate,
    note: body.note || null,
    updated_at: new Date(),
  });
  const booking = await bookingRepository.create(payload);
  await clearBookingCaches();
  await upsertShopProducts(shopId, selectedProducts).catch((error) => {
    console.warn(`Unable to cache product thumbnails for booking ${booking.id}: ${error.message}`);
  });
  await autoLinkCreatedBooking(booking).catch((error) => {
    console.warn(`Unable to auto-link videos for booking ${booking.id}: ${error.message}`);
  });
  const created = await bookingRepository.findByIdWithRelations(booking.id);
  const [serialized] = await serializeBookings([created]);
  return serialized;
};

const updateBooking = async (bookingId, { body, session }) => {
  const normalizedBody = { ...body };
  if (body.total_cost !== undefined || body.booking_cost !== undefined) {
    const cost = Number(body.total_cost ?? body.booking_cost);
    if (!Number.isFinite(cost) || cost < 0) {
      throw requestError('Total cost must be zero or greater.');
    }
    normalizedBody.total_cost = cost;
    normalizedBody.booking_cost = cost;
  }
  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    throw requestError('Invalid booking status');
  }

  let updatedEvaluationSnapshot;
  let updatedProducts = null;
  if (body.products !== undefined || body.product_ids !== undefined) {
    const currentBooking = await bookingRepository.findById(bookingId);
    if (!currentBooking) throw new BookingNotFoundError();
    const current = currentBooking.toJSON ? currentBooking.toJSON() : currentBooking;
    updatedProducts = normalizeBookingProducts(body.products, body.product_ids);
    updatedEvaluationSnapshot = {
      ...(current.evaluation_snapshot || {}),
      products: updatedProducts,
      product_ids: updatedProducts.map((product) => product.id),
    };
  }

  let staffUpdate = {};
  if (body.staff_id !== undefined) {
    if (!canManageUsers(session)) {
      throw requestError('You do not have permission to reassign booking staff.', 403);
    }
    const rawStaffId = body.staff_id;
    if (rawStaffId === null || rawStaffId === '' || rawStaffId === 'unassigned') {
      staffUpdate = { staff_id: null, staff_name: null };
    } else {
      const parsedStaffId = Number(rawStaffId);
      if (!Number.isInteger(parsedStaffId)) throw requestError('Select a valid managing user.');
      const staff = await bookingRepository.findStaffById(parsedStaffId);
      if (!staff) throw requestError('Managing user not found.');
      staffUpdate = { staff_id: staff.id, staff_name: staff.name };
    }
  }

  const targetEndDate = body.end_date !== undefined
    ? body.end_date
    : body.deadline !== undefined ? body.deadline : undefined;
  const targetStartDate = body.start_date;
  const payload = compactPayload({
    ...staffUpdate,
    creator_id: body.creator_id,
    booking_cost: normalizedBody.booking_cost,
    total_cost: normalizedBody.total_cost,
    cost_note: body.cost_note === undefined ? undefined : String(body.cost_note || '').trim() || null,
    currency: body.currency === undefined ? undefined : String(body.currency || 'MYR').trim().toUpperCase(),
    status: body.status,
    start_date: targetStartDate,
    end_date: targetEndDate,
    deadline: targetEndDate !== undefined ? targetEndDate : body.deadline,
    note: body.note,
    video_platform_id: body.video_platform_id,
    video_url: normalizeBookingVideoUrl(body.video_url),
    posted_at: body.posted_at,
    evaluation_snapshot: updatedEvaluationSnapshot,
    updated_at: new Date(),
  });
  const [updated] = await bookingRepository.updateById(bookingId, payload);
  if (!updated) throw new BookingNotFoundError();
  await clearBookingCaches();
  const booking = await bookingRepository.findByIdWithRelations(bookingId);
  if (updatedProducts) {
    await upsertShopProducts(booking.target_shop_id, updatedProducts).catch((error) => {
      console.warn(`Unable to cache product thumbnails for booking ${booking.id}: ${error.message}`);
    });
  }
  const [serialized] = await serializeBookings([booking]);
  return serialized;
};

const deleteBooking = async (bookingId) => {
  const deleted = await bookingRepository.deleteById(bookingId);
  if (!deleted) throw new BookingNotFoundError();
  await clearBookingCaches();
  return { message: 'Booking deleted successfully' };
};

module.exports = {
  clearBookingCaches,
  createBooking,
  deleteBooking,
  updateBooking,
};
