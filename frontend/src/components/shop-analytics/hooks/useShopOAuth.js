import { useCallback, useEffect, useState } from 'react';
import { disconnectTikTokShop, startTikTokShopOauth } from '../../../lib/api.js';

const useShopOAuth = ({
  loadInventory,
  managementOnly,
  onError,
  selectedShop,
  setSnapshot,
  t,
  videoExportOnly,
  videoOnly,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('shop_oauth_status');
    if (!status) return;
    setToast({
      type: status === 'success' ? 'success' : status === 'warning' ? 'info' : 'error',
      message: params.get('shop_oauth_message') || t(
        status === 'success'
          ? 'shopAnalytics.oauthSuccess'
          : status === 'warning' ? 'shopAnalytics.oauthWarning' : 'shopAnalytics.oauthError',
      ),
    });
    params.delete('shop_oauth_status');
    params.delete('shop_oauth_message');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, [t]);

  const startConnect = useCallback(async () => {
    if (disconnectingId !== null) return;
    try {
      setConnecting(true);
      onError('');
      const returnPath = managementOnly
        ? '/manage/shops'
        : videoOnly
          ? videoExportOnly ? '/shop/videos' : '/shop/videos?view=performance'
          : '/shop/analytics';
      const { authorizeUrl } = await startTikTokShopOauth(returnPath);
      if (!authorizeUrl) throw new Error(t('shopAnalytics.oauthError'));
      window.location.assign(authorizeUrl);
    } catch (error) {
      setToast({ type: 'error', message: error.message || t('shopAnalytics.oauthError') });
      setConnecting(false);
    }
  }, [disconnectingId, managementOnly, onError, t, videoExportOnly, videoOnly]);

  const startConnectCustom = useCallback(async () => {
    if (disconnectingId !== null) return;
    try {
      setConnecting(true);
      onError('');
      const { authorizeUrl } = await startTikTokShopOauth('/shop/orders', 'custom');
      if (!authorizeUrl) throw new Error(t('shopAnalytics.oauthError'));
      window.location.assign(authorizeUrl);
    } catch (error) {
      setToast({ type: 'error', message: error.message || t('shopAnalytics.oauthError') });
      setConnecting(false);
    }
  }, [disconnectingId, onError, t]);

  const disconnectShop = useCallback(async (shop) => {
    if (!window.confirm(t('shopAnalytics.disconnectShopConfirm', { name: shop.name || t('common.unknown') }))) return;
    try {
      setDisconnectingId(shop.id);
      await disconnectTikTokShop(shop.id);
      if (String(selectedShop?.id) === String(shop.id)) setSnapshot(null);
      await loadInventory();
      setToast({ type: 'success', message: t('shopAnalytics.disconnectShopSuccess', { name: shop.name || t('common.unknown') }) });
    } catch (error) {
      setToast({ type: 'error', message: error.message || t('shopAnalytics.disconnectShopError') });
    } finally {
      setDisconnectingId(null);
    }
  }, [loadInventory, selectedShop, setSnapshot, t]);

  return { connecting, disconnectingId, disconnectShop, setToast, startConnect, startConnectCustom, toast };
};

export default useShopOAuth;
