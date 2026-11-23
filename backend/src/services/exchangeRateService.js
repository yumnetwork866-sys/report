const { getCache, setCache, delCache } = require('../lib/redis');

const BNM_EXCHANGE_RATE_URL = 'https://api.bnm.gov.my/public/exchange-rate?session=0900&quote=rm';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const FALLBACK_EXCHANGE_RATES = {
  base: 'MYR',
  rates: {
    MYR: 1,
    USD: 4.0895,
    VND: 0.000162,
  },
  dates: {
    MYR: null,
    USD: null,
    VND: null,
  },
  source: 'Bank Negara Malaysia (Fallback)',
  session: '0900',
};

let myrRatesCache = null;

const getBnmSessionForDate = (date = new Date()) => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date).split(':').map(Number);
    const totalMinutes = (parts[0] || 0) * 60 + (parts[1] || 0);
    if (totalMinutes >= 1025) return '1700'; // After 17:05 KL time (16:05 VN)
    if (totalMinutes >= 725) return '1200';  // After 12:05 KL time (11:05 VN)
    return '0900';
  } catch {
    return '0900';
  }
};

const getBnmSessionCandidates = (date = new Date(), preferredSession = null) => {
  if (preferredSession) return [preferredSession];
  const primary = getBnmSessionForDate(date);
  if (primary === '1700') return ['1700', '1200', '0900'];
  if (primary === '1200') return ['1200', '0900'];
  return ['0900'];
};

const resolveBnmUrl = (session = '0900') => {
  const envUrl = process.env.BNM_EXCHANGE_RATE_URL;
  if (envUrl) {
    if (envUrl.includes('session=')) {
      return envUrl.replace(/session=\w+/, `session=${session}`);
    }
    const delimiter = envUrl.includes('?') ? '&' : '?';
    return `${envUrl}${delimiter}session=${session}&quote=rm`;
  }
  return `https://api.bnm.gov.my/public/exchange-rate?session=${session}&quote=rm`;
};

const parseBnmPayload = (payload, session = '0900') => {
  const value = {
    base: 'MYR',
    rates: { MYR: 1 },
    dates: { MYR: null },
    source: 'Bank Negara Malaysia',
    session,
  };
  for (const item of Array.isArray(payload.data) ? payload.data : []) {
    const currency = String(item?.currency_code || '').toUpperCase();
    if (!['USD', 'VND'].includes(currency)) continue;
    const unit = Number(item?.unit || 1);
    const middleRate = Number(item?.rate?.middle_rate);
    if (!Number.isFinite(middleRate) || middleRate <= 0 || !Number.isFinite(unit) || unit <= 0) continue;
    value.rates[currency] = middleRate / unit;
    value.dates[currency] = item.rate?.date || null;
  }
  if (!value.rates.USD) {
    throw new Error('BNM exchange-rate response does not contain a valid USD/MYR middle rate.');
  }
  return value;
};

const getMyrExchangeRates = async (fetchImpl = fetch, { session = null, force = false } = {}) => {
  if (!force && myrRatesCache && myrRatesCache.expiresAt > Date.now()) {
    if (!session || myrRatesCache.value?.session === session) {
      return myrRatesCache.value;
    }
  }

  const isTest = process.env.NODE_ENV === 'test' && process.env.ENABLE_TEST_CACHE !== 'true';
  if (!force && !isTest) {
    const cachedFromRedis = await getCache('exchange_rate:myr');
    if (cachedFromRedis) {
      if (!session || cachedFromRedis.session === session) {
        myrRatesCache = { value: cachedFromRedis, expiresAt: Date.now() + CACHE_TTL_MS };
        return cachedFromRedis;
      }
    }
  }

  const candidateSessions = getBnmSessionCandidates(new Date(), session);
  let lastError = null;

  for (const sess of candidateSessions) {
    try {
      const url = resolveBnmUrl(sess);
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/vnd.BNM.API.v1+json',
          'user-agent': 'YumReport/1.0',
        },
        signal: AbortSignal.timeout(Math.max(1000, Number(process.env.EXCHANGE_RATE_TIMEOUT_MS || 5000))),
      });
      if (!response.ok) {
        throw new Error(`BNM exchange-rate request for session ${sess} failed with status ${response.status}.`);
      }

      const payload = await response.json();
      const value = parseBnmPayload(payload, sess);

      myrRatesCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      if (!isTest) {
        await setCache('exchange_rate:myr', value, Math.ceil(CACHE_TTL_MS / 1000));
      }
      return value;
    } catch (error) {
      lastError = error;
      // In tests, if fetchImpl was provided as a mock without matching candidate loop, don't repeat
      if (isTest) break;
    }
  }

  if (myrRatesCache?.value) {
    return myrRatesCache.value;
  }
  console.warn('[exchangeRateService] BNM exchange-rate fetch failed, using fallback:', lastError?.message);
  return FALLBACK_EXCHANGE_RATES;
};

const syncExchangeRates = async ({ fetchImpl = fetch, session = null } = {}) => {
  await clearExchangeRateCache();
  return getMyrExchangeRates(fetchImpl, { session, force: true });
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
  FALLBACK_EXCHANGE_RATES,
  getMyrExchangeRates,
  getUsdMyrRate,
  convertUsdMoneyToMyr,
  convertUsdRangeToMyr,
  addMarketplaceLocalCurrency,
  clearExchangeRateCache,
  syncExchangeRates,
  getBnmSessionForDate,
  resolveBnmUrl,
};
