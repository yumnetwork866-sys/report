const test = require('node:test');
const assert = require('node:assert/strict');

const { mockModule } = require('./helpers/mockModule');

const modelsPath = require.resolve('../src/models');
const passwordPath = require.resolve('../src/lib/password');
const userControllerPath = require.resolve('../src/controllers/userController');

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

test('PUT /users/:id updates user profile fields and password', async (t) => {
  const updateCalls = [];
  const restorePassword = mockModule(passwordPath, {
    hashPassword: async (password) => `hashed:${password}`,
  });
  const restoreModels = mockModule(modelsPath, {
    Role: { findByPk: async () => ({ key: 'leader' }) },
    sequelize: {
      transaction: async (callback) => callback({ id: 'transaction' }),
    },
    User: {
      findByPk: async (id) => ({
        id: Number(id),
        name: 'Updated User',
        email: 'updated@example.com',
        role: 'leader',
        password_hash: 'hashed:secret123',
        async update(payload, options) {
          updateCalls.push({ payload, options });
          return this;
        },
        get() {
          return {
            id: Number(id),
            name: 'Updated User',
            email: 'updated@example.com',
            role: 'leader',
            password_hash: 'hashed:secret123',
          };
        },
      }),
    },
  });

  t.after(() => {
    restorePassword();
    restoreModels();
    delete require.cache[userControllerPath];
  });

  delete require.cache[userControllerPath];
  const { updateUser } = require('../src/controllers/userController');
  const req = {
    params: { id: '7' },
    body: {
      name: 'Updated User',
      email: 'updated@example.com',
      role: 'leader',
      password: 'secret123',
    },
  };
  const res = makeResponse();

  await updateUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    id: 7,
    name: 'Updated User',
    email: 'updated@example.com',
    role: 'leader',
  });
  assert.deepEqual(updateCalls[0].payload, {
    name: 'Updated User',
    email: 'updated@example.com',
    role: 'leader',
    password_hash: 'hashed:secret123',
  });
  assert.equal(updateCalls[0].options.validate, true);
  assert.deepEqual(updateCalls[0].options.transaction, { id: 'transaction' });
});

test('PUT /users/:id rejects empty updates', async (t) => {
  const restoreModels = mockModule(modelsPath, {
    User: {
      update: async () => [1],
      findByPk: async () => null,
    },
  });

  t.after(() => {
    restoreModels();
    delete require.cache[userControllerPath];
  });

  delete require.cache[userControllerPath];
  const { updateUser } = require('../src/controllers/userController');
  const req = {
    params: { id: '7' },
    body: {},
  };
  const res = makeResponse();

  await updateUser(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'No update fields provided');
});

test('PUT /users/:id saves centralized team and normalized hashtags', async (t) => {
  const attributionCalls = [];
  const user = {
    id: 7,
    name: 'Content User',
    email: 'content@example.com',
    role: 'member',
    get() {
      return {
        id: this.id,
        name: this.name,
        email: this.email,
        role: this.role,
        content_attribution: {
          user_id: this.id,
          team_id: 4,
          hashtags: ['#alice'],
          team: { id: 4, name: 'Creative' },
        },
      };
    },
  };
  const restoreModels = mockModule(modelsPath, {
    Role: { findByPk: async () => ({ key: 'member' }) },
    ContentTeam: { findByPk: async (id) => ({ id: Number(id), name: 'Creative' }) },
    UserContentAttribution: {
      findByPk: async () => null,
      upsert: async (payload, options) => {
        attributionCalls.push({ payload, options });
      },
    },
    sequelize: {
      transaction: async (callback) => callback({ id: 'transaction' }),
    },
    User: {
      findByPk: async () => user,
    },
  });

  t.after(() => {
    restoreModels();
    delete require.cache[userControllerPath];
  });

  delete require.cache[userControllerPath];
  const { updateUser } = require('../src/controllers/userController');
  const req = {
    params: { id: '7' },
    body: {
      content_team_id: '4',
      content_hashtags: 'Alice, #ALICE',
    },
  };
  const res = makeResponse();

  await updateUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(attributionCalls[0].payload, {
    user_id: 7,
    team_id: 4,
    hashtags: ['#alice'],
    updated_at: attributionCalls[0].payload.updated_at,
  });
  assert.equal(attributionCalls[0].payload.updated_at instanceof Date, true);
  assert.equal(res.body.content_attribution.team.name, 'Creative');
});

test('PUT /users/:id allows self-update of avatar and password without users permission', async (t) => {
  const updateCalls = [];
  const validAvatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const restorePassword = mockModule(passwordPath, {
    hashPassword: async (password) => `hashed:${password}`,
  });
  const restoreModels = mockModule(modelsPath, {
    Role: { findByPk: async () => ({ key: 'member' }) },
    sequelize: {
      transaction: async (callback) => callback({ id: 'transaction' }),
    },
    User: {
      findByPk: async (id) => ({
        id: Number(id),
        name: 'Regular Member',
        email: 'member@example.com',
        role: 'member',
        avatar_url: null,
        async update(payload, options) {
          updateCalls.push({ payload, options });
          return this;
        },
        get() {
          return {
            id: Number(id),
            name: 'Regular Member',
            email: 'member@example.com',
            role: 'member',
            avatar_url: validAvatar,
          };
        },
      }),
    },
  });

  t.after(() => {
    restorePassword();
    restoreModels();
    delete require.cache[userControllerPath];
  });

  delete require.cache[userControllerPath];
  const { updateUser } = require('../src/controllers/userController');

  // Self-update without 'users' permission
  const req = {
    params: { id: '9' },
    session: { sub: 9, role: 'member', permissions: ['tiktok'] },
    body: {
      avatar_url: validAvatar,
      password: 'newSecretPassword123',
    },
  };
  const res = makeResponse();

  await updateUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateCalls[0].payload, {
    avatar_url: validAvatar,
    password_hash: 'hashed:newSecretPassword123',
  });
});

test('PUT /users/:id rejects self-update of sensitive fields (role, is_active, team) without users permission', async (t) => {
  const restoreModels = mockModule(modelsPath, {
    Role: { findByPk: async () => ({ key: 'admin' }) },
    User: {
      findByPk: async () => null,
    },
  });

  t.after(() => {
    restoreModels();
    delete require.cache[userControllerPath];
  });

  delete require.cache[userControllerPath];
  const { updateUser } = require('../src/controllers/userController');

  // Try updating role
  const roleReq = {
    params: { id: '9' },
    session: { sub: 9, role: 'member', permissions: ['tiktok'] },
    body: { role: 'admin' },
  };
  const roleRes = makeResponse();
  await updateUser(roleReq, roleRes);
  assert.equal(roleRes.statusCode, 403);
  assert.equal(roleRes.body.message, 'Không có quyền thay đổi vai trò');

  // Try updating is_active
  const activeReq = {
    params: { id: '9' },
    session: { sub: 9, role: 'member', permissions: ['tiktok'] },
    body: { is_active: true },
  };
  const activeRes = makeResponse();
  await updateUser(activeReq, activeRes);
  assert.equal(activeRes.statusCode, 403);
  assert.equal(activeRes.body.message, 'Không có quyền thay đổi trạng thái kích hoạt');

  // Try updating attribution
  const teamReq = {
    params: { id: '9' },
    session: { sub: 9, role: 'member', permissions: ['tiktok'] },
    body: { content_team_id: 1 },
  };
  const teamRes = makeResponse();
  await updateUser(teamReq, teamRes);
  assert.equal(teamRes.statusCode, 403);
  assert.equal(teamRes.body.message, 'Không có quyền thay đổi phân công nhóm nội dung');

  // Try updating another user
  const otherReq = {
    params: { id: '10' },
    session: { sub: 9, role: 'member', permissions: ['tiktok'] },
    body: { password: 'somePassword123' },
  };
  const otherRes = makeResponse();
  await updateUser(otherReq, otherRes);
  assert.equal(otherRes.statusCode, 403);
  assert.equal(otherRes.body.message, 'Không có quyền truy cập');
});
