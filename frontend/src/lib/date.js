const REGION_TIMEZONES = Object.freeze({
  MY: 'Asia/Kuala_Lumpur',
  VN: 'Asia/Ho_Chi_Minh',
  SG: 'Asia/Singapore',
  TH: 'Asia/Bangkok',
  PH: 'Asia/Manila',
  ID: 'Asia/Jakarta',
});

export function resolveRegionTimezone(regionOrTimezone) {
  if (!regionOrTimezone) return null;
  const upper = String(regionOrTimezone).trim().toUpperCase();
  if (REGION_TIMEZONES[upper]) return REGION_TIMEZONES[upper];
  return String(regionOrTimezone).trim();
}

export function parseDateOnly(value, timezoneOrRegion) {
  if (!value) return null;
  const str = String(value || '').trim();
  if (timezoneOrRegion && (/[zZ]|[+-]\d\d:\d\d$/.test(str) || value instanceof Date)) {
    const tz = resolveRegionTimezone(timezoneOrRegion) || 'Asia/Ho_Chi_Minh';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(date);
        const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
        return { year: map.year, month: map.month, day: map.day };
      } catch {
        // fallback to standard regex extraction below
      }
    }
  }

  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (!match) return null;

  const [, year, month, day] = match;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const lastDayOfMonth = numericMonth >= 1 && numericMonth <= 12
    ? new Date(numericYear, numericMonth, 0).getDate()
    : 0;

  if (numericDay < 1 || numericDay > lastDayOfMonth) return null;
  return { year, month, day };
}

export function formatDateOnly(value, fallback = '', timezoneOrRegion) {
  const parts = parseDateOnly(value, timezoneOrRegion);
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : fallback;
}

export function dateOnlyToUtcTimestamp(value) {
  const parts = parseDateOnly(value);
  if (!parts) return null;
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

export function diffInDays(dateA, dateB) {
  const tsA = dateOnlyToUtcTimestamp(dateA);
  const tsB = dateOnlyToUtcTimestamp(dateB);
  if (tsA === null || tsB === null) return null;
  return Math.round((tsA - tsB) / (1000 * 60 * 60 * 24));
}

export function getTodayDateString(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
