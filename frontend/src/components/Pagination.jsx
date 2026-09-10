import React from 'react';
import { getPaginationItems } from '../lib/pagination';

const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  disabled = false,
  previousLabel,
  nextLabel,
  ariaLabel,
  className = '',
  alwaysVisible = false,
}) => {
  const total = Math.max(1, Number(totalPages) || 1);
  const current = Math.min(total, Math.max(1, Number(currentPage) || 1));

  if (total <= 1 && !alwaysVisible) return null;

  return (
    <nav className={`pagination ${className}`.trim()} aria-label={ariaLabel}>
      <button
        className="pagination__direction"
        type="button"
        disabled={disabled || current <= 1}
        onClick={() => onPageChange(current - 1)}
      >
        <span aria-hidden="true">‹</span>
        <span className="pagination__direction-label">{previousLabel}</span>
      </button>
      <div className="pagination__pages">
        {getPaginationItems(current, total).map((item) => (
          typeof item === 'number' ? (
            <button
              className={`pagination__page${item === current ? ' pagination__page--active' : ''}`}
              type="button"
              key={item}
              disabled={disabled}
              aria-current={item === current ? 'page' : undefined}
              aria-label={`${item}`}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ) : (
            <span className="pagination__ellipsis" aria-hidden="true" key={item}>…</span>
          )
        ))}
      </div>
      <button
        className="pagination__direction"
        type="button"
        disabled={disabled || current >= total}
        onClick={() => onPageChange(current + 1)}
      >
        <span className="pagination__direction-label">{nextLabel}</span>
        <span aria-hidden="true">›</span>
      </button>
    </nav>
  );
};

export default Pagination;
