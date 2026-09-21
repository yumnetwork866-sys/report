const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { validateBody, validateParams, validateQuery } = require('../src/middleware/validateRequest');
const { bookingIdParamsSchema } = require('../src/schemas/bookingSchemas');

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

test('validateParams coerces a positive booking id before the controller runs', () => {
  const req = { params: { id: '42' } };
  const res = makeResponse();
  let called = false;

  validateParams(bookingIdParamsSchema)(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.deepEqual(req.params, { id: 42 });
  assert.equal(res.statusCode, 200);
});

test('validateParams returns structured errors for an invalid booking id', () => {
  const req = { params: { id: 'not-an-id' } };
  const res = makeResponse();

  validateParams(bookingIdParamsSchema)(req, res, () => assert.fail('next should not run'));

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid request.');
  assert.deepEqual(res.body.errors, [{
    path: 'id',
    message: 'Invalid booking ID.',
  }]);
});

test('body and query validators share the same parsing contract', () => {
  const schema = z.object({ limit: z.coerce.number().int().positive() });
  const bodyRequest = { body: { limit: '10' } };
  const queryRequest = { query: { limit: '20' } };

  validateBody(schema)(bodyRequest, makeResponse(), () => {});
  validateQuery(schema)(queryRequest, makeResponse(), () => {});

  assert.deepEqual(bodyRequest.body, { limit: 10 });
  assert.deepEqual(queryRequest.query, { limit: 20 });
});
