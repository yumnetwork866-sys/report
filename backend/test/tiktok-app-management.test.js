const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModule } = require('./helpers/mockModule');

const modelsPath = require.resolve('../src/models');
const tiktokAppServicePath = require.resolve('../src/services/tiktokAppService');
const tiktokAppControllerPath = require.resolve('../src/controllers/tiktokAppController');

const {
  normalizeAppKey,
  mapLegacyAppType,
} = require('../src/services/tiktokAppService');
const { encryptPartnerToken, decryptPartnerToken } = require('../src/lib/tiktokPartnerTokenEncryption');

test('tiktokAppService mappings and key normalization', () => {
  assert.equal(normalizeAppKey('partner', 'VN'), 'partner:VN');
  assert.deepEqual(mapLegacyAppType('partner_vn'), { appType: 'partner', region: 'VN' });
  assert.deepEqual(mapLegacyAppType('partner_us'), { appType: 'partner', region: 'US' });
  assert.deepEqual(mapLegacyAppType('custom', 'VN'), { appType: 'custom', region: 'VN' });
  assert.deepEqual(mapLegacyAppType('partner', 'MY'), { appType: 'partner', region: 'MY' });
});

test('tiktokAppController CRUD lifecycle with mocked models', async (t) => {
  let apps = [];
  let nextId = 1;

  class MockTikTokApp {
    constructor(data) {
      this.id = data.id || nextId++;
      this.name = data.name;
      this.app_type = data.app_type;
      this.region = data.region;
      this.app_key = data.app_key;
      this.app_secret_encrypted = data.app_secret_encrypted;
      this.service_id = data.service_id;
      this.authorize_url = data.authorize_url;
      this.redirect_uri = data.redirect_uri;
      this.is_active = data.is_active ?? true;
      this.created_at = data.created_at || new Date();
      this.updated_at = data.updated_at || new Date();
    }

    get() {
      return { ...this };
    }

    async update(updates) {
      Object.assign(this, updates);
      return this;
    }

    async destroy() {
      apps = apps.filter((a) => a.id !== this.id);
    }

    static async findAll({ where } = {}) {
      if (where?.is_active) {
        return apps.filter((a) => a.is_active);
      }
      return [...apps];
    }

    static async findOne({ where }) {
      if (!where) return apps[0] || null;
      return apps.find((a) => {
        return Object.entries(where).every(([k, v]) => a[k] === v);
      }) || null;
    }

    static async findByPk(id) {
      return apps.find((a) => a.id === Number(id)) || null;
    }

    static async create(data) {
      const app = new MockTikTokApp(data);
      apps.push(app);
      return app;
    }
  }

  const restoreModels = mockModule(modelsPath, {
    TikTokApp: MockTikTokApp,
  });

  t.after(() => {
    restoreModels();
    delete require.cache[tiktokAppServicePath];
    delete require.cache[tiktokAppControllerPath];
  });

  delete require.cache[tiktokAppServicePath];
  delete require.cache[tiktokAppControllerPath];

  const appService = require('../src/services/tiktokAppService');
  const controller = require('../src/controllers/tiktokAppController');

  const createMockRes = () => {
    const res = {
      statusCode: 200,
      jsonBody: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonBody = data;
        return this;
      },
    };
    return res;
  };

  // 1. Create App
  const createReq = {
    body: {
      name: 'Test Partner VN',
      app_type: 'partner',
      region: 'VN',
      app_key: 'test_crud_app_key',
      app_secret: 'super_secret_tiktok_value_123',
      service_id: 'test_service_id_vn',
      authorize_url: 'https://services.tiktokshop.com/open/authorize',
      redirect_uri: 'https://yum.test/oauth/callback',
      is_active: true,
    },
  };

  const res1 = createMockRes();
  await controller.createApp(createReq, res1);
  assert.equal(res1.statusCode, 201);
  assert.equal(res1.jsonBody.name, 'Test Partner VN');
  assert.equal(res1.jsonBody.region, 'VN');
  assert.equal(res1.jsonBody.app_key, 'test_crud_app_key');
  assert.equal(res1.jsonBody.app_secret_masked, '••••••••');
  assert.equal(res1.jsonBody.has_secret, true);
  assert.equal(res1.jsonBody.app_secret, undefined);
  const createdId = res1.jsonBody.id;

  // Secret is encrypted in storage
  const inDb = await MockTikTokApp.findByPk(createdId);
  assert.ok(inDb);
  assert.notEqual(inDb.app_secret_encrypted, 'super_secret_tiktok_value_123');
  assert.equal(decryptPartnerToken(inDb.app_secret_encrypted), 'super_secret_tiktok_value_123');

  // Verify service resolved cached credentials
  const creds = appService.getAppCredentials('partner_vn');
  assert.ok(creds);
  assert.equal(creds.appKey, 'test_crud_app_key');
  assert.equal(creds.appSecret, 'super_secret_tiktok_value_123');
  assert.equal(creds.serviceId, 'test_service_id_vn');

  // 2. Reject duplicate (app_type, region)
  const res2 = createMockRes();
  await controller.createApp(createReq, res2);
  assert.equal(res2.statusCode, 409);

  // 3. List Apps
  const res3 = createMockRes();
  await controller.listApps({}, res3);
  assert.equal(res3.statusCode, 200);
  assert.ok(Array.isArray(res3.jsonBody));
  const found = res3.jsonBody.find((a) => a.id === createdId);
  assert.ok(found);
  assert.equal(found.app_secret_masked, '••••••••');

  // 4. Update App
  const updateReq = {
    params: { id: createdId },
    body: {
      name: 'Updated Partner VN',
      app_key: 'test_crud_app_key_updated',
    },
  };
  const res4 = createMockRes();
  await controller.updateApp(updateReq, res4);
  assert.equal(res4.statusCode, 200);
  assert.equal(res4.jsonBody.name, 'Updated Partner VN');
  assert.equal(res4.jsonBody.app_key, 'test_crud_app_key_updated');

  const afterUpdate = await MockTikTokApp.findByPk(createdId);
  assert.equal(decryptPartnerToken(afterUpdate.app_secret_encrypted), 'super_secret_tiktok_value_123');

  // 5. Toggle Status
  const res5 = createMockRes();
  await controller.toggleAppStatus({ params: { id: createdId }, body: { is_active: false } }, res5);
  assert.equal(res5.statusCode, 200);
  assert.equal(res5.jsonBody.is_active, false);

  // App is now inactive, getAppCredentials returns null
  assert.equal(appService.getAppCredentials('partner_vn'), null);

  // 6. Delete App
  const res6 = createMockRes();
  await controller.deleteApp({ params: { id: createdId } }, res6);
  assert.equal(res6.statusCode, 200);
  assert.equal(res6.jsonBody.success, true);

  // 7. Auto-detection: Create app with app_type 'auto' and empty name
  const autoReq = {
    body: {
      name: '',
      app_type: 'auto',
      region: 'AUTO',
      app_key: 'auto_key_123',
      app_secret: 'auto_secret_123',
      service_id: '71234567890',
    },
  };
  const res7 = createMockRes();
  await controller.createApp(autoReq, res7);
  assert.equal(res7.statusCode, 201);
  assert.equal(res7.jsonBody.app_type, 'partner');
  assert.equal(res7.jsonBody.region, 'AUTO');
  assert.equal(res7.jsonBody.name, 'TikTok Partner App');

  // 8. autoSyncAppFromConnection: Shop OAuth callback syncs region to MY
  // Since scopes only contain 'seller.order.info' (order scope), app_type is also auto-detected as 'custom'
  const synced = await appService.autoSyncAppFromConnection({
    appKey: 'auto_key_123',
    detectedRegion: 'MY',
    detectedScopes: ['seller.order.info'],
  });
  assert.ok(synced);
  assert.equal(synced.region, 'MY');
  assert.equal(synced.app_type, 'custom');

  const inDbAfterSync = await MockTikTokApp.findByPk(res7.jsonBody.id);
  assert.equal(inDbAfterSync.region, 'MY');
  assert.equal(inDbAfterSync.app_type, 'custom');

  // Verify getAppCredentials resolves for custom MY
  const credsMY = appService.getAppCredentials('custom', 'MY');
  assert.ok(credsMY);
  assert.equal(credsMY.appKey, 'auto_key_123');
});
