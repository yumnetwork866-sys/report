import React, { useState } from 'react';
import AnalyticsIcon from './AnalyticsIcon';
import { REQUIRED_SCOPE, scopesOf } from './shopAnalyticsUtils';

const ConnectionsPanel = ({
  channels = [],
  connecting,
  connections,
  disconnectingId,
  formatDateTime,
  loading,
  onConnect,
  onConnectCustom,
  onAvatarChannelChange,
  t,
  onDisconnect,
  updatingAvatarShopId = null,
}) => {
  const [expandedAuthIds, setExpandedAuthIds] = useState(() => new Set());

  const toggleExpand = (authId) => {
    setExpandedAuthIds((prev) => {
      const next = new Set(prev);
      const key = String(authId);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div id="shop-connections-panel" className="shop-analytics__tab-panel">
      <section className="section-card shop-analytics__connections-card" aria-labelledby="shop-connections-title">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title" id="shop-connections-title">{t('shopAnalytics.connections')}</h2>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="loading-dot" />
            {t('shopAnalytics.loadingConnections')}
          </div>
        ) : !connections.length ? (
          <div className="shop-analytics__connections-empty">
            <div className="shop-analytics__empty-icon" aria-hidden="true">
              <AnalyticsIcon name="connections" />
            </div>
            <strong>{t('shopAnalytics.noConnections')}</strong>
            <span>{t('shopAnalytics.noConnectionsMeta')}</span>
          </div>
        ) : (
          <div className="table-wrap shop-management__table-wrap">
            <table className="data-table shop-management__table">
              <thead>
                <tr>
                  <th>{t('shopAnalytics.shop')}</th>
                  <th>{t('shopAnalytics.videoAccountType')}</th>
                  <th>{t('shopAnalytics.status', 'Trạng thái')}</th>
                  <th>{t('shopAnalytics.avatarChannel')}</th>
                  <th>{t('shopAnalytics.connectedAt')}</th>
                  <th>{t('shopAnalytics.permissions')}</th>
                  <th className="cell-actions">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
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
                  const isExpanded = expandedAuthIds.has(String(authorization.id));

                  return (
                    <React.Fragment key={authorization.id}>
                      <tr className={`shop-management__row${isExpanded ? ' shop-management__row--expanded' : ''}`}>
                        <td>
                          {authorizationShops.length === 0 ? (
                            <div className="shop-management__cell-identity">
                              <span className="shop-management__shop-avatar" aria-hidden="true">
                                <AnalyticsIcon name="shop" />
                              </span>
                              <div>
                                <strong>{t('shopAnalytics.shopConnection')}</strong>
                                <span className="shop-management__cell-sub">—</span>
                              </div>
                            </div>
                          ) : (
                            <div className="shop-management__shops-col">
                              {authorizationShops.map((shop) => (
                                <div className="shop-management__cell-identity" key={shop.id || shop.platform_shop_id || shop.name}>
                                  <span className="shop-management__shop-avatar" aria-hidden="true">
                                    {shop.avatar_url || shop.avatar_large_url ? (
                                      <img src={shop.avatar_url || shop.avatar_large_url} alt="" />
                                    ) : <AnalyticsIcon name="shop" />}
                                  </span>
                                  <div>
                                    <strong>{shop.name || t('common.unknown')}</strong>
                                    <span className="shop-management__cell-sub">
                                      {[shop.code, shop.region].filter(Boolean).join(' · ') || t('shopAnalytics.connected')}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`chip ${isCustom ? 'chip--blue' : 'chip--purple'}`}>
                            {isCustom ? t('shopAnalytics.customOrderApp') : t('shopAnalytics.partnerApp')}
                          </span>
                        </td>
                        <td>
                          <span className={`chip ${expired || missingScope ? 'chip--amber' : 'chip--positive'}`}>
                            {expired
                              ? t('shopAnalytics.tokenExpired')
                              : missingScope
                                ? t('shopAnalytics.missingScope')
                                : t('shopAnalytics.connected')}
                          </span>
                        </td>
                        <td>
                          {authorizationShops.length === 0 ? (
                            <span className="cell-muted">—</span>
                          ) : (
                            <div className="shop-management__channels-col">
                              {authorizationShops.map((shop) => (
                                <select
                                  key={shop.id || shop.name}
                                  className="shop-management__avatar-select"
                                  aria-label={`${t('shopAnalytics.avatarChannel')}: ${shop.name || t('common.unknown')}`}
                                  disabled={String(updatingAvatarShopId) === String(shop.id)}
                                  value={shop.avatar_channel_id || ''}
                                  onChange={(event) => onAvatarChannelChange(shop.id, event.target.value || null)}
                                >
                                  <option value="">{t('shopAnalytics.avatarChannelAuto')}</option>
                                  {channels.filter((channel) => channel.platform === 'tiktok').map((channel) => (
                                    <option value={channel.id} key={channel.id}>
                                      {channel.display_name
                                        ? `${channel.display_name} · @${channel.username}`
                                        : `@${channel.username}`}
                                    </option>
                                  ))}
                                </select>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="cell-date">
                          {formatDateTime(authorization.connected_at)}
                        </td>
                        <td>
                          <button
                            className={`shop-management__perm-trigger${isExpanded ? ' is-expanded' : ''}`}
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpand(authorization.id)}
                            title={isExpanded ? t('navigation.collapse', 'Thu gọn') : t('navigation.expand', 'Xem quyền')}
                          >
                            <span className={`chip ${missingScope ? 'chip--amber' : ''}`}>
                              {scopes.length} {t('shopAnalytics.permissions')}
                            </span>
                            <span className={`sidebar__chevron${isExpanded ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
                          </button>
                        </td>
                        <td className="cell-actions">
                          <div className="actions actions--inline shop-management__actions-col">
                            {expired || missingScope ? (
                              <button
                                className="button button--small button--ghost"
                                type="button"
                                disabled={connecting || disconnectingId !== null}
                                onClick={isCustom ? onConnectCustom : onConnect}
                              >
                                {t('shopAnalytics.reconnect')}
                              </button>
                            ) : null}
                            {authorizationShops.map((shop) => (
                              <button
                                key={shop.id || shop.name}
                                className="button button--small button--danger shop-management__disconnect"
                                type="button"
                                disabled={connecting || disconnectingId !== null || updatingAvatarShopId !== null}
                                onClick={() => onDisconnect(shop)}
                              >
                                {String(disconnectingId) === String(shop.id)
                                  ? t('common.loading')
                                  : t('shopAnalytics.disconnect')}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="shop-management__expanded-row">
                          <td colSpan="7">
                            <div className="shop-management__expanded-content">
                              <div className="shop-management__expanded-header">
                                <div className="shop-management__expanded-title">
                                  <span className="shop-management__expanded-icon" aria-hidden="true">
                                    <AnalyticsIcon name="connections" />
                                  </span>
                                  <strong>{t('shopAnalytics.permissions')} ({scopes.length})</strong>
                                </div>
                                {missingScope ? (
                                  <span className="chip chip--amber">
                                    {t('shopAnalytics.missing')}: {requiredScope}
                                  </span>
                                ) : null}
                              </div>
                              <div className="shop-management__permissions-grid">
                                {scopes.length ? (
                                  scopes.map((scope) => {
                                    const isRequired = scope === requiredScope;
                                    return (
                                      <span
                                        className={`chip ${isRequired ? 'chip--positive' : 'chip--subtle'}`}
                                        key={scope}
                                        title={isRequired ? `${scope} (${t('common.required', 'Bắt buộc')})` : scope}
                                      >
                                        {isRequired ? '✓ ' : ''}{scope}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="shop-management__permissions-empty">
                                    {t('shopAnalytics.noPermissions')}
                                  </span>
                                )}
                              </div>
                              {authorization.last_sync_error ? (
                                <div className="shop-management__expanded-error" role="alert">
                                  <strong>{t('shopAnalytics.syncFailed')}:</strong> {authorization.last_sync_error}
                                </div>
                              ) : null}
                              {authorization.refresh_token_expires_at ? (
                                <div className="shop-management__expanded-meta">
                                  <span>{t('shopAnalytics.tokenExpiresAt', 'Hạn token')}: {formatDateTime(authorization.refresh_token_expires_at)}</span>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default ConnectionsPanel;
