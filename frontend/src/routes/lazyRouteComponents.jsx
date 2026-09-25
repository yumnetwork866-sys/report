import { lazy } from 'react';
import { clearDynamicImportRecovery, recoverDynamicImportError } from './lazyRouteRecovery';

const lazyWithReload = (loader) => lazy(async () => {
  try {
    const loadedModule = await loader();
    clearDynamicImportRecovery();
    return loadedModule;
  } catch (error) {
    if (recoverDynamicImportError(error)) return new Promise(() => {});
    throw error;
  }
});

export const ChannelManagement = lazyWithReload(() => import('../components/ChannelManagement'));
export const ChannelReport = lazyWithReload(() => import('../components/ChannelReport'));
export const BookingManagement = lazyWithReload(() => import('../components/BookingManagement'));
export const Dashboard = lazyWithReload(() => import('../components/Dashboard'));
export const EmployeeTable = lazyWithReload(() => import('../components/EmployeeTable'));
export const KOCPerformance = lazyWithReload(() => import('../components/KOCPerformance'));
export const SellerAffiliatePanel = lazyWithReload(() => import('../components/SellerAffiliatePanel'));
export const ShopAnalytics = lazyWithReload(() => import('../components/ShopAnalytics'));
export const ScheduleManagement = lazyWithReload(() => import('../components/ScheduleManagement'));
export const QueueManagement = lazyWithReload(() => import('../components/QueueManagement'));
export const HomePage = lazyWithReload(() => import('../components/HomePage'));
export const Login = lazyWithReload(() => import('../components/Login'));
export const PublicReport = lazyWithReload(() => import('../components/PublicReport'));

export const TermsPage = lazyWithReload(() => import('../pages/legal/TermsPage'));
export const PrivacyPage = lazyWithReload(() => import('../pages/legal/PrivacyPage'));
export const DataDeletionPage = lazyWithReload(() => import('../pages/legal/DataDeletionPage'));
