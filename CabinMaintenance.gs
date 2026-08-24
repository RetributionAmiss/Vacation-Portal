function clearCabinData() {
  const confirmed = safeUiConfirm_(
    'Clear all cabin data?',
    'This permanently removes cabins, rental imports, photos, amenities, bedrooms, votes, comments, favorites, room assignments, import logs, queue items, and AI rental history. Travelers and trip planning data are retained.'
  );

  if (!confirmed) {
    return {status: 'cancelled'};
  }

  removeRentalEnrichmentTriggers_();

  const sheetNames = [
    'Cabins',
    'Cabin Details',
    'Cabin Photos',
    'Cabin Amenities',
    'Bedrooms',
    'Votes',
    'Comments',
    'Favorites',
    'Assignments',
    'Rental Import',
    'Rental Import Queue',
    'Rental Import Log',
    'AI History'
  ];

  const ss = getSpreadsheet_();
  const cleared = [];

  sheetNames.forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow > 1 && lastColumn > 0) {
      sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
    }
    cleared.push(name);
  });

  safeUiAlert_(
    'Cabin data cleared',
    'Removed cabin-related records from ' + cleared.length + ' sheets. Travelers and general trip planning data were kept.'
  );

  return {
    status: 'ok',
    sheetsCleared: cleared
  };
}


function setCabinOriginalUrl(cabinId, originalUrl) {
  const providerInfo = getRentalProviderInfo_(originalUrl);
  if (!providerInfo.originalUrl) throw new Error('A full rental URL is required.');

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Original Rental URL': providerInfo.originalUrl,
    'Rental URL': providerInfo.canonicalUrl,
    'Provider': providerInfo.provider,
    'Provider Property ID': providerInfo.propertyId,
    'Updated At': new Date()
  });

  const importRow = readSheet_('Rental Import').slice().reverse().find(function (row) {
    return row['Cabin ID'] === cabinId;
  });

  if (importRow) {
    updateById_('Rental Import', 'Import ID', importRow['Import ID'], {
      'Original URL': providerInfo.originalUrl,
      'Canonical URL': providerInfo.canonicalUrl,
      'Provider': providerInfo.provider,
      'Provider Property ID': providerInfo.propertyId,
      'Updated At': new Date()
    });
  }

  return getPortalData();
}
