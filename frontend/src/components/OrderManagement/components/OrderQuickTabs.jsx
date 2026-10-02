import React from 'react';
import { AlertTriangle } from 'lucide-react';

export const OrderQuickTabs = ({
  activeTab,
  onTabChange,
  counts = {},
  shipmentSubStatus = 'all',
  onShipmentSubStatusChange,
  t,
}) => {
  const isToShipActive = activeTab === 'TO_SHIP'
    || activeTab === 'AWAITING_SHIPMENT'
    || activeTab === 'AWAITING_COLLECTION';

  const tabGroups = [
    {
      key: 'active-ops',
      tabs: [
        { id: 'all', label: t('sellerAffiliate.quickTabAll') || 'Tất cả' },
        {
          id: 'TO_SHIP',
          label: t('sellerAffiliate.orderState_TO_SHIP') || t('sellerAffiliate.orderState_AWAITING_SHIPMENT') || 'Chờ giao hàng',
          count: counts.toShip,
          isToShip: true,
        },
        { id: 'IN_TRANSIT', label: t('sellerAffiliate.orderState_IN_TRANSIT') || 'Đang vận chuyển' },
        { id: 'DELIVERED', label: t('sellerAffiliate.orderState_DELIVERED') || 'Đã giao' },
      ],
    },
    {
      key: 'closed-ops',
      tabs: [
        { id: 'COMPLETED', label: t('sellerAffiliate.orderState_COMPLETED') || 'Hoàn tất' },
        { id: 'CANCELLED', label: t('sellerAffiliate.orderState_CANCELLED') || 'Đã hủy' },
      ],
    },
    {
      key: 'alerts',
      tabs: [
        {
          id: 'refund',
          label: t('sellerAffiliate.quickTabRefund') || 'Đổi trả / Hoàn tiền',
          count: counts.refunded,
          badgeVariant: 'refund',
        },
        {
          id: 'attention',
          label: t('sellerAffiliate.quickTabAttention') || 'Cần chú ý',
          count: counts.attention,
          isWarning: true,
          badgeVariant: 'warning',
          icon: <AlertTriangle size={13} className="tab-icon-alert" aria-hidden="true" />,
        },
      ],
    },
  ];

  return (
    <div className="order-quick-tabs-container">
      <div className="order-status-tabs" role="tablist" aria-label={t('sellerAffiliate.orderStatusFilter')}>
        {tabGroups.map((group, groupIdx) => (
          <React.Fragment key={group.key}>
            {groupIdx > 0 ? <span className="order-tabs-divider" aria-hidden="true" /> : null}
            {group.tabs.map((tab) => {
              const isActive = tab.isToShip ? isToShipActive : activeTab === tab.id;
              const count = tab.count !== undefined && tab.count !== null && tab.count !== '' ? Number(tab.count) : null;
              const hasCount = count !== null && count > 0;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={[
                    isActive ? 'is-active' : '',
                    tab.isWarning && hasCount ? 'is-warning' : '',
                    tab.isWarning && isActive ? 'is-warning-active' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => onTabChange(tab.id)}
                >
                  {tab.icon || null}
                  <span>{tab.label}</span>
                  {hasCount ? (
                    <span className={`tab-badge ${tab.badgeVariant ? `tab-badge--${tab.badgeVariant}` : ''}`}>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {isToShipActive && onShipmentSubStatusChange ? (
        <div className="order-sub-tabs" role="tablist" aria-label={t('sellerAffiliate.orderStatusFilter')}>
          <span className="order-sub-tabs__branch-indicator" aria-hidden="true">↳</span>
          <button
            type="button"
            className={`order-sub-tab ${shipmentSubStatus === 'all' ? 'is-active' : ''}`}
            onClick={() => onShipmentSubStatusChange('all')}
          >
            <span>{t('sellerAffiliate.toShipAll') || 'Tất cả chờ giao'}</span>
            {counts.toShip > 0 ? (
              <span className="tab-badge">{counts.toShip}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`order-sub-tab ${shipmentSubStatus === 'AWAITING_SHIPMENT' ? 'is-active' : ''}`}
            onClick={() => onShipmentSubStatusChange('AWAITING_SHIPMENT')}
          >
            <span className="order-sub-tab__dot order-sub-tab__dot--amber" aria-hidden="true" />
            <span>{t('sellerAffiliate.toShipPacking') || 'Chờ đóng gói'}</span>
            {counts.awaitingShipment > 0 ? (
              <span className="tab-badge tab-badge--packing">{counts.awaitingShipment}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`order-sub-tab ${shipmentSubStatus === 'AWAITING_COLLECTION' ? 'is-active' : ''}`}
            onClick={() => onShipmentSubStatusChange('AWAITING_COLLECTION')}
          >
            <span className="order-sub-tab__dot order-sub-tab__dot--blue" aria-hidden="true" />
            <span>{t('sellerAffiliate.toShipCollection') || 'Chờ lấy hàng'}</span>
            {counts.awaitingCollection > 0 ? (
              <span className="tab-badge tab-badge--collection">{counts.awaitingCollection}</span>
            ) : null}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default OrderQuickTabs;
