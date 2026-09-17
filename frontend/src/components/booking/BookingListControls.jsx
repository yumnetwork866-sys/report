import React from 'react';
import DatePickerInput from '../DatePickerInput';
import BookingStaffSelect from './BookingStaffSelect';

const BookingListControls = ({
  bookingGroups,
  bookingManagerFilterValue,
  onManagerChange,
  canManageUsers,
  bookingTab,
  selectedMonth,
  onMonthChange,
  monthOptions,
  customRange,
  onCustomRangeChange,
  t,
}) => (
  <div className="section-card__header booking-evaluation-list-header">
    <div className="booking-performance-controls">
      {bookingGroups.length ? (
        <div className="field booking-manager-filter">
          <label>{t('booking.bookingStaff')}</label>
          <BookingStaffSelect
            users={bookingGroups.map((group) => ({ id: group.key, ...group.manager }))}
            value={bookingManagerFilterValue}
            onChange={onManagerChange}
            placeholder={t('booking.selectStaff')}
            allLabel={t('booking.allStaff')}
            showAll={canManageUsers}
            loading={false}
            loadingLabel={t('booking.loading')}
          />
        </div>
      ) : null}
      <div className="field booking-month-filter">
        <label htmlFor="booking-month-select">{bookingTab === 'video' ? t('booking.videoPostPeriod') : t('booking.orderPeriod')}</label>
        <select id="booking-month-select" value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)}>
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.labelKey ? t(option.labelKey) : option.label}
            </option>
          ))}
        </select>
      </div>
      {selectedMonth === 'custom' ? (
        <>
          <div className="field booking-month-custom-date">
            <label htmlFor="booking-custom-start">{t('booking.startDate')}</label>
            <DatePickerInput
              id="booking-custom-start"
              label={t('booking.startDate')}
              value={customRange.start}
              max={customRange.end || undefined}
              onChange={(value) => onCustomRangeChange({ ...customRange, start: value })}
            />
          </div>
          <div className="field booking-month-custom-date">
            <label htmlFor="booking-custom-end">{t('booking.endDate')}</label>
            <DatePickerInput
              id="booking-custom-end"
              label={t('booking.endDate')}
              value={customRange.end}
              min={customRange.start || undefined}
              onChange={(value) => onCustomRangeChange({ ...customRange, end: value })}
            />
          </div>
        </>
      ) : null}
    </div>
  </div>
);

export default BookingListControls;
