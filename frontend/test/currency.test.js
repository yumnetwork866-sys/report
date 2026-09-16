import assert from 'node:assert/strict';
import test from 'node:test';
import { convertCurrencyAmount, formatCurrencyAmount } from '../src/lib/currency.js';

const exchangeRates = {
  base: 'MYR',
  rates: { MYR: 1, USD: 4, VND: 0.00016 },
};

test('converts between USD, MYR and VND through MYR', () => {
  assert.equal(convertCurrencyAmount(100, 'USD', 'MYR', exchangeRates), 400);
  assert.equal(convertCurrencyAmount(400, 'MYR', 'VND', exchangeRates), 2_500_000);
  assert.equal(convertCurrencyAmount(100, 'USD', 'VND', exchangeRates), 2_500_000);
});

test('keeps the original currency when a conversion rate is unavailable', () => {
  assert.equal(formatCurrencyAmount(12, 'SGD', 'VND', exchangeRates, 'en-US'), 'SGD\u00a012.00');
});

test('uses the requested RM and VNĐ display symbols', () => {
  assert.match(formatCurrencyAmount(100, 'USD', 'MYR', exchangeRates, 'en-US'), /RM/);
  assert.match(formatCurrencyAmount(100, 'USD', 'VND', exchangeRates, 'vi-VN'), /VNĐ/);
});

test('falls back to default FALLBACK_EXCHANGE_RATES when exchangeRates is not provided or null', () => {
  const converted = convertCurrencyAmount(100, 'MYR', 'VND');
  assert.ok(converted > 0);
  assert.equal(Math.round(converted), Math.round(100 / 0.000162));

  const formattedVnd = formatCurrencyAmount(100, 'MYR', 'VND', null, 'vi-VN');
  assert.match(formattedVnd, /VNĐ/);

  const formattedMyr = formatCurrencyAmount(100, 'MYR', 'MYR', null, 'en-US');
  assert.match(formattedMyr, /RM/);
});

