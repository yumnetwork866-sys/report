import { useEffect, useRef, useState } from 'react';

const CreatorDropdownAvatar = ({ creator, fallbackLabel }) => {
  const [failed, setFailed] = useState(false);
  const src = creator?.avatarUrl;
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={`shop-dropdown__avatar${src && !failed ? '' : ' shop-dropdown__avatar--fallback'}`} aria-hidden="true">
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : String(creator?.name || creator?.username || fallbackLabel || 'C').trim().charAt(0).toUpperCase()}
    </span>
  );
};

const CreatorDropdown = ({
  id, options, value, onChange, disabled, allLabel, searchPlaceholder, noResultsLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const selectedCreator = options.find((creator) => creator.value === value) || null;
  const normalizedQuery = query.trim().replace(/^@+/, '').toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((creator) => [creator.name, creator.username]
      .filter(Boolean)
      .some((text) => String(text).toLocaleLowerCase().includes(normalizedQuery)))
    : options;

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
    if (open) window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const focusOption = (direction) => {
    window.requestAnimationFrame(() => {
      const menuOptions = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
      if (!menuOptions.length) return;
      const focusedIndex = menuOptions.indexOf(document.activeElement);
      const selectedIndex = menuOptions.findIndex((option) => option.getAttribute('aria-selected') === 'true');
      const targetIndex = focusedIndex >= 0
        ? (focusedIndex + direction + menuOptions.length) % menuOptions.length
        : selectedIndex >= 0 ? selectedIndex : direction < 0 ? menuOptions.length - 1 : 0;
      menuOptions[targetIndex]?.focus();
    });
  };

  const handleKeyDown = (event) => {
    const fromSearch = event.target === searchRef.current;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
      || (fromSearch && ['Home', 'End'].includes(event.key))) return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      focusOption(0);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      window.requestAnimationFrame(() => {
        const menuOptions = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
        menuOptions[event.key === 'Home' ? 0 : menuOptions.length - 1]?.focus();
      });
      return;
    }
    focusOption(event.key === 'ArrowDown' ? 1 : -1);
  };

  const choose = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  const renderCopy = (creator) => (
    <span className="shop-dropdown__copy">
      <strong>{creator?.name || (creator?.username ? `@${creator.username}` : allLabel)}</strong>
      {creator?.name && creator?.username ? <small>@{creator.username}</small> : null}
    </span>
  );

  return (
    <div className="shop-dropdown creator-filter-dropdown" ref={rootRef}>
      <button
        id={id}
        className="shop-dropdown__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setQuery('');
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="shop-dropdown__current">
          <CreatorDropdownAvatar creator={selectedCreator} fallbackLabel={allLabel} />
          {renderCopy(selectedCreator)}
        </span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="shop-dropdown__menu creator-filter-dropdown__menu" ref={menuRef} onKeyDown={handleKeyDown}>
          <div className="creator-filter-dropdown__search">
            <input
              ref={searchRef}
              type="search"
              value={query}
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div role="listbox">
            {!normalizedQuery ? (
              <button
                className={`shop-dropdown__option${value ? '' : ' shop-dropdown__option--active'}`}
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => choose('')}
              >
                <CreatorDropdownAvatar fallbackLabel={allLabel} />
                {renderCopy(null)}
              </button>
            ) : null}
            {filteredOptions.map((creator) => (
              <button
                className={`shop-dropdown__option${creator.value === value ? ' shop-dropdown__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={creator.value === value}
                key={creator.value}
                onClick={() => choose(creator.value)}
              >
                <CreatorDropdownAvatar creator={creator} />
                {renderCopy(creator)}
              </button>
            ))}
            {normalizedQuery && !filteredOptions.length ? (
              <div className="creator-filter-dropdown__empty">{noResultsLabel}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CreatorDropdown;
