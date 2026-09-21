import React from 'react';
import BookingEvaluationTable from './BookingEvaluationTable';
import TargetKocAvatar from './TargetKocAvatar';
import { HeaderTooltip, SortIcon } from './BookingIcons';

const BookingGroupsTable = ({
  groups,
  expandedGroupKeys,
  onToggleGroup,
  overviewSort,
  onOverviewSort,
  sortedBookingsOfGroup,
  bookingTableProps,
  selectedCurrency,
  formatMoney,
  formatNumber,
  formatRatio,
  t,
}) => (
  <div className="table-wrap booking-staff-overview-wrap">
    <table className="data-table data-table--compact booking-staff-overview-table">
      <thead>
        <tr>
          {[
            ['staff', 'booking.bookingStaff', ''],
            ['koc', 'booking.kocColumn', 'cell-number'],
            ['videos', bookingTableProps.bookingTab === 'product' ? 'booking.affiliateOrders' : 'booking.matchedVideo', 'cell-number'],
            ['cost', 'booking.totalCost', 'cell-number'],
            ['revenue', 'booking.totalRevenue', 'cell-number'],
            ['ratio', 'booking.costRevenueRatio', 'cell-number'],
          ].map(([key, label, className]) => (
            <th key={key} className={`${className} sortable-th`.trim()}>
              <button type="button" className="table-sort-btn" onClick={() => onOverviewSort(key)}>
                <span>{t(label)}</span>
                {key === 'koc' && bookingTableProps.bookingTab === 'video' ? (
                  <HeaderTooltip text={t('booking.paidKocTooltip')} />
                ) : null}
                <SortIcon active={overviewSort.key === key} direction={overviewSort.direction} />
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const isExpanded = expandedGroupKeys.has(group.key);
          return (
            <React.Fragment key={group.key}>
              <tr
                className={isExpanded ? 'member-row member-row--expanded' : 'member-row'}
                onClick={(event) => {
                  if (event.target.closest('button, a, input, select, textarea, label')) return;
                  onToggleGroup(group.key);
                }}
              >
                <td>
                  <button
                    className="member-row__trigger booking-staff-row__trigger"
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => onToggleGroup(group.key)}
                  >
                    <TargetKocAvatar src={group.manager.avatar_url} name={group.manager.name} />
                    <span className="booking-staff-row__identity">
                      <strong>{group.manager.name}</strong>
                      {group.manager.email ? <small>{group.manager.email}</small> : null}
                    </span>
                  </button>
                </td>
                <td className="cell-number">{formatNumber(group.kocCount)}</td>
                <td className="cell-number">{formatNumber(group.videoCount)}</td>
                <td className="cell-number">{formatMoney(group.totalCost, selectedCurrency)}</td>
                <td className="cell-number">{formatMoney(group.totalRevenue, selectedCurrency)}</td>
                <td className="cell-number">{formatRatio(group.totalRevenue > 0 ? group.totalCost / group.totalRevenue : null)}</td>
              </tr>
              {isExpanded ? (
                <tr className="member-detail-row">
                  <td colSpan={6}>
                    <BookingEvaluationTable
                      {...bookingTableProps}
                      bookings={sortedBookingsOfGroup(group.bookings)}
                    />
                  </td>
                </tr>
              ) : null}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default BookingGroupsTable;
