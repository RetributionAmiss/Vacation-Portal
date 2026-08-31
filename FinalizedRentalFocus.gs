function finalizedRentalFocusIdFromTrip_(trip) {
  trip = trip || {};
  const closed = String(trip['Final Voting Closed'] || 'No').trim().toLowerCase() === 'yes';
  const selectedId = String(trip['Selected Cabin ID'] || '').trim();
  return closed && selectedId ? selectedId : '';
}

function finalizedRentalFocusId_() {
  return finalizedRentalFocusIdFromTrip_(getSettings_('Trip'));
}

function filterRowsForFinalRental_(rows, selectedId, header) {
  rows = Array.isArray(rows) ? rows : [];
  if (!selectedId) return rows;
  header = header || 'Cabin ID';
  return rows.filter(function(row) {
    return String(row && row[header] || '') === selectedId;
  });
}

function filterPaymentDataForFinalRental_(data, selectedId) {
  if (!data || !selectedId) return data;

  const result = Object.assign({}, data);
  ['plans', 'shares', 'schedule', 'payments'].forEach(function(key) {
    result[key] = filterRowsForFinalRental_(result[key], selectedId, 'Cabin ID');
  });
  result.finalizedRentalOnly = true;
  result.finalizedRentalId = selectedId;
  return result;
}

function focusPortalPayloadToFinalRental_(payload, selectedId) {
  if (!payload || !selectedId) return payload;

  payload.cabins = filterRowsForFinalRental_(payload.cabins, selectedId, 'Cabin ID');
  payload.votes = filterRowsForFinalRental_(payload.votes, selectedId, 'Cabin ID');
  payload.favorites = filterRowsForFinalRental_(payload.favorites, selectedId, 'Cabin ID');
  payload.assignments = filterRowsForFinalRental_(payload.assignments, selectedId, 'Cabin ID');
  payload.imports = filterRowsForFinalRental_(payload.imports, selectedId, 'Cabin ID');
  payload.importQueue = filterRowsForFinalRental_(payload.importQueue, selectedId, 'Cabin ID');

  if (payload.paymentData) {
    payload.paymentData = filterPaymentDataForFinalRental_(payload.paymentData, selectedId);
  }

  payload.finalizedRentalOnly = true;
  payload.finalizedRentalId = selectedId;
  return payload;
}

function getPortalStartupDataFocused(deviceId) {
  const freshTrip = getSettings_('Trip');
  const selectedId = finalizedRentalFocusIdFromTrip_(freshTrip);
  const payload = getPortalStartupData(deviceId);

  // The ordinary startup endpoint may legitimately come from its 15-second
  // cache. Always use fresh trip settings for the final-rental decision.
  payload.trip = freshTrip;

  return selectedId
    ? focusPortalPayloadToFinalRental_(payload, selectedId)
    : payload;
}

function getPortalDeferredDataWithPaymentsFocused() {
  const payload = getPortalDeferredDataWithPayments();
  const selectedId = finalizedRentalFocusIdFromTrip_(payload && payload.trip);
  return selectedId
    ? focusPortalPayloadToFinalRental_(payload, selectedId)
    : payload;
}

function getPaymentDataFastFocused(forceFresh) {
  const data = getPaymentDataFast(forceFresh);
  const selectedId = finalizedRentalFocusId_();
  return selectedId
    ? filterPaymentDataForFinalRental_(data, selectedId)
    : data;
}
