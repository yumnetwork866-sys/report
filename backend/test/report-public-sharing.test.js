const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(value) {
    this.statusCode = value;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
});

test('report sharing creates a stable token and public lookup exposes only report content', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const controllerPath = require.resolve('../src/controllers/reportController');
  const endpointServicePath = require.resolve('../src/services/report/reportEndpointService');
  const report = {
    id: 7,
    week_start: '2026-07-01',
    week_end: '2026-07-07',
    generated_content: 'Shared report content',
    public_share_token: null,
    async save() {},
  };
  let publicLookup;
  const restoreModels = mockModule(modelsPath, {
    WeeklyReport: {
      findByPk: async () => report,
      findOne: async (options) => {
        publicLookup = options;
        return {
          id: report.id,
          week_start: report.week_start,
          week_end: report.week_end,
          generated_content: report.generated_content,
        };
      },
    },
  });
  delete require.cache[controllerPath];
  delete require.cache[endpointServicePath];
  t.after(() => {
    delete require.cache[controllerPath];
    delete require.cache[endpointServicePath];
    restoreModels();
  });
  const { getPublicReport, shareReport } = require(controllerPath);

  const shareResponse = makeResponse();
  await shareReport({ params: { id: '7' } }, shareResponse);
  assert.equal(shareResponse.statusCode, 200);
  assert.match(shareResponse.body.share_token, /^[a-f0-9]{48}$/);

  const token = shareResponse.body.share_token;
  const publicResponse = makeResponse();
  await getPublicReport({ params: { token } }, publicResponse);
  assert.equal(publicResponse.statusCode, 200);
  assert.equal(publicResponse.body.generated_content, 'Shared report content');
  assert.equal(publicLookup.where.public_share_token, token);
  assert.deepEqual(publicLookup.attributes, ['id', 'week_start', 'week_end', 'generated_content']);
});
