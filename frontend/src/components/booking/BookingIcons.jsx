import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const BOOKING_VIDEO_ICON_PATHS = {
  views: ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  likes: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6a5.5 5.5 0 0 0 1-8.8Z'],
  comments: ['M21 12a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 21l1.4-3.5A8 8 0 1 1 21 12Z'],
  shares: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M8.6 10.5l6.8-4', 'M8.6 13.5l6.8 4'],
};

export const BookingVideoIcon = ({ name }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {(BOOKING_VIDEO_ICON_PATHS[name] || []).map((path) => <path key={path} d={path} />)}
  </svg>
);

export const SortIcon = ({ active, direction }) => {
  if (!active) {
    return (
      <span className="table-sort-icon table-sort-icon--idle" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7 15 5 5 5-5" />
          <path d="m7 9 5-5 5 5" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`table-sort-icon table-sort-icon--active table-sort-icon--${direction}`} aria-hidden="true">
      {direction === 'asc' ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m18 15-6-6-6 6" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      )}
    </span>
  );
};

export const HeaderTooltip = ({ text }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);

  const handleShow = (e) => {
    e?.stopPropagation?.();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const showAbove = rect.bottom + 80 > window.innerHeight;
    setPosition({
      left: Math.min(window.innerWidth - 220, Math.max(12, rect.left + rect.width / 2 - 100)),
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      showAbove,
    });
    setShow(true);
  };

  const handleHide = (e) => {
    e?.stopPropagation?.();
    setShow(false);
  };

  return (
    <span
      ref={triggerRef}
      className="table-header-help"
      title={text}
      role="button"
      tabIndex={0}
      aria-label={text}
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocus={handleShow}
      onBlur={handleHide}
      onClick={(e) => {
        e.stopPropagation();
        if (show) handleHide(e);
        else handleShow(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          if (show) handleHide(e);
          else handleShow(e);
        }
      }}
    >
      <span className="table-header-help__icon" aria-hidden="true">i</span>
      {show && position && typeof document !== 'undefined' ? createPortal(
        <span
          className={`table-header-tooltip${position.showAbove ? ' table-header-tooltip--above' : ''}`}
          role="tooltip"
          style={{ left: position.left, top: position.top }}
        >
          {text}
        </span>,
        document.body,
      ) : null}
    </span>
  );
};
