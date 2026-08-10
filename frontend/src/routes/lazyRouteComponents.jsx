import { lazy } from 'react';

export const ChannelManagement = lazy(() => import('../components/ChannelManagement'));
export const ChannelReport = lazy(() => import('../components/ChannelReport'));
export const ChatbotManagement = lazy(() => import('../components/ChatbotManagement'));
export const CreatorChatPage = lazy(() => import('../components/CreatorChatPage'));
export const BookingManagement = lazy(() => import('../components/BookingManagement'));
export const Dashboard = lazy(() => import('../components/Dashboard'));
export const EmployeeTable = lazy(() => import('../components/EmployeeTable'));
export const KOCPerformance = lazy(() => import('../components/KOCPerformance'));
export const SellerAffiliatePanel = lazy(() => import('../components/SellerAffiliatePanel'));
export const ShopAnalytics = lazy(() => import('../components/ShopAnalytics'));
export const ScheduleManagement = lazy(() => import('../components/ScheduleManagement'));
export const HomePage = lazy(() => import('../components/HomePage'));
export const Login = lazy(() => import('../components/Login'));
export const PublicReport = lazy(() => import('../components/PublicReport'));

export const TermsPage = lazy(() => import('../pages/legal/TermsPage'));
export const PrivacyPage = lazy(() => import('../pages/legal/PrivacyPage'));
export const DataDeletionPage = lazy(() => import('../pages/legal/DataDeletionPage'));
