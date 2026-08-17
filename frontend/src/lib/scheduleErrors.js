const ERROR_KEYS = new Set(['error', 'errors', 'error_message', 'errorMessage']);
const GENERIC_FAILURE = /^\d+\/\d+\s+.+failed\.?$/i;
const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;

const errorStrings = (value) => {
  if (Array.isArray(value)) return value.flatMap(errorStrings);
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [String(value)];

  const message = value.message || value.detail || value.reason;
  if (typeof message === 'string' && message.trim()) return [message.trim()];
  try {
    return [JSON.stringify(value, null, 2)];
  } catch {
    return [String(value)];
  }
};

const nodeContext = (node) => {
  if (node.shop_id !== undefined && node.shop_id !== null) return `Shop ${node.shop_id}`;
  if (node.channelId !== undefined && node.channelId !== null) return `Channel ${node.channelId}`;
  if (node.channel_id !== undefined && node.channel_id !== null) return `Channel ${node.channel_id}`;
  if (node.metric_date) return String(node.metric_date);
  if (node.date) return String(node.date);
  return '';
};

const collectNestedErrors = (node, context = '', output = []) => {
  if (Array.isArray(node)) {
    node.forEach((item) => collectNestedErrors(item, context, output));
    return output;
  }
  if (!node || typeof node !== 'object') return output;

  const currentContext = nodeContext(node) || context;
  Object.entries(node).forEach(([key, value]) => {
    if (ERROR_KEYS.has(key)) {
      errorStrings(value).forEach((message) => {
        output.push(currentContext ? `${currentContext}: ${message}` : message);
      });
      return;
    }
    if (value && typeof value === 'object') collectNestedErrors(value, currentContext, output);
  });
  return output;
};

export const getRunErrorMessages = (run = {}) => {
  const nested = collectNestedErrors(run.summary);
  const direct = errorStrings(run.error);
  const messages = nested.length && direct.every((message) => GENERIC_FAILURE.test(message))
    ? nested
    : [...nested, ...direct];
  return [...new Set(messages)];
};

export const formatErrorDates = (message, timeZone = 'Asia/Ho_Chi_Minh') => String(message || '')
  .replace(ISO_TIMESTAMP, (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
  });
