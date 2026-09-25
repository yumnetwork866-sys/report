import React from 'react';
import { getOrderFinanceSummary, getOrderPaymentValue } from '../../../../lib/sellerAffiliate';

export const OrderFinancialCell = ({ row, formatMoneyValues, t }) => {
  const payment = getOrderPaymentValue(row);
  const isFinanceAvailable = row.finance_status === 'AVAILABLE';
  const summary = getOrderFinanceSummary(row);
  const status = String(row.order_status || row.status || '').toUpperCase();
  const isCancelled = status === 'CANCELLED';

  const settlementValue = summary?.settlement;
  const feesValue = summary?.fees;
  const refundValue = summary?.refund;

  // For delivered/completed orders with refund, ensure refund display does not exceed buyer-facing payment
  const displayRefund = refundValue && payment?.amount
    ? { ...refundValue, amount: Math.min(refundValue.amount, payment.amount) }
    : refundValue;

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

        {isCancelled ? (
          <span className="order-compact-cell__refund-tag">
            · {t('sellerAffiliate.orderState_CANCELLED') || 'Đã hủy'}
          </span>
        ) : (
          <>
            {isFinanceAvailable && feesValue?.amount ? (
              <span className="row-subtitle order-compact-cell__fees">
                · {t('sellerAffiliate.orderFees') || 'Phí'}: -{formatMoneyValues([feesValue])}
              </span>
            ) : null}

            {isFinanceAvailable && displayRefund?.amount ? (
              <span className="order-compact-cell__refund-tag">
                · {t('sellerAffiliate.orderRefund') || 'Hoàn'}: -{formatMoneyValues([displayRefund])}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default OrderFinancialCell;
