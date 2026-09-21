import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchTikTokShopConnections, fetchTikTokShops } from '../../../lib/api.js';
import {
  getStoredSelectedShopId,
  resolveSelectedShopId,
  setStoredSelectedShopId,
  subscribeSelectedShop,
} from '../../../lib/shopSelection.js';
import { REQUIRED_SCOPE, scopesOf } from '../shopAnalyticsUtils.js';

const useShopInventory = ({ onError, t }) => {
  const [shops, setShops] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(getStoredSelectedShopId);
  const [loading, setLoading] = useState(true);

  const loadInventory = useCallback(async (signal) => {
    setLoading(true);
    onError('');
    try {
      const [loadedShops, loadedConnections] = await Promise.all([
        fetchTikTokShops(signal),
        fetchTikTokShopConnections(signal),
      ]);
      setShops(Array.isArray(loadedShops) ? loadedShops : []);
      setConnections(Array.isArray(loadedConnections) ? loadedConnections : []);
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
      const resolved = resolveSelectedShopId(shops, current || getStoredSelectedShopId());
      if (resolved && resolved !== getStoredSelectedShopId()) setStoredSelectedShopId(resolved);
      return resolved;
    });
  }, [shops]);

  useEffect(() => subscribeSelectedShop((event) => {
    const nextId = event?.detail ?? getStoredSelectedShopId();
    if (!nextId) return;
    setSelectedShopId((current) => {
      if (String(nextId) === String(current)) return current;
      if (shops.length && !shops.some((shop) => String(shop.id) === String(nextId))) return current;
      return String(nextId);
    });
  }), [shops]);

  const changeSelectedShop = useCallback((nextShopId) => {
    if (String(nextShopId) === String(selectedShopId)) return;
    setSelectedShopId(nextShopId);
    setStoredSelectedShopId(nextShopId);
  }, [selectedShopId]);

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
    changeSelectedShop,
    connections,
    loadInventory,
    loading,
    missingAnalyticsScope,
    selectedShop,
    selectedShopId,
    shops,
    tokenExpired,
  };
};

export default useShopInventory;
