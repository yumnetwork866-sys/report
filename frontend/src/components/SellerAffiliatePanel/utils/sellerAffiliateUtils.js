const LOCALIZED_STATUSES = new Set([
  'ACTIVE', 'INACTIVE', 'ONGOING', 'VALID', 'COMPLETED', 'PENDING', 'AWAITING_SHIPMENT',
  'CONTENT_PENDING', 'SUCCEED', 'NORMAL', 'PROCESSING', 'FAILED', 'SUCCEEDED',
]);

export const normalizeCreatorSearchKeyword = (value) => String(value || '').trim().replace(/^@+/, '');

export const formatStatus = (value, t) => {
  const normalized = String(value || '').toUpperCase();
  return LOCALIZED_STATUSES.has(normalized) ? t(`sellerAffiliate.status_${normalized}`) : value || '—';
};

export const waitForMarketplacePoll = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('The operation was aborted.', 'AbortError'));
    return;
  }
  const onAbort = () => {
    window.clearTimeout(timeout);
    reject(new DOMException('The operation was aborted.', 'AbortError'));
  };
  const timeout = window.setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  signal?.addEventListener('abort', onAbort, { once: true });
});

export const defaultInvitationEndDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
};

export const shiftDateValue = (value, days) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const SHOP_TIMEZONES = {
  MY: 'Asia/Kuala_Lumpur',
  VN: 'Asia/Ho_Chi_Minh',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  PH: 'Asia/Manila',
  ID: 'Asia/Jakarta',
};

export const shopTimezone = (region) => SHOP_TIMEZONES[String(region || '').toUpperCase()] || 'UTC';

const zonedDateParts = (date, timeZone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
}).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));

export const shopDateUnix = (value, region) => {
  const desired = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(desired)) return NaN;
  const timeZone = shopTimezone(region);
  let candidate = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = zonedDateParts(new Date(candidate), timeZone);
    const actualUtc = Date.parse(`${actual.year}-${actual.month}-${actual.day}T${actual.hour}:${actual.minute}:${actual.second}.000Z`);
    candidate += desired - actualUtc;
  }
  return Math.floor(candidate / 1000);
};

export const defaultStatisticsRange = (days = 30) => {
  const end = new Date().toISOString().slice(0, 10);
  return { start: shiftDateValue(end, -(days - 1)), end };
};

export const internationalPhone = (dialCode, localNumber) => {
  const digits = String(localNumber || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `${dialCode}${digits}` : '';
};

export const formatReportDate = (value) => {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—';
};
