const REGION_TIMEZONES = {
  MY: 'Asia/Kuala_Lumpur',
  VN: 'Asia/Ho_Chi_Minh',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  PH: 'Asia/Manila',
  ID: 'Asia/Jakarta',
};

const formatterFor = (timezone) => new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const localDateTimeToUtc = (parts, timezone) => {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let candidate = desired;
  const formatter = formatterFor(timezone);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]));
    const actualAsUtc = Date.UTC(
      actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second,
    );
    candidate += desired - actualAsUtc;
  }
  return new Date(candidate);
};

const parseTikTokShopDateTime = (value, region) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/[zZ]|[+-]\d\d:\d\d$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const timezone = REGION_TIMEZONES[String(region || '').toUpperCase()] || 'UTC';
  const parsed = localDateTimeToUtc({ year, month, day, hour, minute, second }, timezone);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const resolveRegionTimezone = (regionOrTimezone) => {
  if (!regionOrTimezone) return null;
  const upper = String(regionOrTimezone).trim().toUpperCase();
  if (REGION_TIMEZONES[upper]) return REGION_TIMEZONES[upper];
  return String(regionOrTimezone).trim();
};

const dateOnlyInTimezone = (value, regionOrTimezone) => {
  if (!value) return null;
  const str = String(value || '').trim();
  const rawMatch = str.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (rawMatch && !/[zZ]|[+-]\d\d:\d\d$/.test(str)) {
    return rawMatch[1];
  }
  const timezone = resolveRegionTimezone(regionOrTimezone) || 'UTC';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const localMidnightToUtc = (dateStr, regionOrTimezone = 'Asia/Ho_Chi_Minh') => {
  const timezone = resolveRegionTimezone(regionOrTimezone) || 'Asia/Ho_Chi_Minh';
  const desired = Date.parse(`${dateStr}T00:00:00.000Z`);
  let candidate = desired;
  const formatter = formatterFor(timezone);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]));
    const actualUtc = Date.UTC(
      actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second,
    );
    candidate += desired - actualUtc;
  }
  return new Date(candidate);
};

module.exports = {
  REGION_TIMEZONES,
  resolveRegionTimezone,
  parseTikTokShopDateTime,
  dateOnlyInTimezone,
  localMidnightToUtc,
};
