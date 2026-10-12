import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../lib/useSession';
import { hasPermission } from '../lib/session';

const authorizedLandingPages = [
  ['shop.analytics.view', '/shop/analytics'],
  [['shop.videos.library.view', 'shop.videos.performance.view'], '/shop/videos'],
  [['shop.affiliate.open.view', 'shop.affiliate.target.view', 'shop.affiliate.discovery.view', 'shop.affiliate.performance.view', 'shop.affiliate.creators.view'], '/shop/affiliate'],
  ['shop.orders.view', '/shop/orders'],
  [['shop.bookings.video.view', 'shop.bookings.product_performance.view', 'shop.bookings.by_product.view'], '/shop/bookings'],
  ['channels.dashboard.view', '/channels/overview'],
  [['channels.reports.video.view', 'channels.reports.revenue.view', 'channels.reports.statistics.view'], '/channels/reports'],
  ['channels.manage', '/channels/manage'],
  [['admin.users.manage', 'admin.roles.manage', 'admin.teams.manage'], '/manage/users'],
  ['admin.shops.manage', '/manage/shops'],
  ['admin.schedules.manage', '/manage/schedules'],
  ['admin.queues.view', '/manage/queues'],
];

const getAuthorizedLandingPage = (session) => (
  authorizedLandingPages.find(([permission]) => hasPermission(session, permission))?.[1] || '/'
);

export function RequireSession({ children }) {
  const location = useLocation();
  const session = useSession();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export function LoginRoute({ children }) {
  const session = useSession();

  if (session) {
    return <Navigate to={getAuthorizedLandingPage(session)} replace />;
  }

  return children;
}

export function RequirePermission({ permission, children, fallback = '/channels/overview' }) {
  const location = useLocation();
  const session = useSession();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasPermission(session, permission)) {
    const fallbackPermission = authorizedLandingPages.find(([, path]) => path === fallback)?.[0];
    const target = fallbackPermission && hasPermission(session, fallbackPermission)
      ? fallback
      : getAuthorizedLandingPage(session);
    return <Navigate to={target} replace />;
  }

  return children;
}
