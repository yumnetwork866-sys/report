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
    ['/channels/overview', '/channels/reports'],
  );
});

test('shop, channel and app management are consolidated into connections page with legacy redirects', () => {
  const adminItems = sidebarSections
    .find((section) => section.title === 'Admin')?.items || [];
  assert.equal(adminItems.some((item) => item.to === '/manage/connections'), true);
  assert.equal(adminItems.some((item) => item.to === '/manage/shops'), false);
  assert.equal(adminItems.some((item) => item.to === '/manage/apps'), false);

  assert.equal(protectedRouteCards.some((route) => route.path === '/manage/connections'), true);
  assert.equal(protectedRouteCards.some((route) => route.path === '/manage/shops'), false);
  assert.equal(protectedRouteCards.some((route) => route.path === '/manage/apps'), false);
  assert.equal(protectedRouteCards.some((route) => route.path === '/channels/manage'), false);

  const channelItems = sidebarSections
    .flatMap((section) => section.items || [])
    .find((item) => item.id === 'tiktok-channel')?.children || [];
  assert.equal(channelItems.some((item) => item.to.includes('channels') && item.labelKey === 'navigation.channels'), false);

  assert.deepEqual(
    redirectRoutes.find((route) => route.path === '/manage/shops'),
    { path: '/manage/shops', to: '/manage/connections?tab=shops' },
  );
  assert.deepEqual(
    redirectRoutes.find((route) => route.path === '/manage/apps'),
    { path: '/manage/apps', to: '/manage/connections?tab=apps' },
  );
  assert.deepEqual(
    redirectRoutes.find((route) => route.path === '/channels/manage'),
    { path: '/channels/manage', to: '/manage/connections?tab=channels' },
  );
});
