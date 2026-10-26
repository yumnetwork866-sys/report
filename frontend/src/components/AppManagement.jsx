import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Edit2,
  Eye,
  EyeOff,
  Globe,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import '../styles/pages/admin.css';
import {
  createTikTokApp,
  deleteTikTokApp,
  fetchTikTokAppSecret,
  fetchTikTokApps,
  toggleTikTokAppStatus,
  updateTikTokApp,
} from '../lib/api';
import { useI18n } from '../lib/language';

const REGION_DATA = [
  { code: 'AUTO', name: 'Tự nhận diện khi kết nối Shop', flag: '🌐' },
  { code: 'ALL', name: 'Dùng chung tất cả các vùng (Global)', flag: '🌏' },
  { code: 'VN', name: 'Việt Nam', flag: '🇻🇳' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'TH', name: 'Thái Lan', flag: '🇹🇭' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
];

const getRegionInfo = (code) => {
  const norm = String(code || '').trim().toUpperCase();
  return REGION_DATA.find((r) => r.code === norm) || { code: norm, name: norm, flag: '🌐' };
};

const getRegionDisplay = (regionCode) => {
  const norm = String(regionCode || '').trim().toUpperCase();
  if (norm === 'AUTO') return { flag: '🌐', label: 'Tự nhận diện' };
  if (norm === 'ALL') return { flag: '🌏', label: 'Global' };
  const info = getRegionInfo(norm);
  return { flag: info.flag, label: norm };
};

const CHANNEL_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const SHOP_AUTHORIZE_URL = 'https://services.tiktokshop.com/open/authorize';
const CHANNEL_REDIRECT_URI = 'https://report-api.yumnetwork.vn/api/channels/oauth/tiktok/callback';
const SHOP_REDIRECT_URI = 'https://report-api.yumnetwork.vn/api/bookings/tiktok-partner/callback';

const INITIAL_FORM = {
  name: '',
  app_type: 'partner',
  region: 'AUTO',
  app_key: '',
  app_secret: '',
  service_id: '',
  authorize_url: SHOP_AUTHORIZE_URL,
  redirect_uri: '',
  is_active: true,
};

const AppManagement = () => {
  const { t } = useI18n();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [togglingId, setTogglingId] = useState(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showSecret, setShowSecret] = useState(false);
  const [fetchingSecret, setFetchingSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const toggleShowSecret = async () => {
    if (fetchingSecret) return;
    if (!showSecret) {
      const isMasked = editingApp && (
        form.app_secret === (editingApp.app_secret_masked || '••••••••') ||
        /^[*•]{3,}$/.test(form.app_secret?.trim())
      );
      if (isMasked && editingApp?.id) {
        setFetchingSecret(true);
        try {
          const res = await fetchTikTokAppSecret(editingApp.id);
          if (res?.app_secret) {
            setForm((prev) => ({ ...prev, app_secret: res.app_secret }));
          }
        } catch (err) {
          setModalError(err.message || 'Không thể xem App Secret');
        } finally {
          setFetchingSecret(false);
        }
      }
      setShowSecret(true);
    } else {
      setShowSecret(false);
    }
  };

  // Delete confirm state
  const [deletingApp, setDeletingApp] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchTikTokApps();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setApps(list);
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách ứng dụng TikTok');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const renderTypeBadge = (appType) => {
    if (appType === 'channel') {
      return (
        <span className="app-management__type-badge app-management__type-badge--channel">
          {t('appsManagement.channelApp') || 'TikTok Channel'}
        </span>
      );
    }
    return (
      <span className="app-management__type-badge app-management__type-badge--partner">
        {t('appsManagement.partnerApp') || 'TikTok Shop'}
      </span>
    );
  };

  const renderLinkedCount = (app) => {
    const isChannel = app.app_type === 'channel';
    const count = Number(app.linked_count || 0);
    const target = isChannel
      ? `/channels/manage?app_id=${encodeURIComponent(app.id)}`
      : `/manage/shops?app_id=${encodeURIComponent(app.id)}`;
    const unit = isChannel
      ? (t('appsManagement.linkedChannels') || 'Kênh')
      : (t('appsManagement.linkedShops') || 'Shop');

    return (
      <Link
        className="app-management__linked-count"
        to={target}
        title={t('appsManagement.viewLinked') || 'Xem danh sách đang liên kết'}
      >
        <strong>{count}</strong>
        <span>{unit}</span>
      </Link>
    );
  };

  const openAddModal = () => {
    setEditingApp(null);
    setForm({
      ...INITIAL_FORM,
      app_type: 'partner',
      redirect_uri: SHOP_REDIRECT_URI,
    });
    setShowSecret(false);
    setModalError('');
    setIsModalOpen(true);
  };

  const openEditModal = (app) => {
    setEditingApp(app);
    setForm({
      name: app.name || '',
      app_type: app.app_type || 'partner',
      region: app.region || 'VN',
      app_key: app.app_key || '',
      app_secret: app.app_secret_masked || '••••••••',
      service_id: app.service_id || '',
      authorize_url: app.authorize_url || (app.app_type === 'channel' ? CHANNEL_AUTHORIZE_URL : SHOP_AUTHORIZE_URL),
      redirect_uri: app.redirect_uri || '',
      is_active: app.is_active ?? true,
    });
    setShowSecret(false);
    setModalError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingApp(null);
  };

  const handleAppTypeChange = (e) => {
    const nextType = e.target.value;
    const isChannel = nextType === 'channel';
    setForm((prev) => ({
      ...prev,
      app_type: nextType,
      region: isChannel ? 'ALL' : 'AUTO',
      authorize_url: isChannel ? CHANNEL_AUTHORIZE_URL : SHOP_AUTHORIZE_URL,
      redirect_uri: isChannel ? CHANNEL_REDIRECT_URI : SHOP_REDIRECT_URI,
    }));
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setSaving(true);

    try {
      const isSecretMasked = editingApp && (
        form.app_secret === (editingApp.app_secret_masked || '••••••••') ||
        /^[*•]{3,}$/.test(form.app_secret?.trim())
      );
      const targetType = editingApp
        ? editingApp.app_type
        : (form.app_type || 'partner');
      const targetRegion = editingApp
        ? editingApp.region
        : (targetType === 'channel' ? 'ALL' : (form.region || 'AUTO'));

      const payload = {
        ...form,
        app_secret: isSecretMasked ? '' : form.app_secret,
        app_type: targetType,
        region: targetRegion,
      };
      if (editingApp) {
        await updateTikTokApp(editingApp.id, payload);
        setNotice(t('appsManagement.successUpdate') || 'Đã cập nhật App thành công.');
      } else {
        await createTikTokApp(payload);
        setNotice(t('appsManagement.successCreate') || 'Đã thêm App thành công.');
      }
      setIsModalOpen(false);
      await loadApps(true);
    } catch (err) {
      setModalError(err.message || 'Lỗi khi lưu ứng dụng');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (app) => {
    if (togglingId) return;
    setTogglingId(app.id);
    try {
      const nextStatus = !app.is_active;
      await toggleTikTokAppStatus(app.id, nextStatus);
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, is_active: nextStatus } : a)));
    } catch (err) {
      setError(err.message || 'Không thể đổi trạng thái App');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingApp) return;
    setIsDeleting(true);
    try {
      await deleteTikTokApp(deletingApp.id);
      setNotice(t('appsManagement.successDelete') || 'Đã xóa App thành công.');
      setDeletingApp(null);
      await loadApps(true);
    } catch (err) {
      setError(err.message || 'Không thể xóa App');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="page page--admin app-management">
      <div className="admin-page__hero app-management__hero">
        <div className="app-management__hero-actions">
          <button
            type="button"
            className="button"
            onClick={openAddModal}
          >
            <Plus size={16} />
            <span>{t('appsManagement.addApp') || 'Thêm App mới'}</span>
          </button>
        </div>
      </div>

      {notice ? (
        <div className="app-management__alert app-management__alert--success" role="status">
          <span>{notice}</span>
          <button type="button" className="app-management__modal-close" onClick={() => setNotice('')}>×</button>
        </div>
      ) : null}

      {error ? (
        <div className="app-management__alert app-management__alert--error" role="alert">
          <span>{error}</span>
          <button type="button" className="app-management__modal-close" onClick={() => setError('')}>×</button>
        </div>
      ) : null}

      <div className="section-card app-management__card">
        {loading ? (
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <LoaderCircle className="is-spinning" size={32} />
            <p style={{ marginTop: '12px' }}>Đang tải danh sách App...</p>
          </div>
        ) : apps.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <Globe size={40} style={{ opacity: 0.4, marginBottom: '12px' }} />
            <p>{t('appsManagement.emptyState') || 'Chưa có App nào được cấu hình.'}</p>
            <button type="button" className="button" style={{ marginTop: '16px' }} onClick={openAddModal}>
              <Plus size={16} />
              <span>{t('appsManagement.addApp') || 'Thêm App đầu tiên'}</span>
            </button>
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Table View */}
            <div className="table-wrap app-management__table-wrap">
              <table className="data-table app-management__table">
                <thead>
                  <tr>
                    <th>{t('appsManagement.appName') || 'Tên App'}</th>
                    <th>{t('appsManagement.appType') || 'Loại App'}</th>
                    <th>{t('appsManagement.region') || 'Vùng'}</th>
                    <th>{t('appsManagement.appKey') || 'App Key'}</th>
                    <th>{t('appsManagement.serviceId') || 'Service ID'}</th>
                    <th>{t('appsManagement.linkedAccounts') || 'Đang liên kết'}</th>
                    <th>{t('appsManagement.status') || 'Trạng thái'}</th>
                    <th style={{ textAlign: 'right' }}>{t('appsManagement.actions') || 'Thao tác'}</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((app) => {
                    const regionDisplay = getRegionDisplay(app.region);
                    const regionFull = getRegionInfo(app.region);

                    return (
                      <tr key={app.id}>
                        <td>
                          <strong>{app.name}</strong>
                        </td>
                        <td>
                          {renderTypeBadge(app.app_type)}
                        </td>
                        <td>
                          <div className="app-management__region-cell" title={regionFull.name}>
                            <span className="app-management__region-flag" aria-hidden="true">{regionDisplay.flag}</span>
                            <span>{regionDisplay.label}</span>
                          </div>
                        </td>
                        <td>
                          <code className="app-management__key-code" title={app.app_key}>
                            {app.app_key}
                          </code>
                        </td>
                        <td>
                          {app.service_id ? (
                            <code className="app-management__key-code" title={app.service_id}>
                              {app.service_id}
                            </code>
                          ) : (
                            <span style={{ color: 'var(--color-muted)' }}>—</span>
                          )}
                        </td>
                        <td>{renderLinkedCount(app)}</td>
                        <td>
                          <label
                            className={`app-management__switch ${app.is_active ? 'is-active' : 'is-inactive'}`}
                            title="Bấm để bật / tắt trạng thái"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(app.is_active)}
                              disabled={togglingId === app.id}
                              onChange={() => handleToggleStatus(app)}
                            />
                            <span className="app-management__switch-track" aria-hidden="true">
                              <span className="app-management__switch-thumb" />
                            </span>
                            <span className="app-management__switch-label">
                              {app.is_active
                                ? (t('appsManagement.active') || 'Hoạt động')
                                : (t('appsManagement.inactive') || 'Tạm dừng')}
                            </span>
                          </label>
                        </td>
                        <td>
                          <div className="app-management__actions-cell" style={{ justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="app-management__btn-icon"
                              onClick={() => openEditModal(app)}
                              title={t('appsManagement.editApp') || 'Chỉnh sửa'}
                              aria-label={t('appsManagement.editApp') || 'Chỉnh sửa'}
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              className="app-management__btn-icon app-management__btn-icon--danger"
                              onClick={() => setDeletingApp(app)}
                              title={t('appsManagement.deleteApp') || 'Xóa'}
                              aria-label={t('appsManagement.deleteApp') || 'Xóa'}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (<= 768px) */}
            <div className="app-management__cards-mobile">
              {apps.map((app) => {
                const regionDisplay = getRegionDisplay(app.region);
                const regionFull = getRegionInfo(app.region);

                return (
                  <div className="app-management__card-item" key={`card-${app.id}`}>
                    <div className="app-management__card-header">
                      <div className="app-management__card-title-group">
                        <h3 className="app-management__card-title">{app.name}</h3>
                        <div className="app-management__card-meta">
                          {renderTypeBadge(app.app_type)}
                          <div className="app-management__region-cell" title={regionFull.name}>
                            <span className="app-management__region-flag" aria-hidden="true">{regionDisplay.flag}</span>
                            <span>{regionDisplay.label}</span>
                          </div>
                        </div>
                      </div>
                      <div className="app-management__actions-cell">
                        <button
                          type="button"
                          className="app-management__btn-icon"
                          onClick={() => openEditModal(app)}
                          title={t('appsManagement.editApp') || 'Chỉnh sửa'}
                          aria-label={t('appsManagement.editApp') || 'Chỉnh sửa'}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          className="app-management__btn-icon app-management__btn-icon--danger"
                          onClick={() => setDeletingApp(app)}
                          title={t('appsManagement.deleteApp') || 'Xóa'}
                          aria-label={t('appsManagement.deleteApp') || 'Xóa'}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="app-management__card-body">
                      <div className="app-management__card-row">
                        <span className="app-management__card-label">{t('appsManagement.appKey') || 'App Key'}:</span>
                        <div className="app-management__card-value">
                          <code className="app-management__key-code" title={app.app_key}>
                            {app.app_key}
                          </code>
                        </div>
                      </div>

                      {app.service_id ? (
                        <div className="app-management__card-row">
                          <span className="app-management__card-label">{t('appsManagement.serviceId') || 'Service ID'}:</span>
                          <div className="app-management__card-value">
                            <code className="app-management__key-code" title={app.service_id}>
                              {app.service_id}
                            </code>
                          </div>
                        </div>
                      ) : null}
                      <div className="app-management__card-row">
                        <span className="app-management__card-label">{t('appsManagement.linkedAccounts') || 'Đang liên kết'}:</span>
                        <div className="app-management__card-value">{renderLinkedCount(app)}</div>
                      </div>
                    </div>

                    <div className="app-management__card-footer">
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                        {t('appsManagement.status') || 'Trạng thái'}:
                      </span>
                      <label
                        className={`app-management__switch ${app.is_active ? 'is-active' : 'is-inactive'}`}
                        title="Bấm để bật / tắt trạng thái"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(app.is_active)}
                          disabled={togglingId === app.id}
                          onChange={() => handleToggleStatus(app)}
                        />
                        <span className="app-management__switch-track" aria-hidden="true">
                          <span className="app-management__switch-thumb" />
                        </span>
                        <span className="app-management__switch-label">
                          {app.is_active
                            ? (t('appsManagement.active') || 'Hoạt động')
                            : (t('appsManagement.inactive') || 'Tạm dừng')}
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget && !saving) closeModal();
            }}
          >
            <div
              className="modal-card app-management__modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-modal-title"
            >
              <div className="app-management__modal-header">
                <div>
                  <h2 id="app-modal-title">
                    {editingApp
                      ? (t('appsManagement.editApp') || 'Chỉnh sửa App')
                      : (t('appsManagement.addApp') || 'Thêm App mới')}
                  </h2>
                </div>
                <button
                  type="button"
                  className="app-management__modal-close"
                  onClick={closeModal}
                  disabled={saving}
                >
                  ×
                </button>
              </div>

              {modalError ? (
                <div className="app-management__alert app-management__alert--error" role="alert">
                  <span>{modalError}</span>
                </div>
              ) : null}

              <form onSubmit={handleFormSubmit}>
                {!editingApp ? (
                  <div style={{ marginBottom: '16px' }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label htmlFor="app-type">{t('appsManagement.appType') || 'Loại App'}</label>
                      <select
                        id="app-type"
                        name="app_type"
                        value={form.app_type}
                        onChange={handleAppTypeChange}
                      >
                        <option value="channel">TikTok Channel</option>
                        <option value="partner">TikTok Shop</option>
                      </select>
                    </div>
                  </div>
                ) : null}

                <div className="field">
                  <label htmlFor="app-name">
                    {t('appsManagement.appName') || 'Tên App'}
                  </label>
                  <input
                    id="app-name"
                    name="name"
                    value={form.name}
                    onChange={handleFormChange}
                  />
                </div>

                {editingApp ? (
                  <div
                    className="app-management__static-info"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '12px',
                      padding: '12px 14px',
                      background: 'var(--color-bg-subtle, rgba(0, 0, 0, 0.02))',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      marginBottom: '16px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', display: 'block', marginBottom: '4px' }}>
                        {t('appsManagement.appType') || 'Loại App'}
                      </span>
                      {renderTypeBadge(editingApp.app_type)}
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', display: 'block', marginBottom: '4px' }}>
                        {t('appsManagement.region') || 'Vùng / Quốc gia'}
                      </span>
                      <div className="app-management__region-cell">
                        <span className="app-management__region-flag" aria-hidden="true">
                          {getRegionDisplay(editingApp.region).flag}
                        </span>
                        <strong>{getRegionDisplay(editingApp.region).label}</strong>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="field">
                  <label htmlFor="app-key">
                    {t('appsManagement.appKey') || 'App Key'} <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    id="app-key"
                    name="app_key"
                    value={form.app_key}
                    onChange={handleFormChange}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="app-secret">
                    {t('appsManagement.appSecret') || 'App Secret'}{' '}
                    {!editingApp ? <span style={{ color: 'red' }}>*</span> : null}
                  </label>
                  <div className="app-management__secret-wrap">
                    <input
                      id="app-secret"
                      name="app_secret"
                      type={showSecret ? 'text' : 'password'}
                      value={form.app_secret}
                      onChange={handleFormChange}
                      onFocus={(e) => {
                        if (editingApp && (form.app_secret === (editingApp.app_secret_masked || '••••••••') || /^[*•]{3,}$/.test(form.app_secret))) {
                          e.target.select();
                        }
                      }}
                      required={!editingApp}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="app-management__secret-toggle"
                      onClick={toggleShowSecret}
                      disabled={fetchingSecret}
                      title={showSecret ? 'Ẩn bí mật' : 'Hiển thị bí mật'}
                    >
                      {fetchingSecret ? (
                        <LoaderCircle className="is-spinning" size={16} />
                      ) : showSecret ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="service-id">{t('appsManagement.serviceIdLabel') || 'Service ID (không bắt buộc)'}</label>
                  <input
                    id="service-id"
                    name="service_id"
                    value={form.service_id}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="field">
                  <label htmlFor="redirect-uri">{t('appsManagement.redirectUri') || 'Redirect URI'}</label>
                  <input
                    id="redirect-uri"
                    name="redirect_uri"
                    value={form.redirect_uri}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="actions app-management__modal-actions" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={closeModal}
                    disabled={saving}
                  >
                    {t('appsManagement.cancel') || 'Hủy'}
                  </button>
                  <button
                    type="submit"
                    className="button"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <LoaderCircle className="is-spinning" size={15} />
                        <span>{t('appsManagement.saving') || 'Đang lưu...'}</span>
                      </>
                    ) : (
                      editingApp ? (t('appsManagement.save') || 'Lưu thay đổi') : (t('appsManagement.create') || 'Thêm App')
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
        : null}

      {/* Delete Confirmation Modal */}
      {deletingApp && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isDeleting) setDeletingApp(null);
            }}
          >
            <div
              className="modal-card"
              role="alertdialog"
              aria-modal="true"
              style={{ width: 'min(440px, calc(100vw - 32px))' }}
            >
              <h2 className="section-card__title" style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
                {t('appsManagement.deleteApp') || 'Xóa App'}
              </h2>
              <p style={{ color: 'var(--color-text-soft)', marginBottom: '20px', lineHeight: 1.5 }}>
                {t('appsManagement.confirmDelete', { name: deletingApp.name })
                  || `Bạn có chắc chắn muốn xóa App "${deletingApp.name}"? Hành động này không thể hoàn tác.`}
              </p>
              <div className="actions app-management__modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setDeletingApp(null)}
                  disabled={isDeleting}
                >
                  {t('appsManagement.cancel') || 'Hủy'}
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                >
                  {isDeleting ? (t('appsManagement.deleting') || 'Đang xóa...') : (t('appsManagement.deleteApp') || 'Xóa')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
};

export default AppManagement;
