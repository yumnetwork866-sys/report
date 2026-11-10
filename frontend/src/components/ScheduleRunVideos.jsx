import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { fetchScheduleRunVideos } from '../lib/api';
import AppAvatar from './AppAvatar';
import { formatMonitorDuration, monitorVideoUrl } from '../lib/runMonitor';

export default function ScheduleRunVideos({ runId, channel, t, locale, onClose }) {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [cursor, setCursor] = useState(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState('');
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const closeRef = useRef(null);
  const generation = useRef(0);
  const moreController = useRef(null);
  const channelId = channel.channelId || channel.channel_id;
  const name = channel.channel_name || channel.channel_username || `Channel #${channelId}`;
  const outcomeLabel = (value) => t(`schedule.monitor.videoOutcomes.${String(value || 'RECEIVED').toLowerCase()}`);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const controls = closeRef.current?.closest('[role="dialog"]')?.querySelectorAll('button:not(:disabled), input, select, a[href]');
        if (!controls?.length) return;
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    moreController.current?.abort();
    setLoadingMore(false); setLoading(true); setRows([]); setCursor(null); setError('');
    fetchScheduleRunVideos(runId, { channel_id: channelId, q: query, outcome }, controller.signal)
      .then((payload) => { if (!controller.signal.aborted) { setRows(payload.videos); setStats(payload.stats); setCursor(payload.next_cursor); } })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); moreController.current?.abort(); };
  }, [runId, channelId, query, outcome, version]);

  const loadMore = async () => {
    const current = generation.current;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true); setError('');
    try {
      const payload = await fetchScheduleRunVideos(runId, { channel_id: channelId, q: query, outcome, before_id: cursor }, controller.signal);
      if (current !== generation.current || controller.signal.aborted) return;
      setRows((existing) => [...existing, ...payload.videos]); setCursor(payload.next_cursor);
    } catch (err) { if (!controller.signal.aborted && current === generation.current) setError(err.message); }
    finally { if (!controller.signal.aborted && current === generation.current) setLoadingMore(false); }
  };
  const copyId = async (id) => {
    try { await navigator.clipboard.writeText(id); setCopied(id); }
    catch { setError(t('schedule.monitor.copyError')); }
  };

  return createPortal(<div className="run-monitor__video-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="run-monitor__video-dialog" role="dialog" aria-modal="true" aria-labelledby="run-videos-title">
      <header><div><h3 id="run-videos-title">{t('schedule.monitor.videosTitle')}</h3><p>{name} · {t('schedule.monitor.runNumber', { id: runId })}</p></div><button ref={closeRef} type="button" className="button button--ghost" onClick={onClose} aria-label={t('schedule.monitor.closeVideos')}><X size={18} /></button></header>
      <div className="run-monitor__video-toolbar">
        <label className="run-monitor__search"><Search size={16} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('schedule.monitor.searchVideos')} aria-label={t('schedule.monitor.searchVideos')} /></label>
        <select value={outcome} onChange={(event) => setOutcome(event.target.value)} aria-label={t('schedule.monitor.videoResult')}><option value="">{t('schedule.allStatuses')}</option>{['CREATED', 'UPDATED', 'FAILED', 'RECEIVED'].map((value) => <option key={value} value={value}>{outcomeLabel(value)}</option>)}</select>
        <button type="button" className="button button--ghost" disabled={loading} onClick={() => setVersion((value) => value + 1)} aria-label={t('schedule.monitor.refreshVideos')}><RefreshCw size={15} /></button>
      </div>
      <p className="run-monitor__video-counts" aria-live="polite">{t('schedule.monitor.videoTotals', { total: stats.total ?? 0, created: stats.created ?? 0, updated: stats.updated ?? 0, failed: stats.failed ?? 0, received: stats.received ?? 0 })}</p>
      {error ? <p className="run-monitor__error" role="alert">{error}</p> : null}
      <div className="table-wrap run-monitor__video-table"><table className="data-table"><thead><tr><th>Video</th><th>Video ID</th><th>{t('schedule.monitor.videoResult')}</th><th>{t('schedule.monitor.time')}</th></tr></thead><tbody>
        {rows.map((row) => {
          const video = row.response_data || {};
          const id = String(video.video_id || '');
          const url = monitorVideoUrl(video, channel.channel_username);
          return <tr key={row.id}>
            <td><div className="run-monitor__identity"><AppAvatar src={row.thumbnail_url} name={video.title || id} generated={false} className="run-monitor__video-thumbnail" fallbackClassName="run-monitor__avatar--fallback" /><div>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{video.title || id} <ExternalLink size={12} aria-hidden="true" /></a> : <strong>{video.title || id}</strong>}</div></div></td>
            <td><code>{id}</code><button type="button" className="run-monitor__copy-id" onClick={() => copyId(id)} aria-label={t('schedule.monitor.copyVideoId', { id })}>{copied === id ? t('schedule.monitor.copied') : <Copy size={13} />}</button></td>
            <td><span className={`monitor-status is-${String(row.status).toLowerCase()}`}>{outcomeLabel(row.module_type)}</span>{row.message ? <p className="run-monitor__video-error">{row.message}</p> : null}</td>
            <td><time>{new Date(row.completed_at || row.started_at).toLocaleString(locale, { hour12: false })}</time><small>{formatMonitorDuration(row.duration_ms)}</small></td>
          </tr>;
        })}
      </tbody></table>
      {loading ? <p className="run-monitor__empty" role="status">{t('schedule.monitor.loading')}</p> : !rows.length && !error ? <p className="run-monitor__empty">{t(stats.total ? 'schedule.monitor.noVideoMatches' : 'schedule.monitor.noRecordedVideos')}</p> : null}
      </div>
      {cursor ? <button type="button" className="button button--ghost" disabled={loadingMore} onClick={loadMore}>{t('schedule.monitor.moreVideos')}</button> : null}
    </section>
  </div>, document.body);
}
