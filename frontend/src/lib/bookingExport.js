import { formatDateOnly } from './date.js';

const ORDER_STATUS_LABELS = {
  COMPLETED: 'Hoàn thành',
  DELIVERED: 'Đã giao',
  SHIPPED: 'Đang giao',
  IN_TRANSIT: 'Đang vận chuyển',
  AWAITING_SHIPMENT: 'Chờ giao hàng',
  AWAITING_COLLECTION: 'Chờ lấy hàng',
  PARTIALLY_SHIPPING: 'Giao một phần',
  UNPAID: 'Chưa thanh toán',
  ON_HOLD: 'Tạm giữ',
};

const escapeCell = (val) => {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
};

const resolveStatusLabel = (row) => {
  if (row.isCancelled) return 'Đã hủy (CANCELLED)';
  if (row.isFullyRefunded) return 'Đã hoàn (REFUNDED)';
  if (row.isPartiallyRefunded) return 'Hoàn một phần (PARTIALLY_REFUNDED)';
  const status = String(row.orderStatus || 'COMPLETED').toUpperCase();
  const label = ORDER_STATUS_LABELS[status] || status;
  return `${label} (${status})`;
};

export const exportBookingModalOrdersToCsv = (
  rows = [],
  {
    booking = {}, video = {}, product: _product = null, convertAmount = null, displayCurrency = '',
  } = {},
  filename = '',
) => {
  if (!rows || !rows.length) return false;

  const targetCurrency = String(displayCurrency || '').trim().toUpperCase();
  const convertValue = (value, sourceCurrency) => {
    if (value === null || value === undefined || value === '') return value;
    if (!targetCurrency || typeof convertAmount !== 'function') return value;
    const converted = convertAmount(Number(value), sourceCurrency || booking.currency || 'MYR');
    return converted === null || converted === undefined || !Number.isFinite(Number(converted))
      ? value
      : converted;
  };

  const headers = [
    'Mã đơn hàng',
    'Thời gian đặt',
    'Nhân sự phụ trách',
    'Email nhân sự',
    'Mã Booking',
    'Tên KOC',
    'TikTok KOC',
    'Mã Video TikTok',
    'Tiêu đề Video',
    'Link Video TikTok',
    'Mã sản phẩm',
    'Tên sản phẩm',
    'Phân loại (SKU)',
    'Số lượng đặt',
    'Số lượng hoàn hủy',
    'Đơn giá',
    'Thành tiền (GMV)',
    'Hoa hồng ước tính',
    'Trạng thái đơn hàng',
    'Shop',
    'Tiền tệ',
  ];

  const staffName = booking.staff?.name || booking.staff_name || '';
  const staffEmail = booking.staff?.email || '';
  const bookingId = booking.id ? String(booking.id) : '';
  const creatorName = booking.creator_name || '';
  const creatorUsername = booking.creator_username
    ? `@${String(booking.creator_username).replace(/^@+/, '')}`
    : '';
  const videoId = String(video?.platform_video_id || video?.id || '').trim();
  const videoTitle = video?.title || video?.item_title || '';
  const cleanUsername = String(booking.creator_username || '').replace(/^@+/, '');
  const videoUrl = cleanUsername && videoId
    ? `https://www.tiktok.com/@${encodeURIComponent(cleanUsername)}/video/${encodeURIComponent(videoId)}`
    : '';
  const shopName = booking.target_shop?.name || '';

  const csvRows = rows.map((row) => {
    let formattedDate = '';
    if (row.orderTime) {
      const numTime = Number(row.orderTime);
      const dateObj = !Number.isNaN(numTime) && numTime > 0
        ? new Date(numTime < 1e12 ? numTime * 1000 : numTime)
        : new Date(row.orderTime);
      formattedDate = !Number.isNaN(dateObj.getTime())
        ? dateObj.toLocaleString('vi-VN', { hour12: false })
        : String(row.orderTime);
    }

    const rowVideoId = String(row.contentId || videoId || '').trim();
    const rowVideoUrl = cleanUsername && rowVideoId
      ? `https://www.tiktok.com/@${encodeURIComponent(cleanUsername)}/video/${encodeURIComponent(rowVideoId)}`
      : videoUrl;
    const rowVideoTitle = row.videoTitle || videoTitle;
    const rowCurrency = row.currency || booking.currency || 'MYR';

    return [
      row.orderId || '',
      formattedDate,
      staffName,
      staffEmail,
      bookingId,
      creatorName,
      creatorUsername,
      rowVideoId,
      rowVideoTitle,
      rowVideoUrl,
      row.productId || '',
      row.displayProductName || row.productName || '',
      row.classification || row.skuName || '',
      row.quantity !== null && row.quantity !== undefined ? row.quantity : '',
      row.refundedQuantity !== null && row.refundedQuantity !== undefined ? row.refundedQuantity : 0,
      row.price !== null && row.price !== undefined ? convertValue(row.price, rowCurrency) : '',
      row.gmv !== null && row.gmv !== undefined ? convertValue(row.gmv, rowCurrency) : '',
      row.commission !== null && row.commission !== undefined ? convertValue(row.commission, rowCurrency) : '',
      resolveStatusLabel(row),
      shopName,
      targetCurrency || rowCurrency,
    ].map(escapeCell).join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(escapeCell).join(','), ...csvRows].join('\r\n');
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return csvContent;
  }

  const effectiveFilename = filename
    || `don_hang_video_${videoId || cleanUsername || 'koc'}_${formatDateOnly(new Date())}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', effectiveFilename.endsWith('.csv') ? effectiveFilename : `${effectiveFilename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
};
