const test = require('node:test');
const assert = require('node:assert/strict');
const { recordCreatorContact } = require('../src/services/tiktokCreatorContactHistoryService');

test('sending a creator invitation still records contact history', async () => {
  let created;
  const contactedAt = new Date('2026-11-03T00:00:00Z');
  const model = {
    findOne: async () => null,
    create: async (values) => { created = values; return values; },
  };
  await recordCreatorContact(7, { creator_open_id: 'open-1', username: '@Creator.One' }, 'invite', { contactedAt, model });
  assert.equal(created.shop_id, 7);
  assert.equal(created.username, 'creator.one');
  assert.equal(created.creator_open_id, 'open-1');
  assert.equal(created.last_invited_at, contactedAt);
});

test('sending another invitation updates existing history without removing the creator identity', async () => {
  let saved = false;
  const existing = { creator_open_id: 'open-1', async save() { saved = true; return this; } };
  const contactedAt = new Date('2026-11-03T00:00:00Z');
  const model = { findOne: async () => existing };
  await recordCreatorContact(7, { username: 'creator.one' }, 'invite', { contactedAt, model });
  assert.equal(saved, true);
  assert.equal(existing.creator_open_id, 'open-1');
  assert.equal(existing.last_invited_at, contactedAt);
});
