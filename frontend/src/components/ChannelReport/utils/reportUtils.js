export const chartTick = { fill: 'var(--color-muted)', fontSize: 12 };

export const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const dateOnly = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export const todayValue = () => dateOnly(new Date());

export const monthRange = (value) => {
  const [year, month] = String(value || '').split('-').map(Number);
  const lastDay = dateOnly(new Date(year, month, 0));
  return {
    startDate: `${value}-01`,
    endDate: value === currentMonthValue() ? todayValue() : lastDay,
  };
};

export const monthIndex = (value) => {
  const [year, month] = String(value || '').split('-').map(Number);
  return year && month ? year * 12 + month - 1 : null;
};

export const formatMonth = (value) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : '';
};

export const previousMonthValue = (value) => {
  const [year, month] = String(value || '').split('-').map(Number);
  if (!year || !month) return value;
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
};

export const previousCustomRange = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const days = Math.round((end - start) / 86400000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - days + 1);
  return { startDate: dateOnly(previousStart), endDate: dateOnly(previousEnd) };
};

export const compactProductName = (value) => {
  const name = String(value || '').trim();
  if (!name) return 'Không gắn giỏ hàng';
  const brandCombo = name.match(/^([A-Z0-9]+)\s+(Kombo)\b/i);
  if (brandCombo) return `${brandCombo[1].toUpperCase()} ${brandCombo[2]}`;
  const headline = name.split(/\s+-\s+/)[0].trim();
  return headline.length > 42 ? `${headline.slice(0, 39).trim()}…` : headline;
};

export const compactVideoTitle = (value, maxLength = 40) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Video';
  const clean = raw.replace(/\s+/g, ' ');
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3).trim()}…` : clean;
};

export const orderStatusLabel = (value) => {
  const status = String(value || '').trim().toUpperCase();
  return ({
    COMPLETED: 'Hoàn tất', DELIVERED: 'Đã giao', SHIPPED: 'Đang giao',
    UNPAID: 'Chưa thanh toán', AWAITING_SHIPMENT: 'Chờ giao',
    CANCELLED: 'Đã hủy', CANCELED: 'Đã hủy', REFUNDED: 'Đã hoàn',
  })[status] || status.replaceAll('_', ' ') || '—';
};

export const getMemberDetailKey = (member) => {
  if (member && typeof member === 'object') {
    if (member.isMerged) return `merged:${member.key}`;
    return member.teamKey ? `${member.teamKey}:${member.key}` : String(member.key);
  }
  return String(member);
};

const TEAM_SHORT_CODES = [
  [/^(us|usa|my|hoa ky)$/, 'US'],
  [/^(malaysia|malay|my\b)/, 'MY'],
  [/^(viet\s*nam|vn)$/, 'VN'],
  [/^(thai\s*lan|thailand|th)$/, 'TH'],
  [/^(indonesia|indo|id)$/, 'ID'],
  [/^(philippines|phil|ph)$/, 'PH'],
  [/^(singapore|sing|sg)$/, 'SG'],
  [/^(uk|anh)$/, 'UK'],
];

export const compactTeamBadge = (label) => {
  const raw = String(label || '').trim();
  if (!raw) return '';
  const withoutPrefix = raw.replace(/^team\s+/i, '').trim() || raw;
  const normalized = withoutPrefix
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
  for (const [pattern, code] of TEAM_SHORT_CODES) {
    if (pattern.test(normalized)) return code;
  }
  return withoutPrefix.length > 8 ? `${withoutPrefix.slice(0, 6).trim()}…` : withoutPrefix;
};

