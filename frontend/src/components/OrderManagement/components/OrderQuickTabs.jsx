import React from 'react';

export const OrderQuickTabs = ({
  activeTab,
  onTabChange,
  counts = {},
  t,
}) => {
  const tabs = [
    { id: 'all', label: t('sellerAffiliate.quickTabAll') || 'Tất cả' },
    { id: 'AWAITING_SHIPMENT', label: t('sellerAffiliate.orderState_AWAITING_SHIPMENT') || 'Chờ giao hàng' },
    { id: 'IN_TRANSIT', label: t('sellerAffiliate.orderState_IN_TRANSIT') || 'Đang vận chuyển' },
    { id: 'DELIVERED', label: t('sellerAffiliate.orderState_DELIVERED') || 'Đã giao' },
    { id: 'COMPLETED', label: t('sellerAffiliate.orderState_COMPLETED') || 'Hoàn tất' },
    { id: 'CANCELLED', label: t('sellerAffiliate.orderState_CANCELLED') || 'Đã hủy' },
    { id: 'refund', label: t('sellerAffiliate.quickTabRefund') || 'Đổi trả / Hoàn tiền', count: counts.refunded },
    { id: 'attention', label: t('sellerAffiliate.quickTabAttention') || 'Cần chú ý', count: counts.attention, isWarning: true },
  ];

  return (
    <div className="order-status-tabs" role="tablist" aria-label={t('sellerAffiliate.orderStatusFilter')}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const count = tab.count !== undefined && tab.count !== null && tab.count !== '' ? Number(tab.count) : null;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${isActive ? 'is-active' : ''}${tab.isWarning && count ? ' is-warning' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span>{tab.label}</span>
            {count !== null && count > 0 ? (
              <span className="tab-badge">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

export default OrderQuickTabs;
