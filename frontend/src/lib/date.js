export function parseDateOnly(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
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

export function formatDateOnly(value, fallback = '') {
  const parts = parseDateOnly(value);
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
