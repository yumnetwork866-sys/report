import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, ListFilter, Search, Store } from 'lucide-react';
import { fetchScheduleRunEvents, fetchScheduleRunEvent } from '../lib/api';
import { useI18n } from '../lib/language';
import { formatMonitorDuration, isMonitorActive, mergeMonitorEvents } from '../lib/runMonitor';
import SelectDropdown from './SelectDropdown';
import ScheduleRunProgress from './ScheduleRunProgress';
import ScheduleRunVideos from './ScheduleRunVideos';
import '../styles/pages/run-monitor.css';

const timestamp = (value, locale) => value ? new Date(value).toLocaleString(locale, { hour12: false }) : '—';
const json = (value) => value == null ? '' : JSON.stringify(value, null, 2);

export default function ScheduleRunMonitor({ initialRun, shops, onBack }) {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [videoChannel, setVideoChannel] = useState(null);
  const closeVideos = useCallback(() => setVideoChannel(null), []);
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
  const autoRefresh = true;
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
  }, [runId, filter, shopId, query, autoRefresh, active, initialRun]);

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
  }, [runId, selectedId, autoRefresh, active]);

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
    {videoChannel ? <ScheduleRunVideos key={`${runId}-${videoChannel.channelId || videoChannel.channel_id}`} runId={runId} channel={videoChannel} t={t} locale={locale} onClose={closeVideos} /> : null}
    <header className="run-monitor__header">
      <button type="button" className="button button--ghost" onClick={onBack} aria-label={t('schedule.monitor.back')} title={t('schedule.monitor.back')}><ArrowLeft size={16} aria-hidden="true" /></button>
      <div className="run-monitor__heading">
        <h2>{t(`schedule.jobs.${initialRun.job_key}.name`)}</h2>
        <span className="run-monitor__run-id">#{run.id}</span>
        <time dateTime={run.started_at}>{timestamp(run.started_at, locale)}</time>
      </div>
    </header>
    <div className="run-monitor__metrics">
      {[[t('schedule.monitor.requests'), stats.requests ?? 0], [t('schedule.monitor.success'), stats.succeeded ?? 0], [t('schedule.monitor.errors'), stats.failed ?? 0], [t('schedule.monitor.inFlight'), stats.in_flight ?? 0], [t('schedule.duration'), formatMonitorDuration(runElapsed)]].map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}
    </div>
    {run.next_retry_at ? <div className="run-monitor__activity">
      <strong>{t('schedule.nextRetry')}: {timestamp(run.next_retry_at, locale)}</strong>
    </div> : null}
    {run.summary?.results?.length ? <ScheduleRunProgress key={runId} results={run.summary.results} onOpenVideos={setVideoChannel} t={t} locale={locale} /> : null}
    <div className="run-monitor__filters">
      <label className="run-monitor__search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('schedule.monitor.search')} aria-label={t('schedule.monitor.search')} /></label>
      <div className="run-monitor__filter">
        <label className="sr-only" htmlFor={`run-${runId}-status`}>{t('schedule.filterStatus')}</label>
        <SelectDropdown
          id={`run-${runId}-status`}
          value={filter}
          onChange={setFilter}
          icon={<ListFilter size={16} />}
          options={[
            { value: 'ALL', label: t('schedule.allStatuses') },
            { value: 'ERRORS', label: t('schedule.monitor.errors') },
            ...['IN_FLIGHT', 'SUCCEEDED', 'RETRY_PENDING'].map((status) => ({ value: status, label: label(status) })),
          ]}
        />
      </div>
      <div className="run-monitor__filter">
        <label className="sr-only" htmlFor={`run-${runId}-shop`}>{t('schedule.monitor.shop')}</label>
        <SelectDropdown
          id={`run-${runId}-shop`}
          value={shopId}
          onChange={setShopId}
          icon={<Store size={16} />}
          options={[
            { value: '', label: t('schedule.monitor.allShops') },
            ...shops.map((shop) => ({ value: String(shop.id), label: shop.name })),
          ]}
        />
      </div>
    </div>
    {error ? <p className="run-monitor__error" role="alert">{error}</p> : null}
    <div className="run-monitor__workspace">
      <section className="run-monitor__timeline" aria-label={t('schedule.monitor.timeline')}>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('schedule.monitor.time')}</th><th>{t('schedule.monitor.event')}</th><th>{t('schedule.status')}</th><th>{t('schedule.duration')}</th></tr></thead>
          <tbody>{events.map((event) => <tr key={event.id} className={String(event.id) === String(selectedId) ? 'is-selected' : ''}>
            <td><time title={timestamp(event.started_at, locale)}>{new Date(event.started_at).toLocaleTimeString(locale, { hour12: false })}</time><small>#{event.id}</small></td>
            <td><button type="button" onClick={() => { setSelectedId(event.id); setTab(event.event_type === 'API_REQUEST' ? 'response_data' : 'request_data'); }}>
              <strong>{event.method ? `${event.method} ${event.endpoint?.replace(/^https?:\/\/[^/]+/, '')}` : t(`schedule.monitor.events.${String(event.event_type || 'API_REQUEST').toLowerCase()}`)}</strong>
              <span>{[event.shop_name || event.channel_name || event.channel_username || (event.shop_id ? `Shop #${event.shop_id}` : event.channel_id ? `Channel #${event.channel_id}` : ''), event.module_type, event.window_type].filter(Boolean).join(' · ')}</span>
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
          {detail.payload_truncated ? <p className="run-monitor__capture-note">{t('schedule.monitor.truncated')}</p> : null}
          <pre role="tabpanel" tabIndex={0}>{selectedText || t(['IN_FLIGHT', 'RECEIVED'].includes(detail.status) ? 'schedule.monitor.awaitingResponse' : 'schedule.monitor.noPayload')}</pre>
        </> : <p className="run-monitor__empty">{t('schedule.monitor.loading')}</p>}
        {detailError ? <p className="run-monitor__error" role="alert">{detailError}</p> : null}
      </aside>
    </div>
  </div>;
}
