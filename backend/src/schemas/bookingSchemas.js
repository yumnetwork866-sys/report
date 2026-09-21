const { z } = require('zod');

const positiveId = (label) => z.coerce.number({
  error: `A valid ${label} is required.`,
}).int(`A valid ${label} is required.`).positive(`A valid ${label} is required.`);

const bookingIdParamsSchema = z.object({
  id: positiveId('booking ID'),
});

const creatorIdParamsSchema = z.object({
  creatorId: positiveId('creator ID'),
});

module.exports = { bookingIdParamsSchema, creatorIdParamsSchema };
