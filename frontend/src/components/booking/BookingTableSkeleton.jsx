import React from 'react';

const BookingTableSkeleton = ({ label = 'Đang tải dữ liệu' }) => (
  <div className="booking-table-skeleton" role="status" aria-label={label} aria-live="polite">
    <div className="booking-table-skeleton__head" aria-hidden="true">
      {[34, 10, 10, 14, 14, 10].map((width, index) => (
        <span key={index} className="booking-skeleton" style={{ width: `${width}%` }} />
      ))}
    </div>
    {[0, 1, 2, 3, 4].map((row) => (
      <div className="booking-table-skeleton__row" key={row} aria-hidden="true">
        <div className="booking-table-skeleton__identity">
          <span className="booking-skeleton booking-skeleton--avatar" />
          <span className="booking-table-skeleton__identity-copy">
            <span className="booking-skeleton" />
            <span className="booking-skeleton booking-skeleton--short" />
          </span>
        </div>
        {[0, 1, 2, 3, 4].map((cell) => <span className="booking-skeleton booking-skeleton--value" key={cell} />)}
      </div>
    ))}
    <span className="sr-only">{label}</span>
  </div>
);

export default BookingTableSkeleton;
