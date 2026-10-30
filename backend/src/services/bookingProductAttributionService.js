const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

const normalizedIds = (...sources) => {
  const ids = new Set();
  const visit = (value) => {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') {
      String(value).split(',').map((item) => item.trim()).filter(Boolean).forEach((id) => ids.add(id));
      return;
    }
    const directId = String(value.id || value.product_id || '').trim();
    if (directId) ids.add(directId);
    visit(value.products);
    visit(value.breakdowns);
  };
  sources.forEach(visit);
  return ids;
};

const productEvidence = (row = {}) => {
  const raw = row.raw_metrics || {};
  const list = raw.list || raw.video?.list || {};
  const products = Array.isArray(list.products) ? list.products
    : Array.isArray(raw.products) ? raw.products
      : null;
  const productId = String(row.snapshot_product_id || '').trim();
  return {
    available: products !== null || Boolean(productId),
    productIds: normalizedIds(productId, products || []),
  };
};

const sameIds = (left, right) => (
  left.size === right.size && [...left].every((id) => right.has(id))
);

const reconcileBookingVideoProductAttribution = async ({ apply = false } = {}) => {
  const rows = await sequelize.query(`
    SELECT
      video.id,
      video.attributed_product_ids,
      booking.evaluation_snapshot,
      snapshot.product_id AS snapshot_product_id,
      snapshot.raw_metrics,
      snapshot.synced_at AS snapshot_synced_at
    FROM booking_videos video
    JOIN bookings booking ON booking.id = video.booking_id
    LEFT JOIN LATERAL (
      SELECT product_id, raw_metrics, synced_at
      FROM tiktok_video_performance_snapshots
      WHERE shop_id = booking.target_shop_id
        AND video_id = video.platform_video_id
      ORDER BY id DESC
      LIMIT 1
    ) snapshot ON TRUE
    ORDER BY video.id
  `, { type: QueryTypes.SELECT });

  const stats = {
    total: rows.length,
    verified: 0,
    corrected: 0,
    unknown: 0,
    applied: Boolean(apply),
    examples: [],
  };
  const updates = [];

  for (const row of rows) {
    const storedIds = normalizedIds(row.attributed_product_ids);
    const evidence = productEvidence(row);
    if (!evidence.available) {
      stats.unknown += 1;
      updates.push({
        id: String(row.id),
        product_ids: [...storedIds],
        attribution_source: 'UNKNOWN',
        verified_at: null,
      });
      continue;
    }

    const snapshot = row.evaluation_snapshot || {};
    const selectedIds = normalizedIds(snapshot.product_ids, snapshot.products);
    const candidates = storedIds.size ? storedIds : selectedIds;
    const verifiedIds = new Set([...candidates].filter((id) => evidence.productIds.has(id)));
    const corrected = !sameIds(storedIds, verifiedIds);
    if (corrected) {
      stats.corrected += 1;
      if (stats.examples.length < 20) {
        stats.examples.push({
          booking_video_id: String(row.id),
          before: [...storedIds],
          after: [...verifiedIds],
          actual_video_products: [...evidence.productIds],
        });
      }
    } else {
      stats.verified += 1;
    }
    updates.push({
      id: String(row.id),
      product_ids: [...verifiedIds],
      attribution_source: 'TIKTOK_VERIFIED',
      verified_at: row.snapshot_synced_at || new Date().toISOString(),
    });
  }

  if (apply && updates.length) {
    await sequelize.query(`
      UPDATE booking_videos video
      SET
        attributed_product_ids = source.product_ids,
        product_attribution_source = source.attribution_source,
        product_attribution_verified_at = source.verified_at
      FROM jsonb_to_recordset(CAST(:updates AS JSONB)) AS source(
        id BIGINT,
        product_ids JSONB,
        attribution_source TEXT,
        verified_at TIMESTAMPTZ
      )
      WHERE video.id = source.id
    `, {
      replacements: { updates: JSON.stringify(updates) },
    });
  }

  return stats;
};

module.exports = {
  productEvidence,
  reconcileBookingVideoProductAttribution,
};
