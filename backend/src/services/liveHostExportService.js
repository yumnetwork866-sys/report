const XLSX = require('xlsx');

const INVALID_SHEET_CHARS = /[:\\/?*[\]]/g;

const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const roundMetric = (value, decimals = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
};

const formatTimestamp = (value) => {
  if (!value) return '—';
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatDurationText = (totalSeconds) => {
  const sec = Math.max(0, Math.floor(toFiniteNumber(totalSeconds, 0)));
  if (sec <= 0) return '—';
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (hours > 0) {
    return mins > 0 ? `${hours} tiếng ${mins} phút` : `${hours} tiếng`;
  }
  return `${Math.max(1, mins)} phút`;
};

const sanitizeSheetName = (rawName, usedNames) => {
  const cleaned = String(rawName || '')
    .replace(INVALID_SHEET_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Host';

  let candidate = cleaned;
  let suffixIndex = 1;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = `_${suffixIndex}`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    suffixIndex += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
};

const applyColumnFormats = (sheet, rows, {
  textCols = new Set(),
  intCols = new Set(),
  decimalCols = new Set(),
  minWidths = [],
  startRow = 0,
} = {}) => {
  if (!rows.length) return;
  const colCount = rows[0].length;
  sheet['!cols'] = Array.from({ length: colCount }, (_, colIdx) => {
    let maxLen = 10;
    for (let r = startRow; r < rows.length; r += 1) {
      const val = rows[r]?.[colIdx];
      if (val !== null && val !== undefined) {
        const len = String(val).length;
        if (len > maxLen) maxLen = len;
      }
    }
    const minW = minWidths[colIdx] || 12;
    return { wch: Math.min(Math.max(maxLen + 3, minW), 55) };
  });

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let R = startRow + 1; R <= range.e.r; R += 1) {
    for (let C = 0; C <= range.e.c; C += 1) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[cellAddr];
      if (!cell || cell.v === null || cell.v === undefined || cell.v === '') continue;

      if (textCols.has(C)) {
        cell.t = 's';
        cell.v = String(cell.v);
        cell.z = '@';
      } else if (intCols.has(C)) {
        const numVal = Number(cell.v);
        if (Number.isFinite(numVal)) {
          cell.t = 'n';
          cell.v = numVal;
          cell.z = '#,##0';
        }
      } else if (decimalCols.has(C)) {
        const numVal = Number(cell.v);
        if (Number.isFinite(numVal)) {
          cell.t = 'n';
          cell.v = numVal;
          cell.z = Math.abs(numVal % 1) > 0.0001 ? '#,##0.00' : '#,##0';
        }
      }
    }
  }
};

const buildSummarySheet = ({ shopName, startDate, endDate, currency, hosts }) => {
  const titleRows = [
    ['BÁO CÁO XẾP HẠNG HOST LIVESTREAM (ĐỐI SOÁT TÍNH LƯƠNG)'],
    [`Shop: ${shopName || 'Tất cả'} | Kỳ báo cáo: ${startDate || '—'} → ${endDate || '—'} | Tiền tệ: ${currency || 'VND'}`],
    [],
  ];

  const headers = [
    'Hạng',
    'Tên Host',
    'Email',
    'Số phiên Live',
    'Thời lượng',
    'Thời lượng (giờ)',
    'Doanh thu thực (Net GMV)',
    'Doanh thu hủy',
    'GMV / Giờ',
    'Số đơn thực',
    'Số đơn hủy',
    'Sản phẩm bán (Net)',
    'Tỷ lệ chốt (%)',
    'AOV (TB đơn)',
    'Chi phí Ads',
    'CP/DT (%)',
    'Tỷ trọng DT (%)',
    'Tiền tệ',
  ];

  let assignedRank = 0;
  let totalSessions = 0;
  let totalDurationSec = 0;
  let totalNetGmv = 0;
  let totalCancelledGmv = 0;
  let totalNetOrders = 0;
  let totalCancelledOrders = 0;
  let totalNetQty = 0;
  let totalAdsCost = 0;

  const dataRows = hosts.map((item) => {
    const isUnassigned = Boolean(item.isUnassigned);
    if (!isUnassigned) assignedRank += 1;

    const sessionsCount = toFiniteNumber(item.sessionsCount, 0);
    const durationSec = toFiniteNumber(item.totalDurationSec, 0);
    const hours = durationSec > 0 ? durationSec / 3600 : toFiniteNumber(item.hours, 0);
    const netGmv = toFiniteNumber(item.totalGmv, 0);
    const cancelledGmv = toFiniteNumber(item.cancelledGmv, 0);
    const gmvPerHour = toFiniteNumber(item.gmvPerHour, 0);
    const orderCount = toFiniteNumber(item.orderCount, 0);
    const cancelledOrderCount = toFiniteNumber(item.cancelledOrderCount, 0);
    const totalQuantity = toFiniteNumber(item.totalQuantity, 0);
    const closingRate = toFiniteNumber(item.closingRate, 0);
    const aov = toFiniteNumber(item.aov, 0);
    const adsCost = toFiniteNumber(item.convertedAdsCost, 0);
    const costRevenueRatio = item.costRevenueRatio !== null && item.costRevenueRatio !== undefined
      ? toFiniteNumber(item.costRevenueRatio, 0)
      : (netGmv > 0 && adsCost > 0 ? (adsCost / netGmv) * 100 : 0);
    const gmvShare = toFiniteNumber(item.gmvShare, 0);

    totalSessions += sessionsCount;
    totalDurationSec += durationSec;
    totalNetGmv += netGmv;
    totalCancelledGmv += cancelledGmv;
    totalNetOrders += orderCount;
    totalCancelledOrders += cancelledOrderCount;
    totalNetQty += totalQuantity;
    totalAdsCost += adsCost;

    return [
      isUnassigned ? '—' : assignedRank,
      item.hostName || (isUnassigned ? 'Phiên chưa gán Host' : 'Host'),
      item.hostEmail || '',
      sessionsCount,
      formatDurationText(durationSec),
      roundMetric(hours, 2),
      roundMetric(netGmv, 2),
      roundMetric(cancelledGmv, 2),
      roundMetric(gmvPerHour, 2),
      orderCount,
      cancelledOrderCount,
      totalQuantity,
      roundMetric(closingRate, 2),
      roundMetric(aov, 2),
      roundMetric(adsCost, 2),
      roundMetric(costRevenueRatio, 2),
      roundMetric(gmvShare, 2),
      item.currency || currency || 'VND',
    ];
  });

  const totalHours = totalDurationSec / 3600;
  const totalGmvPerHour = totalHours > 0 ? totalNetGmv / totalHours : 0;
  const totalAov = totalNetOrders > 0 ? totalNetGmv / totalNetOrders : 0;
  const totalCpDt = totalNetGmv > 0 && totalAdsCost > 0 ? (totalAdsCost / totalNetGmv) * 100 : 0;

  const totalRow = [
    '',
    'TỔNG CỘNG',
    '',
    totalSessions,
    formatDurationText(totalDurationSec),
    roundMetric(totalHours, 2),
    roundMetric(totalNetGmv, 2),
    roundMetric(totalCancelledGmv, 2),
    roundMetric(totalGmvPerHour, 2),
    totalNetOrders,
    totalCancelledOrders,
    totalNetQty,
    '',
    roundMetric(totalAov, 2),
    roundMetric(totalAdsCost, 2),
    roundMetric(totalCpDt, 2),
    totalNetGmv > 0 ? 100 : 0,
    currency || 'VND',
  ];

  const allRows = [...titleRows, headers, ...dataRows, totalRow];
  const sheet = XLSX.utils.aoa_to_sheet(allRows);
  applyColumnFormats(sheet, allRows, {
    textCols: new Set([1, 2, 4, 17]),
    intCols: new Set([3, 9, 10, 11]),
    decimalCols: new Set([5, 6, 7, 8, 12, 13, 14, 15, 16]),
    minWidths: [8, 24, 24, 14, 18, 16, 22, 16, 16, 14, 14, 18, 14, 16, 16, 12, 16, 10],
    startRow: titleRows.length,
  });

  return sheet;
};

const buildHostDetailSheet = ({ hostItem, shopName, startDate, endDate, currency }) => {
  const hostName = hostItem.hostName || (hostItem.isUnassigned ? 'Phiên chưa gán Host' : 'Host');
  const hostCurrency = hostItem.currency || currency || 'VND';
  const sessions = Array.isArray(hostItem.sessions) ? hostItem.sessions : [];
  const orders = Array.isArray(hostItem.orders) ? hostItem.orders : [];

  const summaryBlock = [
    [`CHI TIẾT DOANH THU & ĐƠN HÀNG HOST: ${hostName}`],
    [`Shop: ${shopName || 'Tất cả'} | Email: ${hostItem.hostEmail || '—'} | Kỳ báo cáo: ${startDate || '—'} → ${endDate || '—'} | Tiền tệ: ${hostCurrency}`],
    [
      `Số phiên: ${toFiniteNumber(hostItem.sessionsCount, sessions.length)}`,
      `Thời lượng: ${formatDurationText(hostItem.totalDurationSec)} (${roundMetric(toFiniteNumber(hostItem.totalDurationSec, 0) / 3600, 2)} giờ)`,
      `Doanh thu thực: ${roundMetric(hostItem.totalGmv, 2)} ${hostCurrency}`,
      `Đã trừ hủy: ${roundMetric(hostItem.cancelledGmv, 2)} ${hostCurrency} (${toFiniteNumber(hostItem.cancelledOrderCount, 0)} đơn)`,
      `Số đơn thực: ${toFiniteNumber(hostItem.orderCount, 0)}`,
    ],
    [],
    ['1. CHI TIẾT CÁC PHIÊN LIVE'],
  ];

  const sessionHeaders = [
    'Mã phiên Live',
    'Kênh TikTok',
    'Thời gian bắt đầu',
    'Thời lượng',
    'Thời lượng (giờ)',
    'Số đơn thực',
    'Số đơn hủy',
    'Doanh thu thực (Net GMV)',
    'Doanh thu hủy',
    'Chi phí Ads',
    'CP/DT (%)',
    'GMV / Giờ',
    'Bình luận',
    'Tỷ lệ chốt (%)',
    'AOV',
  ];

  let sumSessDur = 0;
  let sumSessOrders = 0;
  let sumSessCancelledOrders = 0;
  let sumSessGmv = 0;
  let sumSessCancelledGmv = 0;
  let sumSessAds = 0;
  let sumSessComments = 0;

  const sessionRows = sessions.map((sess) => {
    const dur = toFiniteNumber(sess.durationSec, 0);
    const hours = dur / 3600;
    const orderCount = toFiniteNumber(sess.orderCount, 0);
    const cancelledOrders = toFiniteNumber(sess.cancelledOrderCount, 0);
    const netGmv = toFiniteNumber(sess.totalGmv, 0);
    const cancelledGmv = toFiniteNumber(sess.cancelledGmv, 0);
    const ads = toFiniteNumber(sess.convertedAdsCost, 0);
    const cpDt = sess.costRevenueRatio !== null && sess.costRevenueRatio !== undefined
      ? toFiniteNumber(sess.costRevenueRatio, 0)
      : (netGmv > 0 && ads > 0 ? (ads / netGmv) * 100 : 0);
    const gmvPerHour = toFiniteNumber(sess.gmvPerHour, 0);
    const comments = toFiniteNumber(sess.totalComments, 0);
    const closingRate = toFiniteNumber(sess.closingRate, 0);
    const aov = toFiniteNumber(sess.aov, 0);

    sumSessDur += dur;
    sumSessOrders += orderCount;
    sumSessCancelledOrders += cancelledOrders;
    sumSessGmv += netGmv;
    sumSessCancelledGmv += cancelledGmv;
    sumSessAds += ads;
    sumSessComments += comments;

    return [
      String(sess.sessionId || ''),
      sess.creatorUsername ? `@${sess.creatorUsername}` : '—',
      formatTimestamp(sess.firstTime),
      formatDurationText(dur),
      roundMetric(hours, 2),
      orderCount,
      cancelledOrders,
      roundMetric(netGmv, 2),
      roundMetric(cancelledGmv, 2),
      roundMetric(ads, 2),
      roundMetric(cpDt, 2),
      roundMetric(gmvPerHour, 2),
      comments,
      roundMetric(closingRate, 2),
      roundMetric(aov, 2),
    ];
  });

  const sessionTotalRow = [
    'TỔNG PHIÊN',
    '',
    '',
    formatDurationText(sumSessDur),
    roundMetric(sumSessDur / 3600, 2),
    sumSessOrders,
    sumSessCancelledOrders,
    roundMetric(sumSessGmv, 2),
    roundMetric(sumSessCancelledGmv, 2),
    roundMetric(sumSessAds, 2),
    sumSessGmv > 0 && sumSessAds > 0 ? roundMetric((sumSessAds / sumSessGmv) * 100, 2) : 0,
    sumSessDur > 0 ? roundMetric(sumSessGmv / (sumSessDur / 3600), 2) : 0,
    sumSessComments,
    sumSessComments > 0 && sumSessOrders > 0 ? roundMetric((sumSessOrders / sumSessComments) * 100, 2) : 0,
    sumSessOrders > 0 ? roundMetric(sumSessGmv / sumSessOrders, 2) : 0,
  ];

  const orderSectionHeaderRowIdx = summaryBlock.length + 1 + sessionRows.length + 3;
  const orderSectionTitle = [
    [],
    [],
    ['2. CHI TIẾT ĐƠN HÀNG ĐỂ ĐỐI SOÁT KHỚP ĐƠN'],
  ];

  const orderHeaders = [
    'Mã đơn hàng',
    'Mã phiên Live',
    'Thời gian đặt',
    'Kênh TikTok',
    'Sản phẩm',
    'Số lượng (Net)',
    'Số lượng hủy',
    'Doanh thu thực (Net)',
    'Doanh thu hủy',
    'Trạng thái đơn',
    'Đối soát doanh thu',
    'Tiền tệ',
  ];

  let sumOrdNetQty = 0;
  let sumOrdCancelQty = 0;
  let sumOrdNetGmv = 0;
  let sumOrdCancelGmv = 0;

  const orderRows = orders.map((ord) => {
    const netQty = toFiniteNumber(ord.netQuantity, 0);
    const cancelQty = toFiniteNumber(ord.cancelledQuantity, 0);
    const netGmv = toFiniteNumber(ord.netGmv, 0);
    const cancelGmv = toFiniteNumber(ord.cancelledGmv, 0);
    const isCancelled = Boolean(ord.isCancelled);

    sumOrdNetQty += netQty;
    sumOrdCancelQty += cancelQty;
    sumOrdNetGmv += netGmv;
    sumOrdCancelGmv += cancelGmv;

    return [
      String(ord.orderId || ''),
      String(ord.sessionId || ''),
      formatTimestamp(ord.createTime),
      ord.creatorUsername ? `@${ord.creatorUsername}` : '—',
      ord.productSummary || '—',
      netQty,
      cancelQty,
      roundMetric(netGmv, 2),
      roundMetric(cancelGmv, 2),
      ord.statusLabel || ord.status || '—',
      isCancelled ? 'Đã trừ (Hủy/Hoàn)' : 'Tính vào doanh thu',
      ord.currency || hostCurrency,
    ];
  });

  const orderTotalRow = [
    `TỔNG (${orders.length} đơn)`,
    '',
    '',
    '',
    '',
    sumOrdNetQty,
    sumOrdCancelQty,
    roundMetric(sumOrdNetGmv, 2),
    roundMetric(sumOrdCancelGmv, 2),
    '',
    '',
    hostCurrency,
  ];

  const allRows = [
    ...summaryBlock,
    sessionHeaders,
    ...sessionRows,
    sessionTotalRow,
    ...orderSectionTitle,
    orderHeaders,
    ...orderRows,
    orderTotalRow,
  ];

  const sheet = XLSX.utils.aoa_to_sheet(allRows);

  // Compute max column widths across both tables
  const maxCols = Math.max(sessionHeaders.length, orderHeaders.length);
  sheet['!cols'] = Array.from({ length: maxCols }, (_, colIdx) => {
    let maxLen = 12;
    const minW = [22, 22, 20, 20, 34, 14, 14, 20, 16, 18, 20, 14][colIdx] || 14;
    for (let r = summaryBlock.length; r < allRows.length; r += 1) {
      if (r === orderSectionHeaderRowIdx - 1) continue;
      const val = allRows[r]?.[colIdx];
      if (val !== null && val !== undefined) {
        const len = String(val).length;
        if (len > maxLen) maxLen = len;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, minW), 55) };
  });

  // Format session table rows
  const sessionStartRow = summaryBlock.length + 1;
  const sessionEndRow = sessionStartRow + sessionRows.length; // includes total row
  for (let R = sessionStartRow; R <= sessionEndRow; R += 1) {
    for (let C = 0; C < sessionHeaders.length; C += 1) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[cellAddr];
      if (!cell || cell.v === null || cell.v === undefined || cell.v === '') continue;
      if ([0, 1, 2, 3].includes(C)) {
        cell.t = 's';
        cell.v = String(cell.v);
        cell.z = '@';
      } else if ([5, 6, 12].includes(C)) {
        const numVal = Number(cell.v);
        if (Number.isFinite(numVal)) { cell.t = 'n'; cell.v = numVal; cell.z = '#,##0'; }
      } else {
        const numVal = Number(cell.v);
        if (Number.isFinite(numVal)) {
          cell.t = 'n';
          cell.v = numVal;
          cell.z = Math.abs(numVal % 1) > 0.0001 ? '#,##0.00' : '#,##0';
        }
      }
    }
  }

  // Format order table rows
  const orderStartRow = orderSectionHeaderRowIdx + 1;
  const orderEndRow = orderStartRow + orderRows.length; // includes total row
  for (let R = orderStartRow; R <= orderEndRow; R += 1) {
    for (let C = 0; C < orderHeaders.length; C += 1) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[cellAddr];
      if (!cell || cell.v === null || cell.v === undefined || cell.v === '') continue;
      if ([0, 1, 2, 3, 4, 9, 10, 11].includes(C)) {
        cell.t = 's';
        cell.v = String(cell.v);
        cell.z = '@';
      } else if ([5, 6].includes(C)) {
        const numVal = Number(cell.v);
        if (Number.isFinite(numVal)) { cell.t = 'n'; cell.v = numVal; cell.z = '#,##0'; }
      } else {
        const numVal = Number(cell.v);
        if (Number.isFinite(numVal)) {
          cell.t = 'n';
          cell.v = numVal;
          cell.z = Math.abs(numVal % 1) > 0.0001 ? '#,##0.00' : '#,##0';
        }
      }
    }
  }

  return sheet;
};

const buildHostLeaderboardWorkbook = ({
  shopName = '',
  startDate = '',
  endDate = '',
  currency = 'VND',
  hosts = [],
} = {}) => {
  const workbook = XLSX.utils.book_new();
  const safeHosts = Array.isArray(hosts) ? hosts : [];

  const summarySheet = buildSummarySheet({
    shopName,
    startDate,
    endDate,
    currency,
    hosts: safeHosts,
  });
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Tong_hop_Host');

  const usedSheetNames = new Set(['tong_hop_host']);
  for (const hostItem of safeHosts) {
    const rawName = hostItem.hostName || (hostItem.isUnassigned ? 'Chua_gan_Host' : 'Host');
    const sheetName = sanitizeSheetName(rawName, usedSheetNames);
    const detailSheet = buildHostDetailSheet({
      hostItem,
      shopName,
      startDate,
      endDate,
      currency,
    });
    XLSX.utils.book_append_sheet(workbook, detailSheet, sheetName);
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const exportHostLeaderboard = async (req, res) => {
  const { shopName, startDate, endDate, currency, hosts } = req.body || {};
  const buffer = buildHostLeaderboardWorkbook({ shopName, startDate, endDate, currency, hosts });
  const periodLabel = [startDate, endDate].filter(Boolean).join('_') || 'all';
  const filename = `xep_hang_host_${periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(buffer);
};

module.exports = {
  buildHostLeaderboardWorkbook,
  exportHostLeaderboard,
};
