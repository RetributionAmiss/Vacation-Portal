function queueCabinEdit(values, reviewMode) {
  setupVacationPortalSilent_();

  values = values || {};
  assertOrganizerFromValues_(values);

  const cabinId = String(values.id || '').trim();
  const name = String(values.name || '').trim();

  if (!cabinId) throw new Error('Cabin ID is required.');
  if (!name) throw new Error('Property name is required.');

  const cabinExists = readSheet_('Cabins').some(function (row) {
    return row['Cabin ID'] === cabinId;
  });

  if (!cabinExists) throw new Error('Cabin not found.');

  const queueId = uid_('EDITQ');
  const now = new Date();
  const compact = compactCabinEditPayload_(values);
  const sheet = getSpreadsheet_().getSheetByName('Rental Edit Queue');

  if (!sheet) {
    throw new Error(
      'The rental edit queue has not been initialized. Run Vacation Portal → Set up / repair portal once.'
    );
  }

  sheet.appendRow([
    queueId,
    cabinId,
    String(values.submittedBy || '').trim(),
    now,
    'Queued',
    reviewMode ? 'Yes' : 'No',
    JSON.stringify(compact),
    0,
    '',
    now
  ]);

  ensureRentalEnrichmentTrigger_();

  return {
    ok: true,
    queued: true,
    queueId: queueId,
    message: reviewMode
      ? 'Rental review queued. You can keep working while it saves.'
      : 'Rental edits queued. You can keep working while they save.',
    cabin: buildQueuedCabinPatch_(compact, reviewMode)
  };
}

function compactCabinEditPayload_(values) {
  function text_(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength || 10000);
  }

  function number_(value) {
    const number = Number(value || 0);
    return isFinite(number) ? number : 0;
  }

  return {
    id: text_(values.id, 250),
    provider: text_(values.provider, 250),
    providerPropertyId: text_(values.providerPropertyId, 500),
    name: text_(values.name, 1000),
    nickname: text_(values.nickname, 1000),
    originalUrl: text_(values.originalUrl, 5000),
    url: text_(values.url, 5000),
    location: text_(values.location, 1000),
    sleeps: number_(values.sleeps),
    bedrooms: number_(values.bedrooms),
    bathrooms: number_(values.bathrooms),
    totalCost: number_(values.totalCost),
    nightlyRate: number_(values.nightlyRate),
    rating: number_(values.rating),
    reviewCount: number_(values.reviewCount),
    imageUrl: text_(values.imageUrl, 5000),
    photoUrls: normalizeLines_(values.photoUrls).slice(0, 40000),
    description: text_(values.description, 15000),
    amenities: normalizeLines_(values.amenities).slice(0, 20000),
    pool: text_(values.pool, 2000),
    hotTub: text_(values.hotTub, 2000),
    theater: text_(values.theater, 2000),
    arcade: text_(values.arcade, 2000),
    cancellationPolicy: text_(values.cancellationPolicy, 10000),
    feesAndTaxes: text_(values.feesAndTaxes, 10000),
    houseRules: normalizeLines_(values.houseRules).slice(0, 15000),
    parking: text_(values.parking, 5000),
    accessibility: text_(values.accessibility, 5000),
    nearbyHighlights: normalizeLines_(values.nearbyHighlights).slice(0, 10000),
    submittedBy: text_(values.submittedBy, 250)
  };
}

function buildQueuedCabinPatch_(values, reviewMode) {
  return {
    'Cabin ID': values.id,
    'Provider': values.provider,
    'Provider Property ID': values.providerPropertyId,
    'Cabin Name': values.name,
    'Nickname': values.nickname,
    'Rental URL': values.url,
    'Original Rental URL': values.originalUrl || values.url,
    'Location': values.location,
    'Sleeps': values.sleeps,
    'Bedrooms': values.bedrooms,
    'Bathrooms': values.bathrooms,
    'Total Rental Cost': values.totalCost,
    'Nightly Rate': values.nightlyRate,
    'Rating': values.rating,
    'Review Count': values.reviewCount,
    'Image URL': values.imageUrl,
    'Photo URLs': values.photoUrls,
    'Description': values.description,
    'Amenities': values.amenities,
    'Cancellation Policy': values.cancellationPolicy,
    'Fees and Taxes': values.feesAndTaxes,
    'House Rules': values.houseRules,
    'Parking': values.parking,
    'Accessibility': values.accessibility,
    'Nearby Highlights': values.nearbyHighlights,
    'Import Stage': reviewMode ? 'Review Saving…' : 'Saving Edits…',
    'Updated At': new Date().toISOString()
  };
}

function processRentalEditQueue_() {
  const rows = readSheet_('Rental Edit Queue')
    .filter(function (row) {
      return ['Queued', 'Error'].indexOf(String(row.Status || '')) >= 0 &&
        Number(row.Attempts || 0) < 3;
    })
    .slice(0, 4);

  let processed = 0;
  let failed = 0;

  rows.forEach(function (row) {
    const queueId = row['Queue ID'];
    const attempts = Number(row.Attempts || 0) + 1;

    updateById_('Rental Edit Queue', 'Queue ID', queueId, {
      'Status': 'Processing',
      'Attempts': attempts,
      'Last Error': '',
      'Updated At': new Date()
    });

    try {
      const values = JSON.parse(String(row['Payload JSON'] || '{}'));
      applyQueuedCabinEdit_(
        values,
        String(row['Review Mode'] || '').toLowerCase() === 'yes'
      );

      updateById_('Rental Edit Queue', 'Queue ID', queueId, {
        'Status': 'Completed',
        'Payload JSON': '',
        'Last Error': '',
        'Updated At': new Date()
      });

      processed++;
    } catch (error) {
      failed++;
      updateById_('Rental Edit Queue', 'Queue ID', queueId, {
        'Status': attempts >= 3 ? 'Failed' : 'Error',
        'Last Error': String(
          error && error.message ? error.message : error
        ).slice(0, 5000),
        'Updated At': new Date()
      });
    }
  });

  return {
    processed: processed,
    failed: failed,
    remaining: readSheet_('Rental Edit Queue').filter(function (row) {
      return ['Queued', 'Error', 'Processing']
        .indexOf(String(row.Status || '')) >= 0 &&
        Number(row.Attempts || 0) < 3;
    }).length
  };
}

function applyQueuedCabinEdit_(values, reviewMode) {
  const id = String(values.id || '').trim();
  const now = new Date();

  const existing = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === id;
  });

  if (!existing) throw new Error('Cabin not found.');

  const record = {
    'Provider': String(values.provider || existing.Provider || '').trim(),
    'Provider Property ID': String(
      values.providerPropertyId ||
      existing['Provider Property ID'] ||
      ''
    ).trim(),
    'Cabin Name': String(values.name || existing['Cabin Name'] || '').trim(),
    'Nickname': String(values.nickname || '').trim(),
    'Rental URL': String(values.url || existing['Rental URL'] || '').trim(),
    'Original Rental URL': String(
      values.originalUrl ||
      values.url ||
      existing['Original Rental URL'] ||
      ''
    ).trim(),
    'Location': String(values.location || '').trim(),
    'Sleeps': Number(values.sleeps || 0),
    'Bedrooms': Number(values.bedrooms || 0),
    'Bathrooms': Number(values.bathrooms || 0),
    'Total Rental Cost': Number(values.totalCost || 0),
    'Nightly Rate': Number(values.nightlyRate || 0),
    'Rating': Number(values.rating || 0),
    'Review Count': Number(values.reviewCount || 0),
    'Image URL': String(values.imageUrl || '').trim(),
    'Photo URLs': normalizeLines_(values.photoUrls),
    'Description': String(values.description || '').trim(),
    'Amenities': normalizeLines_(values.amenities),
    'Cancellation Policy': String(values.cancellationPolicy || '').trim(),
    'Fees and Taxes': String(values.feesAndTaxes || '').trim(),
    'House Rules': normalizeLines_(values.houseRules),
    'Parking': String(values.parking || '').trim(),
    'Accessibility': String(values.accessibility || '').trim(),
    'Nearby Highlights': normalizeLines_(values.nearbyHighlights),
    'Import Stage': reviewMode ? 'Reviewed' : (
      existing['Import Stage'] === 'Review Saving…'
        ? 'Reviewed'
        : existing['Import Stage'] || 'Manual'
    ),
    'Updated At': now
  };

  if (!record['Cabin Name']) throw new Error('Property name is required.');

  updateById_('Cabins', 'Cabin ID', id, record);

  const photoLines = normalizeLines_(values.photoUrls)
    .split('\n')
    .filter(Boolean);

  const amenityLines = normalizeLines_(values.amenities)
    .split('\n')
    .filter(Boolean);

  if (photoLines.length) {
    replaceCabinPhotos_(id, photoLines, 'Manual Edit');
  }

  if (amenityLines.length) {
    replaceCabinAmenities_(id, amenityLines, 'Manual Edit');
  }

  saveDerivedCabinDetails_(
    id,
    {
      propertyName: record['Cabin Name'],
      description: record.Description,
      amenities: record.Amenities,
      pool: values.pool,
      hotTub: values.hotTub,
      theater: values.theater,
      arcade: values.arcade
    },
    {
      pool: values.pool,
      hotTub: values.hotTub,
      theater: values.theater,
      arcade: values.arcade
    }
  );

  syncCabinBedroomPlaceholders_(
    id,
    record.Bedrooms,
    record.Bathrooms
  );

  if (reviewMode) {
    const imports = readSheet_('Rental Import').filter(function (row) {
      return row['Cabin ID'] === id;
    });

    if (imports.length) {
      const latest = imports[imports.length - 1];
      updateById_('Rental Import', 'Import ID', latest['Import ID'], {
        'Status': 'Imported',
        'Property Name': record['Cabin Name'],
        'Notes': 'Reviewed and completed in the portal.',
        'Updated At': now
      });
    }
  }
}

function retryFailedRentalEdits() {
  assertSpreadsheetAdminContext_();

  const failed = readSheet_('Rental Edit Queue').filter(function (row) {
    return ['Error', 'Failed'].indexOf(String(row.Status || '')) >= 0;
  });

  failed.forEach(function (row) {
    updateById_('Rental Edit Queue', 'Queue ID', row['Queue ID'], {
      'Status': 'Queued',
      'Attempts': 0,
      'Last Error': '',
      'Updated At': new Date()
    });
  });

  ensureRentalEnrichmentTrigger_();

  safeUiAlert_(
    'Rental edits requeued',
    failed.length + ' edit(s) were returned to the background queue.'
  );

  return {queued: failed.length};
}
