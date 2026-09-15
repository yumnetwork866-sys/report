import assert from 'node:assert/strict';
import test from 'node:test';
import { cachedThumbnail, thumbnailFrom } from '../src/lib/bookingVideoThumbnails.js';

test('thumbnailFrom extracts thumbnail from video, snapshot, or raw_metrics', () => {
  assert.equal(thumbnailFrom({ thumbnail_url: 'https://p16.tiktokcdn.com/thumb.jpg' }), 'https://p16.tiktokcdn.com/thumb.jpg');
  assert.equal(thumbnailFrom({}, { raw_metrics: { video: { cover_image_url: 'https://p16.tiktokcdn.com/cover.jpg' } } }), 'https://p16.tiktokcdn.com/cover.jpg');
  assert.equal(thumbnailFrom({}, { raw_metrics: { list: { thumbnail_url: 'https://p16.tiktokcdn.com/list-thumb.jpg' } } }), 'https://p16.tiktokcdn.com/list-thumb.jpg');
  assert.equal(thumbnailFrom(null, null), null);
});

test('cachedThumbnail deduplicates concurrent calls and caches results', async () => {
  let callCount = 0;
  const loadFn = async () => {
    callCount += 1;
    return { thumbnail_url: 'https://p16.tiktokcdn.com/oembed.jpg' };
  };

  const p1 = cachedThumbnail('test-key', loadFn);
  const p2 = cachedThumbnail('test-key', loadFn);

  assert.equal(p1, p2);
  const res1 = await p1;
  const res2 = await p2;

  assert.equal(res1.thumbnail_url, 'https://p16.tiktokcdn.com/oembed.jpg');
  assert.equal(res2.thumbnail_url, 'https://p16.tiktokcdn.com/oembed.jpg');
  assert.equal(callCount, 1);
});
