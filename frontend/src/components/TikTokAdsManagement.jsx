import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  deleteTikTokAdsAuthorization,
  fetchTikTokAdsAuthorizations,
  fetchTikTokAdsAuthUrl,
  removeTikTokAdvertiser,
  syncTikTokAdsAuthorization,
} from '../lib/api';

const TikTokAdsManagement = ({ embedded = false, onCountChange }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [authorizations, setAuthorizations] = useState([]);
  const [totalAdvertisers, setTotalAdvertisers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncingId, setSyncingId] = useState(null);

  // Accordion state: set of expanded authorization IDs (always closed by default)
  const [expandedAuthIds, setExpandedAuthIds] = useState(() => new Set());

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState(null);

  const loadData = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchTikTokAdsAuthorizations(signal);
      if (signal?.aborted) return;
      const list = Array.isArray(data?.authorizations) ? data.authorizations : [];
      const total = Number(data?.totalAdvertisers || 0);
      setAuthorizations(list);
      setTotalAdvertisers(total);

      if (onCountChange) {
        onCountChange(total);
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error('[TikTokAdsManagement] Load error:', err);
      setError(err?.message || 'Không thể tải danh sách tài khoản TikTok Ads.');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [onCountChange]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  // Handle OAuth callback params from URL
  useEffect(() => {
    if (searchParams.get('ads_connected') === 'true') {
      setNotice('Kết nối tài khoản TikTok Ads thành công.');
      const next = new URLSearchParams(searchParams);
      next.delete('ads_connected');
      setSearchParams(next, { replace: true });
      const timer = setTimeout(() => setNotice(''), 4000);
      return () => clearTimeout(timer);
    }
    if (searchParams.get('ads_error')) {
      setError(decodeURIComponent(searchParams.get('ads_error')));
      const next = new URLSearchParams(searchParams);
      next.delete('ads_error');
      setSearchParams(next, { replace: true });
    }
    return undefined;
  }, [searchParams, setSearchParams]);

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

  const handleConnectNew = async () => {
    try {
      setActionLoading(true);
      setError('');
      const res = await fetchTikTokAdsAuthUrl('manage_connections');
      if (res?.url) {
        window.location.href = res.url;
      } else {
        throw new Error('Không thể tạo liên kết xác thực TikTok Business OAuth.');
      }
    } catch (err) {
      setError(err?.message || 'Lỗi khi bắt đầu kết nối TikTok Ads.');
      setActionLoading(false);
    }
  };

  const handleSyncAuth = async (authId, e) => {
    if (e) e.stopPropagation();
    try {
      setSyncingId(authId);
      setError('');
      await syncTikTokAdsAuthorization(authId);
      setNotice('Đã đồng bộ danh sách tài khoản từ TikTok Business.');
      await loadData();
      const timer = setTimeout(() => setNotice(''), 3000);
      return () => clearTimeout(timer);
    } catch (err) {
      setError(err?.message || 'Không thể đồng bộ danh sách tài khoản.');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDeleteAuth = (auth, e) => {
    if (e) e.stopPropagation();
    setConfirmDialog({
      title: 'Hủy kết nối ứng dụng',
      message: `Hủy kết nối ứng dụng (${auth.appId || auth.id})? Tất cả ${auth.advertiserCount || 0} tài khoản quảng cáo liên kết sẽ bị ngắt kết nối.`,
      confirmLabel: 'Hủy kết nối',
      onConfirm: async () => {
        try {
          setActionLoading(true);
          await deleteTikTokAdsAuthorization(auth.id);
          setConfirmDialog(null);
          setNotice('Đã hủy kết nối ứng dụng thành công.');
          await loadData();
        } catch (err) {
          setError(err?.message || 'Lỗi khi hủy kết nối ứng dụng.');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleRemoveAccount = (authId, adv) => {
    setConfirmDialog({
      title: 'Gỡ tài khoản quảng cáo',
      message: `Bạn có chắc muốn gỡ tài khoản "${adv.name || adv.id}" (${adv.id}) khỏi hệ thống?`,
      confirmLabel: 'Gỡ tài khoản',
      onConfirm: async () => {
        try {
          setActionLoading(true);
          await removeTikTokAdvertiser(authId, adv.id);
          setConfirmDialog(null);
          setNotice(`Đã gỡ tài khoản ${adv.name || adv.id}.`);
          await loadData();
        } catch (err) {
          setError(err?.message || 'Lỗi khi gỡ tài khoản quảng cáo.');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const formatShortDate = (val) => {
    if (!val) return '—';
    try {
      return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(val));
    } catch {
      return String(val);
    }
  };

  // Filtered authorizations & auto-expanded when searching
  const filteredAuthorizations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return authorizations;

    return authorizations
      .map((auth) => {
        const matchingAdvs = (auth.advertisers || []).filter((adv) =>
          adv.name?.toLowerCase().includes(q) ||
          adv.id?.toLowerCase().includes(q) ||
          auth.appId?.toLowerCase().includes(q)
        );
        const authMatches = auth.appId?.toLowerCase().includes(q);
        if (authMatches || matchingAdvs.length > 0) {
          return {
            ...auth,
            advertisers: authMatches ? auth.advertisers : matchingAdvs,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [authorizations, searchQuery]);

  // When search query is entered, auto expand matching authorizations; when cleared, collapse
  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedAuthIds(new Set(filteredAuthorizations.map((a) => String(a.id))));
    } else {
      setExpandedAuthIds(new Set());
    }
  }, [searchQuery, filteredAuthorizations]);

  return (
    <div className={`tiktok-ads-management ${embedded ? 'embedded' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Notifications */}
      {notice ? (
        <div className="alert alert--success" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      ) : null}

      {error ? (
        <div className="alert alert--error" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Top Header Card */}
      <div
        className="section-card"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg, 10px)',
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Megaphone size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Kết nối TikTok Ads
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
              <span>Tổng cộng: <strong style={{ color: 'var(--color-text)' }}>{totalAdvertisers}</strong> tài khoản</span>
              <span>·</span>
              <span><strong style={{ color: 'var(--color-text)' }}>{authorizations.length}</strong> ứng dụng đã liên kết</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Quick Search */}
          {authorizations.length > 0 ? (
            <div style={{ position: 'relative', width: 240 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Tìm kiếm tài khoản hoặc ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: 34,
                  padding: '0 10px 0 30px',
                  fontSize: '0.8125rem',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn--primary"
            onClick={handleConnectNew}
            disabled={actionLoading}
            style={{ fontSize: '0.8125rem', height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} />
            <span>Kết nối tài khoản</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state empty-state--compact" style={{ padding: 40 }}>
          <span className="loading-dot" />
          <span>Đang tải kết nối TikTok Ads...</span>
        </div>
      ) : null}

      {!loading && authorizations.length === 0 ? (
        <div
          className="empty-state"
          style={{
            padding: 48,
            textAlign: 'center',
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg, 10px)',
            border: '1px dashed var(--color-border)',
          }}
        >
          <Megaphone size={36} style={{ color: 'var(--color-muted)', margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Chưa có tài khoản TikTok Ads nào được kết nối</h3>
          <p style={{ margin: '0 0 16px', color: 'var(--color-muted)', fontSize: '0.8125rem' }}>
            Ủy quyền tài khoản TikTok Business để theo dõi chi phí quảng cáo và ROAS trực tiếp.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleConnectNew}
            disabled={actionLoading}
            style={{ fontSize: '0.8125rem' }}
          >
            <Plus size={15} />
            <span>Kết nối ngay</span>
          </button>
        </div>
      ) : null}

      {/* Hierarchical Accordion View: Application -> Ad Accounts */}
      {!loading && authorizations.length > 0 ? (
        <div
          className="section-card"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg, 10px)',
            overflow: 'hidden',
          }}
        >
          <div
            className="table-wrap"
            style={{
              margin: 0,
              border: 'none',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              width: '100%',
            }}
          >
            <table
              className="data-table"
              style={{
                width: '100%',
                minWidth: 760,
                tableLayout: 'fixed',
                borderCollapse: 'collapse',
              }}
            >
              <colgroup>
                <col style={{ width: 48 }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ width: 48, textAlign: 'center', padding: '12px 8px' }}></th>
                  <th style={{ padding: '12px 14px' }}>Ứng dụng / Kết nối</th>
                  <th style={{ padding: '12px 14px' }}>Tài khoản quảng cáo</th>
                  <th style={{ padding: '12px 14px' }}>Thời gian kết nối</th>
                  <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuthorizations.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)' }}>
                      Không tìm thấy tài khoản phù hợp với tìm kiếm.
                    </td>
                  </tr>
                ) : null}

                {filteredAuthorizations.map((auth, idx) => {
                  const isExpanded = expandedAuthIds.has(String(auth.id));
                  const advCount = auth.advertisers?.length || 0;

                  return (
                    <React.Fragment key={auth.id}>
                      {/* Parent Row (Application) */}
                      <tr
                        style={{
                          cursor: 'pointer',
                          background: isExpanded ? 'var(--color-surface-hover, rgba(0,0,0,0.02))' : 'inherit',
                          borderBottom: isExpanded ? 'none' : '1px solid var(--color-border)',
                          fontWeight: 500,
                        }}
                        onClick={() => toggleExpand(auth.id)}
                      >
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: isExpanded ? 'var(--color-primary, #2563eb)' : 'var(--color-muted)',
                              transition: 'transform 0.15s ease',
                            }}
                          >
                            {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                background: 'rgba(239, 68, 68, 0.08)',
                                color: '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              #{idx + 1}
                            </div>
                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                              <strong
                                style={{
                                  fontSize: '0.875rem',
                                  color: 'var(--color-text)',
                                  display: 'block',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                TikTok Business App
                              </strong>
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--color-muted)',
                                  fontFamily: 'monospace',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                App ID: {auth.appId || '—'}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '3px 10px',
                              borderRadius: 999,
                              background: 'var(--color-surface-hover, rgba(0,0,0,0.06))',
                              color: 'var(--color-text)',
                              border: '1px solid var(--color-border)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {advCount} tài khoản
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                            {formatShortDate(auth.createdAt || auth.updatedAt)}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '3px 10px',
                              borderRadius: 999,
                              background: 'rgba(22, 163, 74, 0.1)',
                              color: '#16a34a',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                            Đã kết nối
                          </span>
                        </td>

                        <td style={{ textAlign: 'right', padding: '12px 16px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn--secondary"
                              style={{ height: 28, padding: '0 9px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                              onClick={(e) => handleSyncAuth(auth.id, e)}
                              disabled={syncingId === auth.id || actionLoading}
                              title="Đồng bộ danh sách tài khoản từ TikTok"
                            >
                              <RefreshCw size={12} className={syncingId === auth.id ? 'spin' : ''} />
                              <span>{syncingId === auth.id ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
                            </button>

                            <button
                              type="button"
                              className="btn btn--subtle"
                              style={{ height: 28, padding: '0 8px', fontSize: '0.75rem', color: '#ef4444' }}
                              onClick={(e) => handleDeleteAuth(auth, e)}
                              disabled={actionLoading}
                              title="Hủy kết nối toàn bộ ứng dụng này"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Dropdown Child Row: Accounts Sub-table */}
                      {isExpanded ? (
                        <tr style={{ background: 'var(--color-surface-hover, rgba(0,0,0,0.015))' }}>
                          <td colSpan={6} style={{ padding: '10px 16px 14px', borderBottom: '1px solid var(--color-border)' }}>
                            <div
                              style={{
                                background: 'var(--color-surface, #fff)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 8,
                                overflow: 'hidden',
                                boxShadow: 'var(--shadow-xs)',
                              }}
                            >
                              <div
                                style={{
                                  overflowX: 'auto',
                                  WebkitOverflowScrolling: 'touch',
                                  width: '100%',
                                }}
                              >
                                <table
                                  className="data-table"
                                  style={{
                                    width: '100%',
                                    minWidth: 640,
                                    margin: 0,
                                    tableLayout: 'fixed',
                                    borderCollapse: 'collapse',
                                  }}
                                >
                                  <colgroup>
                                    <col style={{ width: 48 }} />
                                    <col style={{ width: '34%' }} />
                                    <col style={{ width: '28%' }} />
                                    <col style={{ width: '20%' }} />
                                    <col style={{ width: '18%' }} />
                                  </colgroup>
                                  <thead>
                                    <tr style={{ background: 'var(--color-surface-hover, rgba(0,0,0,0.03))' }}>
                                      <th style={{ width: 48, textAlign: 'center', fontSize: '0.75rem', padding: '10px 8px' }}>#</th>
                                      <th style={{ fontSize: '0.75rem', padding: '10px 14px' }}>Tên tài khoản</th>
                                      <th style={{ textAlign: 'center', fontSize: '0.75rem', padding: '10px 14px' }}>Advertiser ID</th>
                                      <th style={{ textAlign: 'center', fontSize: '0.75rem', padding: '10px 14px' }}>Trạng thái</th>
                                      <th style={{ textAlign: 'right', fontSize: '0.75rem', padding: '10px 14px' }}>Thao tác</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {advCount === 0 ? (
                                      <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--color-muted)', fontSize: '0.8125rem' }}>
                                          Không tìm thấy tài khoản quảng cáo được ủy quyền cho kết nối này.
                                        </td>
                                      </tr>
                                    ) : null}

                                    {auth.advertisers.map((adv, aIdx) => (
                                      <tr key={adv.id} style={{ borderBottom: aIdx === advCount - 1 ? 'none' : '1px solid var(--color-border)' }}>
                                        <td style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.75rem', padding: '10px 8px' }}>
                                          {aIdx + 1}
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                          <div
                                            style={{
                                              fontWeight: 600,
                                              color: 'var(--color-text)',
                                              fontSize: '0.8125rem',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                            }}
                                            title={adv.name || `Tài khoản ${adv.id}`}
                                          >
                                            {adv.name || `Tài khoản ${adv.id}`}
                                          </div>
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                                          <code
                                            style={{
                                              fontSize: '0.75rem',
                                              fontFamily: 'monospace',
                                              padding: '2px 8px',
                                              borderRadius: 4,
                                              background: 'var(--color-surface-hover, rgba(0,0,0,0.04))',
                                              border: '1px solid var(--color-border)',
                                              display: 'inline-block',
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            {adv.id}
                                          </code>
                                        </td>
                                        <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                                          <span
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 4,
                                              fontSize: '0.75rem',
                                              color: '#16a34a',
                                              fontWeight: 500,
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                                            Đang hoạt động
                                          </span>
                                        </td>
                                        <td style={{ textAlign: 'right', padding: '10px 14px' }}>
                                          <button
                                            type="button"
                                            className="btn btn--subtle"
                                            style={{ padding: '3px 6px', color: '#ef4444' }}
                                            onClick={() => handleRemoveAccount(auth.id, adv)}
                                            disabled={actionLoading}
                                            title="Gỡ tài khoản này"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
        </div>
      ) : null}

      {/* Confirmation Dialog */}
      {confirmDialog ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setConfirmDialog(null)}
        >
          <div
            style={{
              background: 'var(--color-surface, #fff)',
              borderRadius: 12,
              padding: 22,
              maxWidth: 420,
              width: '100%',
              boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.2))',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: 'var(--color-text)' }}>
              {confirmDialog.title}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.5 }}>
              {confirmDialog.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ fontSize: '0.8125rem' }}
                onClick={() => setConfirmDialog(null)}
                disabled={actionLoading}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn--danger"
                style={{ background: '#ef4444', color: '#fff', fontSize: '0.8125rem' }}
                onClick={confirmDialog.onConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? 'Đang xử lý...' : (confirmDialog.confirmLabel || 'Xác nhận')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TikTokAdsManagement;
