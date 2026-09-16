import React, { useEffect, useMemo, useState } from 'react';
import { fetchTikTokSellerOpenCollaborations } from '../../lib/api';
import {
  bookingProductsOf,
  cachedBookingResource,
  finiteNumber,
  productsOfBookingVideo,
} from '../../lib/bookingMetrics';
import BookingVideoProduct from './BookingVideoProduct';

const BookingVideoProducts = ({
  shopId,
  video,
  snapshot,
  label,
  booking,
  onSelectProduct,
  orders = [],
}) => {
  const sourceProducts = useMemo(() => productsOfBookingVideo(video, snapshot), [snapshot, video]);
  const [products, setProducts] = useState(sourceProducts);

  const targetProductMap = useMemo(() => {
    const map = new Map();
    for (const p of bookingProductsOf(booking)) {
      const id = String(p?.id || p?.product_id || '').trim();
      if (id) map.set(id, p);
    }
    return map;
  }, [booking]);

  const quantitiesByProductId = useMemo(() => {
    const map = new Map();
    const normCreator = String(booking?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
    const normVideoId = String(video?.platform_video_id || '').trim();

    for (const order of orders || []) {
      for (const sku of Array.isArray(order?.skus) ? order.skus : []) {
        const prodId = String(sku?.product_id || '').trim();
        if (!prodId) continue;

        const skuCreator = String(sku?.creator_username || order?.creator_username || '').trim().replace(/^@+/, '').toLocaleLowerCase();
        if (normCreator && skuCreator && skuCreator !== normCreator) continue;

        if (normVideoId && String(sku?.content_id || '').trim() !== normVideoId) continue;

        const rawQuantity = sku?.quantity ?? sku?.sku_quantity ?? sku?.item_count ?? sku?.product_count ?? sku?.count;
        const quantity = Math.max(0, finiteNumber(rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '' ? rawQuantity : 1));

        map.set(prodId, (map.get(prodId) || 0) + quantity);
      }
    }
    return map;
  }, [orders, booking?.creator_username, video?.platform_video_id]);

  useEffect(() => {
    const enriched = sourceProducts.map((product) => {
      const target = targetProductMap.get(String(product.id));
      if (!target) return product;
      return {
        ...product,
        name: product.name || target.name || target.title || null,
        thumbnailUrl: product.thumbnailUrl || target.image_url || target.imageUrl || target.thumbnail_url || null,
      };
    });
    setProducts(enriched);
    if (!shopId || !enriched.length) return undefined;
    const missing = enriched.filter((product) => !product.name || !product.thumbnailUrl);
    if (!missing.length) return undefined;
    let active = true;
    Promise.all(missing.map(async (product) => {
      try {
        const payload = await cachedBookingResource(`video-product:${shopId}:${product.id}`, () => (
          fetchTikTokSellerOpenCollaborations(shopId, { pageSize: 20, keyword: product.id })
        ));
        const row = (payload?.open_collaborations || []).find((item) => String(item?.product?.id) === product.id);
        return row?.product ? {
          id: product.id,
          name: row.product.title || product.name,
          thumbnailUrl: row.product.main_image_url || product.thumbnailUrl,
        } : product;
      } catch {
        return product;
      }
    })).then((loaded) => {
      if (active) setProducts(loaded);
    });
    return () => { active = false; };
  }, [shopId, sourceProducts, targetProductMap]);

  const sortedProducts = useMemo(() => {
    if (!targetProductMap.size || !products.length) return products;
    return [...products].sort((a, b) => {
      const aTarget = targetProductMap.has(String(a.id));
      const bTarget = targetProductMap.has(String(b.id));
      if (aTarget && !bTarget) return -1;
      if (!aTarget && bTarget) return 1;
      return 0;
    });
  }, [products, targetProductMap]);

  return (
    <div className="booking-video-expansion__products-card">
      <span className="booking-video-expansion__products-label">{label}</span>
      <span className="booking-video-expansion__products">
        {sortedProducts.length ? sortedProducts.map((product) => {
          const qty = quantitiesByProductId.has(String(product.id))
            ? quantitiesByProductId.get(String(product.id))
            : (product.quantity !== undefined && product.quantity !== null ? Number(product.quantity) : null);
          return (
            <BookingVideoProduct
              product={product}
              isTarget={targetProductMap.has(String(product.id))}
              quantity={qty}
              key={product.id}
              onClick={() => onSelectProduct?.({ product, video: { ...video, snapshot }, booking, snapshot })}
            />
          );
        }) : '—'}
      </span>
    </div>
  );
};

export default BookingVideoProducts;
