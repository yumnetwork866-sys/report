import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, Heart, MessageCircle, Search, Share2 } from 'lucide-react';
import { fetchChannels, fetchVideoPage } from '../lib/api';
import { useI18n } from '../lib/language';
import { useMoneyFormatter } from '../lib/currency';
import Pagination from './Pagination';
import AppAvatar from './AppAvatar';
import {
  getStoredSelectedChannelId,
  resolveSelectedChannelId,
  setStoredSelectedChannelId,
  subscribeSelectedChannel,
} from '../lib/channelSelection';

const PAGE_SIZE = 20;

const ChannelAvatar = ({ channel, className, fallbackClassName, alt }) => {
  const name = channel?.display_name || channel?.username || 'Channel';
  return (
    <AppAvatar
      sources={[channel?.avatar_url, channel?.avatar_large_url]}
      name={name}
      seed={channel?.id || channel?.username}
      className={className}
      fallbackClassName={fallbackClassName}
      alt={alt}
      generated={false}
    />
  );
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

const compactVideoTitle = (value, maxLength = 40) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const clean = raw.replace(/\s+/g, ' ');
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3).trim()}…` : clean;
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
  searchValue = '',
  onSearchChange,
  sortBy = 'published_at',
  sortDirection = 'desc',
  onSortChange,
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
  const formatOrders = (video) => {
    const raw = video.orders ?? video.order_count;
    if (raw === null || raw === undefined) return '—';
    return formatNumber(raw);
  };
  const formatPublishedDate = (value) => {
    if (!value) return null;
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date);
    } catch {
      return null;
    }
  };
  const formatPublishedTime = (value) => {
    if (!value) return null;
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    } catch {
      return null;
    }
  };
  const [localVideos, setLocalVideos] = useState([]);
  const [localChannels, setLocalChannels] = useState([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState('');
  const [localSelectedChannelId, setLocalSelectedChannelId] = useState(() => getStoredSelectedChannelId() || '');
  const [localPagination, setLocalPagination] = useState({ total: 0, total_pages: 1 });
  const [localSummary, setLocalSummary] = useState({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchValue);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const usesProvidedData = Array.isArray(data?.videos) && Array.isArray(data?.channels);
  const videos = usesProvidedData ? data.videos : localVideos;
  const channels = usesProvidedData ? data.channels : localChannels;
  const loading = usesProvidedData ? Boolean(data.loading) : localLoading;
  const error = usesProvidedData ? String(data.error || '') : localError;
  const isChannelControlled = controlledChannelId !== undefined;
  const selectedChannelId = isChannelControlled ? String(controlledChannelId) : localSelectedChannelId;
  const handleLocalChannelChange = (nextChannelId) => {
    const id = String(nextChannelId || '');
    setStoredSelectedChannelId(id);
    setLocalSelectedChannelId(id);
  };
  const changeSelectedChannel = isChannelControlled ? onSelectedChannelChange : handleLocalChannelChange;
  const isPageControlled = controlledPage !== undefined;
  const activePage = isPageControlled ? Number(controlledPage) : page;
  const changePage = isPageControlled ? onPageChange : setPage;
  const usesServerPagination = Boolean(usesProvidedData && controlledPagination);

  useEffect(() => setSearch(searchValue), [searchValue]);
  useEffect(() => {
    if (!onSearchChange || search === searchValue) return undefined;
    const timeout = window.setTimeout(() => onSearchChange(search), 300);
    return () => window.clearTimeout(timeout);
  }, [onSearchChange, search, searchValue]);

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
    if (isChannelControlled || !channels.length) return;
    setLocalSelectedChannelId((current) => {
      const preferred = current || getStoredSelectedChannelId();
      const resolved = resolveSelectedChannelId(channels, preferred);
      if (resolved && resolved !== getStoredSelectedChannelId()) {
        setStoredSelectedChannelId(resolved);
      }
      return resolved;
    });
  }, [channels, isChannelControlled]);

  useEffect(() => {
    if (isChannelControlled) return;
    return subscribeSelectedChannel((event) => {
      const nextId = event?.detail ?? getStoredSelectedChannelId();
      if (!nextId) return;
      setLocalSelectedChannelId((current) => {
        if (String(nextId) === String(current)) return current;
        if (channels.length && !channels.some((channel) => String(channel.id) === String(nextId))) return current;
        return String(nextId);
      });
    });
  }, [channels, isChannelControlled]);

  const filteredVideos = useMemo(() => {
    const channelVideos = selectedChannelId === 'all'
      ? videos
      : selectedChannelId
        ? videos.filter((video) => String(video.channel_id) === selectedChannelId)
        : [];
    if (usesServerPagination || !search.trim()) return channelVideos;
    const needle = search.trim().toLocaleLowerCase();
    return channelVideos.filter((video) => [video.title, video.platform_video_id, ...getVideoHashtags(video)]
      .some((value) => String(value || '').toLocaleLowerCase().includes(needle)));
  }, [search, selectedChannelId, usesServerPagination, videos]);

  const toggleSort = (field) => {
    if (!onSortChange) return;
    onSortChange(field, sortBy === field && sortDirection === 'desc' ? 'asc' : 'desc');
  };
  const SortHeader = ({ field, children, className = '' }) => (
    <th className={className} aria-sort={sortBy === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="video-table-sort" onClick={() => toggleSort(field)}>
        {children}{sortBy === field && sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      </button>
    </th>
  );

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

  useEffect(() => {
    if (!selectedVideo) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedVideo]);

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

        <div className="video-table-toolbar">
          <label className="video-table-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('videoLibrary.searchPlaceholder')}
              aria-label={t('videoLibrary.searchPlaceholder')}
            />
          </label>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('videoLibrary.videos')}</th>
                <SortHeader field="published_at">{t('videoLibrary.publishedAt')}</SortHeader>
                <th>{t('videoLibrary.hashtags')}</th>
                <SortHeader field="views" className="cell-number">{t('videoLibrary.views')}</SortHeader>
                <SortHeader field="likes" className="cell-number">{t('videoLibrary.likes')}</SortHeader>
                <SortHeader field="comments" className="cell-number">{t('videoLibrary.comments')}</SortHeader>
                <SortHeader field="orders" className="cell-number">{t('videoLibrary.orders')}</SortHeader>
                <SortHeader field="gmv" className="cell-number">{t('videoLibrary.gmv')}</SortHeader>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={8}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('videoLibrary.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : filteredVideos.length ? (
                paginatedVideos.map((video) => {
                  const hashtags = getVideoHashtags(video);
                  const fullTitle = String(video.title || '').trim() || t('videoLibrary.untitledVideo');
                  const cleanTitle = String(video.title || '')
                    .replace(/#[\p{L}\p{N}_]+/gu, '')
                    .replace(/\s+/g, ' ')
                    .trim() || fullTitle;
                  const displayTitle = compactVideoTitle(cleanTitle, 40);
                  const publishedDate = formatPublishedDate(video.published_at);
                  const publishedTime = formatPublishedTime(video.published_at);
                  return <tr
                    className="video-table-row"
                    key={video.id}
                    tabIndex={0}
                    aria-label={t('videoLibrary.previewVideo', { title: fullTitle })}
                    onClick={() => setSelectedVideo(video)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedVideo(video);
                      }
                    }}
                  >
                    <td>
                      <div className="video-cell">
                        {video.status === 'unavailable' ? (
                          <div
                            className="video-cell__thumb video-cell__thumb--empty video-cell__thumb--unavailable"
                            aria-hidden="true"
                            title="Video đã bị ẩn hoặc xóa trên TikTok"
                          >
                            <EyeOff size={16} strokeWidth={2.2} aria-hidden="true" />
                            <span>Đã ẩn</span>
                          </div>
                        ) : (
                          <>
                            {video.thumbnail_url ? (
                              video.video_url ? (
                                <a
                                  className="video-cell__thumb-link"
                                  href={video.video_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={t('videoLibrary.openVideo', { title: fullTitle })}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <img
                                    className="video-cell__thumb"
                                    src={video.thumbnail_url}
                                    alt={fullTitle}
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
                                  alt={fullTitle}
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
                              {t('videoLibrary.noThumbnail')}
                            </div>
                          </>
                        )}
                        <div className="video-cell__meta">
                          <div className="video-cell__title-row" title={fullTitle}>
                            {video.video_url ? (
                              <a
                                href={video.video_url}
                                target="_blank"
                                rel="noreferrer"
                                className="row-title row-title--link"
                                title={fullTitle}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {displayTitle}
                              </a>
                            ) : (
                              <span className="row-title" title={fullTitle}>{displayTitle}</span>
                            )}
                          </div>
                          <div className="video-cell__sub-row">
                            <div className="video-engagement video-engagement--inline">
                              <span title={t('videoLibrary.views')} aria-label={`${t('videoLibrary.views')}: ${formatNumber(video.views)}`}>
                                <Eye size={13} strokeWidth={1.8} aria-hidden="true" />
                                {formatNumber(video.views)}
                              </span>
                              <span title={t('videoLibrary.likes')} aria-label={`${t('videoLibrary.likes')}: ${formatNumber(video.likes)}`}>
                                <Heart size={13} strokeWidth={1.8} aria-hidden="true" />
                                {formatNumber(video.likes)}
                              </span>
                              <span title={t('videoLibrary.comments')} aria-label={`${t('videoLibrary.comments')}: ${formatNumber(video.comments)}`}>
                                <MessageCircle size={13} strokeWidth={1.8} aria-hidden="true" />
                                {formatNumber(video.comments)}
                              </span>
                              <span title={t('videoLibrary.shares')} aria-label={`${t('videoLibrary.shares')}: ${formatNumber(video.shares)}`}>
                                <Share2 size={13} strokeWidth={1.8} aria-hidden="true" />
                                {formatNumber(video.shares)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="cell-date">
                      {publishedDate ? (
                        <span className="video-published-date">
                          <span>{publishedDate}</span>
                          {publishedTime ? <small>{publishedTime}</small> : null}
                        </span>
                      ) : '—'}
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
                    <td className="cell-number">{formatNumber(video.likes)}</td>
                    <td className="cell-number">{formatNumber(video.comments)}</td>
                    <td className="cell-number">{formatOrders(video)}</td>
                    <td className="cell-number"><strong>{formatGmv(video)}</strong></td>
                  </tr>;
                })
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={8}>
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
      {selectedVideo ? createPortal((
        <div className="koc-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedVideo(null); }}>
          <aside className="koc-drawer booking-detail-drawer video-preview-drawer" role="dialog" aria-modal="true" aria-labelledby="video-preview-title">
            <div className="koc-drawer__header">
              <div className="booking-detail-drawer__heading">
                <div>
                  <h2 id="video-preview-title">{compactVideoTitle(selectedVideo.title, 70) || t('videoLibrary.untitledVideo')}</h2>
                  <p>TikTok ID: {selectedVideo.platform_video_id || '—'}</p>
                </div>
              </div>
              <div className="booking-detail-drawer__header-actions">
                <button className="button button--ghost booking-detail-drawer__close" type="button" onClick={() => setSelectedVideo(null)} aria-label={t('common.close')}>×</button>
              </div>
            </div>
            <div className="koc-drawer__body">
              {selectedVideo.platform_video_id ? (
                <iframe
                  className="video-preview-drawer__player"
                  src={`https://www.tiktok.com/player/v1/${encodeURIComponent(selectedVideo.platform_video_id)}?autoplay=0&loop=0`}
                  title={selectedVideo.title || t('videoLibrary.untitledVideo')}
                  allow="fullscreen; autoplay"
                  loading="lazy"
                />
              ) : selectedVideo.thumbnail_url ? <img className="video-preview-drawer__image" src={selectedVideo.thumbnail_url} alt="" /> : null}
              <section className="page__stats page__stats--four video-preview-drawer__stats">
                <article className="stat-card"><p className="stat-card__label">{t('videoLibrary.views')}</p><p className="stat-card__value">{formatNumber(selectedVideo.views)}</p></article>
                <article className="stat-card"><p className="stat-card__label">{t('videoLibrary.likes')}</p><p className="stat-card__value">{formatNumber(selectedVideo.likes)}</p></article>
                <article className="stat-card"><p className="stat-card__label">{t('videoLibrary.orders')}</p><p className="stat-card__value">{formatOrders(selectedVideo)}</p></article>
                <article className="stat-card"><p className="stat-card__label">{t('videoLibrary.gmv')}</p><p className="stat-card__value">{formatGmv(selectedVideo)}</p></article>
              </section>
              <section className="drawer-section video-preview-drawer__hashtags">
                <h3>{t('videoLibrary.hashtags')}</h3>
                <div className="video-hashtags">{getVideoHashtags(selectedVideo).map((tag) => <span className="chip" key={tag}>{tag}</span>)}</div>
              </section>
              {selectedVideo.video_url ? <a className="button video-preview-drawer__open" href={selectedVideo.video_url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {t('videoLibrary.openTikTok')}</a> : null}
            </div>
          </aside>
        </div>
      ), document.body) : null}
    </div>
  );
};

export default VideoTable;
