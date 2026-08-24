function processRentalEnrichmentQueue_() {
  // Time-driven trigger target. It intentionally delegates to the existing
  // queue worker so the worker implementation is not duplicated in alpha1.
  return processRentalEnrichmentQueue();
}

function processRentalEnrichmentQueueMenu() {
  assertSpreadsheetAdminContext_();
  return processRentalEnrichmentQueue();
}
