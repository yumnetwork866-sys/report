import test from 'node:test';
import assert from 'node:assert/strict';

import { protectedRouteCards, redirectRoutes, sidebarSections } from '../src/routes/navigation.js';

test('video library and performance share one sidebar page with a legacy redirect', () => {
  const shopItems = sidebarSections
    .flatMap((section) => section.items || [])
    .find((item) => item.id === 'tiktok-shop')?.children || [];
  const videoLinks = shopItems.filter((item) => ['/videos', '/manage/video-analytics'].includes(item.to));
  const videoRoute = protectedRouteCards.find((route) => route.path === '/videos');

  assert.deepEqual(videoLinks.map((item) => item.to), ['/videos']);
  assert.equal(videoRoute?.props?.combinedVideoTabs, true);
  assert.equal(protectedRouteCards.some((route) => route.path === '/manage/video-analytics'), false);
  assert.deepEqual(
    redirectRoutes.find((route) => route.path === '/manage/video-analytics'),
    { path: '/manage/video-analytics', to: '/videos?view=performance' },
  );
});
