import React, { useMemo, useState } from 'react';
import AnalyticsIcon from './AnalyticsIcon';
import { connectionAppType, uniqueShopAuthorizations } from '../../lib/shopConnections';
import { REQUIRED_SCOPE, scopesOf } from './shopAnalyticsUtils';

const ConnectionsPanel = ({
  appIdFilter = null,
  connecting,
  connections = [],
  shops = [],
  disconnectingId,
  formatDateTime,
  loading,
  onConnect,
  onConnectCustom: _onConnectCustom,
  t,
  onDisconnect,
  hideTitle = true,
}) => {
  const [expandedShopIds, setExpandedShopIds] = useState(() => new Set());

  // Group by Shop (1 Shop = 1 Row)
  const shopRows = useMemo(() => {
    const list = [];
    const processedShopIds = new Set();
    const linkedAuthIds = new Set();

    if (Array.isArray(shops)) {
      for (const shop of shops) {
        if (!shop) continue;
        processedShopIds.add(String(shop.id));

        const connectedApps = [];
        for (const authorization of uniqueShopAuthorizations(shop)) {
          linkedAuthIds.add(String(authorization.id));
          const isCustom = connectionAppType(authorization) === 'custom';
          connectedApps.push({
            auth: authorization,
            app: authorization.app || null,
            role: isCustom ? 'custom' : 'partner',
            label: isCustom ? t('shopAnalytics.customOrderApp', 'Custom OMS') : t('shopAnalytics.partnerApp', 'Partner App'),
            appName: authorization.app?.name || (isCustom ? t('shopAnalytics.customOrderApp', 'TikTok OMS App') : t('shopAnalytics.partnerApp', 'TikTok Shop Partner')),
            appKey: authorization.app?.app_key || null,
            region: authorization.app?.region || shop.region || null,
            connectedAt: authorization.connected_at,
            expired: Boolean(
              authorization.refresh_token_expires_at
                && new Date(authorization.refresh_token_expires_at).getTime() <= Date.now(),
            ),
            scopes: scopesOf(authorization),
            lastSyncError: authorization.last_sync_error,
          });
        }

        if (Array.isArray(connections)) {
          for (const conn of connections) {
            const hasThisShop = (conn.shops || []).some((s) => String(s.id) === String(shop.id))
              || (conn.order_shops || []).some((s) => String(s.id) === String(shop.id));
            if (hasThisShop && !linkedAuthIds.has(String(conn.id))) {
              linkedAuthIds.add(String(conn.id));
              const isCustom = connectionAppType(conn) === 'custom';
              connectedApps.push({
                auth: conn,
                app: conn.app || null,
                role: isCustom ? 'custom' : 'partner',
                label: isCustom ? t('shopAnalytics.customOrderApp', 'Custom OMS') : t('shopAnalytics.partnerApp', 'Partner App'),
                appName: conn.app?.name || (isCustom ? 'Custom OMS' : 'TikTok Shop Partner'),
                appKey: conn.app?.app_key || null,
                region: conn.app?.region || shop.region || null,
                connectedAt: conn.connected_at,
                expired: Boolean(
                  conn.refresh_token_expires_at
                    && new Date(conn.refresh_token_expires_at).getTime() <= Date.now(),
                ),
                scopes: scopesOf(conn),
                lastSyncError: conn.last_sync_error,
              });
            }
          }
        }

        list.push({
          id: String(shop.id),
          shop,
          name: shop.name || t('common.unknown', 'Không xác định'),
          code: shop.code || '',
          region: shop.region || '',
          avatarUrl: shop.avatar_url || shop.avatar_large_url || shop.avatar_channel?.avatar_url || '',
          connectedApps,
          scopeAudit: shop.scope_audit || null,
        });
      }
    }

    // Include any authorizations from connections not yet linked to an existing shop
    if (Array.isArray(connections)) {
      for (const conn of connections) {
        if (!linkedAuthIds.has(String(conn.id))) {
          const connShops = [...(conn.shops || []), ...(conn.order_shops || [])];
          if (connShops.length > 0) {
            for (const cShop of connShops) {
              if (!processedShopIds.has(String(cShop.id))) {
                processedShopIds.add(String(cShop.id));
                const isCustom = connectionAppType(conn) === 'custom';
                list.push({
                  id: String(cShop.id),
                  shop: cShop,
                  name: cShop.name || t('common.unknown', 'Không xác định'),
                  code: cShop.code || '',
                  region: cShop.region || '',
                  avatarUrl: cShop.avatar_url || cShop.avatar_large_url || '',
                  connectedApps: [{
                    auth: conn,
                    app: conn.app || null,
                    role: isCustom ? 'custom' : 'partner',
                    label: isCustom ? t('shopAnalytics.customOrderApp', 'Custom OMS') : t('shopAnalytics.partnerApp', 'Partner App'),
                    appName: conn.app?.name || (isCustom ? 'Custom OMS' : 'TikTok Shop Partner'),
                    appKey: conn.app?.app_key || null,
                    region: conn.app?.region || cShop.region || null,
                    connectedAt: conn.connected_at,
                    expired: Boolean(
                      conn.refresh_token_expires_at
                        && new Date(conn.refresh_token_expires_at).getTime() <= Date.now(),
                    ),
                    scopes: scopesOf(conn),
                    lastSyncError: conn.last_sync_error,
                  }],
                  scopeAudit: cShop.scope_audit || null,
                });
              }
            }
          } else {
            // Unlinked / orphan connection
            const isCustom = connectionAppType(conn) === 'custom';
            list.push({
              id: `orphan-${conn.id}`,
              shop: null,
              isOrphan: true,
              name: t('shopAnalytics.unlinkedConnection', 'Kết nối chưa liên kết Shop'),
              code: '',
              region: conn.app?.region || '',
              avatarUrl: '',
              connectedApps: [{
                auth: conn,
                app: conn.app || null,
                role: isCustom ? 'custom' : 'partner',
                label: isCustom ? t('shopAnalytics.customOrderApp', 'Custom OMS') : t('shopAnalytics.partnerApp', 'Partner App'),
                appName: conn.app?.name || (isCustom ? 'Custom OMS' : 'TikTok Shop Partner'),
                appKey: conn.app?.app_key || null,
                region: conn.app?.region || null,
                connectedAt: conn.connected_at,
                expired: Boolean(
                  conn.refresh_token_expires_at
                    && new Date(conn.refresh_token_expires_at).getTime() <= Date.now(),
                ),
                scopes: scopesOf(conn),
                lastSyncError: conn.last_sync_error,
              }],
              scopeAudit: null,
            });
          }
        }
      }
    }

    // Filter by appIdFilter if provided
    if (appIdFilter) {
      return list.filter((row) =>
        row.connectedApps.some((ca) => String(ca.auth?.app_id || ca.app?.id || '') === String(appIdFilter))
      );
    }

    return list;
  }, [shops, connections, appIdFilter, t]);

  const toggleExpand = (shopId) => {
    setExpandedShopIds((prev) => {
      const next = new Set(prev);
      const key = String(shopId);
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
      <section
        className="section-card shop-analytics__connections-card"
        {...(hideTitle ? { 'aria-label': t('shopAnalytics.connections') } : { 'aria-labelledby': 'shop-connections-title' })}
      >
        {!hideTitle ? (
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title" id="shop-connections-title">{t('shopAnalytics.connections')}</h2>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="empty-state">
            <span className="loading-dot" />
            {t('shopAnalytics.loadingConnections')}
          </div>
        ) : !shopRows.length ? (
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
                  <th>{t('shopAnalytics.shop', 'Cửa hàng')}</th>
                  <th>{t('shopAnalytics.connectedApps', 'Các App đang kết nối')}</th>
                  <th>{t('shopAnalytics.status', 'Trạng thái')}</th>
                  <th>{t('shopAnalytics.connectedAt', 'Ngày kết nối')}</th>
                  <th className="cell-actions">{t('common.actions', 'Thao tác')}</th>
                </tr>
              </thead>
              <tbody>
                {shopRows.map((row) => {
                  const isExpanded = expandedShopIds.has(String(row.id));
                  const allUniqueScopes = Array.from(new Set(
                    row.connectedApps.flatMap((ca) => ca.scopes || [])
                  ));
                  const hasExpired = row.connectedApps.some((ca) => ca.expired);

                  // Latest connection date
                  const connectedDates = row.connectedApps
                    .map((ca) => (ca.connectedAt ? new Date(ca.connectedAt).getTime() : 0))
                    .filter((ts) => ts > 0);
                  const latestConnectedAt = connectedDates.length ? Math.max(...connectedDates) : null;

                  const scopeAudit = row.scopeAudit;
                  const missingScopes = Array.isArray(scopeAudit?.missing_scopes) ? scopeAudit.missing_scopes : [];
                  const hasMissingScopes = missingScopes.length > 0;
                  const legacyMissingScope = !allUniqueScopes.includes(REQUIRED_SCOPE) && !allUniqueScopes.includes('seller.order.info');

                  const scopeProviders = {};
                  for (const ca of row.connectedApps) {
                    for (const s of (ca.scopes || [])) {
                      if (!scopeProviders[s]) scopeProviders[s] = [];
                      scopeProviders[s].push(ca.appName);
                    }
                  }

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className={`shop-management__row${isExpanded ? ' shop-management__row--expanded' : ''}`}
                        onClick={(e) => {
                          if (e.target.closest('button, a, input, select, textarea')) return;
                          toggleExpand(row.id);
                        }}
                      >
                        {/* Column 1: Shop */}
                        <td>
                          <div className="shop-management__cell-identity">
                            <span
                              className={`sidebar__chevron${isExpanded ? ' sidebar__chevron--open' : ''}`}
                              aria-hidden="true"
                              style={{
                                margin: '0 2px 0 0',
                                flexShrink: 0,
                                color: isExpanded ? 'var(--color-primary, #2563eb)' : '#94a3b8',
                              }}
                            />
                            <span className="shop-management__shop-avatar" aria-hidden="true">
                              {row.avatarUrl ? (
                                <img src={row.avatarUrl} alt="" />
                              ) : <AnalyticsIcon name="shop" />}
                            </span>
                            <div>
                              <strong>{row.name}</strong>
                              <span className="shop-management__cell-sub">
                                {[row.code, row.region].filter(Boolean).join(' · ') || (row.isOrphan ? '—' : t('shopAnalytics.connected'))}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Connected Apps (Multiple Apps per Shop) */}
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '240px' }}>
                            {row.connectedApps.length === 0 ? (
                              <span style={{ color: 'var(--color-muted)', fontSize: '12px' }}>—</span>
                            ) : (
                              row.connectedApps.map((ca, idx) => (
                                <span
                                  key={ca.auth?.id || idx}
                                  className={`chip ${ca.role === 'custom' ? 'chip--blue' : 'chip--purple'}`}
                                  style={{ fontSize: '11px', padding: '2px 8px', fontWeight: 500 }}
                                  title={`${ca.appName} (${ca.label}) - Key: ${ca.appKey || 'N/A'}`}
                                >
                                  {ca.appName}
                                </span>
                              ))
                            )}
                          </div>
                        </td>

                        {/* Column 3: Status & Missing Scopes */}
                        <td>
                          {hasExpired ? (
                            <span className="chip chip--amber">
                              {t('shopAnalytics.tokenExpired', 'Hết hạn token')}
                            </span>
                          ) : scopeAudit ? (
                            !hasMissingScopes ? (
                              <span className="chip chip--positive" title="Shop đã cấp đủ tất cả các scopes cốt lõi">
                                ✓ {t('shopAnalytics.fullyAuthorized', 'Đủ scopes')} ({allUniqueScopes.length})
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <span className="chip chip--amber" title={missingScopes.map((m) => `${m.scope}: ${m.name}`).join('\n')}>
                                  {t('shopAnalytics.missingScopesCount', `Thiếu ${missingScopes.length} scopes`)}
                                </span>
                                <div style={{ fontSize: '11px', color: '#b45309', maxWidth: '170px', lineHeight: 1.25 }}>
                                  {missingScopes.slice(0, 2).map((m) => m.name || m.scope).join(', ')}
                                  {missingScopes.length > 2 ? ` (+${missingScopes.length - 2})` : ''}
                                </div>
                              </div>
                            )
                          ) : (
                            <span className={`chip ${legacyMissingScope ? 'chip--amber' : 'chip--positive'}`}>
                              {legacyMissingScope ? t('shopAnalytics.missingScope', 'Thiếu quyền') : t('shopAnalytics.connected', 'Đã kết nối')}
                            </span>
                          )}
                        </td>

                        {/* Column 4: Connected At */}
                        <td className="cell-date">
                          {formatDateTime(latestConnectedAt)}
                        </td>

                        {/* Column 5: Actions */}
                        <td className="cell-actions">
                          <div className="actions actions--inline shop-management__actions-col">
                            {hasExpired ? (
                              <button
                                className="button button--small button--ghost"
                                type="button"
                                disabled={connecting || disconnectingId !== null}
                                onClick={() => {
                                  const expiredApp = row.connectedApps.find((ca) => ca.expired);
                                  if (expiredApp?.auth?.app_id) {
                                    onConnect({
                                      appId: expiredApp.auth.app_id,
                                      appType: expiredApp.auth.app_type,
                                      region: expiredApp.region,
                                    });
                                  } else {
                                    onConnect();
                                  }
                                }}
                              >
                                {t('shopAnalytics.reconnect', 'Kết nối lại')}
                              </button>
                            ) : null}

                            {row.shop ? (
                              <button
                                key={row.shop.id || row.shop.name}
                                className="button button--small button--danger shop-management__disconnect"
                                type="button"
                                disabled={connecting || disconnectingId !== null}
                                onClick={() => onDisconnect(row.shop)}
                              >
                                {String(disconnectingId) === String(row.shop.id)
                                  ? t('common.loading')
                                  : t('shopAnalytics.disconnect', 'Ngắt kết nối')}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {isExpanded ? (
                        <tr className="shop-management__expanded-row">
                          <td colSpan="5">
                            <div className="shop-management__expanded-content">
                              {/* Sync Error Alert if any App has an error */}
                              {row.connectedApps.some((ca) => ca.lastSyncError) ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {row.connectedApps.filter((ca) => ca.lastSyncError).map((ca, idx) => (
                                    <div
                                      key={ca.auth?.id || idx}
                                      className="shop-management__expanded-error"
                                      style={{ padding: '8px 12px', fontSize: '12px' }}
                                      role="alert"
                                    >
                                      <strong>{ca.appName} ({t('shopAnalytics.syncFailed', 'Lỗi đồng bộ')}):</strong> {ca.lastSyncError}
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {/* Missing Scopes List */}
                              {hasMissingScopes ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {missingScopes.map((m) => (
                                    <div
                                      key={m.scope}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '8px',
                                        padding: '8px 12px',
                                        background: 'var(--color-bg-subtle, #f8fafc)',
                                        borderRadius: '8px',
                                        border: '1px solid var(--color-border, #e2e8f0)',
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <code style={{ fontSize: '11px', fontWeight: 600, color: '#b45309' }}>{m.scope}</code>
                                        <strong style={{ fontSize: '12px' }}>{m.name}</strong>
                                        {Array.isArray(m.affectedJobs) && m.affectedJobs.length ? (
                                          <span style={{ fontSize: '11px', color: '#b45309', fontStyle: 'italic' }}>
                                            — Ảnh hưởng: {m.affectedJobs.join(', ')}
                                          </span>
                                        ) : null}
                                      </div>
                                        {Array.isArray(m.suggestedApps) && m.suggestedApps.length > 0 ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {m.suggestedApps.map((sApp) => (
                                              <button
                                                key={sApp.id}
                                                type="button"
                                                className="button button--small"
                                                style={{
                                                  fontSize: '11px',
                                                  padding: '3px 10px',
                                                  height: 'auto',
                                                  lineHeight: 1.3,
                                                  background: 'var(--color-primary-light, #eff6ff)',
                                                  color: 'var(--color-primary, #2563eb)',
                                                  border: '1px solid #bfdbfe',
                                                  borderRadius: '999px',
                                                  fontWeight: 500,
                                                  whiteSpace: 'nowrap',
                                                  cursor: 'pointer',
                                                }}
                                                disabled={connecting || disconnectingId !== null}
                                                title={`Cấp scope "${m.scope}" bằng cách kết nối ${sApp.name}`}
                                                onClick={() => onConnect({ appId: sApp.id, appType: sApp.appType, region: sApp.region })}
                                              >
                                                {sApp.name} ↗
                                              </button>
                                            ))}
                                          </div>
                                        ) : (
                                          <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                            Chưa có App nào hỗ trợ
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}

                              {/* Overall Scopes Summary */}
                              <div>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-soft)', display: 'block', marginBottom: '6px' }}>
                                  {t('shopAnalytics.commonScopes', 'Scope chung')}:
                                </span>
                                <div className="shop-management__permissions-grid">
                                  {allUniqueScopes.length ? (
                                    allUniqueScopes.map((scope) => {
                                      const providers = scopeProviders[scope];
                                      const tooltip = providers?.length ? `${scope} (cung cấp bởi: ${providers.join(', ')})` : scope;
                                      return (
                                        <span
                                          className="chip chip--positive"
                                          key={scope}
                                          title={tooltip}
                                        >
                                          ✓ {scope}
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="shop-management__permissions-empty">
                                      {t('shopAnalytics.noPermissions', 'Chưa có quyền nào')}
                                    </span>
                                  )}
                                </div>
                              </div>
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
