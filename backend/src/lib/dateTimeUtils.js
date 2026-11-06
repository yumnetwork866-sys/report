const REGION_TIMEZONES = Object.freeze({
  MY: 'Asia/Kuala_Lumpur',
  VN: 'Asia/Ho_Chi_Minh',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  PH: 'Asia/Manila',
  ID: 'Asia/Jakarta',
});

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

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

const resolveRegionTimezone = (regionOrTimezone) => {
  if (!regionOrTimezone) return null;
  const upper = String(regionOrTimezone).trim().toUpperCase();
  if (REGION_TIMEZONES[upper]) return REGION_TIMEZONES[upper];
  return String(regionOrTimezone).trim();
};

const localMidnightToUtc = (dateStr, regionOrTimezone = DEFAULT_TIMEZONE) => {
  const timezone = resolveRegionTimezone(regionOrTimezone) || DEFAULT_TIMEZONE;
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

const sqlDateInTimezone = (columnName, timezone = DEFAULT_TIMEZONE) => (
  `(${columnName} AT TIME ZONE '${resolveRegionTimezone(timezone) || DEFAULT_TIMEZONE}')::date`
);

module.exports = {
  REGION_TIMEZONES,
  DEFAULT_TIMEZONE,
  resolveRegionTimezone,
  localMidnightToUtc,
  dateOnlyInTimezone,
  sqlDateInTimezone,
};

