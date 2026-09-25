import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAffiliateOrderCommission,
  getAffiliateOrderCreators,
  getAffiliateOrderItems,
  getAffiliateOrderProductIds,
  getAffiliateOrderProgramIds,
  getAffiliateOrderSettlementStatus,
  getAffiliateOrderSources,
  getAffiliateOrderValue,
  getAffiliateOrderVideos,
  getCreatorVideoEngagementRate,
  getOrderFinanceSummary,
  getOrderFinanceBreakdown,
  getOrderProductDetails,
  getOrderDeliveryHistory,
  getOrderPaymentValue,
  getOrderShipping,
  getOrderSla,
  normalizeEngagementPercentage,
} from '../src/lib/sellerAffiliate.js';

test('affiliate order details derive products, GMV, KOC, settlement and commission from SKUs', () => {
  const order = {
    products: [{ id: 'product-1', title: 'Unisex T-shirt', main_image_url: 'shirt.jpg' }],
    skus: [{
      sku_id: 'sku-1', product_id: 'product-1', sku_name: 'Size L', quantity: 2,
      refunded_quantity: 0, price: { amount: '125000', currency: 'VND' },
      creator_username: '@linh.review', creator_nickname: 'Linh Review',
      creator_avatar_url: 'linh.jpg', creator_commission_rate: 1200,
      settlement_status: 'SETTLED',
    }],
  };

  assert.deepEqual(getAffiliateOrderItems(order).map((item) => {
    const normalized = { ...item };
    delete normalized.raw;
    return normalized;
  }), [{
    id: 'sku-1', productId: 'product-1', productName: 'Unisex T-shirt', skuName: 'Size L',
    quantity: 2, refundedQuantity: 0, imageUrl: 'shirt.jpg',
    price: { amount: 125000, currency: 'VND' },
  }]);
  assert.deepEqual(getAffiliateOrderValue(order), [{ amount: 250000, currency: 'VND' }]);
  assert.deepEqual(getAffiliateOrderCreators(order), [{
    username: 'linh.review', name: 'Linh Review', avatarUrl: 'linh.jpg',
  }]);
  assert.deepEqual(getAffiliateOrderCommission(order), {
    amounts: [{ amount: 30000, currency: 'VND' }], rates: [12],
  });
  assert.equal(getAffiliateOrderSettlementStatus(order), 'SETTLED');
});

test('affiliate order settlement gives refunds priority and supports explicit commission amounts', () => {
  const order = { skus: [{
    quantity: 1, refunded_quantity: 1, fully_return: true,
    price: { amount: 20, currency: 'MYR' },
    commission_amount: { amount: 2.5, currency: 'MYR' },
    settlement_status: 'SETTLED',
  }] };
  assert.equal(getAffiliateOrderSettlementStatus(order), 'REFUNDED');
  assert.deepEqual(getAffiliateOrderCommission(order), {
    amounts: [{ amount: 2.5, currency: 'MYR' }], rates: [],
  });
});

test('affiliate order fields are collected from every SKU and deduplicated', () => {
  const order = {
    skus: [
      { product_id: 'product-1', open_collaboration_id: 'open-1', target_collaboration_id: '' },
      { product_id: 'product-2', open_collaboration_id: '', target_collaboration_id: 'target-1' },
      { product_id: 'product-1', open_collaboration_id: 'open-1' },
    ],
  };

  assert.deepEqual(getAffiliateOrderProductIds(order), ['product-1', 'product-2']);
  assert.deepEqual(getAffiliateOrderProgramIds(order), ['open-1', 'target-1']);
});

test('affiliate order videos are collected from VIDEO SKUs and deduplicated', () => {
  const order = {
    skus: [
      { content_type: 'VIDEO', content_id: 'video-1', creator_username: 'creator.one', video_title: 'Serum buổi tối' },
      { content_type: 'LIVE', content_id: 'live-1', creator_username: 'creator.one' },
      { content_type: 'video', content_id: 'video-1', creator_username: 'creator.one' },
      { video_id: 'video-2', video_url: 'https://www.tiktok.com/video-2' },
    ],
  };

  assert.deepEqual(getAffiliateOrderVideos(order), [
    { id: 'video-1', username: 'creator.one', url: null, thumbnail: null, title: 'Serum buổi tối' },
    { id: 'video-2', username: null, url: 'https://www.tiktok.com/video-2', thumbnail: null, title: null },
  ]);
  assert.deepEqual(getAffiliateOrderVideos(), []);
});

test('affiliate order sources include non-video attribution and deduplicate by type and id', () => {
  const order = { skus: [
    { content_type: 'LIVE', content_id: 'content-1', creator_username: 'creator.one' },
    { content_type: 'VIDEO', content_id: 'content-1', creator_username: 'creator.one' },
    { content_type: 'SHOP' },
    { content_type: 'SHOP' },
  ] };

  assert.deepEqual(getAffiliateOrderSources(order).map(({ type, id }) => ({ type, id })), [
    { type: 'LIVE', id: 'content-1' },
    { type: 'VIDEO', id: 'content-1' },
    { type: 'SHOP', id: '' },
  ]);
});

test('affiliate order fields retain support for legacy top-level values', () => {
  const order = {
    product_id: 'legacy-product',
    program_id: 'legacy-program',
  };

  assert.deepEqual(getAffiliateOrderProductIds(order), ['legacy-product']);
  assert.deepEqual(getAffiliateOrderProgramIds(order), ['legacy-program']);
  assert.deepEqual(getAffiliateOrderProductIds(), []);
  assert.deepEqual(getAffiliateOrderProgramIds(), []);
});

test('shop order payment, finance and shipping fields use Order and Finance API values', () => {
  const order = {
    order_status: 'COMPLETED',
    payment: { total_amount: '169.99', currency: 'MYR' },
    packages: [{ id: 'package-1' }],
    skus: [{
      package_id: 'package-1', display_status: 'DELIVERED',
      shipping_provider_name: 'J&T Express', tracking_number: 'TRACK-123',
    }],
    finance: {
      currency: 'MYR',
      revenue_amount: '200',
      fee_and_tax_amount: '-16',
      shipping_cost_amount: '-8',
      settlement_amount: '146',
      sku_transactions: [{
        revenue_breakdown: {
          subtotal_before_discount_amount: '200',
          seller_discount_amount: '-10',
          refund_subtotal_before_discount_amount: '-20',
        },
        fee_tax_breakdown: { platform_commission_amount: '-12', sales_tax_amount: '-4' },
      }],
    },
  };

  assert.deepEqual(getOrderPaymentValue(order), { amount: 169.99, currency: 'MYR' });
  assert.deepEqual(getOrderFinanceSummary(order), {
    currency: 'MYR',
    revenue: { amount: 200, currency: 'MYR' },
    refund: { amount: 20, currency: 'MYR' },
    fees: { amount: -16, currency: 'MYR' },
    settlement: { amount: 146, currency: 'MYR' },
    shippingCost: { amount: -8, currency: 'MYR' },
  });
  assert.deepEqual(getOrderFinanceBreakdown(order), {
    currency: 'MYR',
    productRevenue: { amount: 200, currency: 'MYR' },
    sellerDiscount: { amount: -10, currency: 'MYR' },
    fees: { amount: -12, currency: 'MYR' },
    taxes: { amount: -4, currency: 'MYR' },
    shippingCost: { amount: -8, currency: 'MYR' },
    refund: { amount: -20, currency: 'MYR' },
    settlement: { amount: 146, currency: 'MYR' },
  });
  assert.deepEqual(getOrderShipping(order), {
    packageId: 'package-1',
    status: 'DELIVERED',
    provider: 'J&T Express',
    trackingNumber: 'TRACK-123',
  });
});

test('order drawer helpers expose product discounts and truthful delivery milestones', () => {
  const order = {
    currency: 'MYR',
    status: 'IN_TRANSIT',
    create_time: 100,
    paid_time: 120,
    update_time: 180,
    skus: [{
      sku_id: 'sku-1', product_id: 'product-1', product_name: 'Serum', sku_name: '15ml',
      quantity: 2, currency: 'MYR', sale_price: '80', original_price: '100',
      seller_discount: '15', platform_discount: '5', seller_sku: 'SERUM-15',
    }],
  };

  assert.deepEqual(getOrderProductDetails(order)[0], {
    id: 'sku-1',
    productId: 'product-1',
    productName: 'Serum',
    skuName: '15ml',
    quantity: 2,
    refundedQuantity: 0,
    imageUrl: null,
    price: { amount: 100, currency: 'MYR' },
    raw: order.skus[0],
    sellerSku: 'SERUM-15',
    productStatus: null,
    productUrl: null,
    originalPrice: { amount: 100, currency: 'MYR' },
    salePrice: { amount: 80, currency: 'MYR' },
    sellerDiscount: { amount: 15, currency: 'MYR' },
    platformDiscount: { amount: 5, currency: 'MYR' },
    totalDiscount: { amount: 20, currency: 'MYR' },
  });
  assert.deepEqual(getOrderDeliveryHistory(order), [
    { status: 'CREATED', time: 100 },
    { status: 'PAID', time: 120 },
    { status: 'IN_TRANSIT', time: 180 },
  ]);
});

test('shop order SLA selects the earliest deadline and reports its urgency', () => {
  assert.deepEqual(getOrderSla({
    order_status: 'AWAITING_SHIPMENT',
    shipping_due_time: 2000,
    collection_due_time: 1000,
  }, 2100), { state: 'OVERDUE', deadline: 2000 });
  assert.deepEqual(getOrderSla({
    order_status: 'IN_TRANSIT',
    shipping_due_time: 5000,
  }, 4900), { state: 'DUE_SOON', deadline: 5000 });
  assert.deepEqual(getOrderSla({ order_status: 'DELIVERED', shipping_due_time: 1 }, 2), {
    state: 'DONE', deadline: null,
  });
});

test('engagement percentage normalization handles TikTok basis-point rates and explicit units', () => {
  assert.equal(normalizeEngagementPercentage(581), 5.81);
  assert.equal(normalizeEngagementPercentage(0.4), 0.004);
  assert.equal(normalizeEngagementPercentage('0.4%'), 0.4);
  assert.equal(normalizeEngagementPercentage({ percentage: 4.8 }), 4.8);
  assert.equal(normalizeEngagementPercentage({ ratio: 0.048 }), 4.8);
  assert.equal(normalizeEngagementPercentage({ value: 480, unit: 'BPS' }), 4.8);
  assert.equal(normalizeEngagementPercentage({ value: 4.8, unit: 'PERCENT' }), 4.8);
  assert.equal(normalizeEngagementPercentage({ value: 480 }), 4.8);
  assert.equal(normalizeEngagementPercentage(null), null);
});

test('all-video engagement prefers TikTok provided rate without mixing in EC counts', () => {
  const creator = {
    avg_ec_video_play_count: 10000,
    avg_ec_video_like_count: 60,
    avg_ec_video_comment_count: 8,
    avg_ec_video_share_count: 4,
    ec_video_engagement_rate: 72,
    engagement_rate: 110,
  };

  assert.equal((60 + 8 + 4) / 10000 * 100, 0.72);
  assert.equal(getCreatorVideoEngagementRate(creator), 1.1);
});

test('shoppable-video engagement derives a rate when TikTok does not provide one', () => {
  const creator = {
    avg_ec_video_play_count: 18000,
    avg_ec_video_like_count: 920,
    avg_ec_video_comment_count: 74,
    avg_ec_video_share_count: 51,
  };

  assert.equal(getCreatorVideoEngagementRate(creator), null);
  assert.equal(
    getCreatorVideoEngagementRate(creator, { scope: 'shoppable' }),
    (920 + 74 + 51) / 18000 * 100,
  );
});

test('creator video engagement supports nested interaction counts and direct percentage fallback', () => {
  assert.equal(getCreatorVideoEngagementRate({
    content_performance: {
      avg_video_views: 2500,
      avg_video_interaction_count: 125,
    },
  }), 5);
  assert.equal(getCreatorVideoEngagementRate({ video_engagement_rate: 581 }), 5.81);
  assert.equal(getCreatorVideoEngagementRate({ ec_video_engagement_rate: 72 }), null);
  assert.equal(getCreatorVideoEngagementRate(
    { ec_video_engagement_rate: 72 },
    { scope: 'shoppable' },
  ), 0.72);
  assert.equal(getCreatorVideoEngagementRate({}), null);
});

test('Product Basic metadata overrides stale raw order labels and supplies SKU details', () => {
  const order = {
    products: [{
      id: 'product-1',
      title: 'Current catalog name',
      main_image_url: 'current.jpg',
      status: 'ACTIVATE',
      product_url: 'https://shop.tiktok.com/view/product/product-1',
      skus: [{
        id: 'sku-1',
        seller_sku: 'CURRENT-SKU',
        sales_attributes: [{ value_name: 'Red' }, { value_name: 'L' }],
      }],
    }],
    skus: [{
      sku_id: 'sku-1',
      product_id: 'product-1',
      product_name: 'Old order name',
      sku_name: 'Old variant',
      product_image: 'old.jpg',
      quantity: 1,
    }],
  };

  const item = getOrderProductDetails(order)[0];
  assert.equal(item.productName, 'Current catalog name');
  assert.equal(item.imageUrl, 'current.jpg');
  assert.equal(item.skuName, 'Red / L');
  assert.equal(item.sellerSku, 'CURRENT-SKU');
  assert.equal(item.productStatus, 'ACTIVATE');
  assert.equal(item.productUrl, 'https://shop.tiktok.com/view/product/product-1');
});
