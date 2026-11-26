const XLSX = require('xlsx');

const ORDER_EXPORT_HEADERS = [
  'Mã đơn',
  'Thời gian tạo',
  'Nguồn đơn (KOC)',
  'Loại nguồn',
  'Video URL',
  'Sản phẩm',
  'Số lượng',
  'Tổng thanh toán',
  'Trạng thái đơn',
  'Trạng thái vận chuyển',
  'Đơn vị vận chuyển',
  'Mã vận đơn',
  'Phí TikTok',
  'Hoàn tiền',
  'Thực nhận',
  'Tiền tệ',
];

const ORDER_MIN_WIDTHS = [22, 19, 22, 14, 38, 38, 10, 16, 18, 18, 18, 22, 14, 14, 16, 10];

const ORDER_STATUS_LABELS = {
  COMPLETED: 'Hoàn tất',
  DELIVERED: 'Đã giao',
  SHIPPED: 'Đang giao',
  IN_TRANSIT: 'Đang vận chuyển',
  AWAITING_SHIPMENT: 'Chờ giao',
  AWAITING_COLLECTION: 'Chờ lấy hàng',
  PARTIALLY_SHIPPING: 'Giao một phần',
  UNPAID: 'Chưa thanh toán',
  ON_HOLD: 'Tạm giữ',
  CANCELLED: 'Đã hủy',
  CANCELED: 'Đã hủy',
  REFUNDED: 'Đã hoàn',
};

const formatOrderTime = (value) => {
  if (!value) return '';
  const num = Number(value);
  const date = Number.isFinite(num) && num > 0
    ? new Date(num < 1e12 ? num * 1000 : num)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
};

const toAmount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    const raw = value.amount ?? value.value ?? value.total_amount;
    if (raw === null || raw === undefined || raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractFinanceNumbers = (order) => {
  const fin = order.finance || order.order_finance || order.settlement || {};
  const paymentObj = order.payment || order.payment_info || {};
  const totalPayment = toAmount(paymentObj.total_amount)
    ?? toAmount(paymentObj.sub_total)
    ?? toAmount(order.payment_amount)
    ?? toAmount(fin.gross_amount);
  const fees = toAmount(fin.platform_fees) ?? toAmount(fin.fees) ?? toAmount(fin.commission);
  const refund = toAmount(fin.refund_amount) ?? toAmount(fin.refund);
  const settlement = toAmount(fin.settlement_amount) ?? toAmount(fin.settlement);
  const currency = paymentObj.currency
    || fin.currency
    || order.currency
    || (Array.isArray(order.skus) && order.skus[0]?.currency)
    || '';
  return { totalPayment, fees, refund, settlement, currency };
};

const extractOrderRow = (order) => {
  const skus = Array.isArray(order.skus) ? order.skus : [];
  const creators = new Set();
  const sourceTypes = new Set();
  const videoUrls = new Set();
  const productTitles = [];
  let totalQty = 0;

  for (const sku of skus) {
    const creator = sku.creator_nickname || sku.creator_name || sku.creator_username;
    if (creator) creators.add(String(creator).replace(/^@+/, ''));
    const contentType = String(sku.content_type || '').trim().toUpperCase();
    if (contentType) sourceTypes.add(contentType);
    const contentId = String(sku.content_id || '').trim();
    if (contentId && contentType === 'VIDEO') {
      const uname = String(sku.creator_username || '').replace(/^@+/, '');
      if (uname) videoUrls.add(`https://www.tiktok.com/@${uname}/video/${contentId}`);
    }
    const qty = Number(sku.quantity || 0);
    totalQty += qty;
    const title = sku.product_name || sku.product_id || '';
    if (title) {
      productTitles.push(`${title}${sku.sku_name ? ` (${sku.sku_name})` : ''} x${qty || 1}`);
    }
  }

  if (!creators.size && Array.isArray(order.creator_profiles)) {
    for (const profile of order.creator_profiles) {
      if (profile?.nickname || profile?.username) {
        creators.add(profile.nickname || profile.username);
      }
    }
  }

  const orderStatus = String(order.order_status || order.status || '').trim().toUpperCase();
  const shipping = order.shipping || {};
  const deliveryStatus = String(
    order.delivery_status || shipping.status || order.fulfillment_status || ''
  ).trim().toUpperCase();
  const carrier = order.shipping_provider || shipping.provider_name || shipping.carrier || '';
  const tracking = order.tracking_number || shipping.tracking_number || '';
  const { totalPayment, fees, refund, settlement, currency } = extractFinanceNumbers(order);

  return [
    String(order.order_id || order.id || ''),
    formatOrderTime(order.create_time || order.created_time),
    [...creators].join(', ') || '—',
    [...sourceTypes].join(', ') || 'DIRECT',
    [...videoUrls].join(' ; '),
    productTitles.join(' ; '),
    totalQty,
    totalPayment !== null ? totalPayment : '',
    ORDER_STATUS_LABELS[orderStatus] || orderStatus || '—',
    ORDER_STATUS_LABELS[deliveryStatus] || deliveryStatus || '—',
    carrier,
    String(tracking || ''),
    fees !== null ? fees : '',
    refund !== null ? refund : '',
    settlement !== null ? settlement : '',
    currency,
  ];
};

/**
 * Build an Excel (.xlsx) buffer for all filtered shop orders.
 */
const buildShopOrdersWorkbookBuffer = (orders = []) => {
  const workbook = XLSX.utils.book_new();
  const rows = orders.map(extractOrderRow);
  const sheet = XLSX.utils.aoa_to_sheet([ORDER_EXPORT_HEADERS, ...rows]);

  sheet['!cols'] = ORDER_EXPORT_HEADERS.map((header, idx) => {
    let maxLen = header.length;
    for (const row of rows) {
      const val = row[idx];
      if (val !== null && val !== undefined) {
        const len = String(val).length;
        if (len > maxLen) maxLen = len;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, ORDER_MIN_WIDTHS[idx] || 12), 60) };
  });

  const textCols = new Set([0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 15]);
  const intCols = new Set([6]);
  const moneyCols = new Set([7, 12, 13, 14]);
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  for (let r = 1; r <= range.e.r; r += 1) {
    for (let c = 0; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (textCols.has(c)) {
        cell.t = 's';
        cell.v = cell.v !== undefined && cell.v !== null ? String(cell.v) : '';
        cell.z = '@';
      } else if (intCols.has(c) || moneyCols.has(c)) {
        if (cell.v !== null && cell.v !== undefined && cell.v !== '') {
          const numVal = Number(cell.v);
          if (Number.isFinite(numVal)) {
            cell.t = 'n';
            cell.v = numVal;
            if (intCols.has(c)) {
              cell.z = '#,##0';
            } else {
              const hasDecimals = Math.abs(numVal % 1) > 0.0001;
              cell.z = hasDecimals ? '#,##0.00' : '#,##0';
            }
          }
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(workbook, sheet, 'Orders');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
  buildShopOrdersWorkbookBuffer,
};
