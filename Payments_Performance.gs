function paymentSheetsReady_() {
  const ss = getSpreadsheet_();
  return Boolean(
    ss.getSheetByName('Booking Plans') &&
    ss.getSheetByName('Payment Shares') &&
    ss.getSheetByName('Payment Schedule') &&
    ss.getSheetByName('Payments')
  );
}

function getPaymentDataFast() {
  // Normal portal startup already keeps the core schema current. This check is
  // effectively free when the stored schema version matches and only runs the
  // full setup when a migration is actually required.
  ensurePortalSchemaCurrent_();

  // Payment Shares is an extension sheet managed by Payments.gs. Fall back to
  // the original repair path only for a genuinely missing payment sheet.
  if (!paymentSheetsReady_()) {
    ensurePaymentSheets_();
  }

  return buildPaymentData_();
}
