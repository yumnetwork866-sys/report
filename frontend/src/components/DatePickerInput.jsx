import React, { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateOnly } from '../lib/date';

const DatePickerInput = ({ id, value, onChange, min, max, label = 'Choose date', required = false, invalid = false }) => {
  const inputRef = useRef(null);
  const openPicker = () => {
    if (typeof inputRef.current?.showPicker === 'function') inputRef.current.showPicker();
    else inputRef.current?.click();
  };

  return (
    <span className="channel-report-date-picker">
      <button className="channel-report-date-picker__value" type="button" onClick={openPicker} aria-label={label}>
        <span>{formatDateOnly(value, 'dd/mm/yyyy')}</span>
        <CalendarDays className="channel-report-date-picker__icon" size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        id={id}
        type="date"
        lang="en-GB"
        value={value}
        min={min}
        max={max}
        aria-label={label}
        required={required}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
};

export default DatePickerInput;
