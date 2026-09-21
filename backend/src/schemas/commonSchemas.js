const { z } = require('zod');

const invalid = (label) => `Invalid ${label}.`;

const positiveId = (label = 'ID') => z.coerce.number({ error: invalid(label) })
  .int(invalid(label))
  .positive(invalid(label));

const isoDate = (label = 'date') => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, invalid(label))
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, invalid(label));

const optionalIsoDate = (label) => z.preprocess(
  (value) => value === '' || value === null || value === undefined ? undefined : value,
  isoDate(label).optional(),
);

const booleanQuery = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (['true', '1'].includes(normalized)) return true;
  if (['false', '0'].includes(normalized)) return false;
  return value;
}, z.boolean({ error: 'Invalid boolean value.' }));

const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3,8}$/, 'Invalid currency.');
const tiktokUsername = z.string().trim().transform((value) => value.replace(/^@+/, ''))
  .pipe(z.string().min(1, 'Invalid TikTok username.').max(64, 'Invalid TikTok username.'));
const tiktokVideoId = z.coerce.string().trim().regex(/^\d{5,30}$/, 'Invalid TikTok video ID.');

const paginationFields = {
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
};
const paginationQuerySchema = z.object(paginationFields).passthrough();

const withDateRange = (schema, { exclusiveEnd = false } = {}) => schema.superRefine((value, context) => {
  if (!value.start_date || !value.end_date) return;
  const invalidRange = exclusiveEnd
    ? value.start_date >= value.end_date
    : value.start_date > value.end_date;
  if (invalidRange) context.addIssue({
    code: 'custom',
    path: ['end_date'],
    message: exclusiveEnd
      ? 'end_date must be after start_date.'
      : 'end_date must be on or after start_date.',
  });
});

module.exports = {
  booleanQuery,
  currency,
  isoDate,
  optionalIsoDate,
  paginationFields,
  paginationQuerySchema,
  positiveId,
  tiktokUsername,
  tiktokVideoId,
  withDateRange,
};
