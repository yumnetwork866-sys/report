import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOrderFinanceSummary,
  getOrderPaymentValue,
  getOrderShipping,
  getOrderSla,
  getTrackingUrl,
  getAffiliateOrderCreators,
  getAffiliateOrderSources,
} from '../src/lib/sellerAffiliate.js';

test('compact financial extraction derives settlement, payment, fees and refund correctly', () => {
  const row = {
    order_id: 'ORDER-12345',
    finance_status: 'AVAILABLE',
    payment: {
      total_amount: '250000',
      currency: 'VND',
    },
    finance: {
      currency: 'VND',
      settlement_amount: '220000',
      revenue_amount: '250000',
      fee_and_tax_amount: '30000',
      sku_transactions: [
        {
          revenue_breakdown: {
            refund_amount: -15000,
          },
        },
      ],
    },
  };

  const payment = getOrderPaymentValue(row);
  assert.equal(payment.amount, 250000);
  assert.equal(payment.currency, 'VND');

  const summary = getOrderFinanceSummary(row);
  assert.equal(summary.currency, 'VND');
  assert.equal(summary.settlement.amount, 220000);
  assert.equal(summary.fees.amount, 30000);
  assert.equal(summary.refund.amount, 15000);
});

test('compact status fulfillment extracts shipping, tracking link and SLA warning', () => {
  const row = {
    order_id: 'ORDER-7788',
    order_status: 'AWAITING_SHIPMENT',
    rts_sla_time: 1700000000,
    shipping_provider: 'SPX Express',
    tracking_number: 'SPXVN123456789',
    buyer_cancel_reason: 'Mistake in address',
  };

  const shipping = getOrderShipping(row);
  assert.equal(shipping.provider, 'SPX Express');
  assert.equal(shipping.trackingNumber, 'SPXVN123456789');

  const trackingUrl = getTrackingUrl(shipping.provider, shipping.trackingNumber);
  assert.ok(trackingUrl.includes('spx.vn'));

  const nowSeconds = 1700005000; // Past SLA deadline
  const sla = getOrderSla(row, nowSeconds);
  assert.equal(sla.state, 'OVERDUE');
});

test('compact identity and attribution cell extracts primary creator and video source', () => {
  const row = {
    order_id: 'ORDER-9900',
    create_time: 1727236800,
    skus: [
      {
        creator_username: 'super_koc',
        creator_nickname: 'Super Creator',
        content_type: 'VIDEO',
        video_url: 'https://tiktok.com/@super_koc/video/987654321',
      },
    ],
  };

  const creators = getAffiliateOrderCreators(row);
  assert.equal(creators.length, 1);
  assert.equal(creators[0].username, 'super_koc');
  assert.equal(creators[0].name, 'Super Creator');

  const sources = getAffiliateOrderSources(row);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].type, 'VIDEO');
  assert.equal(sources[0].url, 'https://tiktok.com/@super_koc/video/987654321');
});
