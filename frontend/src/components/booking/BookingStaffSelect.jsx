import React, { useEffect, useId, useRef, useState } from 'react';
import TargetKocAvatar from './TargetKocAvatar';

const BookingStaffSelect = ({
  users,
  value,
  onChange,
  placeholder,
  loading,
  loadingLabel,
  allLabel,
  showAll = false,
}) => {
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = users.find((user) => String(user.id) === String(value)) || null;
  const isAll = showAll && value === 'all';
  const showTriggerAvatar = !isAll && Boolean(selected);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
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

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const selectableUsers = users.filter((user) => user.is_active !== false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredUsers = normalizedQuery
    ? selectableUsers.filter((user) => (
      [user.name, user.email].filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase().includes(normalizedQuery))
    ))
    : selectableUsers;

  const toggle = () => setOpen((current) => !current);

  return (
    <div className="booking-koc-combobox booking-staff-select" ref={rootRef}>
      <button
        className={`booking-staff-select__trigger${!showTriggerAvatar ? ' booking-staff-select__trigger--no-avatar' : ''}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={loading}
        onClick={toggle}
      >
        {showTriggerAvatar ? <TargetKocAvatar src={selected?.avatar_url} name={selected?.name || 'U'} /> : null}
        <span className="booking-staff-select__meta">
          <strong>{isAll ? allLabel : selected?.name || (loading ? loadingLabel : placeholder)}</strong>
          {selected?.email ? <small>{selected.email}</small> : null}
        </span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="booking-koc-combobox__menu booking-staff-select__menu" id={menuId} role="listbox">
          <label className="booking-staff-select__search">
            <span className="sr-only">Tìm nhân viên</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên hoặc email…"
            />
          </label>
          {showAll ? (
            <button
              className={`booking-koc-combobox__option booking-staff-select__option--all${isAll ? ' booking-koc-combobox__option--active' : ''}`}
              type="button"
              role="option"
              aria-selected={isAll}
              onClick={() => { onChange('all'); setOpen(false); }}
            >
              <span className="booking-staff-select__option-meta"><strong>{allLabel}</strong></span>
              {isAll ? <span className="booking-staff-select__check" aria-hidden="true">✓</span> : null}
            </button>
          ) : null}
          {filteredUsers.length ? filteredUsers.map((user) => (
            <button
              className={`booking-koc-combobox__option${String(user.id) === String(value) ? ' booking-koc-combobox__option--active' : ''}`}
              type="button"
              role="option"
              aria-selected={String(user.id) === String(value)}
              key={user.id}
              onClick={() => { onChange(String(user.id)); setOpen(false); }}
            >
              <TargetKocAvatar src={user.avatar_url} name={user.name} />
              <span className="booking-staff-select__option-meta">
                <strong>{user.name}</strong>
                <small>{user.email || '—'}</small>
              </span>
              {String(user.id) === String(value) ? <span className="booking-staff-select__check" aria-hidden="true">✓</span> : null}
            </button>
          )) : <div className="booking-koc-combobox__empty">Không có nhân viên phù hợp.</div>}
        </div>
      ) : null}
    </div>
  );
};

export default BookingStaffSelect;
