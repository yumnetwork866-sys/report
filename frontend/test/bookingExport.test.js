import test from 'node:test';
import assert from 'node:assert/strict';
import { exportBookingModalOrdersToCsv } from '../src/lib/bookingExport.js';

test('exportBookingModalOrdersToCsv generates properly formatted CSV content with UTF-8 BOM', () => {
  const sampleRows = [
    {
      orderId: '587123456789',
      orderTime: 1731600000,
      orderStatus: 'COMPLETED',
      isCancelled: false,
      isFullyRefunded: false,
      isPartiallyRefunded: false,
      productId: '172983719283',
      productName: 'Actiscar Serum 30ml',
      displayProductName: 'Actiscar Serum 30ml',
      skuName: 'Combo 2 chai',
      classification: 'Combo 2 chai',
      quantity: 2,
      refundedQuantity: 0,
      price: 150000,
      gmv: 300000,
      commission: 30000,
      currency: 'VND',
      contentId: '7701234567890',
      videoTitle: 'Review tri nam Actiscar',
    },
  ];

  const booking = {
    id: 101,
    creator_name: 'Lan Anh',
    creator_username: 'lananh.review',
    staff: { name: 'Thanh Hang', email: 'hang@yumnetwork.vn' },
    target_shop: { name: 'Actiscar Official' },
    currency: 'VND',
  };

  const video = {
    platform_video_id: '7701234567890',
    title: 'Review tri nam Actiscar',
  };

  const csv = exportBookingModalOrdersToCsv(sampleRows, { booking, video });
  assert.ok(typeof csv === 'string');
  assert.ok(csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');
  assert.ok(csv.includes('"Mã đơn hàng","Thời gian đặt"'));
  assert.ok(csv.includes('"587123456789"'));
  assert.ok(csv.includes('"Thanh Hang"'));
  assert.ok(csv.includes('"hang@yumnetwork.vn"'));
  assert.ok(csv.includes('"101"'));
  assert.ok(csv.includes('"Lan Anh"'));
  assert.ok(csv.includes('"@lananh.review"'));
  assert.ok(csv.includes('"7701234567890"'));
  assert.ok(csv.includes('"Actiscar Serum 30ml"'));
  assert.ok(csv.includes('"Combo 2 chai"'));
  assert.ok(csv.includes('"Hoàn thành (COMPLETED)"'));
});


test('exportBookingModalOrdersToCsv converts money columns to the display currency', () => {
  const rows = [{
    orderId: 'ord-vnd-1',
    orderTime: 1731600000,
    orderStatus: 'COMPLETED',
    isCancelled: false,
    isFullyRefunded: false,
    isPartiallyRefunded: false,
    productId: 'prod-1',
    productName: 'Kem Actiscar',
    quantity: 2,
    refundedQuantity: 0,
    price: 250000,
    gmv: 500000,
    commission: 50000,
    currency: 'VND',
  }];
  const csv = exportBookingModalOrdersToCsv(rows, {
    booking: { id: 1, currency: 'VND' },
    displayCurrency: 'MYR',
    convertAmount: (amount) => amount * 0.000162,
  });
  assert.ok(csv.includes('"40.5","81","8.1"'));
  assert.ok(csv.includes('"MYR"'));
});
