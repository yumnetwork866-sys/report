import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const DEFAULT_TIMES = ['02:00', '06:00', '10:00', '14:00', '18:00', '22:00'];
const CHANNEL_JOB_KEYS = new Set(['tiktok_channel_metrics']);

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
  const [activeTab, setActiveTab] = useState('schedules');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [jobFilter, setJobFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [runningKey, setRunningKey] = useState('');
  const [stoppingKey, setStoppingKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedErrorRuns, setExpandedErrorRuns] = useState(() => new Set());

  const load = useCallback(async (signal, quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await fetchSchedules(signal);
      setSchedules(payload.schedules || []);
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
    () => allRuns.some((run) => run.status === 'PROCESSING'),
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

  const enabledCount = schedules.filter((schedule) => schedule.enabled).length;
  const runningCount = allRuns.filter((run) => run.status === 'PROCESSING').length;
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

  const runNow = async (schedule) => {
    try {
      setRunningKey(schedule.job_key);
      setError('');
      await runScheduleNow(schedule.job_key);
      setNotice(t('schedule.started'));
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
    return `${succeeded}/${total}`;
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
            const isRunning = runningKey === schedule.job_key || latest?.status === 'PROCESSING';
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


                {latest?.error ? <p className="schedule-card__error" title={latest.error}>{latest.error}</p> : null}

                <footer className="schedule-card__actions">
                  <button className="button schedule-action schedule-action--save" type="button" disabled={savingKey === schedule.job_key} onClick={() => save(schedule)}><Save aria-hidden="true" />{savingKey === schedule.job_key ? t('common.loading') : t('schedule.save')}</button>
                  {isRunning ? (
                    <button className="button button--danger schedule-action" type="button" disabled={stoppingKey === schedule.job_key} onClick={() => stopNow(schedule)}><Square aria-hidden="true" />{stoppingKey === schedule.job_key ? t('schedule.stopping') : t('schedule.stop')}</button>
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
          <header className="schedule-logs__toolbar">
            <div><h2>{t('schedule.logsTitle')}</h2><span>{t('schedule.logsCount', { count: filteredRuns.length })}</span></div>
            <div className="schedule-logs__filters">
              <label><span className="sr-only">{t('schedule.filterJob')}</span><select value={jobFilter} onChange={(event) => setJobFilter(event.target.value)}><option value="ALL">{t('schedule.allJobs')}</option>{scheduleGroups.map((group) => <optgroup label={t(`schedule.groups.${group.key}.name`)} key={group.key}>{group.schedules.map((schedule) => <option value={schedule.job_key} key={schedule.job_key}>{t(`schedule.jobs.${schedule.job_key}.name`)}</option>)}</optgroup>)}</select></label>
              <label><span className="sr-only">{t('schedule.filterStatus')}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">{t('schedule.allStatuses')}</option><option value="SUCCEEDED">{statusLabel('SUCCEEDED')}</option><option value="FAILED">{statusLabel('FAILED')}</option><option value="PROCESSING">{statusLabel('PROCESSING')}</option><option value="CANCELLED">{statusLabel('CANCELLED')}</option></select></label>
              <button className="button button--ghost schedule-logs__refresh" type="button" disabled={refreshing} onClick={() => load(undefined, true)}><RefreshCw className={refreshing ? 'is-spinning' : ''} aria-hidden="true" />{t('schedule.refresh')}</button>
            </div>
          </header>
          <div className="table-wrap schedule-logs__table-wrap">
            <table className="data-table schedule-logs__table">
              <thead><tr><th>{t('schedule.startedAt')}</th><th>{t('schedule.job')}</th><th>{t('schedule.trigger')}</th><th>{t('schedule.status')}</th><th>{t('schedule.duration')}</th><th>{t('schedule.result')}</th><th>{t('schedule.error')}</th></tr></thead>
              <tbody>
                {filteredRuns.map((run) => {
                  const errorMessages = getRunErrorMessages(run).map((message) => formatErrorDates(message));
                  const errorText = errorMessages.join('\n');
                  const errorExpanded = expandedErrorRuns.has(String(run.id));
                  return <tr key={run.id}><td>{formatDateTime(run.started_at, locale)}</td><td><strong>{t(`schedule.jobs.${run.job_key}.name`)}</strong></td><td>{triggerLabel(run.trigger_type)}</td><td><span className={`schedule-run-status is-${String(run.status).toLowerCase()}`}><ScheduleStatusIcon status={run.status} />{statusLabel(run.status)}</span></td><td>{durationInSeconds(run) === null ? '—' : `${durationInSeconds(run)}s`}</td><td>{resultLabel(run)}</td><td>{errorMessages.length ? <div className={`schedule-log-error${errorExpanded ? ' is-expanded' : ''}`}><pre title={errorExpanded ? '' : errorText}>{errorText}</pre><button type="button" aria-expanded={errorExpanded} aria-label={t(errorExpanded ? 'schedule.collapseError' : 'schedule.expandError')} title={t(errorExpanded ? 'schedule.collapseError' : 'schedule.expandError')} onClick={() => toggleRunError(run.id)}><ChevronDown aria-hidden="true" /></button></div> : <span className="schedule-log-error-empty">—</span>}</td></tr>;
                })}
                {!filteredRuns.length ? <tr><td colSpan="7"><div className="empty-state empty-state--compact">{t('schedule.noLogs')}</div></td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default ScheduleManagement;
