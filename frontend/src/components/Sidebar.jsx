import React from 'react';
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
  '/manage/affiliate': 'koc',
  '/manage/users': 'users',
  '/manage/shops': 'shop',
  '/manage/schedules': 'schedule',
  '/manage/queues': 'schedule',
  '/manage/koc-performance': 'koc',
  '/manage/shop-analytics': 'shopAnalytics',
  '/manage/video-analytics': 'analytics',
  '/bookings': 'bookings',
  '/orders': 'orders',
  '/manage/channels': 'channels',
  '/videos': 'videos',
  '/reports': 'reports',
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

const AdminIcon = () => (
  <svg className="sidebar__platform-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5.5 20c.4-4.2 2.6-6.3 6.5-6.3s6.1 2.1 6.5 6.3h-13Z" />
  </svg>
);

const TikTokIcon = () => (
  <svg className="sidebar__platform-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g stroke="none">
      <path fill="#25f4ee" transform="translate(-.65 .45)" d="M13 3h3a5 5 0 0 0 5 5v3a8 8 0 0 1-5-1.75V16a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3Z" />
      <path fill="#fe2c55" transform="translate(.65 -.45)" d="M13 3h3a5 5 0 0 0 5 5v3a8 8 0 0 1-5-1.75V16a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3Z" />
      <path fill="#111827" d="M13 3h3a5 5 0 0 0 5 5v3a8 8 0 0 1-5-1.75V16a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3Z" />
    </g>
  </svg>
);

const Sidebar = ({ id, isCollapsed = false, onToggle, isMobile = false, onNavigate }) => {
  const { t } = useI18n();
  const location = useLocation();
  const session = useSession();
  const isAdminArea = location.pathname.startsWith('/manage/users')
    || location.pathname.startsWith('/manage/shops')
    || location.pathname.startsWith('/manage/schedules')
    || location.pathname.startsWith('/manage/queues');

  const can = (permission) => hasPermission(session, permission);
  const activeSectionTitle = isAdminArea ? 'Admin' : 'TikTok';
  const visibleSections = sidebarSections.filter((section) => section.title === activeSectionTitle);
  return (
    <aside id={id} className={`sidebar${isCollapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar__header">
        <span className="sidebar__header-label">
          {isAdminArea ? <AdminIcon /> : <TikTokIcon />}
          {activeSectionTitle}
        </span>
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={t(isMobile ? 'navigation.closeMenu' : isCollapsed ? 'navigation.expand' : 'navigation.collapse')}
          title={t(isMobile ? 'navigation.closeMenu' : isCollapsed ? 'navigation.expand' : 'navigation.collapse')}
          aria-expanded={isMobile ? undefined : !isCollapsed}
        >
          {isMobile ? <span aria-hidden="true">&times;</span> : (
            <svg className="sidebar__toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
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
                    if (!visibleChildren.length) return null;
                    return (
                      <section className="sidebar__group" key={item.id} aria-label={t(item.labelKey)}>
                        <h2 className="sidebar__group-title">{t(item.labelKey)}</h2>
                        {visibleChildren.map((child) => (
                          <NavLink
                            className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
                            key={child.to}
                            to={child.to}
                            title={t(child.labelKey)}
                            aria-label={t(child.labelKey)}
                            onClick={onNavigate}
                            end
                          >
                            <SidebarIcon name={routeIconMap[child.to]} />
                            <span className="sidebar__link-label">{t(child.labelKey)}</span>
                          </NavLink>
                        ))}
                      </section>
                    );
                  }
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
                      aria-label={t(item.labelKey)}
                      onClick={onNavigate}
                      end
                      title={t(item.labelKey)}
                    >
                      <SidebarIcon name={routeIconMap[item.to]} />
                      <span className="sidebar__link-label">{t(item.labelKey)}</span>
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
