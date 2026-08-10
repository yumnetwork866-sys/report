import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { fetchExchangeRates } from './api.js';
import { getStoredSession } from './session.js';

const CURRENCY_STORAGE_KEY = 'content_report_currency';
const DEFAULT_CURRENCY = 'MYR';
const SUPPORTED_CURRENCIES = new Set(['MYR', 'VND']);
let exchangeRatesSnapshot = null;
let exchangeRatesRequested = false;
const exchangeRateListeners = new Set();

function preferenceKey() {
  const session = getStoredSession();
  const userKey = session?.user?.id || session?.user?.email || session?.id || session?.email;
  return userKey ? `${CURRENCY_STORAGE_KEY}:${userKey}` : CURRENCY_STORAGE_KEY;
}

function isSupportedCurrency(value) {
  return SUPPORTED_CURRENCIES.has(value);
}

export function getStoredCurrency() {
  try {
    const scopedKey = preferenceKey();
    const stored = localStorage.getItem(scopedKey);
    if (isSupportedCurrency(stored)) return stored;
    if (scopedKey !== CURRENCY_STORAGE_KEY) {
      const legacy = localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (isSupportedCurrency(legacy)) {
        localStorage.setItem(scopedKey, legacy);
        return legacy;
      }
    }
    return DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function setStoredCurrency(currency) {
  const nextCurrency = isSupportedCurrency(currency) ? currency : DEFAULT_CURRENCY;

  try {
    localStorage.setItem(preferenceKey(), nextCurrency);
  } catch {
    // Ignore storage failures and keep the in-memory event flow working.
  }

  window.dispatchEvent(new Event('content-report-currency-change'));
}

function subscribe(callback) {
  const handler = () => callback();

  window.addEventListener('storage', handler);
  window.addEventListener('content-report-currency-change', handler);
  window.addEventListener('content-report-session-change', handler);

  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener('content-report-currency-change', handler);
    window.removeEventListener('content-report-session-change', handler);
  };
}

export function useCurrency() {
  return useSyncExternalStore(subscribe, getStoredCurrency, () => DEFAULT_CURRENCY);
}

function subscribeExchangeRates(callback) {
  exchangeRateListeners.add(callback);
  return () => exchangeRateListeners.delete(callback);
}

function getExchangeRatesSnapshot() {
  return exchangeRatesSnapshot;
}

async function loadExchangeRates() {
  if (exchangeRatesRequested) return;
  exchangeRatesRequested = true;
  try {
    const payload = await fetchExchangeRates();
    if (payload?.base === 'MYR' && payload?.rates) {
      exchangeRatesSnapshot = payload;
      exchangeRateListeners.forEach((listener) => listener());
    }
  } catch {
    // Keep original monetary values when the rate service is unavailable.
  }
}

export function useExchangeRates() {
  const rates = useSyncExternalStore(subscribeExchangeRates, getExchangeRatesSnapshot, () => null);
  useEffect(() => { loadExchangeRates(); }, []);
  return rates;
}

function normalizeCurrency(currency) {
  const normalized = String(currency || DEFAULT_CURRENCY).trim().toUpperCase();
  return normalized === 'LOCAL' ? DEFAULT_CURRENCY : normalized;
}

export function convertCurrencyAmount(amount, sourceCurrency, targetCurrency, exchangeRates) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return null;
  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);
  if (source === target) return numericAmount;
  const sourceRate = Number(exchangeRates?.rates?.[source]);
  const targetRate = Number(exchangeRates?.rates?.[target]);
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0) return null;
  return numericAmount * sourceRate / targetRate;
}

export function formatCurrencyAmount(amount, sourceCurrency, targetCurrency, exchangeRates, locale, options = {}) {
  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);
  const converted = convertCurrencyAmount(amount, source, target, exchangeRates);
  const displayCurrency = converted === null ? source : target;
  const displayAmount = converted === null ? Number(amount) : converted;
  if (!Number.isFinite(displayAmount)) return '—';
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: displayCurrency,
    maximumFractionDigits: displayCurrency === 'VND' ? 0 : 2,
    ...(options.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
  });
  if (displayCurrency === 'MYR' || displayCurrency === 'VND') {
    const symbol = displayCurrency === 'MYR' ? 'RM' : 'VNĐ';
    return formatter.formatToParts(displayAmount)
      .map((part) => part.type === 'currency' ? symbol : part.value)
      .join('');
  }
  return formatter.format(displayAmount);
}

export function useMoneyFormatter(locale) {
  const currency = useCurrency();
  const exchangeRates = useExchangeRates();
  return useMemo(() => ({
    currency,
    exchangeRates,
    convertAmount: (amount, sourceCurrency) => convertCurrencyAmount(amount, sourceCurrency, currency, exchangeRates),
    formatMoney: (amount, sourceCurrency, options) => formatCurrencyAmount(
      amount,
      sourceCurrency,
      currency,
      exchangeRates,
      locale,
      options,
    ),
  }), [currency, exchangeRates, locale]);
}

export { CURRENCY_STORAGE_KEY, DEFAULT_CURRENCY };
