import React, { useEffect, useMemo, useRef, useState } from 'react';

export const ChannelAvatar = ({ channel }) => {
  const [failed, setFailed] = useState(false);
  const avatarUrl = channel?.avatar_url || '';
  useEffect(() => setFailed(false), [avatarUrl]);
  return (
    <span className="channel-report-channel-picker__avatar" aria-hidden="true">
      {avatarUrl && !failed
        ? <img src={avatarUrl} alt="" onError={() => setFailed(true)} />
        : String(channel?.name || 'TK').trim().charAt(0).toUpperCase()}
    </span>
  );
};

export const VideoProductThumb = ({ product }) => {
  const [failed, setFailed] = useState(false);
  const imageUrl = product?.image_url || product?.thumbnail_url || product?.thumbnailUrl || product?.main_image_url || '';
  const quantity = Number(product?.quantity || 0);
  useEffect(() => setFailed(false), [imageUrl]);

  const tooltip = product.name
    ? `${product.name} (Đã bán: ${quantity})`
    : `Đã bán: ${quantity}`;

  return (
    <span
      className="member-detail__video-order-thumb"
      title={tooltip}
    >
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="member-detail__video-order-thumb-placeholder" aria-hidden="true">
          {(product.name || 'P').trim().charAt(0).toUpperCase() || 'P'}
        </span>
      )}
      <span
        className={`member-detail__video-order-thumb-badge${quantity > 0 ? ' member-detail__video-order-thumb-badge--active' : ''}`}
        aria-label={`Số lượng bán: ${quantity}`}
      >
        x{quantity}
      </span>
    </span>
  );
};

export const ProductRowThumb = ({ product }) => {
  const [failed, setFailed] = useState(false);
  const imageUrl = product?.image_url || product?.thumbnail_url || product?.thumbnailUrl || '';
  useEffect(() => setFailed(false), [imageUrl]);

  return (
    <span className="member-detail__product-thumb">
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="member-detail__product-thumb-fallback" aria-hidden="true">
          {(product?.name || 'P').trim().charAt(0).toUpperCase() || 'P'}
        </span>
      )}
    </span>
  );
};

export const ChannelSelectDropdown = ({ channels, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedChannel = channels.find((channel) => String(channel.id) === String(value)) || null;
  const label = selectedChannel?.name || 'Tất cả kênh';

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape'
        || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const selectChannel = (channelId) => {
    onChange(String(channelId));
    setOpen(false);
  };

  return (
    <div className="channel-report-channel-picker" ref={rootRef}>
      <button
        id="channel-report-channel"
        className="channel-report-channel-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!channels.length}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-report-channel-picker__current">
          {selectedChannel ? <ChannelAvatar channel={selectedChannel} /> : null}
          <span title={label}>{channels.length ? label : 'Chưa có kênh'}</span>
        </span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="channel-report-channel-picker__menu" role="listbox">
          <button
            type="button"
            className={`channel-report-channel-picker__option${value === 'all' ? ' channel-report-channel-picker__option--active' : ''}`}
            role="option"
            aria-selected={value === 'all'}
            onClick={() => selectChannel('all')}
          >
            <span className="channel-report-channel-picker__copy">
              <span><strong>Tất cả kênh</strong><small>{channels.length} kênh</small></span>
            </span>
          </button>
          {channels.map((channel) => {
            const selected = String(channel.id) === String(value);
            return (
              <button
                type="button"
                className={`channel-report-channel-picker__option${selected ? ' channel-report-channel-picker__option--active' : ''}`}
                role="option"
                aria-selected={selected}
                key={channel.id}
                onClick={() => selectChannel(channel.id)}
              >
                <span className="channel-report-channel-picker__copy">
                  <ChannelAvatar channel={channel} />
                  <span><strong>{channel.name || `Kênh #${channel.id}`}</strong></span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export const TeamSelectDropdown = ({ teams, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const isAll = value === 'all' || !Array.isArray(value);
  const selectedSet = useMemo(() => {
    if (isAll) return new Set(teams.map((team) => String(team.id)));
    return new Set((value || []).map(String));
  }, [isAll, value, teams]);

  const allSelected = teams.length > 0 && teams.every((team) => selectedSet.has(String(team.id)));

  let label = 'Tất cả team';
  if (!allSelected && teams.length > 0) {
    const selectedTeams = teams.filter((team) => selectedSet.has(String(team.id)));
    if (selectedTeams.length === 0) {
      label = 'Chưa chọn team';
    } else if (selectedTeams.length === 1) {
      label = selectedTeams[0].name;
    } else {
      label = `Đã chọn ${selectedTeams.length} team`;
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape'
        || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange('all');
    }
  };

  const toggleTeam = (teamId) => {
    const idStr = String(teamId);
    let next;
    if (allSelected) {
      next = teams.map((team) => String(team.id)).filter((id) => id !== idStr);
    } else if (selectedSet.has(idStr)) {
      next = [...selectedSet].filter((id) => id !== idStr);
    } else {
      next = [...selectedSet, idStr];
    }
    if (teams.length > 0 && next.length === teams.length) {
      onChange('all');
    } else {
      onChange(next);
    }
  };

  return (
    <div className="channel-report-team-picker" ref={rootRef}>
      <button
        id="channel-report-team"
        className="channel-report-team-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={!teams.length}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-report-team-picker__current">
          <span title={label}>{teams.length ? label : 'Chưa có team'}</span>
        </span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="channel-report-team-picker__menu" role="group">
          <label className="channel-report-team-picker__option">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
            />
            <span className="channel-report-team-picker__copy">
              <strong>Tất cả team</strong>
              <small>{teams.length} team</small>
            </span>
          </label>
          <div className="channel-report-team-picker__divider" />
          {teams.map((team) => {
            const checked = selectedSet.has(String(team.id));
            return (
              <label className="channel-report-team-picker__option" key={team.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTeam(team.id)}
                />
                <span className="channel-report-team-picker__copy">
                  <span>{team.name}</span>
                  {team.member_count ? <small>{team.member_count} thành viên</small> : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export const ReportSelectDropdown = ({ id, options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption = options.find((option) => String(option.value) === String(value)) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape'
        || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="channel-report-channel-picker channel-report-single-picker" ref={rootRef}>
      <button
        id={id}
        className="channel-report-channel-picker__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="channel-report-channel-picker__current">
          <span title={selectedOption?.label}>{selectedOption?.label}</span>
        </span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="channel-report-channel-picker__menu" role="listbox">
          {options.map((option) => {
            const selected = String(option.value) === String(value);
            return (
              <button
                type="button"
                className={`channel-report-channel-picker__option${selected ? ' channel-report-channel-picker__option--active' : ''}`}
                role="option"
                aria-selected={selected}
                key={option.value}
                onClick={() => { onChange(option.value); setOpen(false); }}
              >
                <span><strong>{option.label}</strong></span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
