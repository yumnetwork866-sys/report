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

for (const scenario of ['success', 'missing', 'delete failure', 'unassign failure', 'remove bookings', 'remove bookings failure', 'invalid action']) {
  test(`DELETE /users/:id handles ${scenario} atomically`, async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const events = [];
    const invalidated = [];
    const foreignKeyError = Object.assign(new Error('foreign key violation'), {
      name: 'SequelizeForeignKeyConstraintError',
    });
    const restoreRedis = mockModule(require.resolve('../src/lib/redis'), {
      delByPattern: async (pattern) => {
        assert.equal(events.at(-1), 'commit');
        invalidated.push(pattern);
      },
    });
    const restoreModels = mockModule(modelsPath, {
      sequelize: {
        transaction: async (callback) => {
          try {
            const result = await callback(transaction);
            events.push('commit');
            return result;
          } catch (error) {
            events.push('rollback');
            throw error;
          }
        },
      },
      User: {
        findByPk: async (id, options) => {
          assert.equal(id, '7');
          assert.equal(options.transaction, transaction);
          assert.equal(options.lock, 'UPDATE');
          events.push('lock');
          return scenario === 'missing' ? null : { id: 7 };
        },
        destroy: async (options) => {
          assert.deepEqual(options, { where: { id: 7 }, transaction });
          events.push('delete');
          if (scenario === 'delete failure' || scenario === 'remove bookings failure') throw foreignKeyError;
          return 1;
        },
      },
      Booking: {
        destroy: async (options) => {
          assert.deepEqual(options, { where: { staff_id: 7 }, transaction });
          events.push('remove bookings');
          return 2;
        },
        update: async (payload, options) => {
          assert.deepEqual(options, { where: { staff_id: 7 }, transaction });
          assert.equal(payload.staff_id, null);
          assert.equal(payload.staff_name, null);
          assert.ok(payload.updated_at instanceof Date);
          events.push('unassign');
          if (scenario === 'unassign failure') throw new Error('Booking update failed');
          return [2];
        },
      },
    });
    t.after(() => {
      restoreModels();
      restoreRedis();
      delete require.cache[userControllerPath];
    });
    delete require.cache[userControllerPath];
    const { deleteUser } = require('../src/controllers/userController');
    const res = makeResponse();
    const body = scenario.startsWith('remove bookings')
      ? { booking_action: 'delete' }
      : scenario === 'invalid action' ? { booking_action: 'DELETE' } : undefined;
    await deleteUser({ params: { id: '7' }, body }, res);

    if (scenario === 'remove bookings') {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(events, ['lock', 'remove bookings', 'delete', 'commit']);
      assert.deepEqual(invalidated, ['bookings:*', 'dashboard:*', 'report:*']);
    } else if (scenario === 'remove bookings failure') {
      assert.equal(res.statusCode, 409);
      assert.deepEqual(events, ['lock', 'remove bookings', 'delete', 'rollback']);
      assert.deepEqual(invalidated, []);
    } else if (scenario === 'invalid action') {
      assert.equal(res.statusCode, 400);
      assert.deepEqual(events, []);
      assert.deepEqual(invalidated, []);
    } else if (scenario === 'success') {
      assert.equal(res.statusCode, 200);
      assert.deepEqual(events, ['lock', 'unassign', 'delete', 'commit']);
      assert.deepEqual(invalidated, ['bookings:*', 'dashboard:*', 'report:*']);
    } else {
      assert.deepEqual(invalidated, []);
      if (scenario === 'missing') {
        assert.equal(res.statusCode, 404);
        assert.deepEqual(events, ['lock', 'commit']);
      } else if (scenario === 'delete failure') {
        assert.equal(res.statusCode, 409);
        assert.match(res.body.message, /vô hiệu hóa/);
        assert.deepEqual(events, ['lock', 'unassign', 'delete', 'rollback']);
      } else {
        assert.equal(res.statusCode, 500);
        assert.deepEqual(events, ['lock', 'unassign', 'rollback']);
      }
    }
  });
}

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

test('GET /users/:id/bookings returns user and their assigned bookings', async (t) => {
  const restoreModels = mockModule(modelsPath, {
    User: {
      findByPk: async (id) => ({
        id: Number(id),
        name: 'Test Staff',
        email: 'staff@example.com',
        avatar_url: null,
      }),
    },
    Booking: {
      findAll: async ({ where }) => [
        {
          id: 101,
          staff_id: where.staff_id,
          creator_name: 'Creator A',
          creator_username: 'creator_a',
          total_cost: 500,
          currency: 'MYR',
          status: 'booked',
        },
      ],
    },
    TikTokShop: {},
  });

  t.after(() => {
    restoreModels();
    delete require.cache[userControllerPath];
  });

  const { getUserBookings } = require('../src/controllers/userController');
  const req = { params: { id: '5' } };
  const res = makeResponse();
  await getUserBookings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, 5);
  assert.equal(res.body.bookings.length, 1);
  assert.equal(res.body.bookings[0].id, 101);
});

test('POST /users/:id/unassign-bookings unassigns all or selected bookings', async (t) => {
  let updateCalledWith = null;
  const restoreModels = mockModule(modelsPath, {
    User: {
      findByPk: async (id) => ({
        id: Number(id),
        name: 'Test Staff',
      }),
    },
    Booking: {
      update: async (payload, options) => {
        updateCalledWith = { payload, options };
        return [2];
      },
    },
    TikTokShop: {},
  });

  t.after(() => {
    restoreModels();
    delete require.cache[userControllerPath];
  });

  const { unassignUserBookings } = require('../src/controllers/userController');
  const req = {
    params: { id: '5' },
    body: { booking_ids: [101, 102] },
  };
  const res = makeResponse();
  await unassignUserBookings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.updatedCount, 2);
  assert.equal(updateCalledWith.payload.staff_id, null);
  assert.equal(updateCalledWith.payload.staff_name, null);
});
