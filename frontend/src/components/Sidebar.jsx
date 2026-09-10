import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { hasPermission } from '../lib/session';
import { useSession } from '../lib/useSession';
import { sidebarSections } from '../routes/navigation';
import { useI18n } from '../lib/language';

const sidebarIcons = {
  dashboard: [
    'M4 13h7V4H4v9Z',
    'M13 20h7V4h-7v16Z',
    'M4 20h7v-5H4v5Z',
  ],
  users: [
    'M16 11a4 4 0 1 0-8 0',
    'M3.5 20a6.5 6.5 0 0 1 13 0',
    'M17.5 13.5a3 3 0 0 1 3 3V20',
  ],
  koc: [
    'M12 4l2.3 4.7 5.2.8-3.8 3.7.9 5.3L12 16l-4.6 2.5.9-5.3-3.8-3.7 5.2-.8L12 4Z',
  ],
  analytics: [
    'M5 20V10',
    'M12 20V4',
    'M19 20v-7',
    'M3 20h18',
  ],
  bookings: [
    'M7 4v3',
    'M17 4v3',
    'M5 8h14',
    'M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z',
  ],
  channels: [
    'M6 7h12',
    'M8 12h8',
    'M10 17h4',
    'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-4-3H6a2 2 0 0 1-2-2V5Z',
  ],
  videos: [
    'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    'M10 9l5 3-5 3V9Z',
  ],
  reports: [
    'M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
    'M15 3v5h5',
    'M8 13h8',
    'M8 17h5',
  ],
  chat: [
    'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  ],
  settings: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    'M4 12h2',
    'M18 12h2',
    'M12 4v2',
    'M12 18v2',
    'M5.6 5.6 7 7',
    'M18.4 5.6l-1.4 1.4',
    'M5.6 18.4l1.4-1.4',
    'M18.4 18.4l-1.4-1.4',
  ],
  schedule: [
    'M7 3v3',
    'M17 3v3',
    'M5 7h14',
    'M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    'M9 12h2v2H9z',
    'M14 12h2v2h-2z',
  ],
  orders: [
    'M6 3h12l1 18H5L6 3Z',
    'M9 7a3 3 0 0 0 6 0',
    'M8 13h8',
    'M8 17h5',
  ],
  shop: [
    'M4 9h16',
    'M5 9l1-5h12l1 5',
    'M6 9v11h12V9',
    'M9 20v-6h6v6',
  ],
  shopAnalytics: [
    'M4 9h16',
    'M5 9l1-5h12l1 5',
    'M6 9v11h12V9',
    'M8.5 16.5 11 14l2 1.5 3-4',
  ],
};

const routeIconMap = {
  '/dashboard': 'dashboard',
  '/channel-reports': 'reports',
  '/manage/affiliate': 'analytics',
  '/manage/creator-chat': 'chat',
  '/manage/users': 'users',
  '/manage/shops': 'shop',
  '/manage/schedules': 'schedule',
  '/manage/queues': 'schedule',
  '/manage/koc-performance': 'koc',
  '/manage/shop-analytics': 'shopAnalytics',
  '/manage/video-analytics': 'videos',
  '/bookings': 'bookings',
  '/orders': 'orders',
  '/manage/channels': 'channels',
  '/videos': 'videos',
  '/reports': 'reports',
  '/chatbot/dashboard': 'dashboard',
  '/chatbot/chat': 'chat',
  '/chatbot/chat-setting': 'settings',
  '/chatbot/orders': 'orders',

};

const SidebarIcon = ({ name }) => {
  const paths = sidebarIcons[name] || sidebarIcons.dashboard;

  return (
    <svg className="sidebar__link-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
};

const CollapseIcon = ({ isCollapsed }) => (
  <svg className="sidebar__toggle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={isCollapsed ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
  </svg>
);

const PlatformIcon = ({ type }) => (
  <svg className="sidebar__platform-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {type === 'admin' ? (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 20c.4-4.2 2.6-6.3 6.5-6.3s6.1 2.1 6.5 6.3h-13Z" />
      </>
    ) : type === 'facebook' ? (
      <path d="M14 21v-8h2.8l.4-3H14V8.1c0-.9.3-1.6 1.7-1.6h1.8V3.8c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5V10H7.6v3h2.9v8H14Z" />
    ) : (
      <>
        <path d="M13.2 3v10.1a3.2 3.2 0 1 1-2.5-3.1v3a1.3 1.3 0 1 0 .6 1.1V3h1.9Z" />
        <path d="M13.2 3c.4 2.1 1.7 3.5 4 4v2.5a7.3 7.3 0 0 1-4-1.8V3Z" />
      </>
    )}
  </svg>
);

const Sidebar = ({ isCollapsed, onToggle }) => {
  const { t } = useI18n();
  const location = useLocation();
  const session = useSession();
  const isAdminArea = location.pathname.startsWith('/manage/users')
    || location.pathname.startsWith('/manage/shops')
    || location.pathname.startsWith('/manage/schedules')
    || location.pathname.startsWith('/manage/queues')
    || location.pathname.startsWith('/chatbot/chat-setting');
  const isFacebookArea = location.pathname.startsWith('/chatbot');

  const isTikTokShopArea = [
    '/manage/affiliate',
    '/manage/koc-performance',
    '/manage/shop-analytics',
    '/manage/video-analytics',
    '/bookings',
    '/orders',
    '/reports',
  ].some((prefix) => location.pathname.startsWith(prefix));
  const can = (permission) => hasPermission(session, permission);
  const activeSectionTitle = isAdminArea ? 'Admin' : isFacebookArea ? 'Facebook' : 'TikTok';
  const visibleSections = sidebarSections.filter((section) => section.title === activeSectionTitle);
  const activeTikTokGroup = isTikTokShopArea ? 'tiktok-shop' : 'tiktok-channel';
  const [openGroups, setOpenGroups] = useState({ [activeTikTokGroup]: true });

  useEffect(() => {
    if (activeSectionTitle !== 'TikTok') return;
    setOpenGroups((current) => ({ ...current, [activeTikTokGroup]: true }));
  }, [activeSectionTitle, activeTikTokGroup]);

  const toggleGroup = (groupId) => {
    if (isCollapsed) {
      onToggle();
      setOpenGroups((current) => ({ ...current, [groupId]: true }));
      return;
    }
    setOpenGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  return (
    <aside className={`sidebar${isCollapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar__header">
        {!isCollapsed ? (
          <span className="sidebar__header-label">
            <PlatformIcon type={isAdminArea ? 'admin' : isFacebookArea ? 'facebook' : 'tiktok'} />
            {activeSectionTitle}
          </span>
        ) : null}
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={isCollapsed ? t('navigation.expand') : t('navigation.collapse')}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? t('navigation.expand') : t('navigation.collapse')}
        >
          <CollapseIcon isCollapsed={isCollapsed} />
        </button>
      </div>
      <nav className="sidebar__nav" aria-label={t('navigation.workspace')}>
        {visibleSections.map((section) => (
          <div className="sidebar__section" key={section.title}>
            <div className="sidebar__section-links">
              {section.items
                .filter((item) => can(item.permission))
                .map((item) => {
                  if (item.children) {
                    const visibleChildren = item.children.filter((child) => can(child.permission));
                    const isGroupActive = visibleChildren.some((child) => location.pathname.startsWith(child.to));
                    const isOpen = Boolean(openGroups[item.id]);
                    return (
                      <div className="sidebar__expandable" key={item.id}>
                        <button
                          className={`sidebar__link sidebar__link--button${isGroupActive ? ' sidebar__link--group-active' : ''}`}
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => toggleGroup(item.id)}
                          title={t(item.labelKey)}
                        >
                          <span className="sidebar__group-label">
                            <SidebarIcon name={item.icon} />
                            {!isCollapsed ? <span className="sidebar__link-label">{t(item.labelKey)}</span> : null}
                          </span>
                          {!isCollapsed ? (
                            <span className={`sidebar__chevron${isOpen ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
                          ) : null}
                        </button>
                        {isOpen && !isCollapsed ? (
                          <div className="sidebar__subnav">
                            {visibleChildren.map((child) => (
                              <NavLink
                                className={({ isActive }) => `sidebar__sublink${isActive ? ' sidebar__sublink--active' : ''}`}
                                key={child.to}
                                to={child.to}
                              >
                                <span>{t(child.labelKey)}</span>
                              </NavLink>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
                      title={t(item.labelKey)}
                    >
                      <SidebarIcon name={routeIconMap[item.to]} />
                      {!isCollapsed ? <span className="sidebar__link-label">{t(item.labelKey)}</span> : null}
                    </NavLink>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
