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

module.exports = { REGION_TIMEZONES, parseTikTokShopDateTime };
