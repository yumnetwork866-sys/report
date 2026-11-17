import React from 'react';
import { Download } from 'lucide-react';
import DatePickerInput from '../DatePickerInput';
import BookingStaffSelect from './BookingStaffSelect';

const BookingListControls = ({
  bookingGroups,
  bookingManagerFilterValue,
  onManagerChange,
  canManageUsers,
  hashtagFilterEnabled,
  onHashtagFilterChange,
  bookingTab,
  selectedMonth,
  onMonthChange,
  monthOptions,
  customRange,
  onCustomRangeChange,
  onExportOrders,
  isExportingOrders,
  t,
}) => (
  <div className="section-card__header booking-evaluation-list-header">
    <label
      className={`booking-hashtag-toggle${hashtagFilterEnabled ? ' booking-hashtag-toggle--active' : ''}`}
      title={t('booking.hashtagFilterHelp')}
    >
      <input
        type="checkbox"
        checked={hashtagFilterEnabled}
        onChange={(event) => onHashtagFilterChange(event.target.checked)}
      />
      <span className="booking-hashtag-toggle__label">Hashtag</span>
      <span className="booking-hashtag-toggle__track" aria-hidden="true"><i /></span>
    </label>
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
        <label htmlFor="booking-month-select">
          {bookingTab === 'video'
            ? t('booking.videoPostPeriod')
            : bookingTab === 'by_product'
              ? (t('booking.productPeriod') || 'Thời gian booking')
              : t('booking.orderPeriod')}
        </label>
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
      {onExportOrders ? (
        <div className="field booking-export-field">
          <label style={{ visibility: 'hidden' }} aria-hidden="true">Export</label>
          <button
            type="button"
            className="button button--secondary booking-export-orders-btn"
            onClick={onExportOrders}
            disabled={isExportingOrders}
            title={t('booking.exportOrdersTooltip', { defaultValue: 'Xuất chi tiết toàn bộ đơn hàng video trong kỳ ra file Excel (nhiều sheet theo từng nhân viên)' })}
          >
            <Download size={14} />
            <span>{isExportingOrders ? (t('booking.exportingOrders') || 'Đang xuất…') : (t('booking.exportOrders') || 'Xuất Excel')}</span>
          </button>
        </div>
      ) : null}
    </div>
  </div>
);

export default BookingListControls;
