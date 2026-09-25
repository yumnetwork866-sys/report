import React from 'react';
import { getOrderFinanceSummary, getOrderPaymentValue } from '../../../../lib/sellerAffiliate';

export const OrderFinancialCell = ({ row, formatMoneyValues, t }) => {
  const payment = getOrderPaymentValue(row);
  const isFinanceAvailable = row.finance_status === 'AVAILABLE';
  const summary = getOrderFinanceSummary(row);

  const settlementValue = summary?.settlement;
  const feesValue = summary?.fees;
  const refundValue = summary?.refund;

  return (
    <div className="order-compact-cell order-compact-cell--finance">
      <div className="order-compact-cell__top">
        {isFinanceAvailable && settlementValue ? (
          <strong className="order-compact-cell__settlement">
            {formatMoneyValues([settlementValue])}
          </strong>
        ) : (
          <span className="order-compact-cell__pending-pill" title={t(`sellerAffiliate.financeStatus_${row.finance_status || 'PENDING'}`)}>
            {t(`sellerAffiliate.financeStatus_${row.finance_status || 'PENDING'}`)}
          </span>
        )}
      </div>

      <div className="order-compact-cell__bottom order-compact-cell__finance-breakdown">
        {payment ? (
          <span className="row-subtitle">
            {t('sellerAffiliate.orderPaymentShort') || 'Thu'}: {formatMoneyValues([payment])}
          </span>
        ) : null}

        {isFinanceAvailable && feesValue?.amount ? (
          <span className="row-subtitle order-compact-cell__fees">
            {t('sellerAffiliate.orderFees') || 'Phí'}: -{formatMoneyValues([feesValue])}
          </span>
        ) : null}

        {isFinanceAvailable && refundValue?.amount ? (
          <span className="order-compact-cell__refund-tag">
            {t('sellerAffiliate.orderRefund') || 'Hoàn'}: -{formatMoneyValues([refundValue])}
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default OrderFinancialCell;
