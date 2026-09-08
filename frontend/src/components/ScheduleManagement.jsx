import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  LoaderCircle,
  Plus,
  Play,
  Radio,
  RefreshCw,
  Save,
  ShoppingBag,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';
import '../styles/pages/admin.css';
import {
  fetchSchedules,
  runScheduleNow,
  stopScheduleNow,
  updateSchedule,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { formatErrorDates, getRunErrorMessages } from '../lib/scheduleErrors';
import ScheduleRunMonitor from './ScheduleRunMonitor';

const DEFAULT_TIMES = ['02:00', '06:00', '10:00', '14:00', '18:00', '22:00'];
const CHANNEL_JOB_KEYS = new Set(['tiktok_channel_metrics']);
const isActiveRun = (run) => ['PROCESSING', 'RETRY_PENDING'].includes(run?.status);

const resizeRunTimes = (current, count) => {
  const next = [...current].slice(0, count);
  for (const candidate of DEFAULT_TIMES) {
    if (next.length >= count) break;
    if (!next.includes(candidate)) next.push(candidate);
  }
  return next.sort();
};

const formatDateTime = (value, locale) => value
  ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
  : '—';

const durationInSeconds = (run) => run.completed_at
  ? Math.max(0, Math.round((new Date(run.completed_at) - new Date(run.started_at)) / 1000))
  : null;

const ScheduleStatusIcon = ({ status }) => {
  if (status === 'SUCCEEDED') return <CheckCircle2 aria-hidden="true" />;
  if (status === 'FAILED') return <XCircle aria-hidden="true" />;
  if (status === 'PROCESSING') return <LoaderCircle className="is-spinning" aria-hidden="true" />;
  return <Clock3 aria-hidden="true" />;
};

const ScheduleManagement = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [schedules, setSchedules] = useState([]);
  const [shops, setShops] = useState([]);
  const [activeTab, setActiveTab] = useState('schedules');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [jobFilter, setJobFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [runningKey, setRunningKey] = useState('');
  const [stoppingKey, setStoppingKey] = useState('');
  const [openRunMenu, setOpenRunMenu] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedErrorRuns, setExpandedErrorRuns] = useState(() => new Set());
  const [monitorRun, setMonitorRun] = useState(null);

  useEffect(() => {
    const closeRunMenu = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'click' && (event.target.closest('.schedule-run-menu') || event.target.closest('.schedule-action--run-trigger'))) return;
      setOpenRunMenu(null);
    };
    document.addEventListener('click', closeRunMenu);
    document.addEventListener('keydown', closeRunMenu);
    window.addEventListener('resize', closeRunMenu);
    window.addEventListener('scroll', closeRunMenu, true);
    return () => {
      document.removeEventListener('click', closeRunMenu);
      document.removeEventListener('keydown', closeRunMenu);
      window.removeEventListener('resize', closeRunMenu);
      window.removeEventListener('scroll', closeRunMenu, true);
    };
  }, []);

  const load = useCallback(async (signal, quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await fetchSchedules(signal);
      setSchedules(payload.schedules || []);
      if (Array.isArray(payload.shops)) setShops(payload.shops);
      setError('');
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || t('schedule.loadError'));
    } finally {
      if (!signal?.aborted) {
        if (!quiet) setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const allRuns = useMemo(() => schedules.flatMap((schedule) => (
    (schedule.runs || []).map((run) => ({ ...run, job_key: schedule.job_key }))
  )).sort((a, b) => new Date(b.started_at) - new Date(a.started_at)), [schedules]);

  const hasRunningJob = useMemo(
    () => allRuns.some(isActiveRun),
    [allRuns],
  );

  useEffect(() => {
    if (!hasRunningJob) return undefined;
    const controller = new AbortController();
    const interval = window.setInterval(() => load(controller.signal, true), 10000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [hasRunningJob, load]);

  const filteredRuns = useMemo(() => allRuns.filter((run) => (
    (statusFilter === 'ALL' || run.status === statusFilter)
    && (jobFilter === 'ALL' || run.job_key === jobFilter)
  )), [allRuns, jobFilter, statusFilter]);

  const shopNames = useMemo(() => Object.fromEntries(
    shops.map((shop) => [String(shop.id), shop.name || shop.code || `Shop ${shop.id}`])
  ), [shops]);

  const enabledCount = schedules.filter((schedule) => schedule.enabled).length;
  const runningCount = allRuns.filter(isActiveRun).length;
  const failedCount = allRuns.filter((run) => run.status === 'FAILED').length;
  const scheduleGroups = useMemo(() => ([
    {
      key: 'shop',
      schedules: schedules.filter((schedule) => !CHANNEL_JOB_KEYS.has(schedule.job_key)),
    },
    {
      key: 'channel',
      schedules: schedules.filter((schedule) => CHANNEL_JOB_KEYS.has(schedule.job_key)),
    },
  ]), [schedules]);

  const patchSchedule = (jobKey, patch) => setSchedules((items) => items.map((item) => (
    item.job_key === jobKey ? { ...item, ...patch } : item
  )));

  const save = async (schedule) => {
    try {
      setSavingKey(schedule.job_key);
      setError('');
      const payload = await updateSchedule(schedule.job_key, {
        enabled: schedule.enabled,
        timezone: 'Asia/Ho_Chi_Minh',
        run_times: schedule.run_times,
      });
      patchSchedule(schedule.job_key, payload.schedule);
      setNotice(t('schedule.saved'));
    } catch (err) {
      setError(err.message || t('schedule.saveError'));
    } finally {
      setSavingKey('');
    }
  };

  const toggleRunMenu = (schedule, triggerElement) => {
    setOpenRunMenu((current) => {
      if (current?.jobKey === schedule.job_key) {
        return null;
      }
      const rect = triggerElement.getBoundingClientRect();
      const menuHeight = 50 + shops.length * 45;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const direction = spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'up' : 'down';
      return {
        jobKey: schedule.job_key,
        schedule,
        direction,
        top: Math.min(window.innerHeight - 12, rect.bottom + 6),
        bottom: Math.max(12, window.innerHeight - (rect.top - 6)),
        right: Math.max(12, window.innerWidth - rect.right),
      };
    });
  };

  const runNow = async (schedule, shopId = null) => {
    try {
      setRunningKey(schedule.job_key);
      setError('');
      setOpenRunMenu(null);
      await runScheduleNow(schedule.job_key, shopId ? { shop_id: shopId } : {});
      const targetShopName = shopId ? (shopNames[shopId] || `Shop ${shopId}`) : null;
      setNotice(targetShopName ? t('schedule.startedShop', { shop: targetShopName }) : t('schedule.started'));
      setActiveTab('logs');
      await load(undefined, true);
    } catch (err) {
      setError(err.message || t('schedule.runError'));
    } finally {
      setRunningKey('');
    }
  };

  const stopNow = async (schedule) => {
    try {
      setStoppingKey(schedule.job_key);
      setError('');
      await stopScheduleNow(schedule.job_key);
      setNotice(t('schedule.stopped'));
      await load(undefined, true);
    } catch (err) {
      setError(err.message || t('schedule.stopError'));
    } finally {
      setStoppingKey('');
    }
  };

  const statusLabel = (status) => t(`schedule.statuses.${String(status || 'EMPTY').toLowerCase()}`);
  const triggerLabel = (trigger) => t(`schedule.triggers.${String(trigger || 'SCHEDULED').toLowerCase()}`);
  const resultLabel = (run) => {
    if (!run.summary) return '—';
    const total = run.summary.total ?? run.summary.channels ?? 0;
    const succeeded = run.summary.succeeded ?? Math.max(0, total - (run.summary.failed ?? 0));
    return run.status === 'RETRY_PENDING' && run.next_retry_at
      ? `${succeeded}/${total} · ${t('schedule.nextRetry')}: ${formatDateTime(run.next_retry_at, locale)}`
      : `${succeeded}/${total}`;
  };
  const toggleRunError = (runId) => setExpandedErrorRuns((current) => {
    const next = new Set(current);
    const key = String(runId);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div className="page schedule-page schedule-page--operations">
      <section className="page__hero admin-page__hero schedule-page__hero">
        <div>
          <h1 className="page__title">{t('schedule.title')}</h1>
        </div>
      </section>

      <section className="schedule-overview" aria-label={t('schedule.overview')}>
        <article><CalendarClock aria-hidden="true" /><div><span>{t('schedule.totalJobs')}</span><strong>{schedules.length}</strong></div></article>
        <article><CheckCircle2 aria-hidden="true" /><div><span>{t('schedule.activeJobs')}</span><strong>{enabledCount}</strong></div></article>
        <article className={runningCount ? 'is-running' : ''}><Activity aria-hidden="true" /><div><span>{t('schedule.runningJobs')}</span><strong>{runningCount}</strong></div></article>
        <article className={failedCount ? 'is-failed' : ''}><XCircle aria-hidden="true" /><div><span>{t('schedule.failedRuns')}</span><strong>{failedCount}</strong></div></article>
      </section>

      {error ? <div className="schedule-alert schedule-alert--error" role="alert"><XCircle aria-hidden="true" />{error}</div> : null}
      {notice ? <div className="schedule-alert schedule-alert--success" role="status"><CheckCircle2 aria-hidden="true" />{notice}<button type="button" aria-label={t('common.close')} onClick={() => setNotice('')}>×</button></div> : null}

      <div className="schedule-tabs" role="tablist" aria-label={t('schedule.tabsLabel')}>
        <button type="button" role="tab" aria-selected={activeTab === 'schedules'} onClick={() => setActiveTab('schedules')}>
          <CalendarClock aria-hidden="true" />{t('schedule.scheduleTab')}<span>{schedules.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>
          <History aria-hidden="true" />{t('schedule.logsTab')}<span>{allRuns.length}</span>
        </button>
      </div>

      {loading ? <section className="section-card empty-state"><span className="loading-dot" />{t('schedule.loading')}</section> : null}

      {!loading && activeTab === 'schedules' ? (
        <div className="schedule-groups" role="tabpanel">
          {scheduleGroups.map((group) => (
            <section className={`schedule-group schedule-group--${group.key}`} key={group.key}>
              <header className="schedule-group__header">
                <span aria-hidden="true">{group.key === 'shop' ? <ShoppingBag /> : <Radio />}</span>
                <div>
                  <h2>{t(`schedule.groups.${group.key}.name`)}</h2>
                </div>
                <strong>{group.schedules.length}</strong>
              </header>
              <div className="schedule-grid schedule-grid--compact">
                {group.schedules.map((schedule) => {
            const latest = schedule.runs?.[0];
            const isRunning = runningKey === schedule.job_key || isActiveRun(latest);
            const description = t(`schedule.jobs.${schedule.job_key}.description`);
            return (
              <article className="section-card schedule-card schedule-card--compact" key={schedule.job_key}>
                <header className="schedule-card__header">
                  <span className="schedule-card__icon" aria-hidden="true"><CalendarClock /></span>
                  <div className="schedule-card__heading">
                    <h2>{t(`schedule.jobs.${schedule.job_key}.name`)}</h2>
                    {description ? <p>{description}</p> : null}
                  </div>
                  <label className="schedule-switch">
                    <input
                      type="checkbox"
                      checked={schedule.enabled}
                      onChange={(event) => patchSchedule(schedule.job_key, { enabled: event.target.checked })}
                    />
                    <span className="schedule-switch__track" aria-hidden="true"><i /></span>
                  </label>
                </header>

                <div className="schedule-card__body">
                  <div className="schedule-times">
                    <div className="schedule-time-list">
                      {schedule.run_times.map((time, index) => {
                        const inputId = `${schedule.job_key}-run-time-${index}`;
                        return (
                          <div className="schedule-time-row" key={inputId}>
                            <span className="schedule-time-index" aria-hidden="true">{index + 1}</span>
                            <label className="sr-only" htmlFor={inputId}>{t('schedule.runNumber', { number: index + 1 })}</label>
                            <input
                              id={inputId}
                              type="time"
                              value={time}
                              onChange={(event) => {
                                const times = [...schedule.run_times];
                                times[index] = event.target.value;
                                patchSchedule(schedule.job_key, { run_times: times });
                              }}
                            />
                            <button
                              className="schedule-time-delete"
                              type="button"
                              aria-label={t('schedule.removeRunTime', { number: index + 1 })}
                              title={t('schedule.removeRunTime', { number: index + 1 })}
                              disabled={schedule.run_times.length <= 1}
                              onClick={() => patchSchedule(schedule.job_key, {
                                run_times: schedule.run_times.filter((_, timeIndex) => timeIndex !== index),
                              })}
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      className="schedule-time-add"
                      type="button"
                      aria-label={t('schedule.addRunTime')}
                      title={t('schedule.addRunTime')}
                      disabled={schedule.run_times.length >= 6}
                      onClick={() => patchSchedule(schedule.job_key, {
                        run_times: resizeRunTimes(schedule.run_times, schedule.run_times.length + 1),
                      })}
                    >
                      <Plus aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <footer className="schedule-card__actions">
                  <button className="button schedule-action schedule-action--save" type="button" disabled={savingKey === schedule.job_key} onClick={() => save(schedule)}><Save aria-hidden="true" />{savingKey === schedule.job_key ? t('common.loading') : t('schedule.save')}</button>
                  {isRunning ? (
                    <button className="button button--danger schedule-action" type="button" disabled={stoppingKey === schedule.job_key} onClick={() => stopNow(schedule)}><Square aria-hidden="true" />{stoppingKey === schedule.job_key ? t('schedule.stopping') : t('schedule.stop')}</button>
                  ) : !CHANNEL_JOB_KEYS.has(schedule.job_key) && shops.length > 0 ? (
                    <button
                      className="button button--ghost schedule-action schedule-action--run-trigger"
                      type="button"
                      disabled={runningKey === schedule.job_key}
                      aria-haspopup="true"
                      aria-expanded={openRunMenu?.jobKey === schedule.job_key}
                      onClick={(event) => toggleRunMenu(schedule, event.currentTarget)}
                    >
                      <Play aria-hidden="true" />
                      {t('schedule.runNow')}
                      <ChevronDown aria-hidden="true" className="schedule-action-run__chevron" />
                    </button>
                  ) : (
                    <button className="button button--ghost schedule-action" type="button" disabled={runningKey === schedule.job_key} onClick={() => runNow(schedule)}><Play aria-hidden="true" />{t('schedule.runNow')}</button>
                  )}
                </footer>
              </article>
            );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {!loading && activeTab === 'logs' ? (
        <section className="section-card schedule-logs" role="tabpanel">
          {monitorRun ? <ScheduleRunMonitor initialRun={monitorRun} shops={shops} onBack={() => setMonitorRun(null)} /> : <>
          <header className="schedule-logs__toolbar">
            <div><h2>{t('schedule.logsTitle')}</h2><span>{t('schedule.logsCount', { count: filteredRuns.length })}</span></div>
            <div className="schedule-logs__filters">
              <label><span className="sr-only">{t('schedule.filterJob')}</span><select value={jobFilter} onChange={(event) => setJobFilter(event.target.value)}><option value="ALL">{t('schedule.allJobs')}</option>{scheduleGroups.map((group) => <optgroup label={t(`schedule.groups.${group.key}.name`)} key={group.key}>{group.schedules.map((schedule) => <option value={schedule.job_key} key={schedule.job_key}>{t(`schedule.jobs.${schedule.job_key}.name`)}</option>)}</optgroup>)}</select></label>
              <label><span className="sr-only">{t('schedule.filterStatus')}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">{t('schedule.allStatuses')}</option><option value="SUCCEEDED">{statusLabel('SUCCEEDED')}</option><option value="FAILED">{statusLabel('FAILED')}</option><option value="PROCESSING">{statusLabel('PROCESSING')}</option><option value="RETRY_PENDING">{statusLabel('RETRY_PENDING')}</option><option value="CANCELLED">{statusLabel('CANCELLED')}</option></select></label>
              <button className="button button--ghost schedule-logs__refresh" type="button" disabled={refreshing} onClick={() => load(undefined, true)}><RefreshCw className={refreshing ? 'is-spinning' : ''} aria-hidden="true" />{t('schedule.refresh')}</button>
            </div>
          </header>
          <div className="table-wrap schedule-logs__table-wrap">
            <table className="data-table schedule-logs__table">
              <thead><tr><th>{t('schedule.startedAt')}</th><th>{t('schedule.job')}</th><th>{t('schedule.trigger')}</th><th>{t('schedule.status')}</th><th>{t('schedule.duration')}</th><th>{t('schedule.result')}</th><th>{t('schedule.error')}</th></tr></thead>
              <tbody>
                {filteredRuns.map((run) => {
                  const errorMessages = getRunErrorMessages(run, shopNames).map((message) => formatErrorDates(message));
                  const errorText = errorMessages.join('\n');
                  const errorExpanded = expandedErrorRuns.has(String(run.id));
                  return <tr key={run.id}><td>{formatDateTime(run.started_at, locale)}<button type="button" className="schedule-log-open" onClick={() => setMonitorRun(run)}>#{run.id} · {t('schedule.monitor.open')}</button></td><td><strong>{t(`schedule.jobs.${run.job_key}.name`)}</strong>{run.summary?.results?.length === 1 && run.summary.results[0]?.shop_name ? <div><span className="schedule-log-shop-tag">{run.summary.results[0].shop_name}</span></div> : null}</td><td>{triggerLabel(run.trigger_type)}</td><td><span className={`schedule-run-status is-${String(run.status).toLowerCase()}`}><ScheduleStatusIcon status={run.status} />{statusLabel(run.status)}</span></td><td>{durationInSeconds(run) === null ? '—' : `${durationInSeconds(run)}s`}</td><td>{resultLabel(run)}</td><td>{errorMessages.length ? <div className={`schedule-log-error${errorExpanded ? ' is-expanded' : ''}`}><pre title={errorExpanded ? '' : errorText}>{errorText}</pre><button type="button" aria-expanded={errorExpanded} aria-label={t(errorExpanded ? 'schedule.collapseError' : 'schedule.expandError')} title={t(errorExpanded ? 'schedule.collapseError' : 'schedule.expandError')} onClick={() => toggleRunError(run.id)}><ChevronDown aria-hidden="true" /></button></div> : <span className="schedule-log-error-empty">—</span>}</td></tr>;
                })}
                {!filteredRuns.length ? <tr><td colSpan="7"><div className="empty-state empty-state--compact">{t('schedule.noLogs')}</div></td></tr> : null}
              </tbody>
            </table>
          </div>
          </>}
        </section>
      ) : null}

      {openRunMenu ? createPortal(
        <div
          className={`schedule-run-menu schedule-run-menu--${openRunMenu.direction}`}
          role="menu"
          style={{
            position: 'fixed',
            right: `${openRunMenu.right}px`,
            top: openRunMenu.direction === 'down' ? `${openRunMenu.top}px` : 'auto',
            bottom: openRunMenu.direction === 'up' ? `${openRunMenu.bottom}px` : 'auto',
            zIndex: 9999,
          }}
        >
          <button
            type="button"
            className="schedule-run-menu__item is-all"
            role="menuitem"
            onClick={() => runNow(openRunMenu.schedule, null)}
          >
            <div className="schedule-run-menu__item-content">
              <span className="schedule-run-menu__item-title">{t('schedule.runAllShops')}</span>
              <span className="schedule-run-menu__item-sub">{t('schedule.runAllShopsSub', { count: shops.length })}</span>
            </div>
          </button>
          <div className="schedule-run-menu__divider" />
          <div className="schedule-run-menu__list">
            {shops.map((shop) => (
              <button
                key={shop.id}
                type="button"
                className="schedule-run-menu__item"
                role="menuitem"
                onClick={() => runNow(openRunMenu.schedule, shop.id)}
              >
                <div className="schedule-run-menu__item-content">
                  <span className="schedule-run-menu__item-title">{shop.name || shop.code || `Shop ${shop.id}`}</span>
                  {shop.code || shop.region ? (
                    <span className="schedule-run-menu__item-sub">{[shop.code, shop.region].filter(Boolean).join(' • ')}</span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
};

export default ScheduleManagement;
