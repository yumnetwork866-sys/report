import React from 'react';
import { Navigate } from 'react-router-dom';
import { LoginRoute, RequirePermission } from './guards';
import {
  BookingManagement,
  ChannelManagement,
  ChannelReport,
  ChatbotManagement,
  CreatorChatPage,
  Dashboard,
  DataDeletionPage,
  EmployeeTable,
  HomePage,
  KOCPerformance,
  Login,
  PrivacyPage,
  PublicReport,
  ScheduleManagement,
  SellerAffiliatePanel,
  ShopAnalytics,
  TermsPage,
} from './lazyRouteComponents';
import { protectedRouteCards, redirectRoutes } from './navigation';

const componentMap = {
  Dashboard,
  EmployeeTable,
  KOCPerformance,
  SellerAffiliatePanel,
  ShopAnalytics,
  ScheduleManagement,
  BookingManagement,
  ChannelManagement,
  ChannelReport,
  ChatbotManagement,
  CreatorChatPage,
};

export const publicRouteConfig = [
  { path: '/', element: <HomePage /> },
  {
    path: '/login',
    element: (
      <LoginRoute>
        <Login />
      </LoginRoute>
    ),
  },
  { path: '/terms', element: <TermsPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/data-deletion', element: <DataDeletionPage /> },
  { path: '/shared/reports/:token', element: <PublicReport /> },
];

export const protectedRouteConfig = protectedRouteCards.map(({ path, component, props, permission }) => ({
  path,
  element: permission
    ? (
      <RequirePermission permission={permission}>
        {React.createElement(componentMap[component], props)}
      </RequirePermission>
    )
    : React.createElement(componentMap[component], props),
}));

export const protectedRedirectConfig = redirectRoutes.map(({ path, to }) => ({
  path,
  element: <Navigate to={to} replace />,
}));
