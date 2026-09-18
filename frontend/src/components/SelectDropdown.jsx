import React, { useEffect, useMemo, useRef, useState } from 'react';

const SelectDropdown = ({
  id,
  options = [],
  value,
  onChange,
  disabled = false,
  placeholder = '',
  icon = null,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
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
      const optionElements = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
      if (!optionElements.length) return;
      const currentIndex = optionElements.indexOf(document.activeElement);
      const selectedIndex = optionElements.findIndex((option) => option.getAttribute('aria-selected') === 'true');
      const baseIndex = currentIndex >= 0 ? currentIndex : Math.max(selectedIndex, 0);
      optionElements[(baseIndex + direction + optionElements.length) % optionElements.length]?.focus();
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
        const optionElements = [...(menuRef.current?.querySelectorAll('[role="option"]') || [])];
        optionElements[event.key === 'Home' ? 0 : optionElements.length - 1]?.focus();
      });
      return;
    }
    focusOption(event.key === 'ArrowDown' ? 1 : -1);
  };

  const handleSelect = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className={`shop-dropdown select-dropdown${className ? ` ${className}` : ''}`} ref={rootRef}>
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
          {icon ? <span className="shop-dropdown__avatar shop-dropdown__avatar--icon" aria-hidden="true">{icon}</span> : null}
          <span className="shop-dropdown__copy">
            <strong>{selectedOption?.label || placeholder}</strong>
            {selectedOption?.subtitle ? <small>{selectedOption.subtitle}</small> : null}
          </span>
        </span>
        <span className={`sidebar__chevron${open ? ' sidebar__chevron--open' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        <div className="shop-dropdown__menu" role="listbox" ref={menuRef} onKeyDown={handleKeyDown}>
          {options.map((option) => {
            const selected = String(option.value) === String(value);
            return (
              <button
                className={`shop-dropdown__option${selected ? ' shop-dropdown__option--active' : ''}`}
                type="button"
                role="option"
                aria-selected={selected}
                key={option.value}
                onClick={() => handleSelect(option.value)}
              >
                {option.icon ? (
                  <span className="shop-dropdown__avatar shop-dropdown__avatar--icon" aria-hidden="true">{option.icon}</span>
                ) : null}
                <span className="shop-dropdown__copy">
                  <strong>{option.label}</strong>
                  {option.subtitle ? <small>{option.subtitle}</small> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default SelectDropdown;
