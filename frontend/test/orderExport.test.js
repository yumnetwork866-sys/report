import assert from 'node:assert/strict';
import test from 'node:test';
import { exportOrdersToCsv } from '../src/components/OrderManagement/utils/orderExport.js';

test('exportOrdersToCsv returns false when orders array is empty', () => {
  assert.equal(exportOrdersToCsv([]), false);
  assert.equal(exportOrdersToCsv(null), false);
});

test('exportOrdersToCsv generates properly formatted CSV with UTF-8 BOM and correct headers', () => {
  const orders = [
    {
      order_id: 'ORDER-1001',
      create_time: 1727236800,
      order_status: 'COMPLETED',
      skus: [
        {
          sku_id: 'SKU-01',
          product_name: 'Áo thun nam Cotton',
          sku_name: 'Size XL / Đen',
          quantity: 2,
          price: { amount: '150000', currency: 'VND' },
          creator_username: 'koc_reviewer',
          creator_nickname: 'KOC Review',
          content_type: 'VIDEO',
          video_url: 'https://tiktok.com/@koc_reviewer/video/123456789',
        },
      ],
      payment: {
        total_amount: { amount: '300000', currency: 'VND' },
      },
      shipping_provider: 'J&T Express',
      tracking_number: 'JT84000123',
      packages: [
        {
          shipping_provider: 'J&T Express',
          tracking_number: 'JT84000123',
          delivery_status: 'DELIVERED',
        },
      ],
    },
  ];

  const csv = exportOrdersToCsv(orders, 'test_export.csv', (k) => k, 'vi-VN');
  assert.equal(typeof csv, 'string');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"ORDER-1001"'));
  assert.ok(csv.includes('KOC Review'));
  assert.ok(csv.includes('Áo thun nam Cotton (Size XL / Đen) x2'));
  assert.ok(csv.includes('J&T Express'));
  assert.ok(csv.includes('JT84000123'));
});
