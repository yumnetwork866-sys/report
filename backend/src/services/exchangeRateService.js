const { getCache, setCache, delCache } = require('../lib/redis');

const BNM_EXCHANGE_RATE_URL = 'https://api.bnm.gov.my/public/exchange-rate?session=0900&quote=rm';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let myrRatesCache = null;

const getMyrExchangeRates = async (fetchImpl = fetch) => {
  if (myrRatesCache && myrRatesCache.expiresAt > Date.now()) return myrRatesCache.value;

  const isTest = process.env.NODE_ENV === 'test' && process.env.ENABLE_TEST_CACHE !== 'true';
  if (!isTest) {
    const cachedFromRedis = await getCache('exchange_rate:myr');
    if (cachedFromRedis) {
      myrRatesCache = { value: cachedFromRedis, expiresAt: Date.now() + CACHE_TTL_MS };
      return cachedFromRedis;
    }
  }

  const response = await fetchImpl(process.env.BNM_EXCHANGE_RATE_URL || BNM_EXCHANGE_RATE_URL, {
    headers: {
      accept: 'application/vnd.BNM.API.v1+json',
      'user-agent': 'YumReport/1.0',
    },
    signal: AbortSignal.timeout(Math.max(1000, Number(process.env.EXCHANGE_RATE_TIMEOUT_MS || 5000))),
  });
  if (!response.ok) throw new Error(`BNM exchange-rate request failed with status ${response.status}.`);

  const payload = await response.json();
  const value = {
    base: 'MYR',
    rates: { MYR: 1 },
    dates: { MYR: null },
    source: 'Bank Negara Malaysia',
  };
  for (const item of Array.isArray(payload.data) ? payload.data : []) {
    const currency = String(item?.currency_code || '').toUpperCase();
    if (!['USD', 'VND'].includes(currency)) continue;
    const unit = Number(item?.unit || 1);
    const middleRate = Number(item?.rate?.middle_rate);
    if (!Number.isFinite(middleRate) || middleRate <= 0 || !Number.isFinite(unit) || unit <= 0) continue;
    value.rates[currency] = middleRate / unit;
    value.dates[currency] = item.rate.date || null;
  }
  if (!value.rates.USD) {
    throw new Error('BNM exchange-rate response does not contain a valid USD/MYR middle rate.');
  }
  myrRatesCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  if (!isTest) {
    await setCache('exchange_rate:myr', value, Math.ceil(CACHE_TTL_MS / 1000));
  }
  return value;
};

const getUsdMyrRate = async (fetchImpl = fetch) => {
  const exchangeRates = await getMyrExchangeRates(fetchImpl);
  return {
    base: 'USD',
    quote: 'MYR',
    rate: exchangeRates.rates.USD,
    date: exchangeRates.dates.USD,
    source: exchangeRates.source,
  };
};

const convertUsdMoneyToMyr = (money, exchangeRate) => {
  if (!money || money.amount === undefined || money.amount === null || money.amount === '') return null;
  if (money.currency === 'MYR') return { ...money, currency: 'MYR' };
  if (money.currency !== 'USD') return null;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    amount: String(amount * exchangeRate.rate),
    currency: 'MYR',
    source_amount: String(money.amount),
    source_currency: 'USD',
    exchange_rate: exchangeRate.rate,
    exchange_rate_date: exchangeRate.date,
  };
};

const RANGE_AMOUNT_KEYS = [
  'minimum_amount', 'maximum_amount', 'min_amount', 'max_amount',
  'minimum', 'maximum', 'min', 'max',
];

const compactAmountValue = (value) => {
  const match = String(value ?? '').trim().match(/^(-?[\d,.]+)\s*([KMB])?$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[String(match[2] || '').toUpperCase()] || 1;
  return amount * multiplier;
};

const formatCompactMyr = (amount) => `RM${new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(amount)}`;

const convertUsdRangeToMyr = (range, exchangeRate) => {
  if (!range || typeof range !== 'object') return null;
  const formattedRange = String(range.formatted_range || '');
  const currency = String(range.currency || (/US\$|USD|\$/i.test(formattedRange) ? 'USD' : '')).toUpperCase();
  if (currency === 'MYR') return { ...range, currency: 'MYR' };
  if (currency !== 'USD') return null;

  const converted = {
    ...range,
    currency: 'MYR',
    source_currency: 'USD',
    exchange_rate: exchangeRate.rate,
    exchange_rate_date: exchangeRate.date,
  };
  for (const key of RANGE_AMOUNT_KEYS) {
    if (range[key] === undefined || range[key] === null || range[key] === '') continue;
    const amount = compactAmountValue(range[key]);
    if (amount !== null) converted[key] = String(amount * exchangeRate.rate);
  }
  if (formattedRange) {
    converted.source_formatted_range = formattedRange;
    converted.formatted_range = formattedRange.replace(
      /(?:US\$|USD|\$)\s*(-?[\d,.]+)\s*([KMB])?/gi,
      (_, amount, suffix) => {
        const numeric = compactAmountValue(`${amount}${suffix || ''}`);
        return numeric === null ? _ : formatCompactMyr(numeric * exchangeRate.rate);
      },
    );
  }
  return converted;
};

const addMarketplaceLocalCurrency = async (payload, region, fetchImpl = fetch) => {
  if (String(region || '').toUpperCase() !== 'MY' || !payload?.data) return payload;
  const exchangeRate = await getUsdMyrRate(fetchImpl);
  const addLocalGmv = (creator) => {
    if (!creator) return creator;
    const localGmv = convertUsdMoneyToMyr(creator.gmv, exchangeRate);
    const localGmvRange = convertUsdRangeToMyr(creator.gmv_range, exchangeRate);
    return {
      ...creator,
      ...(localGmv ? { local_gmv: localGmv } : {}),
      ...(localGmvRange ? { local_gmv_range: localGmvRange } : {}),
    };
  };
  return {
    ...payload,
    data: {
      ...payload.data,
      ...(Array.isArray(payload.data.creators)
        ? { creators: payload.data.creators.map(addLocalGmv) }
        : {}),
      ...(payload.data.creator ? { creator: addLocalGmv(payload.data.creator) } : {}),
      exchange_rate: exchangeRate,
    },
  };
};

const clearExchangeRateCache = async () => {
  myrRatesCache = null;
  await delCache('exchange_rate:myr');
};

module.exports = {
  BNM_EXCHANGE_RATE_URL,
  getMyrExchangeRates,
  getUsdMyrRate,
  convertUsdMoneyToMyr,
  convertUsdRangeToMyr,
  addMarketplaceLocalCurrency,
  clearExchangeRateCache,
};
