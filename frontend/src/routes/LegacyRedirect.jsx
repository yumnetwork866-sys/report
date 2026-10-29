import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const LegacyRedirect = ({ to }) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const [base, toQuery] = to.split('?');
  if (toQuery) {
    const toParams = new URLSearchParams(toQuery);
    for (const [key, value] of toParams.entries()) {
      if (!searchParams.has(key)) searchParams.set(key, value);
    }
  }
  const search = searchParams.toString();
  const target = search ? `${base}?${search}` : base;
  return <Navigate to={target} replace />;
};

export default LegacyRedirect;
