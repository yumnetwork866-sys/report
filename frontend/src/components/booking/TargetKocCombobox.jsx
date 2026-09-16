import React, { useEffect, useMemo, useRef, useState } from 'react';
import { targetKocKey } from '../../lib/bookingMetrics';
import TargetKocAvatar from './TargetKocAvatar';

const TargetKocCombobox = ({
  creators,
  value,
  onChange,
  onSearch,
  onLoadMore,
  hasMore,
  loading,
  placeholder,
  noResults,
  performanceSourceLabel,
  collaborationLabel,
  loadMoreLabel,
  loadingLabel,
}) => {
  const rootRef = useRef(null);
  const selectedCreator = useMemo(
    () => creators.find((creator) => targetKocKey(creator) === value) || null,
    [creators, value],
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selectedName = selectedCreator?.nickname || selectedCreator?.username || '';

  useEffect(() => setQuery(selectedName), [selectedName]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !rootRef.current?.contains(event.target))) {
        setOpen(false);
        setQuery(selectedName);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open, selectedName]);

  const openSearch = () => {
    setQuery('');
    onSearch('');
    setOpen(true);
  };

  return (
    <div className="booking-koc-combobox" ref={rootRef}>
      <div className={`booking-koc-combobox__control${selectedCreator && !open ? ' booking-koc-combobox__control--selected' : ''}`}>
        {selectedCreator && !open ? (
          <span className="booking-koc-combobox__selected-avatar" aria-hidden="true">
            <TargetKocAvatar src={selectedCreator.avatar_url} name={selectedName} />
          </span>
        ) : null}
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="booking-koc-options"
          value={query}
          placeholder={placeholder}
          required
          onFocus={openSearch}
          onChange={(event) => {
            setQuery(event.target.value);
            onSearch(event.target.value);
            onChange('');
            setOpen(true);
          }}
        />
        <button
          type="button"
          aria-label={placeholder}
          aria-expanded={open}
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery(selectedName);
            } else {
              openSearch();
            }
          }}
        >
          <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <div className="booking-koc-combobox__menu" id="booking-koc-options" role="listbox">
          {creators.length ? creators.map((creator) => (
            <button
              className={`booking-koc-combobox__option${targetKocKey(creator) === value ? ' booking-koc-combobox__option--active' : ''}`}
              type="button"
              role="option"
              aria-selected={targetKocKey(creator) === value}
              key={targetKocKey(creator)}
              onClick={() => { onChange(targetKocKey(creator)); setQuery(creator.nickname || creator.username || ''); setOpen(false); }}
            >
              <TargetKocAvatar src={creator.avatar_url} name={creator.nickname || creator.username} />
              <span>
                <strong>{creator.nickname || creator.username}</strong>
                <small>
                  {creator.shop_name ? `${creator.shop_name} · ` : ''}@{creator.username} · {creator.collaboration_count ? `${creator.collaboration_count} ${collaborationLabel}` : performanceSourceLabel}
                </small>
              </span>
            </button>
          )) : loading ? null : <div className="booking-koc-combobox__empty">{noResults}</div>}
          {loading ? <div className="booking-koc-combobox__empty"><span className="loading-dot" />{loadingLabel}</div> : null}
          {!loading && hasMore ? <button className="booking-koc-combobox__load-more" type="button" onClick={onLoadMore}>{loadMoreLabel}</button> : null}
        </div>
      ) : null}
    </div>
  );
};

export default TargetKocCombobox;
