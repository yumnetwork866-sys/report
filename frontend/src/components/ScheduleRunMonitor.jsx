import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, RefreshCw, Radio, Search } from 'lucide-react';
import { fetchScheduleRunEvents, fetchScheduleRunEvent } from '../lib/api';
import { useI18n } from '../lib/language';
import { formatMonitorDuration, isMonitorActive, mergeMonitorEvents } from '../lib/runMonitor';
import '../styles/pages/run-monitor.css';

const timestamp = (value, locale) => value ? new Date(value).toLocaleString(locale, { hour12: false }) : '—';
const json = (value) => value == null ? '' : JSON.stringify(value, null, 2);

export default function ScheduleRunMonitor({ initialRun, shops, onBack }) {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [run, setRun] = useState(initialRun);
  const [stats, setStats] = useState({});
  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('response_data');
  const [filter, setFilter] = useState('ALL');
  const [shopId, setShopId] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [copied, setCopied] = useState(false);
  const olderLoaded = useRef(false);
  const generation = useRef(0);
  const active = isMonitorActive(run.status);
  const runId = initialRun.id;
  const filters = { status: filter, shop_id: shopId, q: query };
  const label = (status) => t(`schedule.monitor.statuses.${String(status || 'UNKNOWN').toLowerCase()}`);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setEvents([]); setCursor(null); setSelectedId(null); setDetail(null);
    olderLoaded.current = false;
  }, [runId, filter, shopId, query]);

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    generation.current += 1;
    const load = async () => {
      try {
        const payload = await fetchScheduleRunEvents(runId, { status: filter, shop_id: shopId, q: query }, controller.signal);
        if (controller.signal.aborted) return;
        setRun({ ...initialRun, ...payload.run });
        setStats(payload.stats);
        setEvents((current) => filter === 'IN_FLIGHT' ? payload.events : mergeMonitorEvents(current, payload.events));
        if (!olderLoaded.current) setCursor(payload.next_cursor);
        setError('');
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (autoRefresh && active) timer = setTimeout(load, 3000);
        }
      }
    };
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [runId, filter, shopId, query, autoRefresh, active, refreshKey, initialRun]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const controller = new AbortController();
    let timer;
    setDetail(null); setCopied(false); setDetailError('');
    const load = async () => {
      try {
        const payload = await fetchScheduleRunEvent(runId, selectedId, controller.signal);
        if (controller.signal.aborted) return;
        setDetail(payload.event); setDetailError('');
        if (autoRefresh && active && ['IN_FLIGHT', 'RECEIVED'].includes(payload.event.status)) timer = setTimeout(load, 3000);
      } catch (err) {
        if (!controller.signal.aborted) setDetailError(err.message);
      }
    };
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [runId, selectedId, autoRefresh, active, refreshKey]);

  const loadMore = async () => {
    const currentGeneration = generation.current;
    setLoadingMore(true);
    try {
      const payload = await fetchScheduleRunEvents(runId, { ...filters, before_id: cursor });
      if (currentGeneration !== generation.current) return;
      olderLoaded.current = true;
      setEvents((current) => mergeMonitorEvents(current, payload.events));
      setCursor(payload.next_cursor);
    } catch (err) { if (currentGeneration === generation.current) setError(err.message); }
    finally { setLoadingMore(false); }
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { setDetailError(t('schedule.monitor.copyError')); }
  };
  const selectedText = json(detail?.[tab]);
  const runElapsed = new Date(run.completed_at || Date.now()) - new Date(run.started_at);

  return <div className="run-monitor">
    <header className="run-monitor__header">
      <div><button type="button" className="button button--ghost" onClick={onBack}><ArrowLeft size={16} />{t('schedule.monitor.back')}</button>
        <h2>{t('schedule.monitor.title')} <span>#{run.id}</span></h2>
        <p>{t(`schedule.jobs.${initialRun.job_key}.name`)} · {timestamp(run.started_at, locale)}</p></div>
      <div className="run-monitor__actions">
        <span className={`monitor-status is-${String(run.status || '').toLowerCase()}`}>{label(run.status)}</span>
        <label className="run-monitor__live"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /><Radio size={15} />{t('schedule.monitor.live')}</label>
        <button type="button" className="button button--ghost" onClick={() => setRefreshKey((key) => key + 1)} aria-label={t('schedule.refresh')}><RefreshCw size={16} /></button>
      </div>
    </header>
    <div className="run-monitor__metrics">
      {[[t('schedule.monitor.requests'), stats.requests ?? 0], [t('schedule.monitor.success'), stats.succeeded ?? 0], [t('schedule.monitor.errors'), stats.failed ?? 0], [t('schedule.monitor.inFlight'), stats.in_flight ?? 0], [t('schedule.duration'), formatMonitorDuration(runElapsed)]].map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}
    </div>
    {run.next_retry_at ? <div className="run-monitor__activity">
      <strong>{t('schedule.nextRetry')}: {timestamp(run.next_retry_at, locale)}</strong>
    </div> : null}
    {run.summary?.results?.length ? <details className="run-monitor__shops" open>
      <summary>{t('schedule.monitor.progress')}</summary>
      <div>{run.summary.results.map((shop, index) => <article key={shop.shop_id || shop.channelId || index}>
        <header><strong>{shop.shop_name || (shop.shop_id ? `Shop #${shop.shop_id}` : `Channel #${shop.channelId || index + 1}`)}</strong><span className={`monitor-status is-${String(shop.status).toLowerCase()}`}>{label(String(shop.status).toUpperCase() === 'SUCCESS' ? 'SUCCEEDED' : shop.status)}</span></header>
        <div className="run-monitor__windows">{shop.windows?.map((window, wIdx) => {
          const status = String(window.status || shop.status || 'SUCCEEDED');
          const windowType = String(window.window_type || (window.days ? `PAST_${window.days}_DAYS` : '') || '');
          const windowLabel = windowType ? windowType.replace('PAST_', '').replace('_DAYS', 'd') : (window.days ? `${window.days}d` : '');
          const moduleType = window.module_type || (window.row_count !== undefined ? 'VIDEO' : '');
          const rowInfo = window.row_count !== undefined ? `${window.row_count} rows` : '';
          const parts = [moduleType, windowLabel, rowInfo, label(status)].filter(Boolean);
          const titleParts = [moduleType, label(status), window.retry_count !== undefined ? `${t('schedule.monitor.retries')}: ${window.retry_count}` : ''].filter(Boolean);
          return (
            <span
              key={`${moduleType}-${windowType || wIdx}`}
              className={`monitor-status is-${status.toLowerCase()}`}
              title={titleParts.join(' · ')}
            >
              {parts.join(' · ')}
            </span>
          );
        })}</div>
        {shop.next_retry_at ? <small>{t('schedule.nextRetry')}: {timestamp(shop.next_retry_at, locale)}</small> : null}
        {shop.error ? <p>{shop.error}</p> : null}
      </article>)}</div>
    </details> : null}
    <div className="run-monitor__filters">
      <label className="run-monitor__search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('schedule.monitor.search')} aria-label={t('schedule.monitor.search')} /></label>
      <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('schedule.filterStatus')}>
        <option value="ALL">{t('schedule.allStatuses')}</option><option value="ERRORS">{t('schedule.monitor.errors')}</option><option value="IN_FLIGHT">{label('IN_FLIGHT')}</option><option value="SUCCEEDED">{label('SUCCEEDED')}</option><option value="RETRY_PENDING">{label('RETRY_PENDING')}</option>
      </select>
      <select value={shopId} onChange={(e) => setShopId(e.target.value)} aria-label={t('schedule.monitor.shop')}><option value="">{t('schedule.monitor.allShops')}</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select>
    </div>
    {error ? <p className="run-monitor__error" role="alert">{error}</p> : null}
    <div className="run-monitor__workspace">
      <section className="run-monitor__timeline" aria-label={t('schedule.monitor.timeline')}>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('schedule.monitor.time')}</th><th>{t('schedule.monitor.event')}</th><th>{t('schedule.status')}</th><th>{t('schedule.duration')}</th></tr></thead>
          <tbody>{events.map((event) => <tr key={event.id} className={String(event.id) === String(selectedId) ? 'is-selected' : ''}>
            <td><time title={timestamp(event.started_at, locale)}>{new Date(event.started_at).toLocaleTimeString(locale, { hour12: false })}</time><small>#{event.id}</small></td>
            <td><button type="button" onClick={() => { setSelectedId(event.id); setTab(event.event_type === 'API_REQUEST' ? 'response_data' : 'request_data'); }}>
              <strong>{event.method ? `${event.method} ${event.endpoint?.replace(/^https?:\/\/[^/]+/, '')}` : t(`schedule.monitor.events.${String(event.event_type || 'API_REQUEST').toLowerCase()}`)}</strong>
              <span>{[event.shop_name || (event.shop_id ? `Shop #${event.shop_id}` : event.channel_id ? `Channel #${event.channel_id}` : ''), event.module_type, event.window_type].filter(Boolean).join(' · ')}</span>
              {event.request_id ? <code>{event.request_id}</code> : null}
            </button></td>
            <td><span className={`monitor-status is-${String(event.status || '').toLowerCase()}`}>{event.http_status ? `${event.http_status} · ` : ''}{label(event.status)}</span>{event.tiktok_code && event.tiktok_code !== '0' && event.tiktok_code !== 'ok' ? <small>Code {event.tiktok_code}</small> : null}</td>
            <td>{formatMonitorDuration(event.duration_ms)}</td>
          </tr>)}</tbody></table></div>
        {!events.length ? <p className="run-monitor__empty">{loading ? t('schedule.monitor.loading') : stats.last_activity_at ? t('schedule.monitor.noMatches') : t('schedule.monitor.noEvents')}</p> : null}
        {cursor ? <button type="button" className="button button--ghost" disabled={loadingMore} onClick={loadMore}>{t('schedule.monitor.loadOlder')}</button> : null}
      </section>
      <aside className="run-monitor__detail" aria-label={t('schedule.monitor.detail')}>
        {!selectedId ? <p className="run-monitor__empty">{t('schedule.monitor.selectEvent')}</p> : detail ? <>
          <header><h3>{t('schedule.monitor.detail')} #{detail.id}</h3><span className={`monitor-status is-${String(detail.status || '').toLowerCase()}`}>{label(detail.status)}</span></header>
          <dl>{[
            ['Request ID', detail.request_id], ['Task ID', detail.task_id], [t('schedule.monitor.endpoint'), detail.endpoint],
            [t('schedule.monitor.started'), timestamp(detail.started_at, locale)], [t('schedule.monitor.completed'), timestamp(detail.completed_at, locale)],
            [t('schedule.duration'), formatMonitorDuration(detail.duration_ms)], ['HTTP / TikTok code', `${detail.http_status ?? '—'} / ${detail.tiktok_code ?? '—'}`],
            [t('schedule.monitor.attempt'), detail.attempt], ['End day', detail.end_day], ['Retry-After', detail.retry_after],
            [t('schedule.nextRetry'), detail.next_retry_at ? timestamp(detail.next_retry_at, locale) : null],
          ].filter(([, value]) => value != null).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}{name === 'Request ID' ? <button type="button" onClick={() => copy(String(value))} aria-label={t('schedule.monitor.copy')}><Copy size={13} /></button> : null}</dd></div>)}</dl>
          {detail.message ? <p className="run-monitor__message">{detail.message}</p> : null}
          <div className="run-monitor__tabs" role="tablist">{[['request_data', 'Request'], ['response_data', 'Response'], ['response_headers', 'Headers']].map(([key, name]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setCopied(false); }}>{name}</button>)}<button type="button" disabled={!selectedText} onClick={() => copy(selectedText)} aria-label={t('schedule.monitor.copy')}><Copy size={14} />{copied ? t('schedule.monitor.copied') : t('schedule.monitor.copy')}</button></div>
          <p className="run-monitor__capture-note">{t('schedule.monitor.redacted')}{detail.payload_truncated ? ` ${t('schedule.monitor.truncated')}` : ''}</p>
          <pre role="tabpanel" tabIndex={0}>{selectedText || t(['IN_FLIGHT', 'RECEIVED'].includes(detail.status) ? 'schedule.monitor.awaitingResponse' : 'schedule.monitor.noPayload')}</pre>
        </> : <p className="run-monitor__empty">{t('schedule.monitor.loading')}</p>}
        {detailError ? <p className="run-monitor__error" role="alert">{detailError}</p> : null}
      </aside>
    </div>
  </div>;
}
