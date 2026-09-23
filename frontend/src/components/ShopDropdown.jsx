import React, { useEffect, useMemo, useRef, useState } from 'react';

const avatarUrlOf = (shop) => shop?.avatar_url || shop?.logo_url || shop?.logo?.url || '';

const avatarTextOf = (shop) => String(shop?.name || shop?.code || 'TS')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part.charAt(0))
  .join('')
  .toUpperCase() || 'TS';

const ShopAvatar = ({ shop }) => {
  const avatarUrl = avatarUrlOf(shop);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const showImage = Boolean(avatarUrl) && !imageFailed;
  return (
    <span className={`shop-dropdown__avatar${showImage ? '' : ' shop-dropdown__avatar--fallback'}`} aria-hidden="true">
      {showImage
        ? <img src={avatarUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        : avatarTextOf(shop)}
    </span>
  );
};

const ShopDropdown = ({
  id,
  shops,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select a Shop',
  unknownLabel = 'Unknown',
  allLabel = '',
  allDescription = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const options = useMemo(() => (
    allLabel
      ? [{ id: 'all', name: allLabel, region: allDescription, code: '', isAll: true }, ...shops]
      : shops
  ), [allDescription, allLabel, shops]);
  const selectedShop = useMemo(
    () => options.find((shop) => String(shop.id) === String(value)) || null,
    [options, value],
  );

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

  const focusOption = (direction) => {
    window.requestAnimationFrame(() => {
      const options = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
      if (!options.length) return;
      const currentIndex = options.indexOf(document.activeElement);
      const selectedIndex = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
      const baseIndex = currentIndex >= 0 ? currentIndex : Math.max(selectedIndex, 0);
      options[(baseIndex + direction + options.length) % options.length]?.focus();
    });
  };

  const handleKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      focusOption(0);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      window.requestAnimationFrame(() => {
        const options = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
        options[event.key === 'Home' ? 0 : options.length - 1]?.focus();
      });
      return;
    }
    focusOption(event.key === 'ArrowDown' ? 1 : -1);
  };

  const selectShop = (shopId) => {
    onChange(String(shopId));
    setOpen(false);
  };

  return (
    <div className="shop-dropdown" ref={rootRef}>
      <button
        id={id}
        className="shop-dropdown__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className="shop-dropdown__current">
          {selectedShop?.isAll ? null : <ShopAvatar shop={selectedShop} />}
          <span className="shop-dropdown__copy">
            <strong>{selectedShop?.name || placeholder}</strong>
            {selectedShop ? (
              <small>
                {selectedShop.isAll
                  ? selectedShop.region
                  : `${selectedShop.region || unknownLabel} · ${selectedShop.code || selectedShop.platform_shop_id}`}
              </small>
            ) : null}
          </span>
        </span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="shop-dropdown__menu" role="listbox" ref={menuRef} onKeyDown={handleKeyDown}>
          {options.map((shop) => {
            const selected = String(shop.id) === String(value);
            return (
              <button
                className={`shop-dropdown__option${selected ? ' shop-dropdown__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={selected}
                key={shop.id}
                onClick={() => selectShop(shop.id)}
              >
                {shop.isAll ? null : <ShopAvatar shop={shop} />}
                <span className="shop-dropdown__copy">
                  <strong>{shop.name}</strong>
                  <small>
                    {shop.isAll
                      ? shop.region
                      : `${shop.region || unknownLabel} · ${shop.code || shop.platform_shop_id}`}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default ShopDropdown;
