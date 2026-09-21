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

test('generated report uses Booking Management snapshots and Ollama analysis', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const controllerPath = require.resolve('../src/controllers/reportController');
  const endpointServicePath = require.resolve('../src/services/report/reportEndpointService');
  let savedReport;
  const restoreModels = mockModule(modelsPath, {
    Booking: {
      findAll: async () => [{
        id: 3,
        creator_id: null,
        creator_open_id: 'creator-2',
        creator_username: 'koc_an',
        creator_name: 'KOC An',
        booking_cost: 1500,
        status: 'draft',
        deadline: '2026-07-22',
        created_at: new Date('2026-07-19T08:00:00Z'),
        evaluation_snapshot: {
          collaboration: {
            name: 'Chiến dịch A',
            status: 'ONGOING',
            end_at: '2026-07-31',
          },
          performance: {
            start_date: '2026-06-01',
            end_date: '2026-06-30',
            currency: 'MYR',
            affiliate_gmv: 30000,
            affiliate_orders: 25,
            items_sold: 30,
            video_views: 12500,
            shoppable_videos: 8,
          },
        },
      }],
    },
    User: {},
    WeeklyReport: {
      create: async (payload) => {
        savedReport = payload;
        return { id: 9, ...payload };
      },
    },
    sequelize: {},
  });
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(url, /\/api\/chat$/);
    const request = JSON.parse(options.body);
    assert.equal(request.stream, false);
    assert.match(request.messages[1].content, /"videoViews":12500/);
    return {
      ok: true,
      json: async () => ({
        message: {
          content: '### Điểm nổi bật\nKOC An có Creator Performance đầy đủ.',
        },
      }),
    };
  };
  delete require.cache[controllerPath];
  delete require.cache[endpointServicePath];
  t.after(() => {
    global.fetch = originalFetch;
    delete require.cache[controllerPath];
    delete require.cache[endpointServicePath];
    restoreModels();
  });

  const { generateWeeklyReport } = require(controllerPath);
  const response = makeResponse();
  await generateWeeklyReport({
    body: { week_start: '2026-07-18', week_end: '2026-07-24' },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(savedReport.week_start, '2026-07-18');
  assert.equal(savedReport.week_end, '2026-07-24');
  assert.match(savedReport.generated_content, /BÁO CÁO ĐÁNH GIÁ HIỆU QUẢ KOC/);
  assert.match(savedReport.generated_content, /12\.500/);
  assert.match(savedReport.generated_content, /KOC An/);
  assert.match(savedReport.generated_content, /1 đánh giá · chi phí RM 1\.500/);
  assert.match(savedReport.generated_content, /GMV 30\.000 MYR · 25 đơn/);
  assert.match(savedReport.generated_content, /RM 120\/1K views · RM 60\/đơn · 5% GMV lịch sử/);
  assert.doesNotMatch(savedReport.generated_content, /Phân tích bởi Ollama/i);
  assert.doesNotMatch(savedReport.generated_content, /gemma4:latest/i);
  assert.match(savedReport.generated_content, /KOC An có Creator Performance đầy đủ/);
});

test('invalid report period is rejected before querying data', async (t) => {
  const modelsPath = require.resolve('../src/models');
  const controllerPath = require.resolve('../src/controllers/reportController');
  const endpointServicePath = require.resolve('../src/services/report/reportEndpointService');
  let queried = false;
  const restoreModels = mockModule(modelsPath, {
    Booking: { findAll: async () => { queried = true; return []; } },
    User: {},
    WeeklyReport: {},
    sequelize: {},
  });
  delete require.cache[controllerPath];
  delete require.cache[endpointServicePath];
  t.after(() => {
    delete require.cache[controllerPath];
    delete require.cache[endpointServicePath];
    restoreModels();
  });

  const { generateWeeklyReport } = require(controllerPath);
  const response = makeResponse();
  await generateWeeklyReport({
    body: { week_start: '2026-07-25', week_end: '2026-07-24' },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(queried, false);
  assert.match(response.body.message, /không hợp lệ/);
});
