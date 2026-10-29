import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layers, Store, Tv } from 'lucide-react';
import { useSession } from '../lib/useSession';
import { hasPermission } from '../lib/session';
import { useI18n } from '../lib/language';
import ShopManagement from './ShopManagement';
import ChannelManagement from './ChannelManagement';
import AppManagement from './AppManagement';

const NORMALIZE_TAB_MAP = {
  shop: 'shops',
  shops: 'shops',
  channel: 'channels',
  channels: 'channels',
  app: 'apps',
  apps: 'apps',
};

const ConnectionManagement = () => {
  const { t } = useI18n();
  const session = useSession();
  const [searchParams, setSearchParams] = useSearchParams();

  const [shopCount, setShopCount] = useState(null);
  const [channelCount, setChannelCount] = useState(null);
  const [appCount, setAppCount] = useState(null);

  const canManageShops = hasPermission(session, 'admin.shops.manage');
  const canManageChannels = hasPermission(session, 'channels.manage');
  const canManageApps = hasPermission(session, ['app.manage', 'admin.shops.manage']);

  const availableTabs = useMemo(() => {
    const list = [];
    if (canManageShops) {
      list.push({
        key: 'shops',
        label: t('connections.tabs.shops') || 'Shop',
        icon: Store,
        count: shopCount,
      });
    }
    if (canManageChannels) {
      list.push({
        key: 'channels',
        label: t('connections.tabs.channels') || 'Kênh',
        icon: Tv,
        count: channelCount,
      });
    }
    if (canManageApps) {
      list.push({
        key: 'apps',
        label: t('connections.tabs.apps') || 'App',
        icon: Layers,
        count: appCount,
      });
    }
    return list;
  }, [canManageShops, canManageChannels, canManageApps, t, shopCount, channelCount, appCount]);

  const rawTab = (searchParams.get('tab') || '').toLowerCase();
  const normalizedRequestedTab = NORMALIZE_TAB_MAP[rawTab] || rawTab;

  const activeTab = useMemo(() => {
    if (availableTabs.some((tab) => tab.key === normalizedRequestedTab)) {
      return normalizedRequestedTab;
    }
    return availableTabs[0]?.key || 'shops';
  }, [availableTabs, normalizedRequestedTab]);

  const handleTabChange = (nextTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    }, { replace: true });
  };

  return (
    <div className="page connection-management-page">
      {availableTabs.length > 1 ? (
        <div className="connection-tabs" role="tablist" aria-label={t('connections.title') || 'Quản lý kết nối'}>
          {availableTabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleTabChange(tab.key)}
              >
                <Icon aria-hidden="true" />
                <span>{tab.label}</span>
                {tab.count !== null && tab.count !== undefined ? (
                  <span className="connection-tab__badge">{tab.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <main className="connection-tab-content" role="tabpanel">
        {activeTab === 'shops' && canManageShops ? (
          <ShopManagement onCountChange={setShopCount} />
        ) : null}
        {activeTab === 'channels' && canManageChannels ? (
          <ChannelManagement embedded={true} onCountChange={setChannelCount} />
        ) : null}
        {activeTab === 'apps' && canManageApps ? (
          <AppManagement embedded={true} onCountChange={setAppCount} />
        ) : null}
      </main>
    </div>
  );
};

export default ConnectionManagement;

