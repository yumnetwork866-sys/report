import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchChannels,
  fetchTikTokShopConnections,
  fetchTikTokShops,
  updateTikTokShopAvatarChannel,
} from '../../../lib/api.js';
import {
  getStoredSelectedShopId,
  resolveSelectedShopId,
  setStoredSelectedShopId,
  subscribeSelectedShop,
} from '../../../lib/shopSelection.js';
import { REQUIRED_SCOPE, scopesOf } from '../shopAnalyticsUtils.js';

const useShopInventory = ({ allowAll = false, onError, t }) => {
  const [shops, setShops] = useState([]);
  const [connections, setConnections] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(() => {
    const stored = getStoredSelectedShopId();
    if (allowAll) return stored || 'all';
    return stored === 'all' ? '' : stored;
  });
  const [loading, setLoading] = useState(true);
  const [updatingAvatarShopId, setUpdatingAvatarShopId] = useState(null);

  const loadInventory = useCallback(async (signal) => {
    setLoading(true);
    onError('');
    try {
      const [loadedShops, loadedConnections, loadedChannels] = await Promise.all([
        fetchTikTokShops(signal),
        fetchTikTokShopConnections(signal),
        fetchChannels(signal),
      ]);
      setShops(Array.isArray(loadedShops) ? loadedShops : []);
      setConnections(Array.isArray(loadedConnections) ? loadedConnections : []);
      setChannels(Array.isArray(loadedChannels) ? loadedChannels : []);
    } catch (error) {
      if (error.name !== 'AbortError') onError(error.message || t('shopAnalytics.loadError'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [onError, t]);

  useEffect(() => {
    const controller = new AbortController();
    loadInventory(controller.signal);
    return () => controller.abort();
  }, [loadInventory]);

  useEffect(() => {
    if (!shops.length) return;
    setSelectedShopId((current) => {
      const stored = getStoredSelectedShopId();
      const preferred = current || stored;
      if (allowAll) {
        if (!preferred || preferred === 'all') return 'all';
        return shops.some((shop) => String(shop.id) === String(preferred))
          ? String(preferred)
          : 'all';
      }
      return resolveSelectedShopId(shops, preferred === 'all' ? '' : preferred);
    });
  }, [allowAll, shops]);

  useEffect(() => subscribeSelectedShop((event) => {
    const stored = event?.detail ?? getStoredSelectedShopId();
    const nextId = allowAll ? (stored || 'all') : (stored === 'all' ? '' : stored);
    setSelectedShopId((current) => {
      if (String(nextId) === String(current)) return current;
      if (allowAll && nextId === 'all') return 'all';
      if (shops.length && !shops.some((shop) => String(shop.id) === String(nextId))) {
        return allowAll ? 'all' : resolveSelectedShopId(shops, '');
      }
      return String(nextId);
    });
  }), [allowAll, shops]);

  const changeSelectedShop = useCallback((nextShopId) => {
    if (String(nextShopId) === String(selectedShopId)) return;
    const normalized = String(nextShopId);
    setSelectedShopId(normalized);
    setStoredSelectedShopId(normalized);
  }, [selectedShopId]);

  const changeShopAvatarChannel = useCallback(async (shopId, channelId) => {
    setUpdatingAvatarShopId(shopId);
    onError('');
    try {
      await updateTikTokShopAvatarChannel(shopId, channelId ? Number(channelId) : null);
      await loadInventory();
    } catch (error) {
      onError(error.message || t('shopAnalytics.avatarChannelUpdateError'));
    } finally {
      setUpdatingAvatarShopId(null);
    }
  }, [loadInventory, onError, t]);

  const selectedShop = useMemo(
    () => shops.find((shop) => String(shop.id) === String(selectedShopId)) || null,
    [selectedShopId, shops],
  );
  const selectedAuthorization = useMemo(() => connections.find(
    (authorization) => String(authorization.id) === String(selectedShop?.authorization?.id),
  ) || selectedShop?.authorization || null, [connections, selectedShop]);
  const selectedScopes = useMemo(() => scopesOf(selectedAuthorization), [selectedAuthorization]);
  const missingAnalyticsScope = Boolean(selectedShop) && !selectedScopes.includes(REQUIRED_SCOPE);
  const tokenExpired = Boolean(
    selectedAuthorization?.refresh_token_expires_at
      && new Date(selectedAuthorization.refresh_token_expires_at).getTime() <= Date.now(),
  );
  const attentionCount = useMemo(() => connections.filter((authorization) => {
    const expired = Boolean(
      authorization.refresh_token_expires_at
        && new Date(authorization.refresh_token_expires_at).getTime() <= Date.now(),
    );
    return expired || !scopesOf(authorization).includes(REQUIRED_SCOPE);
  }).length, [connections]);

  return {
    attentionCount,
    changeShopAvatarChannel,
    changeSelectedShop,
    channels,
    connections,
    loadInventory,
    loading,
    missingAnalyticsScope,
    selectedShop,
    selectedShopId,
    shops,
    tokenExpired,
    updatingAvatarShopId,
  };
};

export default useShopInventory;
