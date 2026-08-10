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
