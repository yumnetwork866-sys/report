const assert = require('node:assert/strict');
const test = require('node:test');

const { endpoint } = require('../src/controllers/controllerAdapter');
const { attachExecutor } = require('../src/services/serviceResult');

const responseRecorder = () => ({
  statusCode: 200,
  body: undefined,
  headers: {},
  redirectLocation: null,
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
  setHeader(name, value) { this.headers[name] = value; },
  redirect(location) { this.redirectLocation = location; return this; },
});

test('controller adapter forwards plain request data and preserves status and headers', async () => {
  let input;
  const service = attachExecutor({
    run: async (request, response) => {
      input = request;
      response.set('X-Cache', 'MISS');
      return response.status(201).json({ id: 7 });
    },
  });
  const response = responseRecorder();

  await endpoint(service, 'run')({
    params: { id: '7' }, query: { page: '2' }, body: { name: 'A' }, session: { sub: 4 },
  }, response);

  assert.deepEqual(input, {
    params: { id: '7' }, query: { page: '2' }, body: { name: 'A' }, session: { sub: 4 },
  });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, { id: 7 });
  assert.equal(response.headers['X-Cache'], 'MISS');
});

test('controller adapter preserves redirects', async () => {
  const response = responseRecorder();
  const service = attachExecutor({ run: async (_request, result) => result.redirect('/done') });

  await endpoint(service, 'run')({}, response);

  assert.equal(response.redirectLocation, '/done');
  assert.equal(response.body, undefined);
});
