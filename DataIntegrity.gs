const DATA_INTEGRITY_LOCK_TIMEOUT_MS_ = 20000;
const DATA_CONFLICT_CODE_ = 'DATA_CONFLICT';

function withPortalMutationLock_(callback) {
  if (typeof callback !== 'function') {
    throw new Error('A mutation callback is required.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(DATA_INTEGRITY_LOCK_TIMEOUT_MS_)) {
    throw new Error('SAVE_BUSY: Another family update is still being saved. Please try again.');
  }

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function portalMoneyToCents_(value, options) {
  options = options || {};

  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  const numeric = typeof value === 'string'
    ? Number(value.replace(/[$,\s]/g, ''))
    : Number(value);

  if (!isFinite(numeric)) {
    throw new Error('Enter a valid money amount.');
  }

  // Round only at the integer-cent boundary. The adaptive epsilon offsets
  // binary floating-point artifacts such as 10.075 * 100 evaluating just
  // below 1007.5 without materially changing genuine fractional-cent values.
  const scaled = numeric * 100;
  const direction = scaled < 0 ? -1 : 1;
  const correction =
    direction * Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
  const cents = Math.round(scaled + correction);

  if (options.allowNegative !== true && cents < 0) {
    throw new Error('Money amounts cannot be negative.');
  }

  return cents;
}

function portalCentsToMoney_(cents) {
  const numeric = Number(cents || 0);
  if (!isFinite(numeric)) {
    throw new Error('Stored money amount is invalid.');
  }
  return Math.round(numeric) / 100;
}

function normalizeMutationVersion_(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || '').trim();
}

function assertExpectedVersion_(expected, actual, label) {
  const expectedVersion = normalizeMutationVersion_(expected);
  if (!expectedVersion) return true;

  const actualVersion = normalizeMutationVersion_(actual);
  if (expectedVersion === actualVersion) return true;

  throw new Error(
    DATA_CONFLICT_CODE_ + ': ' +
    String(label || 'This item') +
    ' changed on another device. Refresh and review the latest version before saving again.'
  );
}

function normalizeMutationRequestId_(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 120);
}

function portalMutationCacheKey_(scope, requestId) {
  const normalizedId = normalizeMutationRequestId_(requestId);
  if (!normalizedId) return '';

  const normalizedScope = String(scope || 'general')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 60) || 'general';

  return 'PORTAL_MUTATION_' + normalizedScope + '_' + normalizedId;
}

function readMutationResult_(scope, requestId) {
  const key = portalMutationCacheKey_(scope, requestId);
  if (!key) return null;

  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function rememberMutationResult_(scope, requestId, result, ttlSeconds) {
  const key = portalMutationCacheKey_(scope, requestId);
  if (!key) return result;

  try {
    CacheService.getScriptCache().put(
      key,
      JSON.stringify(result === undefined ? null : result),
      Math.max(60, Math.min(21600, Number(ttlSeconds || 1800)))
    );
  } catch (error) {
    // Idempotency caching must never turn a successful write into a failed write.
  }

  return result;
}
