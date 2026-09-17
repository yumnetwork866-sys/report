import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AiChatBubble from '../components/AiChatBubble';
import { useI18n } from '../lib/language';
import Sidebar from '../components/Sidebar';
import { RequireSession } from '../routes/guards';

const ProtectedLayout = () => {
  const location = useLocation();
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 599px)').matches);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 599px)');
    const update = () => { setIsMobile(media.matches); setIsMenuOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => { setIsMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isMobile || !isMenuOpen) { dialog?.close(); return; }
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; dialog.close(); };
  }, [isMobile, isMenuOpen]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem('sidebar-collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;
      window.localStorage.setItem('sidebar-collapsed', String(nextValue));
      return nextValue;
    });
  };

  return (
    <RequireSession>
      <div className={`app-shell__layout${isSidebarCollapsed ? ' app-shell__layout--sidebar-collapsed' : ''}`}>
        {isMobile ? <button type="button" className="sidebar-menu-button"
          onClick={() => setIsMenuOpen(true)}
          aria-label={t('navigation.openMenu')}
          title={t('navigation.openMenu')}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button> : null}
        {isMobile ? (
            <dialog ref={dialogRef} id="mobile-navigation" className="sidebar-drawer"
              aria-label={t('navigation.workspace')} onCancel={() => setIsMenuOpen(false)}
              onClose={() => setIsMenuOpen(false)}
              onClick={(event) => { if (event.target === event.currentTarget) setIsMenuOpen(false); }}>
              <Sidebar isMobile onToggle={() => setIsMenuOpen(false)} onNavigate={() => setIsMenuOpen(false)} />
            </dialog>
        ) : <Sidebar id="desktop-navigation" isCollapsed={isSidebarCollapsed} onToggle={toggleSidebar} />}
        <main className="app-shell__content">
          <div className="app-shell__content-frame">
            <div className="route-transition" key={location.pathname}>
              <Outlet />
            </div>
          </div>
        </main>
        <AiChatBubble />
      </div>
    </RequireSession>
  );
};

export default ProtectedLayout;
