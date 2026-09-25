import {
  getOrderProductDetails,
  getOrderShipping,
  getOrderFinanceSummary,
  getAffiliateOrderCreators,
  getAffiliateOrderSources,
  getOrderPaymentValue,
} from '../../../lib/sellerAffiliate.js';

const escapeCell = (val) => {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
};

export const exportOrdersToCsv = (orders = [], filename = 'orders.csv', t = (key) => key, locale = 'vi-VN') => {
  if (!orders || !orders.length) return false;

  const headers = [
    t('sellerAffiliate.orderId') || 'Mã đơn',
    t('sellerAffiliate.createdAt') || 'Thời gian tạo',
    t('sellerAffiliate.kocAndSource') || 'KOC & Nguồn',
    t('sellerAffiliate.video') || 'Loại nguồn',
    'Video URL',
    t('sellerAffiliate.products') || 'Sản phẩm',
    t('sellerAffiliate.quantity') || 'Số lượng',
    t('sellerAffiliate.totalPayment') || 'Tổng thanh toán',
    t('sellerAffiliate.orderStatus') || 'Trạng thái đơn',
    t('sellerAffiliate.deliveryStatus') || 'Trạng thái vận chuyển',
    t('sellerAffiliate.shippingCarrier') || 'Đơn vị vận chuyển',
    t('sellerAffiliate.tracking') || 'Mã vận đơn',
    t('sellerAffiliate.tiktokFees') || 'Phí TikTok',
    t('sellerAffiliate.refund') || 'Hoàn tiền',
    t('sellerAffiliate.actualSettlement') || 'Thực nhận',
  ];

  const rows = orders.map((order) => {
    const products = getOrderProductDetails(order);
    const shipping = getOrderShipping(order);
    const finance = getOrderFinanceSummary(order);
    const creators = getAffiliateOrderCreators(order);
    const sources = getAffiliateOrderSources(order);
    const status = String(order.order_status || order.status || 'UNKNOWN').toUpperCase();
    const payment = getOrderPaymentValue(order);

    const kocName = creators.map((c) => c.name || c.username).filter(Boolean).join(', ') || '—';
    const sourceTypes = sources.map((s) => s.type).join(', ') || 'DIRECT';
    const videoUrls = sources.map((s) => s.url).filter(Boolean).join(' ; ') || '';
    const productTitles = products.map((p) => `${p.productName}${p.skuName ? ` (${p.skuName})` : ''} x${p.quantity}`).join(' ; ');
    const totalQty = products.reduce((sum, p) => sum + (p.quantity || 0), 0);

    const createdAt = order.create_time
      ? new Date(Number(order.create_time) * (Number(order.create_time) < 1e12 ? 1000 : 1)).toLocaleString(locale)
      : (order.created_time || '');

    return [
      order.order_id || order.id || '',
      createdAt,
      kocName,
      sourceTypes,
      videoUrls,
      productTitles,
      totalQty,
      payment ? `${payment.amount} ${payment.currency}` : '',
      t(`sellerAffiliate.orderState_${status}`, { defaultValue: status }),
      t(`sellerAffiliate.orderState_${shipping.status}`, { defaultValue: shipping.status }),
      shipping.provider || '',
      shipping.trackingNumber || '',
      finance?.fees ? `${finance.fees.amount} ${finance.fees.currency}` : '',
      finance?.refund ? `${finance.refund.amount} ${finance.refund.currency}` : '',
      finance?.settlement ? `${finance.settlement.amount} ${finance.settlement.currency}` : '',
    ].map(escapeCell).join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(escapeCell).join(','), ...rows].join('\r\n');
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return csvContent;
  }
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
};
