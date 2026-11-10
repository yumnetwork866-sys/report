import React, { useState } from 'react';
import { Search } from 'lucide-react';
import AppAvatar from './AppAvatar';
import { formatMonitorDuration, filterMonitorResults, monitorResultStatus } from '../lib/runMonitor';

export default function ScheduleRunProgress({ results, t, locale, onOpenVideos }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const label = (status) => t(`schedule.monitor.statuses.${monitorResultStatus(status).toLowerCase()}`);
  const visible = filterMonitorResults(results, search, filter);
  const counts = results.reduce((all, item) => {
    const status = monitorResultStatus(item.status);
    all[status] = (all[status] || 0) + 1;
    return all;
  }, {});
  return <details className="run-monitor__shops" open>
    <summary>{t('schedule.monitor.progress')} <span className="run-monitor__result-count">{results.length}</span></summary>
    <div className="run-monitor__progress-tools">
      <label className="run-monitor__search"><Search size={15} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('schedule.monitor.searchEntities')} aria-label={t('schedule.monitor.searchEntities')} /></label>
      <div className="run-monitor__progress-filters" role="group" aria-label={t('schedule.filterStatus')}>
        {['ALL', ...Object.keys(counts)].map((status) => <button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === 'ALL' ? t('schedule.allStatuses') : label(status)} <span>{status === 'ALL' ? results.length : counts[status]}</span></button>)}
      </div>
    </div>
    <div className="table-wrap run-monitor__progress-table"><table className="data-table">
      <thead><tr><th>{t('schedule.monitor.entity')}</th><th>{t('schedule.status')}</th><th>{t('schedule.duration')}</th><th>{t('schedule.monitor.result')}</th></tr></thead>
      <tbody>{visible.map((shop, index) => {
        const channelId = shop.channelId || shop.channel_id;
        const name = shop.shop_name || shop.channel_name || shop.channel_username || (shop.shop_id ? `Shop #${shop.shop_id}` : `Channel #${channelId || index + 1}`);
        return <tr key={shop.shop_id ? `shop-${shop.shop_id}` : `channel-${channelId || index}`}>
          <td><div className="run-monitor__identity"><AppAvatar src={shop.channel_avatar_url || shop.avatar_url} name={name} generated={false} className="run-monitor__avatar" fallbackClassName="run-monitor__avatar--fallback" /><div><strong>{name}</strong><small>{[shop.channel_username ? `@${shop.channel_username.replace(/^@/, '')}` : '', shop.shop_id ? `Shop #${shop.shop_id}` : channelId ? `Channel #${channelId}` : ''].filter(Boolean).join(' · ')}</small></div></div></td>
          <td><span className={`monitor-status is-${monitorResultStatus(shop.status).toLowerCase()}`}>{label(shop.status)}</span></td>
          <td className="run-monitor__duration">{formatMonitorDuration(shop.duration_ms)}</td>
          <td>
            {shop.total != null ? (channelId ? <button type="button" className="run-monitor__video-link" onClick={() => onOpenVideos(shop)}>{t('schedule.monitor.videoCount', { count: Number(shop.total).toLocaleString(locale) })}</button> : <span>{t('schedule.monitor.videoCount', { count: Number(shop.total).toLocaleString(locale) })}</span>) : null}
            {shop.created != null ? <small>{t('schedule.monitor.savedVideoCounts', { created: shop.created, updated: shop.updated ?? 0, failed: shop.video_failed ?? 0 })}</small> : null}
            {shop.profile_updated != null ? <small>{t(shop.profile_updated ? 'schedule.monitor.profileUpdated' : 'schedule.monitor.profileUnchanged')}</small> : null}
            <div className="run-monitor__windows">{shop.windows?.map((window, wIdx) => {
                const status = String(window.status || shop.status || 'SUCCEEDED');
                const windowType = String(window.window_type || (window.days ? `PAST_${window.days}_DAYS` : '') || '');
                const windowLabel = windowType ? windowType.replace('PAST_', '').replace('_DAYS', 'd') : (window.days ? `${window.days}d` : '');
                const moduleType = window.module_type || (window.row_count !== undefined ? 'VIDEO' : '');
                const detailInfo = moduleType === 'DETAIL' ? [
                  t('schedule.monitor.detailSelected', { count: window.selected ?? 0 }),
                  t('schedule.monitor.detailSucceeded', { count: window.succeeded ?? 0 }),
                  t('schedule.monitor.detailFailed', { count: window.failed ?? 0 }),
                  t('schedule.monitor.detailFresh', { count: window.skipped_fresh ?? 0 }),
                  window.deferred ? t('schedule.monitor.detailDeferred', { count: window.deferred }) : '',
                ] : [];
                const rowInfo = moduleType !== 'DETAIL' && window.row_count !== undefined ? `${window.row_count} rows` : '';
                const parts = [moduleType, windowLabel, rowInfo, ...detailInfo, label(status)].filter(Boolean);
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
            {shop.next_retry_at ? <small>{t('schedule.nextRetry')}: {new Date(shop.next_retry_at).toLocaleString(locale, { hour12: false })}</small> : null}
            {shop.error ? <details className="run-monitor__result-error"><summary>{shop.error}</summary><p>{shop.error}</p></details> : null}
            {shop.total == null && !shop.windows?.length && !shop.error && !shop.next_retry_at ? <span className="run-monitor__muted">{t('schedule.monitor.noResultDetails')}</span> : null}
          </td>
        </tr>;
      })}</tbody>
    </table>{!visible.length ? <p className="run-monitor__empty">{t('schedule.monitor.noEntities')}</p> : null}</div>
  </details>;
}
