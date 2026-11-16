'use strict';

/**
 * Checks whether an error represents a temporary network failure
 * (e.g., DNS resolution failure, network link down, connection refused/timed out).
 *
 * @param {Error|any} error
 * @returns {boolean}
 */
const isTransientNetworkError = (error) => {
  if (!error) return false;
  if (error.name === 'AbortError') return false;
  const message = String(error.message || '');
  const code = String(error.code || error.cause?.code || '');
  const causeMessage = String(error.cause?.message || '');
  return (
    error instanceof TypeError && /fetch failed/i.test(message)
    || /fetch failed|econnrefused|enotfound|eai_again|enetunreach|etimedout|socket hang up|network error/i.test(message)
    || /fetch failed|econnrefused|enotfound|eai_again|enetunreach|etimedout|socket hang up|network error/i.test(causeMessage)
    || ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET'].includes(code)
  );
};

/**
 * Calculates exponential backoff delay for network retry.
 * In test environment, uses minimal delay (10ms) to avoid slowing tests down.
 *
 * @param {number} attempt
 * @returns {number} Delay in milliseconds
 */
const networkRetryDelayMs = (attempt) => (
  process.env.NODE_ENV === 'test' ? 10 : Math.min(6000, 1500 * (2 ** attempt))
);

module.exports = {
  isTransientNetworkError,
  networkRetryDelayMs,
};
