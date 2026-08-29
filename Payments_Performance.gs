const PAYMENT_DATA_SERVER_CACHE_KEY_ = 'payment-data-v4-4-1';
const PAYMENT_DATA_SERVER_CACHE_SECONDS_ = 45;

function paymentSheetsReady_() {
  const ss = getSpreadsheet_();
  return Boolean(
    ss.getSheetByName('Booking Plans') &&
    ss.getSheetByName('Payment Shares') &&
    ss.getSheetByName('Payment Schedule') &&
    ss.getSheetByName('Payments')
  );
}

function readPaymentDataServerCache_() {
  try {
    const raw = CacheService.getScriptCache().get(PAYMENT_DATA_SERVER_CACHE_KEY_);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      !Array.isArray(parsed.plans) ||
      !Array.isArray(parsed.shares) ||
      !Array.isArray(parsed.schedule) ||
      !Array.isArray(parsed.payments)
    ) {
      return null;
    }

    parsed.fromServerCache = true;
    return parsed;
  } catch (error) {
    return null;
  }
}

function writePaymentDataServerCache_(data) {
  try {
    const raw = JSON.stringify(data || {});

    // CacheService caps an individual value at roughly 100 KB. Payment data
    // is normally tiny, but silently skip caching if a future trip grows past
    // that point instead of risking the actual payment request.
    if (raw.length > 90000) return;

    CacheService.getScriptCache().put(
      PAYMENT_DATA_SERVER_CACHE_KEY_,
      raw,
      PAYMENT_DATA_SERVER_CACHE_SECONDS_
    );
  } catch (error) {}
}

function getPaymentDataFast(forceFresh) {
  // Normal portal startup already keeps the core schema current. This check is
  // effectively free when the stored schema version matches and only runs the
  // full setup when a migration is actually required.
  ensurePortalSchemaCurrent_();

  // Payment Shares is an extension sheet managed by Payments.gs. Fall back to
  // the original repair path only for a genuinely missing payment sheet.
  if (!paymentSheetsReady_()) {
    ensurePaymentSheets_();
  }

  if (!forceFresh) {
    const cached = readPaymentDataServerCache_();
    if (cached) return cached;
  }

  const data = buildPaymentData_();
  writePaymentDataServerCache_(data);
  return data;
}

function getPortalDeferredDataWithPayments() {
  ensurePortalSchemaCurrent_();

  const result = buildPortalDataFull_();
  result.deferredLoaded = true;

  // Bundle the payment snapshot into the deferred trip-data request. Dashboard
  // first paint is still handled by getPortalStartupData(), so this adds no
  // payment work to the fast startup path and removes a second Apps Script
  // round-trip before Payments can be ready.
  result.paymentData = getPaymentDataFast(false);

  return result;
}
