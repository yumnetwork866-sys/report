const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getUsdMyrRate,
  getMyrExchangeRates,
  convertUsdMoneyToMyr,
  convertUsdRangeToMyr,
  addMarketplaceLocalCurrency,
  clearExchangeRateCache,
} = require('../src/services/exchangeRateService');

const bnmResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    data: [{
      currency_code: 'USD',
      unit: 1,
      rate: { date: '2026-07-21', middle_rate: 4.0895 },
    }, {
      currency_code: 'VND',
      unit: 100,
      rate: { date: '2026-07-21', middle_rate: 0.0162 },
    }],
  }),
});

test('normalizes BNM USD and VND rates to MYR per one currency unit', async (t) => {
  clearExchangeRateCache();
  t.after(clearExchangeRateCache);
  const rates = await getMyrExchangeRates(async () => bnmResponse());
  assert.equal(rates.base, 'MYR');
  assert.equal(rates.rates.MYR, 1);
  assert.equal(rates.rates.USD, 4.0895);
  assert.ok(Math.abs(rates.rates.VND - 0.000162) < 1e-12);
  assert.deepEqual(rates.dates, { MYR: null, USD: '2026-07-21', VND: '2026-07-21' });
  assert.equal(rates.source, 'Bank Negara Malaysia');
});

test('falls back to FALLBACK_EXCHANGE_RATES when BNM fetch throws an error', async (t) => {
  clearExchangeRateCache();
  t.after(clearExchangeRateCache);
  const rates = await getMyrExchangeRates(async () => {
    throw new Error('Connection timed out');
  });
  assert.equal(rates.base, 'MYR');
  assert.equal(rates.rates.MYR, 1);
  assert.equal(rates.rates.USD, 4.0895);
  assert.equal(rates.rates.VND, 0.000162);
  assert.match(rates.source, /Fallback/);
});

test('loads and caches the BNM USD/MYR middle rate', async (t) => {
  clearExchangeRateCache();
  t.after(clearExchangeRateCache);
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.match(url, /api\.bnm\.gov\.my\/public\/exchange-rate/);
    assert.equal(options.headers.accept, 'application/vnd.BNM.API.v1+json');
    return bnmResponse();
  };
  const first = await getUsdMyrRate(fetchImpl);
  const second = await getUsdMyrRate(fetchImpl);
  assert.deepEqual(first, { base: 'USD', quote: 'MYR', rate: 4.0895, date: '2026-07-21', source: 'Bank Negara Malaysia' });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test('converts marketplace USD GMV to MYR and preserves source money', async (t) => {
  clearExchangeRateCache();
  t.after(clearExchangeRateCache);
  const payload = await addMarketplaceLocalCurrency({
    data: { creators: [{ username: 'mawarrahmad', gmv: { amount: '82943.81', currency: 'USD' } }] },
  }, 'MY', async () => bnmResponse());
  const localGmv = payload.data.creators[0].local_gmv;
  assert.equal(localGmv.currency, 'MYR');
  assert.equal(localGmv.source_amount, '82943.81');
  assert.equal(localGmv.exchange_rate, 4.0895);
  assert.ok(Math.abs(Number(localGmv.amount) - 339198.710995) < 0.000001);
  assert.equal(payload.data.exchange_rate.source, 'Bank Negara Malaysia');
});

test('does not relabel unsupported currencies', () => {
  assert.equal(convertUsdMoneyToMyr({ amount: '100', currency: 'SGD' }, { rate: 4.0895 }), null);
});

test('converts marketplace USD GMV ranges to MYR instead of only replacing the symbol', () => {
  const converted = convertUsdRangeToMyr({
    minimum_amount: '1K',
    maximum_amount: '5K',
    currency: 'USD',
    formatted_range: 'US$1K-US$5K',
  }, { rate: 4, date: '2026-07-21' });

  assert.equal(converted.currency, 'MYR');
  assert.equal(converted.minimum_amount, '4000');
  assert.equal(converted.maximum_amount, '20000');
  assert.equal(converted.formatted_range, 'RM4K-RM20K');
  assert.equal(converted.source_formatted_range, 'US$1K-US$5K');
});
