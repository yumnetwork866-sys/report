import test from 'node:test';
import assert from 'node:assert/strict';

import { protectedRouteCards, redirectRoutes, sidebarSections } from '../src/routes/navigation.js';

test('video library and performance share one sidebar page with a legacy redirect', () => {
  const shopItems = sidebarSections
    .flatMap((section) => section.items || [])
    .find((item) => item.id === 'tiktok-shop')?.children || [];
  const videoLinks = shopItems.filter((item) => item.to === '/shop/videos');
  const videoRoute = protectedRouteCards.find((route) => route.path === '/shop/videos');

  assert.deepEqual(videoLinks.map((item) => item.to), ['/shop/videos']);
  assert.equal(videoRoute?.props?.combinedVideoTabs, true);
  assert.equal(protectedRouteCards.some((route) => route.path === '/manage/video-analytics'), false);
  assert.deepEqual(
    redirectRoutes.find((route) => route.path === '/manage/video-analytics'),
    { path: '/manage/video-analytics', to: '/shop/videos?view=performance' },
  );
});

test('shop and channel pages use consistent route namespaces', () => {
  assert.deepEqual(
    protectedRouteCards
      .map((route) => route.path)
      .filter((path) => path.startsWith('/shop/')),
    ['/shop/affiliate', '/shop/analytics', '/shop/videos', '/shop/bookings', '/shop/orders'],
  );
  assert.deepEqual(
    protectedRouteCards
      .map((route) => route.path)
      .filter((path) => path.startsWith('/channels/')),
    ['/channels/overview', '/channels/reports', '/channels/manage'],
  );
});
