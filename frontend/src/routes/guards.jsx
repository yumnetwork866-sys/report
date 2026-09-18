import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../lib/useSession';
import { hasPermission } from '../lib/session';

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
    return <Navigate to="/shop/analytics" replace />;
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
    return <Navigate to={fallback} replace />;
  }

  return children;
}
