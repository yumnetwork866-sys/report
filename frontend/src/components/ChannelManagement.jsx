import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  deleteChannel,
  fetchChannels,
  revokeChannelAuthorization,
  syncChannelVideos,
} from '../lib/api';
import { useI18n } from '../lib/language';
import AppAvatar from './AppAvatar';

const ChannelManagement = ({ heroTitle }) => {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [deletingChannelId, setDeletingChannelId] = useState(null);
  const [syncingChannelId, setSyncingChannelId] = useState(null);
  const [openActions, setOpenActions] = useState({
    id: null,
    direction: 'down',
    top: 0,
    bottom: 0,
    right: 0,
  });
  const oauthParams = new URLSearchParams(location.search);
  const oauthStatus = oauthParams.get('oauth_status');
  const oauthMessage = oauthParams.get('oauth_message');

  const loadChannels = async (signal) => {
    const loadedChannels = await fetchChannels(signal);
    setChannels(loadedChannels);
  };

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const loadedChannels = await fetchChannels(controller.signal);
        setChannels(loadedChannels);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || t('channel.errorLoad'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [location.search, t]);

  useEffect(() => {
    if (!oauthStatus) {
      setToast(null);
      return undefined;
    }

    setToast({
      status: oauthStatus,
      message: oauthMessage || (oauthStatus === 'success' ? t('channel.successConnected') : t('channel.successOauthFailed')),
    });

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    navigate({ pathname: location.pathname, search: '' }, { replace: true });

    return () => window.clearTimeout(timeoutId);
  }, [oauthStatus, oauthMessage, navigate, location.pathname, t]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.action-menu')) {
        setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const sourceCounts = useMemo(() => {
    return channels.reduce((acc, channel) => {
      acc[channel.sync_source] = (acc[channel.sync_source] || 0) + 1;
      return acc;
    }, {});
  }, [channels]);

  const isFallbackUsername = (value) => {
    const text = String(value || '').trim();
    return !text || text.startsWith('tiktok_') || text.startsWith('-');
  };

  const renderChannelIdentity = (channel) => (
    <>
      <AppAvatar
        src={channel.avatar_url}
        name={channel.display_name || channel.username || 'Channel'}
        seed={channel.id || channel.username}
        className="channel-cell__avatar"
        fallbackClassName="channel-cell__avatar--empty"
        alt={channel.display_name || channel.username || 'Channel avatar'}
        generated={false}
      />
      <div className="channel-cell__meta">
        <span className="row-title">{channel.display_name}</span>
        {!isFallbackUsername(channel.username) ? <div className="row-subtitle">@{channel.username}</div> : null}
        {channel.sync_source === 'oauth' && !channel.is_connected ? (
          <div className="row-subtitle">{t('channel.disconnected')}</div>
        ) : null}
      </div>
    </>
  );

  const handleDeleteChannel = async (channel) => {
    const confirmed = window.confirm(t('channel.confirmDelete', { name: channel.display_name }));

    if (!confirmed) {
      return;
    }

    try {
      setDeletingChannelId(channel.id);
      setError('');
      await deleteChannel(channel.id);
      await loadChannels();
    } catch (err) {
      setError(err.message || t('channel.errorDelete'));
    } finally {
      setDeletingChannelId(null);
    }
  };

  const handleSyncChannelVideos = async (channel) => {
    try {
      setSyncingChannelId(channel.id);
      setError('');
      const result = await syncChannelVideos(channel.id);
      setToast({
        status: 'success',
        message: result?.message || t('channel.successSynced'),
      });
      await loadChannels();
    } catch (err) {
      setError(err.message || t('channel.errorSync'));
    } finally {
      setSyncingChannelId(null);
      setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
    }
  };

  const handleRevokeChannelAuthorization = async (channel) => {
    const confirmed = window.confirm(t('channel.confirmDisconnect', { name: channel.display_name }));

    if (!confirmed) {
      return;
    }

    try {
      setError('');
      const result = await revokeChannelAuthorization(channel.id);
      setToast({
        status: 'success',
        message: result?.message || t('channel.successDisconnected'),
      });
      await loadChannels();
    } catch (err) {
      setError(err.message || t('channel.errorDisconnect'));
    } finally {
      setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
    }
  };

  const toggleActionsMenu = (channelId, triggerElement) => {
    setOpenActions((current) => {
      if (current.id === channelId) {
        return { id: null, direction: 'down', top: 0, bottom: 0, right: 0 };
      }

      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const direction = spaceBelow < 180 && spaceAbove > spaceBelow ? 'up' : 'down';
      const right = Math.max(12, window.innerWidth - rect.right);
      const top = Math.min(window.innerHeight - 12, rect.bottom + 8);
      const bottom = Math.max(12, window.innerHeight - (rect.top - 8));

      return { id: channelId, direction, top, bottom, right };
    });
  };

  return (
    <div className="page">
      {toast ? (
        <div className={`toast ${toast.status === 'success' ? 'toast--success' : 'toast--error'}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      ) : null}

      <section className="page__hero">
        <h1 className="page__title">{t('channel.heroTitle') || heroTitle}</h1>
        <div className="page__stats">
          <article className="stat-card">
            <p className="stat-card__label">{t('channel.channels')}</p>
            <p className="stat-card__value">{channels.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('channel.oauth')}</p>
            <p className="stat-card__value">{sourceCounts.oauth || 0}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('channel.importCrawl')}</p>
            <p className="stat-card__value">{(sourceCounts.import || 0) + (sourceCounts.crawler || 0)}</p>
          </article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">{t('channel.list')}</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('channel.channelColumn')}</th>
                <th className="cell-number">{t('channel.videosColumn')}</th>
                <th className="cell-actions">{t('channel.actionsColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={3}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('channel.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : channels.length ? (
                channels.map((channel) => (
                  <tr key={channel.id}>
                    <td>
                      {channel.profile_url ? (
                        <a
                          className="channel-cell channel-cell--link"
                          href={channel.profile_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('channel.openProfile', { name: channel.display_name || channel.username })}
                        >
                          {renderChannelIdentity(channel)}
                        </a>
                      ) : <div className="channel-cell">{renderChannelIdentity(channel)}</div>}
                    </td>
                    <td className="cell-number">{Number(channel.video_count || 0)}</td>
                    <td className="cell-actions">
                      <div className="action-menu">
                        <button
                          className="action-menu__trigger"
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={openActions.id === channel.id}
                          onClick={(event) => toggleActionsMenu(channel.id, event.currentTarget)}
                        >
                          ...
                        </button>
                        {openActions.id === channel.id ? (
                          <div
                            className={`action-menu__panel action-menu__panel--${openActions.direction}`}
                            role="menu"
                            style={{
                              position: 'fixed',
                              right: `${openActions.right}px`,
                              top: openActions.direction === 'down' ? `${openActions.top}px` : 'auto',
                              bottom: openActions.direction === 'up' ? `${openActions.bottom}px` : 'auto',
                            }}
                          >
                            <button
                              className="action-menu__item"
                              type="button"
                              role="menuitem"
                              onClick={() => handleSyncChannelVideos(channel)}
                              disabled={syncingChannelId === channel.id || !channel.is_connected}
                            >
                              {syncingChannelId === channel.id ? t('channel.syncing') : t('channel.syncVideo')}
                            </button>
                            <button
                              className="action-menu__item"
                              type="button"
                              role="menuitem"
                              onClick={() => handleRevokeChannelAuthorization(channel)}
                              disabled={!channel.is_connected}
                            >
                              {t('channel.disconnect')}
                            </button>
                            <button
                              className="action-menu__item action-menu__item--danger"
                              type="button"
                              role="menuitem"
                              onClick={() => handleDeleteChannel(channel)}
                              disabled={deletingChannelId === channel.id}
                            >
                              {deletingChannelId === channel.id ? t('channel.deleting') : t('channel.delete')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={3}>
                    <div className="empty-state empty-state--compact table-empty-state">{t('channel.noData')}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
};

export default ChannelManagement;
