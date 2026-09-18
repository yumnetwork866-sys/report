import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const LegacyRedirect = ({ to }) => {
  const location = useLocation();
  const target = to.includes('?') ? to : `${to}${location.search}`;
  return <Navigate to={target} replace />;
};

export default LegacyRedirect;
