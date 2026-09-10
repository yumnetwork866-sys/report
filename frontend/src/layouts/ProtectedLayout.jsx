import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AiChatBubble from '../components/AiChatBubble';
import Sidebar from '../components/Sidebar';
import { RequireSession } from '../routes/guards';

const ProtectedLayout = () => {
  const location = useLocation();
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
        <Sidebar isCollapsed={isSidebarCollapsed} onToggle={toggleSidebar} />
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
