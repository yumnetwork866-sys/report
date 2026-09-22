import AnalyticsIcon from './AnalyticsIcon';
import { REQUIRED_SCOPE, scopesOf } from './shopAnalyticsUtils';

const ConnectionsPanel = ({
  connecting,
  connections,
  disconnectingId,
  formatDateTime,
  loading,
  onConnect,
  onConnectCustom,
  t,
  onDisconnect,
}) => (
  <div id="shop-connections-panel" className="shop-analytics__tab-panel">
    <section className="section-card shop-analytics__connections-card" aria-labelledby="shop-connections-title">
      <div className="section-card__header">
        <div>
          <h2 className="section-card__title" id="shop-connections-title">{t('shopAnalytics.connections')}</h2>
        </div>
        <div className="section-card__actions">
          <button
            className="button button--small button--secondary"
            type="button"
            disabled={connecting || disconnectingId !== null}
            onClick={onConnectCustom}
          >
            <AnalyticsIcon name="shop" />
            {t('shopAnalytics.connectCustomApp')}
          </button>
          <button
            className="button button--small button--primary"
            type="button"
            disabled={connecting || disconnectingId !== null}
            onClick={onConnect}
          >
            <AnalyticsIcon name="shop" />
            {t('shopAnalytics.connectPartnerApp')}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="empty-state">
          <span className="loading-dot" />
          {t('shopAnalytics.loadingConnections')}
        </div>
      ) : (
        <div className="shop-analytics__connections">
          {connections.map((authorization) => {
            const scopes = scopesOf(authorization);
            const isCustom = authorization.app_type === 'custom';
            const requiredScope = isCustom ? 'seller.order.info' : REQUIRED_SCOPE;
            const expired = Boolean(
              authorization.refresh_token_expires_at
                && new Date(authorization.refresh_token_expires_at).getTime() <= Date.now(),
            );
            const missingScope = !scopes.includes(requiredScope);
            const authorizationShops = Array.isArray(authorization.shops) ? authorization.shops : [];
            return (
              <article className="shop-analytics__connection" key={authorization.id}>
                <div className="shop-analytics__connection-head">
                  <div className="shop-analytics__connection-identity">
                    <span className="shop-analytics__shop-mark" aria-hidden="true">
                      <AnalyticsIcon name="shop" />
                    </span>
                    <div>
                      <strong>{authorizationShops.map((shop) => shop.name).join(', ') || t('shopAnalytics.shopConnection')}</strong>
                      <span>{t('shopAnalytics.connectedAt')}: {formatDateTime(authorization.connected_at)}</span>
                    </div>
                  </div>
                  <div className="shop-analytics__connection-badges">
                    <span className={`chip ${isCustom ? 'chip--blue' : 'chip--purple'}`}>
                      {isCustom ? t('shopAnalytics.customOrderApp') : t('shopAnalytics.partnerApp')}
                    </span>
                    <span className={`chip ${expired || missingScope ? 'chip--amber' : 'chip--positive'}`}>
                      {expired
                        ? t('shopAnalytics.tokenExpired')
                        : missingScope
                          ? t('shopAnalytics.missingScope')
                          : t('shopAnalytics.connected')}
                    </span>
                  </div>
                </div>
                <div className="shop-management__permissions-block">
                  <span className="shop-management__permissions-label">{t('shopAnalytics.permissions')}</span>
                  <div className="shop-management__permissions">
                    {scopes.length ? scopes.map((scope) => (
                      <span className={`chip ${scope === requiredScope ? 'chip--positive' : ''}`} key={scope}>
                        {scope}
                      </span>
                    )) : <span className="shop-management__permissions-empty">{t('shopAnalytics.noPermissions')}</span>}
                  </div>
                </div>
                {authorizationShops.length ? (
                  <div className="shop-management__shop-list" aria-label={t('shopAnalytics.shopInventory')}>
                    {authorizationShops.map((shop) => (
                      <div className="shop-management__shop-row" key={shop.id || shop.platform_shop_id || shop.name}>
                        <span className="shop-management__shop-avatar" aria-hidden="true">
                          <AnalyticsIcon name="shop" />
                        </span>
                        <div>
                          <strong>{shop.name || t('common.unknown')}</strong>
                          <span>{[shop.code, shop.region].filter(Boolean).join(' · ') || t('shopAnalytics.connected')}</span>
                        </div>
                        <button
                          className="button button--small button--danger shop-management__disconnect"
                          type="button"
                          disabled={connecting || disconnectingId !== null}
                          onClick={() => onDisconnect(shop)}
                        >
                          {String(disconnectingId) === String(shop.id)
                            ? t('common.loading')
                            : t('shopAnalytics.disconnect')}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {missingScope ? (
                  <div className="shop-analytics__scope-list">
                    <span className="chip chip--amber">{t('shopAnalytics.missing')}: {requiredScope}</span>
                  </div>
                ) : null}
                {authorization.last_sync_error ? (
                  <p className="shop-analytics__connection-error">{authorization.last_sync_error}</p>
                ) : null}
                {expired || missingScope ? (
                  <div className="shop-analytics__connection-actions">
                    <button
                      className="button button--small button--ghost"
                      type="button"
                      disabled={connecting || disconnectingId !== null}
                      onClick={isCustom ? onConnectCustom : onConnect}
                    >
                      {t('shopAnalytics.reconnect')}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
          {!connections.length ? (
            <div className="shop-analytics__connections-empty">
              <div className="shop-analytics__empty-icon" aria-hidden="true">
                <AnalyticsIcon name="connections" />
              </div>
              <strong>{t('shopAnalytics.noConnections')}</strong>
              <span>{t('shopAnalytics.noConnectionsMeta')}</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  </div>
);

export default ConnectionsPanel;
