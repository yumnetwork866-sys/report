const XLSX = require('xlsx');

const ALL_HEADERS = [
  'STT',
  'Nhân sự',
  'Team / Thị trường',
  'Tổng video',
  'Video ẩn/xóa',
  'Lượt xem',
  'TB lượt xem/video',
  'Đơn hàng',
  'Doanh số (GMV)',
  'TB doanh số/video',
  'Tiền tệ',
];

const MEMBER_HEADERS = [
  'STT',
  'Mã Video TikTok',
  'Tiêu đề video',
  'Link video',
  'Kênh',
  'Team / Thị trường',
  'Ngày đăng',
  'Trạng thái',
  'Lượt xem',
  'Lượt thích',
  'Bình luận',
  'Chia sẻ',
  'Đơn hàng',
  'Doanh số (GMV)',
  'Tiền tệ',
];

const ALL_MIN_WIDTHS = [6, 24, 24, 12, 14, 14, 18, 12, 18, 18, 10];
const MEMBER_MIN_WIDTHS = [6, 22, 38, 42, 22, 20, 18, 14, 14, 12, 12, 12, 12, 18, 10];

const formatVietnamDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
};

const createStyledSheet = (headers, rows, minWidths, textCols, integerCols, decimalCols) => {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = headers.map((header, idx) => {
    let maxLen = String(header || '').length;
    for (const row of rows) {
      const val = row[idx];
      if (val !== null && val !== undefined) {
        const len = String(val).length;
        if (len > maxLen) maxLen = len;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, minWidths[idx] || 12), 60) };
  });

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let r = 1; r <= range.e.r; r += 1) {
    for (let c = 0; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (textCols.has(c)) {
        cell.t = 's';
        cell.v = cell.v !== undefined && cell.v !== null ? String(cell.v) : '';
        cell.z = '@';
      } else if (integerCols.has(c) || decimalCols.has(c)) {
        if (cell.v !== null && cell.v !== undefined && cell.v !== '') {
          const numVal = Number(cell.v);
          if (Number.isFinite(numVal)) {
            cell.t = 'n';
            cell.v = numVal;
            if (integerCols.has(c)) {
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
  return sheet;
};

const resolveUniqueSheetName = (rawName, usedNames) => {
  let base = String(rawName || '')
    .replace(/[:\\/?*[\]]/g, '')
    .trim()
    .slice(0, 31);
  if (!base) base = 'Nhan_vien';
  let candidate = base;
  let counter = 1;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = `_${counter}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
};

/**
 * Build a multi-sheet Excel workbook for channel video report:
 * - "All" sheet: aggregated metrics per member
 * - One sheet per member: detailed list of videos & metrics for payroll/bonus calculation
 */
const buildChannelReportWorkbookBuffer = ({ members = [], videosByUserId = new Map() }) => {
  const workbook = XLSX.utils.book_new();

  let totalVideos = 0;
  let totalUnavailable = 0;
  let totalViews = 0;
  let totalOrders = 0;
  let totalRevenue = 0;
  const allCurrencies = new Set();

  const allRows = members.map((member, index) => {
    const videos = Number(member.videos || 0);
    const unavailable = Number(member.unavailable_videos || 0);
    const views = Number(member.views || 0);
    const orders = Number(member.orders || 0);
    const revenueAvailable = Boolean(member.revenue_available);
    const revenue = revenueAvailable ? Number(member.revenue || 0) : null;
    const currency = member.currency || '';

    totalVideos += videos;
    totalUnavailable += unavailable;
    totalViews += views;
    totalOrders += orders;
    if (revenue !== null) {
      totalRevenue += revenue;
      if (currency) allCurrencies.add(currency);
    }

    return [
      index + 1,
      member.member_name || `User #${member.user_id}`,
      member.team_names || '',
      videos,
      unavailable,
      views,
      videos > 0 ? Math.round(views / videos) : 0,
      orders,
      revenue !== null ? revenue : '',
      revenue !== null && videos > 0 ? Number((revenue / videos).toFixed(2)) : '',
      currency,
    ];
  });

  if (members.length > 0) {
    const singleCurrency = allCurrencies.size === 1 ? [...allCurrencies][0] : '';
    const canSumRevenue = allCurrencies.size <= 1;
    allRows.push([
      '',
      'TỔNG CỘNG',
      '',
      totalVideos,
      totalUnavailable,
      totalViews,
      totalVideos > 0 ? Math.round(totalViews / totalVideos) : 0,
      totalOrders,
      canSumRevenue ? totalRevenue : '',
      canSumRevenue && totalVideos > 0 ? Number((totalRevenue / totalVideos).toFixed(2)) : '',
      singleCurrency,
    ]);
  }

  const allSheet = createStyledSheet(
    ALL_HEADERS,
    allRows,
    ALL_MIN_WIDTHS,
    new Set([1, 2, 10]),
    new Set([0, 3, 4, 5, 6, 7]),
    new Set([8, 9]),
  );
  XLSX.utils.book_append_sheet(workbook, allSheet, 'All');

  const usedSheetNames = new Set(['all']);
  for (const member of members) {
    const userVideos = videosByUserId.get(String(member.user_id)) || [];
    let mViews = 0;
    let mLikes = 0;
    let mComments = 0;
    let mShares = 0;
    let mOrders = 0;
    let mRevenue = 0;
    const mCurrencies = new Set();

    const memberRows = userVideos.map((video, idx) => {
      const views = Number(video.views || 0);
      const likes = Number(video.likes || 0);
      const comments = Number(video.comments || 0);
      const shares = Number(video.shares || 0);
      const orders = Number(video.orders || 0);
      const hasRevenue = video.revenue !== null && video.revenue !== undefined;
      const revenue = hasRevenue ? Number(video.revenue) : null;
      const currency = video.currency || '';

      mViews += views;
      mLikes += likes;
      mComments += comments;
      mShares += shares;
      mOrders += orders;
      if (revenue !== null) {
        mRevenue += revenue;
        if (currency) mCurrencies.add(currency);
      }

      return [
        idx + 1,
        video.platform_video_id ? String(video.platform_video_id) : '',
        video.title || '',
        video.video_url || '',
        video.channel_name || (video.channel_username ? `@${video.channel_username}` : ''),
        video.team_names || '',
        formatVietnamDateTime(video.published_at),
        video.status === 'unavailable' ? 'Ẩn/Xóa' : 'Hoạt động',
        views,
        likes,
        comments,
        shares,
        orders,
        revenue !== null ? revenue : '',
        currency,
      ];
    });

    if (userVideos.length > 0) {
      const singleCurrency = mCurrencies.size === 1 ? [...mCurrencies][0] : '';
      memberRows.push([
        '',
        '',
        `TỔNG CỘNG (${userVideos.length} video)`,
        '',
        '',
        '',
        '',
        '',
        mViews,
        mLikes,
        mComments,
        mShares,
        mOrders,
        mCurrencies.size <= 1 ? mRevenue : '',
        singleCurrency,
      ]);
    }

    const sheetName = resolveUniqueSheetName(member.member_name || `User_${member.user_id}`, usedSheetNames);
    const memberSheet = createStyledSheet(
      MEMBER_HEADERS,
      memberRows,
      MEMBER_MIN_WIDTHS,
      new Set([1, 2, 3, 4, 5, 6, 7, 14]),
      new Set([0, 8, 9, 10, 11, 12]),
      new Set([13]),
    );
    XLSX.utils.book_append_sheet(workbook, memberSheet, sheetName);
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
  buildChannelReportWorkbookBuffer,
};
