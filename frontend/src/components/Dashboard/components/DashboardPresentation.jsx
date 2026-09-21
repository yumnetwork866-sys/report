import React, { useEffect, useRef, useState } from 'react';
import {
  CircleDollarSign,
  Eye,
  Heart,
  MessageCircle,
  Minus,
  Share2,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  UserRound,
  UsersRound,
  Video,
} from 'lucide-react';

export const UserAvatar = ({ user, className, fallbackClassName }) => {
  const avatarSeed = String(user?.id || user?.email || user?.name || 'user');
  const generatedAvatarUrl = `https://api.dicebear.com/10.x/pixel-art/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=e6f7f5`;
  const sources = [...new Set([user?.avatar_url, generatedAvatarUrl].filter(Boolean))];
  const sourceKey = sources.join('|');
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => setSourceIndex(0), [sourceKey]);

  if (!sources[sourceIndex]) {
    return <span className={`${className} ${fallbackClassName}`} aria-hidden="true"><UserRound size={16} /></span>;
  }

  return (
    <img
      className={className}
      src={sources[sourceIndex]}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSourceIndex((current) => current + 1)}
    />
  );
};

export const UserPicker = ({ id, users, value, onChange, allLabel, disabled }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedUser = users.find((user) => String(user.id) === String(value)) || null;
  const isAll = value === 'all';

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="channel-picker dashboard-user-picker" ref={rootRef}>
      <button
        id={id}
        className="channel-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-picker__current">
          {isAll ? (
            <span className="channel-picker__avatar channel-picker__avatar--empty" aria-hidden="true"><UsersRound size={16} /></span>
          ) : (
            <UserAvatar
              user={selectedUser}
              className="channel-picker__avatar"
              fallbackClassName="channel-picker__avatar--empty"
            />
          )}
          <span className="channel-picker__label">{isAll ? allLabel : selectedUser?.name || selectedUser?.email}</span>
        </span>
        <span className={`sidebar__chevron channel-picker__chevron ${open ? 'sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="channel-picker__menu" role="listbox">
          <button
            className={`channel-picker__option ${isAll ? 'channel-picker__option--active' : ''}`}
            type="button"
            role="option"
            aria-selected={isAll}
            onClick={() => { onChange('all'); setOpen(false); }}
          >
            <span className="channel-picker__option-avatar channel-picker__option-avatar--empty" aria-hidden="true"><UsersRound size={16} /></span>
            <span className="channel-picker__option-meta"><span className="channel-picker__option-title">{allLabel}</span></span>
          </button>
          {users.map((user) => {
            const active = String(user.id) === String(value);
            return (
              <button
                className={`channel-picker__option ${active ? 'channel-picker__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={active}
                key={user.id}
                onClick={() => { onChange(String(user.id)); setOpen(false); }}
              >
                <UserAvatar
                  user={user}
                  className="channel-picker__option-avatar"
                  fallbackClassName="channel-picker__option-avatar--empty"
                />
                <span className="channel-picker__option-meta">
                  <span className="channel-picker__option-title">{user.name || user.email}</span>
                  {user.email ? <span className="channel-picker__option-subtitle">{user.email}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const dailyMetricOptions = [
  { value: 'gmv', labelKey: 'dashboard.metric_gmv_daily', Icon: CircleDollarSign },
  { value: 'views', labelKey: 'dashboard.metric_views_daily', Icon: Eye },
  { value: 'orders', labelKey: 'dashboard.totalOrders', Icon: ShoppingBag },
  { value: 'likes', labelKey: 'dashboard.metric_likes', Icon: Heart },
  { value: 'shares', labelKey: 'dashboard.metric_shares', Icon: Share2 },
  { value: 'comments', labelKey: 'dashboard.metric_comments', Icon: MessageCircle },
  { value: 'video_count', labelKey: 'dashboard.metric_videos_daily', Icon: Video },
];

export const MetricPicker = ({ id, value, onChange, t }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption = dailyMetricOptions.find((option) => option.value === value) || dailyMetricOptions[0];
  const SelectedIcon = selectedOption.Icon;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="channel-picker dashboard-metric-picker" ref={rootRef}>
      <button
        id={id}
        className="channel-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-picker__current">
          <SelectedIcon className="dashboard-metric-picker__icon" size={18} aria-hidden="true" />
          <span className="channel-picker__label">{t(selectedOption.labelKey)}</span>
        </span>
        <span className={`sidebar__chevron channel-picker__chevron ${open ? 'sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="channel-picker__menu" role="listbox">
          {dailyMetricOptions.map(({ value: optionValue, labelKey, Icon }) => {
            const active = optionValue === value;
            return (
              <button
                className={`channel-picker__option ${active ? 'channel-picker__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={active}
                key={optionValue}
                onClick={() => { onChange(optionValue); setOpen(false); }}
              >
                <Icon className="dashboard-metric-picker__icon" size={18} aria-hidden="true" />
                <span className="channel-picker__option-meta">
                  <span className="channel-picker__option-title">{t(labelKey)}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export const GrowthBadge = ({ value, label }) => {
  if (value === null || value === undefined) return null;
  const isPositive = value > 0;
  const isNegative = value < 0;
  const formatted = `${isPositive ? '+' : ''}${value.toFixed(1)}%`;

  return (
    <div
      className={`stat-card__growth ${
        isPositive
          ? 'stat-card__growth--positive'
          : isNegative
            ? 'stat-card__growth--negative'
            : 'stat-card__growth--neutral'
      }`}
      title={`${formatted} ${label}`}
    >
      {isPositive ? (
        <TrendingUp size={11} aria-hidden="true" />
      ) : isNegative ? (
        <TrendingDown size={11} aria-hidden="true" />
      ) : (
        <Minus size={11} aria-hidden="true" />
      )}
      <span>{formatted}</span>
      <span className="stat-card__growth-label">{label}</span>
    </div>
  );
};

export const DashboardBarLabel = ({ x, y, width, value, index, total, formatter }) => {
  const numericValue = Number(value || 0);
  if (!numericValue) return null;
  const step = total > 60 ? 7 : total > 40 ? 5 : total > 28 ? 4 : total > 18 ? 3 : total > 10 ? 2 : 1;
  if (Number(index || 0) % step !== 0) return null;
  return (
    <text
      className="dashboard-chart-label"
      x={Number(x || 0) + Number(width || 0) / 2}
      y={Number(y || 0) - 7}
      textAnchor="middle"
    >
      {formatter(numericValue)}
    </text>
  );
};

export const ActiveDotGlow = ({ cx, cy, stroke }) => {
  if (cx == null || cy == null || Number.isNaN(cx) || Number.isNaN(cy)) return null;
  const strokeColor = stroke || 'var(--color-primary, #0ea5e9)';
  return (
    <g className="dashboard-chart-active-dot">
      <circle cx={cx} cy={cy} r={9} fill={strokeColor} fillOpacity={0.25} />
      <circle cx={cx} cy={cy} r={4.5} fill="#ffffff" stroke={strokeColor} strokeWidth={2.5} />
    </g>
  );
};

export const DashboardChartTooltip = ({
  active,
  payload,
  formatNumber,
  formatGmvAmount,
  currency,
  t,
  dailyMetric,
  metricLabel,
}) => {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  const videoCount = Number(item.videoCount || 0);
  const isGmv = !dailyMetric || dailyMetric === 'gmv';
  const selectedMetricValue = dailyMetric === 'video_count'
    ? videoCount
    : (item[dailyMetric] ?? item.value ?? 0);

  return (
    <div className="dashboard-chart-tooltip">
      <div className="dashboard-chart-tooltip__header">
        <strong className="dashboard-chart-tooltip__title">{item.fullName}</strong>
        {videoCount > 0 ? (
          <span className="dashboard-chart-tooltip__badge">
            <Video size={11} aria-hidden="true" />
            <span>{formatNumber(videoCount)} {t('dashboard.video')}</span>
          </span>
        ) : null}
      </div>

      <div className="dashboard-chart-tooltip__hero">
        <div className="dashboard-chart-tooltip__hero-card dashboard-chart-tooltip__hero-card--gmv">
          <span className="dashboard-chart-tooltip__hero-label">
            <span className="dashboard-chart-tooltip__indicator dashboard-chart-tooltip__indicator--gmv" />
            {t('dashboard.metric_gmv')}
          </span>
          <strong className="dashboard-chart-tooltip__hero-val">
            {formatGmvAmount(item.gross_gmv || 0, currency)}
          </strong>
        </div>
        <div className="dashboard-chart-tooltip__hero-card dashboard-chart-tooltip__hero-card--views">
          <span className="dashboard-chart-tooltip__hero-label">
            <span className="dashboard-chart-tooltip__indicator dashboard-chart-tooltip__indicator--views" />
            {isGmv ? t('dashboard.totalViews') : (metricLabel || t(`dashboard.metric_${dailyMetric}`))}
          </span>
          <strong className="dashboard-chart-tooltip__hero-val">
            {formatNumber(isGmv ? item.views || 0 : selectedMetricValue)}
          </strong>
        </div>
      </div>

      <div className="dashboard-chart-tooltip__grid">
        {!isGmv && dailyMetric !== 'views' ? (
          <div className="dashboard-chart-tooltip__stat">
            <span className="dashboard-chart-tooltip__stat-label">{t('dashboard.totalViews')}</span>
            <b className="dashboard-chart-tooltip__stat-value">{formatNumber(item.views || 0)}</b>
          </div>
        ) : null}
        {dailyMetric !== 'orders' ? (
          <div className="dashboard-chart-tooltip__stat">
            <span className="dashboard-chart-tooltip__stat-label">{t('dashboard.totalOrders')}</span>
            <b className="dashboard-chart-tooltip__stat-value">{formatNumber(item.orders || 0)}</b>
          </div>
        ) : null}
        {dailyMetric !== 'likes' ? (
          <div className="dashboard-chart-tooltip__stat">
            <span className="dashboard-chart-tooltip__stat-label">{t('dashboard.totalLikes')}</span>
            <b className="dashboard-chart-tooltip__stat-value">{formatNumber(item.likes || 0)}</b>
          </div>
        ) : null}
        {dailyMetric !== 'comments' ? (
          <div className="dashboard-chart-tooltip__stat">
            <span className="dashboard-chart-tooltip__stat-label">{t('dashboard.totalComments')}</span>
            <b className="dashboard-chart-tooltip__stat-value">{formatNumber(item.comments || 0)}</b>
          </div>
        ) : null}
        {dailyMetric !== 'shares' ? (
          <div className="dashboard-chart-tooltip__stat">
            <span className="dashboard-chart-tooltip__stat-label">{t('dashboard.totalShares')}</span>
            <b className="dashboard-chart-tooltip__stat-value">{formatNumber(item.shares || 0)}</b>
          </div>
        ) : null}
      </div>
    </div>
  );
};

