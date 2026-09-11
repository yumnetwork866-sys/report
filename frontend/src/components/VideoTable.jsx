import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { fetchChannels, fetchVideoPage } from '../lib/api';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import Pagination from './Pagination';
import AppAvatar from './AppAvatar';

const PAGE_SIZE = 20;

const ChannelAvatar = ({ channel, className, fallbackClassName, alt }) => {
  const name = channel?.display_name || channel?.username || 'Channel';
  return <AppAvatar sources={[channel?.avatar_url, channel?.avatar_large_url]} name={name} seed={channel?.id || channel?.username} className={className} fallbackClassName={fallbackClassName} alt={alt} />;
};

export const ChannelPicker = ({
  id,
  channels,
  value,
  onChange,
  includeAll = false,
  allLabel = '',
  disabled = false,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedChannel = channels.find((channel) => String(channel.id) === String(value)) || null;
  const isAll = includeAll && value === 'all';
  const selectedLabel = isAll
    ? allLabel
    : selectedChannel?.display_name || selectedChannel?.username || t('videoLibrary.noChannels');

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  const options = includeAll
    ? [{ id: 'all', display_name: allLabel, isAll: true }, ...channels]
    : channels;

  return (
    <div className="channel-picker" ref={rootRef}>
      <button
        id={id}
        className="channel-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled || (!channels.length && !includeAll)}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-picker__current">
          {isAll ? (
            <span className="channel-picker__avatar channel-picker__avatar--empty" aria-hidden="true">ALL</span>
          ) : (
            <ChannelAvatar
              channel={selectedChannel}
              className="channel-picker__avatar"
              fallbackClassName="channel-picker__avatar--empty"
              alt={selectedLabel}
            />
          )}
          <span className="channel-picker__label">{selectedLabel}</span>
        </span>
        <span className={`sidebar__chevron channel-picker__chevron ${open ? 'sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="channel-picker__menu" role="listbox">
          {options.map((channel) => {
            const isActive = String(channel.id) === String(value);
            const label = channel.display_name || channel.username || channel.id;
            return (
              <button
                key={channel.id}
                className={`channel-picker__option ${isActive ? 'channel-picker__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(String(channel.id));
                  setOpen(false);
                }}
              >
                {channel.isAll ? (
                  <span className="channel-picker__option-avatar channel-picker__option-avatar--empty" aria-hidden="true">ALL</span>
                ) : (
                  <ChannelAvatar
                    channel={channel}
                    className="channel-picker__option-avatar"
                    fallbackClassName="channel-picker__option-avatar--empty"
                    alt={label}
                  />
                )}
                <span className="channel-picker__option-meta">
                  <span className="channel-picker__option-title">{label}</span>
                  {!channel.isAll && channel.username ? (
                    <span className="channel-picker__option-subtitle">@{channel.username}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const getVideoHashtags = (video) => {
  const provided = Array.isArray(video.hashtags)
    ? video.hashtags
    : typeof video.hashtags === 'string'
      ? video.hashtags.split(/[\s,]+/)
      : [];
  const extracted = String(video.title || '').match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set([...provided, ...extracted]
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .map((tag) => tag.startsWith('#') ? tag : `#${tag}`))];
};

const VideoTable = ({
  heroTitle,
  embedded = false,
  data = null,
  selectedChannelId: controlledChannelId,
  onSelectedChannelChange,
  pagination: controlledPagination = null,
  currentPage: controlledPage,
  onPageChange,
}) => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const { formatMoney } = useMoneyFormatter(locale);
  const formatNumber = (value) => Number(value || 0).toLocaleString(locale);
  const formatGmv = (video) => {
    if (video.gross_gmv === null || video.gross_gmv === undefined) return '—';
    const currency = /^[A-Z]{3}$/.test(String(video.sales_currency || '').toUpperCase())
      ? String(video.sales_currency).toUpperCase()
      : 'MYR';
    return formatMoney(video.gross_gmv, currency);
  };
  const [localVideos, setLocalVideos] = useState([]);
  const [localChannels, setLocalChannels] = useState([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState('');
  const [localSelectedChannelId, setLocalSelectedChannelId] = useState('');
  const [localPagination, setLocalPagination] = useState({ total: 0, total_pages: 1 });
  const [localSummary, setLocalSummary] = useState({});
  const [page, setPage] = useState(1);
  const usesProvidedData = Array.isArray(data?.videos) && Array.isArray(data?.channels);
  const videos = usesProvidedData ? data.videos : localVideos;
  const channels = usesProvidedData ? data.channels : localChannels;
  const loading = usesProvidedData ? Boolean(data.loading) : localLoading;
  const error = usesProvidedData ? String(data.error || '') : localError;
  const isChannelControlled = controlledChannelId !== undefined;
  const selectedChannelId = isChannelControlled ? String(controlledChannelId) : localSelectedChannelId;
  const changeSelectedChannel = isChannelControlled ? onSelectedChannelChange : setLocalSelectedChannelId;
  const isPageControlled = controlledPage !== undefined;
  const activePage = isPageControlled ? Number(controlledPage) : page;
  const changePage = isPageControlled ? onPageChange : setPage;
  const usesServerPagination = Boolean(usesProvidedData && controlledPagination);

  useEffect(() => {
    if (usesProvidedData) return undefined;
    const controller = new AbortController();

    const load = async () => {
      try {
        setLocalLoading(true);
        setLocalError('');
        const [videoPayload, loadedChannels] = await Promise.all([
          fetchVideoPage({
            signal: controller.signal,
            page: activePage,
            pageSize: PAGE_SIZE,
            channelId: localSelectedChannelId || null,
          }),
          fetchChannels(controller.signal),
        ]);
        setLocalVideos(videoPayload.items || []);
        setLocalPagination(videoPayload.pagination || { total: 0, total_pages: 1 });
        setLocalSummary(videoPayload.summary || {});
        setLocalChannels(loadedChannels);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setLocalError(err.message || t('videoLibrary.loadError'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLocalLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [activePage, localSelectedChannelId, t, usesProvidedData]);

  useEffect(() => {
    if (isChannelControlled) return;
    setLocalSelectedChannelId((current) => (
      channels.some((channel) => String(channel.id) === current)
        ? current
        : String(channels[0]?.id || '')
    ));
  }, [channels, isChannelControlled]);

  const filteredVideos = useMemo(() => {
    if (selectedChannelId === 'all') return videos;
    if (!selectedChannelId) return [];
    return videos.filter((video) => String(video.channel_id) === selectedChannelId);
  }, [videos, selectedChannelId]);

  const clientFilteredTotals = useMemo(() => {
    return filteredVideos.reduce((acc, video) => {
      acc.views += Number(video.views || 0);
      acc.likes += Number(video.likes || 0);
      acc.comments += Number(video.comments || 0);
      acc.shares += Number(video.shares || 0);
      return acc;
    }, { views: 0, likes: 0, comments: 0, shares: 0 });
  }, [filteredVideos]);
  const filteredTotals = usesProvidedData ? clientFilteredTotals : localSummary;

  const totalVideos = usesServerPagination
    ? Number(controlledPagination.total || 0)
    : usesProvidedData
      ? filteredVideos.length
      : Number(localPagination.total || 0);
  const pageCount = usesServerPagination
    ? Math.max(1, Number(controlledPagination.total_pages || 1))
    : usesProvidedData
    ? Math.max(1, Math.ceil(filteredVideos.length / PAGE_SIZE))
    : Math.max(1, Number(localPagination.total_pages || 1));
  const paginatedVideos = useMemo(() => {
    if (!usesProvidedData || usesServerPagination) return filteredVideos;
    const start = (activePage - 1) * PAGE_SIZE;
    return filteredVideos.slice(start, start + PAGE_SIZE);
  }, [activePage, filteredVideos, usesProvidedData, usesServerPagination]);

  useEffect(() => {
    if (!isPageControlled) setPage(1);
  }, [isPageControlled, selectedChannelId]);

  return (
    <div className={embedded ? 'dashboard-video-library' : 'page'} id={embedded ? 'videos' : undefined}>
      {!embedded ? <section className="page__hero">
        <h1 className="page__title">{t('videoLibrary.heroTitle') || heroTitle}</h1>
        <div className="page__stats page__stats--four">
          <article className="stat-card">
            <p className="stat-card__label">{t('videoLibrary.videos')}</p>
            <p className="stat-card__value">{totalVideos}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('videoLibrary.views')}</p>
            <p className="stat-card__value">{formatNumber(filteredTotals.views)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('videoLibrary.likes')}</p>
            <p className="stat-card__value">{formatNumber(filteredTotals.likes)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">{t('videoLibrary.shares')}</p>
            <p className="stat-card__value">{formatNumber(filteredTotals.shares)}</p>
          </article>
        </div>
      </section> : null}

      {error && !embedded ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header">
          {embedded ? (
            <div>
              <h2 className="section-card__title">{t('videoLibrary.heroTitle') || heroTitle}</h2>
            </div>
          ) : null}
          <div className="chip-row">
            <span className="chip chip--blue">{t('videoLibrary.channels', { count: channels.length })}</span>
          </div>
        </div>

        {!embedded ? <div className="filter-panel filter-panel--compact">
          <div className="field">
            <label htmlFor="channel-filter">{t('videoLibrary.channel')}</label>
            <ChannelPicker
              id="channel-filter"
              channels={channels}
              value={selectedChannelId}
              onChange={changeSelectedChannel}
              disabled={!channels.length}
            />
          </div>
        </div> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('videoLibrary.videos')}</th>
                <th>{t('videoLibrary.hashtags')}</th>
                <th className="cell-number">{t('videoLibrary.views')}</th>
                <th className="cell-number">{t('videoLibrary.gmv')}</th>
                <th className="cell-number">{t('videoLibrary.engagement')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={5}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('videoLibrary.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : filteredVideos.length ? (
                paginatedVideos.map((video) => {
                  const hashtags = getVideoHashtags(video);
                  const displayTitle = String(video.title || '')
                    .replace(/#[\p{L}\p{N}_]+/gu, '')
                    .replace(/\s+/g, ' ')
                    .trim() || t('videoLibrary.untitledVideo');
                  return <tr key={video.id}>
                    <td>
                      <div className="video-cell">
                        {video.thumbnail_url ? (
                          video.video_url ? (
                            <a
                              className="video-cell__thumb-link"
                              href={video.video_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={t('videoLibrary.openVideo', { title: displayTitle })}
                            >
                              <img
                                className="video-cell__thumb"
                                src={video.thumbnail_url}
                                alt={displayTitle}
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.parentElement?.nextElementSibling) {
                                    e.currentTarget.parentElement.nextElementSibling.style.display = 'flex';
                                  }
                                }}
                              />
                            </a>
                          ) : (
                            <img
                              className="video-cell__thumb"
                              src={video.thumbnail_url}
                              alt={displayTitle}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextElementSibling) {
                                  e.currentTarget.nextElementSibling.style.display = 'flex';
                                }
                              }}
                            />
                          )
                        ) : null}
                        <div
                          className="video-cell__thumb video-cell__thumb--empty"
                          aria-hidden="true"
                          style={{ display: video.thumbnail_url ? 'none' : 'flex' }}
                        >
                          {video.status === 'unavailable' ? 'Đã ẩn' : t('videoLibrary.noThumbnail')}
                        </div>
                        <div className="video-cell__meta">
                          <div className="video-cell__title-row">
                            <span className="row-title">{displayTitle}</span>
                            {video.status === 'unavailable' ? (
                              <span
                                className="video-status-badge video-status-badge--unavailable"
                                title="Video không còn tồn tại trên TikTok (đã xóa hoặc đặt ở chế độ riêng tư)"
                              >
                                Đã ẩn / Xóa
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {hashtags.length ? (
                        <div className="video-hashtags" title={hashtags.join(' ')}>
                          {hashtags.slice(0, 3).map((hashtag) => <span className="chip" key={hashtag}>{hashtag}</span>)}
                          {hashtags.length > 3 ? <span className="chip">+{hashtags.length - 3}</span> : null}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="cell-number">{formatNumber(video.views)}</td>
                    <td className="cell-number"><strong>{formatGmv(video)}</strong></td>
                    <td className="cell-number">
                      <div className="video-engagement">
                        <span title={t('videoLibrary.likes')} aria-label={`${t('videoLibrary.likes')}: ${formatNumber(video.likes)}`}>
                          <Heart size={15} strokeWidth={1.8} aria-hidden="true" />
                          {formatNumber(video.likes)}
                        </span>
                        <span title={t('videoLibrary.comments')} aria-label={`${t('videoLibrary.comments')}: ${formatNumber(video.comments)}`}>
                          <MessageCircle size={15} strokeWidth={1.8} aria-hidden="true" />
                          {formatNumber(video.comments)}
                        </span>
                        <span title={t('videoLibrary.shares')} aria-label={`${t('videoLibrary.shares')}: ${formatNumber(video.shares)}`}>
                          <Share2 size={15} strokeWidth={1.8} aria-hidden="true" />
                          {formatNumber(video.shares)}
                        </span>
                      </div>
                    </td>
                  </tr>;
                })
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={5}>
                    <div className="empty-state empty-state--compact table-empty-state">
                      <div>{t('videoLibrary.noMatch')}</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 ? (
          <Pagination
            currentPage={activePage}
            totalPages={pageCount}
            onPageChange={changePage}
            previousLabel={t('common.previous')}
            nextLabel={t('common.next')}
            ariaLabel={t('videoLibrary.pagination')}
          />
        ) : null}
      </section>
    </div>
  );
};

export default VideoTable;
