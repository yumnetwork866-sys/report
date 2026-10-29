import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConnectionsPanel from './shop-analytics/ConnectionsPanel';
import useShopInventory from './shop-analytics/hooks/useShopInventory';
import useShopOAuth from './shop-analytics/hooks/useShopOAuth';
import { useI18n } from '../lib/language';

const ShopManagement = ({ appIdFilter: propAppIdFilter = null, onCountChange }) => {
  const { t, language } = useI18n();
  const [searchParams] = useSearchParams();
  const appIdFilter = propAppIdFilter || searchParams.get('app_id') || null;
  const [error, setError] = useState('');

  const inventory = useShopInventory({
    allowAll: false,
    onError: setError,
    t,
  });
  const {
    connections, loadInventory, loading, selectedShop,
  } = inventory;

  const {
    connecting, disconnectingId, disconnectShop, startConnect, startConnectCustom, toast,
  } = useShopOAuth({
    loadInventory,
    managementOnly: true,
    onError: setError,
    selectedShop,
    setSnapshot: () => {},
    t,
    videoExportOnly: false,
    videoOnly: false,
  });

  useEffect(() => {
    if (onCountChange && Array.isArray(connections)) {
      onCountChange(connections.length);
    }
  }, [connections, onCountChange]);

  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const formatDateTime = (value) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    } catch {
      return value;
    }
  };

  return (
    <div className="shop-management-container">
      {toast ? (
        <div className={`toast ${toast.type === 'error' ? 'toast--error' : 'toast--success'}`} role="status">
          {toast.message}
        </div>
      ) : null}
      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
      <ConnectionsPanel
        appIdFilter={appIdFilter}
        connecting={connecting}
        connections={connections}
        disconnectingId={disconnectingId}
        formatDateTime={formatDateTime}
        loading={loading}
        onConnect={startConnect}
        onConnectCustom={startConnectCustom}
        onDisconnect={disconnectShop}
        t={t}
      />
    </div>
  );
};

export default ShopManagement;

