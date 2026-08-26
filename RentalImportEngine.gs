function submitRental(url, submittedBy) {
  const providerInfo = getRentalProviderInfo_(url);
  const expediaPropertyId = typeof getExpediaPropertyId_ === 'function'
    ? getExpediaPropertyId_(providerInfo.originalUrl)
    : '';

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error(
      'Another rental is being queued right now. Please try this link again in a few seconds.'
    );
  }

  try {
    const duplicate = findDuplicateRental_(providerInfo, expediaPropertyId);
    if (duplicate) {
      throw new Error(
        'Duplicate rental: ' +
        (duplicate.name || providerInfo.canonicalUrl) +
        ' is already in the portal' +
        (duplicate.stage ? ' (' + duplicate.stage + ')' : '') +
        '. Open the existing cabin card instead.'
      );
    }

    const importId = uid_('IMPORT');
    const cabinId = uid_('CABIN');
    const queueId = uid_('QUEUE');
    const now = new Date();
    const placeholderName =
      providerInfo.provider + ' property ' +
      (providerInfo.propertyId || expediaPropertyId || '');

    appendObject_('Cabins', {
      'Cabin ID': cabinId,
      'Provider': providerInfo.provider,
      'Provider Property ID': providerInfo.propertyId,
      'Cabin Name': placeholderName.trim() || 'Queued rental',
      'Nickname': '',
      'Rental URL': providerInfo.canonicalUrl,
      'Original Rental URL': providerInfo.originalUrl,
      'Location': '',
      'Sleeps': 0,
      'Bedrooms': 0,
      'Bathrooms': 0,
      'Total Rental Cost': 0,
      'Nightly Rate': 0,
      'Rating': 0,
      'Review Count': 0,
      'Image URL': '',
      'Photo URLs': '',
      'Description': '',
      'Amenities': '',
      'Cancellation Policy': '',
      'Fees and Taxes': '',
      'House Rules': '',
      'Parking': '',
      'Accessibility': '',
      'Nearby Highlights': '',
      'Import Stage': 'Queued',
      'Import Confidence': 0,
      'Status': 'Candidate',
      'Submitted By': submittedBy || '',
      'Created At': now,
      'Updated At': now,
      'Active': 'Yes'
    });

    appendObject_('Rental Import', {
      'Import ID': importId,
      'Original URL': providerInfo.originalUrl,
      'Canonical URL': providerInfo.canonicalUrl,
      'Provider': providerInfo.provider,
      'Provider Property ID': providerInfo.propertyId,
      'Submitted By': submittedBy || '',
      'Submitted At': now,
      'Status': 'Quick Queued',
      'Cabin ID': cabinId,
      'Property Name': placeholderName,
      'Notes':
        'Accepted after initial duplicate validation. ' +
        'Fast import and AI enrichment will run in the background.',
      'Updated At': now
    });

    appendObject_('Rental Import Queue', {
      'Queue ID': queueId,
      'Import ID': importId,
      'Cabin ID': cabinId,
      'Original URL': providerInfo.originalUrl,
      'Canonical URL': providerInfo.canonicalUrl,
      'Provider': providerInfo.provider,
      'Status': 'Quick Queued',
      'Attempts': 0,
      'Last Error': '',
      'Created At': now,
      'Updated At': now
    });

    logRentalImport_(
      importId,
      cabinId,
      'Initial Entry',
      'Queued',
      'Duplicate check passed. Background import queued.',
      ''
    );

    ensureRentalEnrichmentTrigger_();

    return {
      queued: true,
      cabin: {
        'Cabin ID': cabinId,
        'Provider': providerInfo.provider,
        'Provider Property ID': providerInfo.propertyId,
        'Cabin Name': placeholderName.trim() || 'Queued rental',
        'Nickname': '',
        'Rental URL': providerInfo.canonicalUrl,
        'Original Rental URL': providerInfo.originalUrl,
        'Location': '',
        'Sleeps': 0,
        'Bedrooms': 0,
        'Bathrooms': 0,
        'Total Rental Cost': 0,
        'Nightly Rate': 0,
        'Rating': 0,
        'Review Count': 0,
        'Image URL': '',
        'Photo URLs': '',
        'Description': '',
        'Amenities': '',
        'Cancellation Policy': '',
        'Fees and Taxes': '',
        'House Rules': '',
        'Parking': '',
        'Accessibility': '',
        'Nearby Highlights': '',
        'Import Stage': 'Queued',
        'Import Confidence': 0,
        'Status': 'Candidate',
        'Submitted By': submittedBy || '',
        'Created At': now,
        'Updated At': now,
        'Active': 'Yes',
        bedrooms: [],
        comments: [],
        favoriteCount: 0,
        voteCount: 0,
        averageScore: 0,
        import: {
          'Import ID': importId,
          'Status': 'Quick Queued',
          'Notes': 'Accepted after initial duplicate validation.'
        },
        queue: {
          'Queue ID': queueId,
          'Status': 'Quick Queued',
          'Attempts': 0,
          'Last Error': ''
        },
        detail: null,
        photos: [],
        amenityRows: []
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function findDuplicateRental_(providerInfo, expediaPropertyId) {
  const canonical = String(providerInfo.canonicalUrl || '').toLowerCase();
  const provider = String(providerInfo.provider || '').toLowerCase();
  const publicPropertyId = String(providerInfo.propertyId || '');
  const expediaId = String(expediaPropertyId || '');

  function sameIdentity_(row, urlField, canonicalField, propertyIdField) {
    const rowOriginalUrl = String(row[urlField] || '');
    const rowCanonical = String(row[canonicalField] || '').toLowerCase();
    const rowProvider = String(row.Provider || '').toLowerCase();
    const rowPublicId = String(row[propertyIdField] || '');
    const rowExpediaId = typeof getExpediaPropertyId_ === 'function'
      ? String(getExpediaPropertyId_(rowOriginalUrl) || '')
      : '';

    return Boolean(
      (canonical && rowCanonical && canonical === rowCanonical) ||
      (
        provider &&
        rowProvider === provider &&
        publicPropertyId &&
        rowPublicId === publicPropertyId
      ) ||
      (
        expediaId &&
        rowExpediaId &&
        expediaId === rowExpediaId
      )
    );
  }

  const cabin = readSheet_('Cabins').find(function (row) {
    return sameIdentity_(
      row,
      'Original Rental URL',
      'Rental URL',
      'Provider Property ID'
    );
  });

  if (cabin) {
    return {
      cabinId: cabin['Cabin ID'],
      name: cabin.Nickname || cabin['Cabin Name'] || '',
      stage: cabin['Import Stage'] || cabin.Status || ''
    };
  }

  const importRow = readSheet_('Rental Import').find(function (row) {
    return sameIdentity_(
      row,
      'Original URL',
      'Canonical URL',
      'Provider Property ID'
    );
  });

  if (importRow) {
    return {
      cabinId: importRow['Cabin ID'],
      name: importRow['Property Name'] || '',
      stage: importRow.Status || ''
    };
  }

  return null;
}

function refreshCabinPhotos(cabinId, authorization) {
  authorization = authorization || {};
  assertOrganizerFromValues_(authorization);

  const cabin = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId;
  });
  if (!cabin) throw new Error('Cabin not found.');

  const providerInfo = getRentalProviderInfo_(
    cabin['Original Rental URL'] || cabin['Rental URL']
  );
  const fetchResult = fetchRentalHtml_(providerInfo);
  const fastData = extractFastRentalData_(providerInfo, fetchResult);

  const fragmentImages =
    fastData.sourceSummary &&
    fastData.sourceSummary.structuredFragments
      ? fastData.sourceSummary.structuredFragments.images || []
      : [];

  const photoUrls = prioritizePropertyImages_(
    (fastData.photoUrls || []).concat(fragmentImages)
  ).slice(0, 40);

  if (!photoUrls.length) {
    const token = PropertiesService.getScriptProperties()
      .getProperty('APIFY_API_TOKEN');

    throw new Error(
      token
        ? 'The Vrbo scraper completed but returned no photo URLs. Open the Apify run output to confirm the listing result, then check Rental Import Log for the response details.'
        : 'Vrbo does not expose its gallery to Apps Script. Configure Apify from Vacation Portal → Set Apify API token, then run Refresh photos again.'
    );
  }

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Image URL': photoUrls[0],
    'Photo URLs': normalizeLines_(photoUrls),
    'Updated At': new Date()
  });

  replaceCabinPhotos_(cabinId, photoUrls, 'Photo Refresh');
  return getPortalData();
}

function enrichCabinNow(cabinId, authorization) {
  authorization = authorization || {};
  assertOrganizerFromValues_(authorization);

  const queue = readSheet_('Rental Import Queue').slice().reverse().find(function (row) {
    return row['Cabin ID'] === cabinId &&
      [
        'Quick Queued',
        'Quick Processing',
        'Quick Error',
        'Enrichment Queued',
        'Enriching',
        'Enrichment Error'
      ].indexOf(String(row.Status || '')) >= 0;
  });

  if (queue) {
    const status = String(queue.Status || '');
    if (['Quick Queued', 'Quick Processing', 'Quick Error'].indexOf(status) >= 0) {
      processRentalQuickPhase_(queue);
      const refreshedQueue = readSheet_('Rental Import Queue')
        .slice()
        .reverse()
        .find(function (row) {
          return row['Queue ID'] === queue['Queue ID'];
        });
      if (refreshedQueue && refreshedQueue.Status === 'Enrichment Queued') {
        processRentalEnrichmentPhase_(refreshedQueue);
      }
    } else {
      processRentalEnrichmentPhase_(queue);
    }
  } else {
    const cabin = readSheet_('Cabins').find(function (row) {
      return row['Cabin ID'] === cabinId;
    });
    if (!cabin) throw new Error('Cabin not found.');

    const importRow = readSheet_('Rental Import').slice().reverse().find(function (row) {
      return row['Cabin ID'] === cabinId;
    });

    const queueRecord = {
      'Queue ID': uid_('QUEUE'),
      'Import ID': importRow ? importRow['Import ID'] : uid_('IMPORT'),
      'Cabin ID': cabinId,
      'Original URL': cabin['Original Rental URL'] || cabin['Rental URL'],
      'Canonical URL': cabin['Rental URL'],
      'Provider': cabin.Provider || 'Other',
      'Status': 'Enrichment Queued',
      'Attempts': 0,
      'Created At': new Date(),
      'Updated At': new Date()
    };

    appendObject_('Rental Import Queue', queueRecord);
    processRentalQueueItem_(queueRecord);
  }

  return getPortalData();
}

function processRentalEnrichmentQueue_() {
  setupVacationPortalSilent_();

  const editResult = processRentalEditQueue_();
  const extensionResult = processExtensionCaptureQueue_();
  const queueRows = readSheet_('Rental Import Queue');
  const quickRows = queueRows.filter(function (row) {
    return ['Quick Queued', 'Quick Error'].indexOf(String(row.Status || '')) >= 0 &&
      Number(row.Attempts || 0) < 3;
  }).slice(0, 2);

  const enrichmentRows = queueRows.filter(function (row) {
    return ['Enrichment Queued', 'Enrichment Error'].indexOf(String(row.Status || '')) >= 0 &&
      Number(row.Attempts || 0) < 3;
  }).slice(0, quickRows.length ? 0 : 1);

  let quickProcessed = 0;
  let enriched = 0;
  let failed = 0;

  quickRows.forEach(function (row) {
    try {
      processRentalQuickPhase_(row);
      quickProcessed++;
    } catch (error) {
      failed++;
    }
  });

  enrichmentRows.forEach(function (row) {
    try {
      processRentalEnrichmentPhase_(row);
      enriched++;
    } catch (error) {
      failed++;
    }
  });

  const remaining = readSheet_('Rental Import Queue').filter(function (row) {
    return [
      'Quick Queued',
      'Quick Error',
      'Enrichment Queued',
      'Enrichment Error'
    ].indexOf(String(row.Status || '')) >= 0 &&
      Number(row.Attempts || 0) < 3;
  }).length;

  return {
    editsProcessed: editResult.processed,
    editsFailed: editResult.failed,
    editsRemaining: editResult.remaining,
    extensionProcessed: extensionResult.processed,
    extensionDuplicates: extensionResult.duplicates,
    extensionFailed: extensionResult.failed,
    extensionRemaining: extensionResult.remaining,
    quickProcessed: quickProcessed,
    enriched: enriched,
    failed: failed,
    remaining: remaining
  };
}

function processRentalQuickPhase_(queueRow) {
  const queueId = queueRow['Queue ID'];
  const importId = queueRow['Import ID'];
  const cabinId = queueRow['Cabin ID'];
  const attempts = Number(queueRow.Attempts || 0) + 1;

  updateById_('Rental Import Queue', 'Queue ID', queueId, {
    'Status': 'Quick Processing',
    'Attempts': attempts,
    'Last Error': '',
    'Updated At': new Date()
  });

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Import Stage': 'Importing Property',
    'Updated At': new Date()
  });

  updateById_('Rental Import', 'Import ID', importId, {
    'Status': 'Importing Property',
    'Updated At': new Date()
  });

  logRentalImport_(
    importId,
    cabinId,
    'Quick Import',
    'Started',
    'Retrieving the property card, photos, price, rooms, and reviews.',
    ''
  );

  try {
    const providerInfo = getRentalProviderInfo_(
      queueRow['Original URL'] || queueRow['Canonical URL']
    );

    const fetchResult = fetchRentalHtml_(providerInfo);
    const fastData = extractFastRentalData_(providerInfo, fetchResult);

    applyQuickRentalData_(cabinId, fastData);

    const quotaLimited = Boolean(fastData.sourceSummary && fastData.sourceSummary.apifyQuotaLimited);
    if (quotaLimited && !fastData.imageUrl && !(fastData.photoUrls || []).length) {
      updateById_('Rental Import Queue', 'Queue ID', queueId, {
        'Status': 'Quota Waiting',
        'Last Error': 'Apify usage limit reached. Existing photos were preserved. Retry after the quota resets or add photos manually.',
        'Updated At': new Date()
      });
      updateById_('Rental Import', 'Import ID', importId, {
        'Status': 'Quota Waiting',
        'Notes': 'Core import paused because the Apify usage limit was reached. Existing photos were preserved.',
        'Updated At': new Date()
      });
      updateById_('Cabins', 'Cabin ID', cabinId, {
        'Import Stage': 'Waiting for Photo Quota',
        'Updated At': new Date()
      });
      logRentalImport_(importId, cabinId, 'Quick Import', 'Quota Waiting', 'Apify usage limit reached. The import was paused without clearing existing photos.', fastData.sourceSummary.apifyStatus || '');
      return;
    }

    const coreMissing = getMissingCoreRentalFields_(fastData);

    updateById_('Rental Import Queue', 'Queue ID', queueId, {
      'Status': 'Enrichment Queued',
      'Attempts': 0,
      'Last Error': '',
      'Updated At': new Date()
    });

    updateById_('Rental Import', 'Import ID', importId, {
      'Status': 'Enrichment Queued',
      'Property Name': fastData.propertyName || '',
      'Notes': coreMissing.length
        ? 'Core card created. Still seeking: ' + coreMissing.join(', ') + '.'
        : 'Core card created. AI detail enrichment is queued.',
      'Updated At': new Date()
    });

    updateById_('Cabins', 'Cabin ID', cabinId, {
      'Import Stage': 'Core Card Ready',
      'Import Confidence': calculateImportConfidence_(fastData),
      'Updated At': new Date()
    });

    logRentalImport_(
      importId,
      cabinId,
      'Quick Import',
      'Completed',
      coreMissing.length
        ? 'Core card created with missing fields: ' + coreMissing.join(', ')
        : 'Core card created successfully.',
      fetchResult.status || ''
    );

    ensureRentalEnrichmentTrigger_();
  } catch (error) {
    const message = String(error.message || error);

    updateById_('Rental Import Queue', 'Queue ID', queueId, {
      'Status': 'Quick Error',
      'Last Error': message,
      'Updated At': new Date()
    });

    updateById_('Rental Import', 'Import ID', importId, {
      'Status': 'Quick Error',
      'Notes': message,
      'Updated At': new Date()
    });

    updateById_('Cabins', 'Cabin ID', cabinId, {
      'Import Stage': 'Import Error',
      'Updated At': new Date()
    });

    logRentalImport_(importId, cabinId, 'Quick Import', 'Error', message, '');
    throw error;
  }
}

function applyQuickRentalData_(cabinId, data) {
  data = deriveFeatureDetails_(data || {});
  data.rating = sanitizeRating_(data.rating, 'Vrbo');

  const existing = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId;
  }) || {};

  const incomingPhotos = uniqueStrings_(data.photoUrls || []);
  const existingPhotos = String(existing['Photo URLs'] || '')
    .split(/\r?\n/)
    .map(function (value) { return value.trim(); })
    .filter(Boolean);

  const finalPhotos = incomingPhotos.length ? incomingPhotos : existingPhotos;
  const finalImage = data.imageUrl || finalPhotos[0] || existing['Image URL'] || '';

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Cabin Name': data.propertyName || existing['Cabin Name'] || 'Imported rental',
    'Location': data.location || existing.Location || '',
    'Sleeps': Number(data.sleeps || existing.Sleeps || 0),
    'Bedrooms': Number(data.bedroomCount || existing.Bedrooms || 0),
    'Bathrooms': Number(data.bathroomCount || existing.Bathrooms || 0),
    'Total Rental Cost': Number(data.totalRentalCost || existing['Total Rental Cost'] || 0),
    'Nightly Rate': Number(data.nightlyRate || existing['Nightly Rate'] || 0),
    'Rating': Number(data.rating || existing.Rating || 0),
    'Review Count': Number(data.reviewCount || existing['Review Count'] || 0),
    'Image URL': finalImage,
    'Photo URLs': normalizeLines_(finalPhotos),
    'Description': data.description || existing.Description || '',
    'Amenities': normalizeLines_((data.amenities && data.amenities.length) ? data.amenities : String(existing.Amenities || '').split(/\r?\n/)),
    'Cancellation Policy': data.cancellationPolicy || existing['Cancellation Policy'] || '',
    'Fees and Taxes': data.feesAndTaxes || existing['Fees and Taxes'] || '',
    'House Rules': normalizeLines_((data.houseRules && data.houseRules.length) ? data.houseRules : String(existing['House Rules'] || '').split(/\r?\n/)),
    'Import Confidence': calculateImportConfidence_(data),
    'Updated At': new Date()
  });

  if (incomingPhotos.length) replaceCabinPhotos_(cabinId, incomingPhotos, 'Quick Import');
  if (data.amenities && data.amenities.length) replaceCabinAmenities_(cabinId, data.amenities, 'Quick Import');
  if (data.bedrooms && data.bedrooms.length) replaceCabinBedrooms_(cabinId, data.bedrooms);

  saveCabinDetail_(cabinId, {
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    minimumAge: data.minimumAge,
    pets: data.pets,
    pool: data.pool,
    hotTub: data.hotTub,
    theater: data.theater,
    arcade: data.arcade,
    kitchen: data.kitchen,
    laundry: data.laundry,
    outdoorSpace: data.outdoorSpace,
    internet: data.internet,
    latitude: data.latitude,
    longitude: data.longitude,
    rawStructuredData: JSON.stringify(data.sourceSummary || {}),
    confidenceJson: JSON.stringify(data.confidence || buildConfidenceMap_(data))
  });
}

function getMissingCoreRentalFields_(data) {
  const missing = [];
  if (!data.propertyName) missing.push('property name');
  if (!data.imageUrl && !(data.photoUrls || []).length) missing.push('photos');
  if (!Number(data.sleeps || 0)) missing.push('guest capacity');
  if (!Number(data.bedroomCount || 0)) missing.push('bedrooms');
  if (!Number(data.bathroomCount || 0)) missing.push('bathrooms');
  if (!Number(data.totalRentalCost || data.nightlyRate || 0)) missing.push('price');
  if (!Number(data.rating || 0)) missing.push('rating');
  return missing;
}

function processRentalEnrichmentPhase_(queueRow) {
  const queueId = queueRow['Queue ID'];
  const importId = queueRow['Import ID'];
  const cabinId = queueRow['Cabin ID'];
  const attempts = Number(queueRow.Attempts || 0) + 1;

  updateById_('Rental Import Queue', 'Queue ID', queueId, {
    'Status': 'Enriching',
    'Attempts': attempts,
    'Last Error': '',
    'Updated At': new Date()
  });

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Import Stage': 'Enriching Details',
    'Updated At': new Date()
  });

  updateById_('Rental Import', 'Import ID', importId, {
    'Status': 'Enriching Details',
    'Updated At': new Date()
  });

  logRentalImport_(
    importId,
    cabinId,
    'AI Enrichment',
    'Started',
    'Gemini is enriching amenities, policies, room layouts, and descriptions.',
    ''
  );

  try {
    const providerInfo = getRentalProviderInfo_(
      queueRow['Original URL'] || queueRow['Canonical URL']
    );

    const fetchResult = fetchRentalHtml_(providerInfo);
    const fastData = extractFastRentalData_(providerInfo, fetchResult);
    const aiData = importRentalWithGemini_(
      providerInfo,
      fastData,
      importId,
      cabinId
    );
    const merged = mergeRentalData_(fastData, aiData);

    applyEnrichedRental_(cabinId, merged);

    const missing = getMissingRentalFields_(merged);
    const status = missing.length ? 'Needs Review' : 'Imported';

    updateById_('Rental Import Queue', 'Queue ID', queueId, {
      'Status': 'Completed',
      'Last Error': '',
      'Updated At': new Date()
    });

    updateById_('Rental Import', 'Import ID', importId, {
      'Status': status,
      'Property Name': merged.propertyName || '',
      'Notes': missing.length
        ? 'Enrichment completed. Review: ' + missing.join(', ') + '.'
        : 'Automatic enrichment completed.',
      'Updated At': new Date()
    });

    updateById_('Cabins', 'Cabin ID', cabinId, {
      'Import Stage': status,
      'Import Confidence': calculateImportConfidence_(merged),
      'Updated At': new Date()
    });

    logRentalImport_(
      importId,
      cabinId,
      'AI Enrichment',
      status,
      missing.length
        ? 'Completed with missing fields: ' + missing.join(', ')
        : 'Completed successfully.',
      ''
    );
  } catch (error) {
    const message = String(error.message || error);

    updateById_('Rental Import Queue', 'Queue ID', queueId, {
      'Status': 'Enrichment Error',
      'Last Error': message,
      'Updated At': new Date()
    });

    updateById_('Rental Import', 'Import ID', importId, {
      'Status': 'Needs Review',
      'Notes': 'Automatic enrichment failed: ' + message,
      'Updated At': new Date()
    });

    updateById_('Cabins', 'Cabin ID', cabinId, {
      'Import Stage': 'Core Ready — Enrichment Error',
      'Updated At': new Date()
    });

    logRentalImport_(importId, cabinId, 'AI Enrichment', 'Error', message, '');
    throw error;
  }
}

function processRentalQueueItem_(queueRow) {
  const status = String(queueRow.Status || '');

  if (['Quick Queued', 'Quick Error'].indexOf(status) >= 0) {
    return processRentalQuickPhase_(queueRow);
  }

  return processRentalEnrichmentPhase_(queueRow);
}

function mergeRentalData_(fastData, aiData) {
  fastData = fastData || {};
  aiData = aiData || {};

  const merged = {};
  [
    'propertyName', 'nickname', 'location', 'sleeps', 'bedroomCount',
    'bathroomCount', 'totalRentalCost', 'nightlyRate', 'rating',
    'reviewCount', 'imageUrl', 'description', 'cancellationPolicy',
    'feesAndTaxes', 'parking', 'accessibility', 'checkIn', 'checkOut',
    'minimumAge', 'pets', 'pool', 'hotTub', 'theater', 'arcade',
    'kitchen', 'laundry', 'outdoorSpace', 'internet', 'latitude',
    'longitude'
  ].forEach(function (key) {
    const aiValue = aiData[key];
    const fastValue = fastData[key];
    const hasAiValue = typeof aiValue === 'number'
      ? aiValue !== 0
      : String(aiValue || '').trim() !== '';
    merged[key] = hasAiValue ? aiValue : fastValue;
  });

  merged.photoUrls = uniqueStrings_(
    (aiData.photoUrls || []).concat(fastData.photoUrls || [])
  );
  merged.amenities = uniqueStrings_(
    (aiData.amenities || []).concat(fastData.amenities || [])
  );
  merged.houseRules = uniqueStrings_(
    (aiData.houseRules || []).concat(fastData.houseRules || [])
  );
  merged.nearbyHighlights = uniqueStrings_(
    (aiData.nearbyHighlights || []).concat(fastData.nearbyHighlights || [])
  );
  merged.bedrooms = Array.isArray(aiData.bedrooms) && aiData.bedrooms.length
    ? aiData.bedrooms
    : (fastData.bedrooms || []);
  merged.rating = sanitizeRating_(merged.rating, aiData.provider || fastData.provider || 'Vrbo');
  deriveFeatureDetails_(merged);
  merged.confidence = sanitizeConfidenceMap_(
    aiData.confidence || buildConfidenceMap_(merged)
  );
  merged.sourceSummary = fastData.sourceSummary || {};
  return merged;
}

function applyEnrichedRental_(cabinId, data) {
  data = deriveFeatureDetails_(data || {});
  data.rating = sanitizeRating_(data.rating, 'Vrbo');

  const existing = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId;
  });

  if (!existing) throw new Error('Cabin not found.');

  const existingPhotos = String(existing['Photo URLs'] || '')
    .split(/\r?\n/)
    .map(function (value) { return value.trim(); })
    .filter(Boolean);

  const incomingPhotos = uniqueStrings_(data.photoUrls || []);
  const finalPhotos = incomingPhotos.length
    ? uniqueStrings_(incomingPhotos.concat(existingPhotos))
    : existingPhotos;

  const existingAmenities = String(existing.Amenities || '')
    .split(/\r?\n/)
    .map(function (value) { return value.trim(); })
    .filter(Boolean);

  const incomingAmenities = uniqueStrings_(data.amenities || []);
  const finalAmenities = incomingAmenities.length
    ? uniqueStrings_(incomingAmenities.concat(existingAmenities))
    : existingAmenities;

  const existingRules = String(existing['House Rules'] || '')
    .split(/\r?\n/)
    .map(function (value) { return value.trim(); })
    .filter(Boolean);

  const incomingRules = uniqueStrings_(data.houseRules || []);
  const finalRules = incomingRules.length
    ? uniqueStrings_(incomingRules.concat(existingRules))
    : existingRules;

  function keepText_(incoming, current) {
    return String(incoming || '').trim()
      ? incoming
      : (current || '');
  }

  function keepNumber_(incoming, current) {
    const value = Number(incoming || 0);
    return value > 0 ? value : Number(current || 0);
  }

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Cabin Name': keepText_(data.propertyName, existing['Cabin Name']),
    'Nickname': keepText_(data.nickname, existing.Nickname),
    'Location': keepText_(data.location, existing.Location),
    'Sleeps': keepNumber_(data.sleeps, existing.Sleeps),
    'Bedrooms': keepNumber_(data.bedroomCount, existing.Bedrooms),
    'Bathrooms': keepNumber_(data.bathroomCount, existing.Bathrooms),
    'Total Rental Cost': keepNumber_(
      data.totalRentalCost,
      existing['Total Rental Cost']
    ),
    'Nightly Rate': keepNumber_(
      data.nightlyRate,
      existing['Nightly Rate']
    ),
    'Rating': keepNumber_(data.rating, existing.Rating),
    'Review Count': keepNumber_(
      data.reviewCount,
      existing['Review Count']
    ),
    'Image URL':
      data.imageUrl ||
      finalPhotos[0] ||
      existing['Image URL'] ||
      '',
    'Photo URLs': normalizeLines_(finalPhotos),
    'Description': keepText_(data.description, existing.Description),
    'Amenities': normalizeLines_(finalAmenities),
    'Cancellation Policy': keepText_(
      data.cancellationPolicy,
      existing['Cancellation Policy']
    ),
    'Fees and Taxes': keepText_(
      data.feesAndTaxes,
      existing['Fees and Taxes']
    ),
    'House Rules': normalizeLines_(finalRules),
    'Parking': keepText_(data.parking, existing.Parking),
    'Accessibility': keepText_(
      data.accessibility,
      existing.Accessibility
    ),
    'Nearby Highlights': normalizeLines_(
      (data.nearbyHighlights || []).length
        ? data.nearbyHighlights
        : String(existing['Nearby Highlights'] || '').split(/\r?\n/)
    ),
    'Import Confidence': Math.max(
      Number(existing['Import Confidence'] || 0),
      calculateImportConfidence_(data)
    ),
    'Updated At': new Date()
  });

  if (incomingPhotos.length) {
    replaceCabinPhotos_(cabinId, finalPhotos, 'AI Enrichment');
  }

  if (incomingAmenities.length) {
    replaceCabinAmenities_(
      cabinId,
      finalAmenities,
      'AI Enrichment'
    );
  }

  if (data.bedrooms && data.bedrooms.length) {
    replaceCabinBedrooms_(cabinId, data.bedrooms);
  } else {
    syncCabinBedroomPlaceholders_(
      cabinId,
      keepNumber_(data.bedroomCount, existing.Bedrooms),
      keepNumber_(data.bathroomCount, existing.Bathrooms)
    );
  }

  saveDerivedCabinDetails_(
    cabinId,
    {
      propertyName:
        data.propertyName || existing['Cabin Name'],
      description:
        data.description || existing.Description,
      amenities: finalAmenities,
      pool: data.pool,
      hotTub: data.hotTub,
      theater: data.theater,
      arcade: data.arcade,
      kitchen: data.kitchen,
      laundry: data.laundry,
      outdoorSpace: data.outdoorSpace,
      internet: data.internet
    },
    {
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      minimumAge: data.minimumAge,
      pets: data.pets,
      latitude: data.latitude,
      longitude: data.longitude,
      rawStructuredData: JSON.stringify(data.sourceSummary || {}),
      confidenceJson: JSON.stringify(
        data.confidence || buildConfidenceMap_(data)
      )
    }
  );
}

function calculateImportConfidence_(data) {
  const map = sanitizeConfidenceMap_(
    data && data.confidence ? data.confidence : buildConfidenceMap_(data)
  );
  const values = Object.keys(map)
    .map(function (key) { return Number(map[key]); })
    .filter(function (value) { return isFinite(value); });

  return values.length
    ? Math.round(values.reduce(function (total, value) {
        return total + value;
      }, 0) / values.length)
    : 0;
}

function sanitizeConfidenceMap_(map) {
  const clean = {};
  Object.keys(map || {}).forEach(function (key) {
    let value = Number(map[key]);
    if (!isFinite(value)) value = 0;
    clean[key] = Math.max(0, Math.min(100, Math.round(value)));
  });
  return clean;
}

function buildConfidenceMap_(data) {
  data = data || {};
  return {
    name: data.propertyName ? 100 : 0,
    image: data.imageUrl || (data.photoUrls || []).length ? 90 : 0,
    location: data.location ? 90 : 0,
    sleeps: Number(data.sleeps || 0) > 0 ? 90 : 0,
    bedrooms: Number(data.bedroomCount || 0) > 0 ? 90 : 0,
    bathrooms: Number(data.bathroomCount || 0) > 0 ? 90 : 0,
    price: Number(data.totalRentalCost || data.nightlyRate || 0) > 0 ? 80 : 0,
    rating: Number(data.rating || 0) > 0 ? 80 : 0,
    description: data.description ? 80 : 0,
    amenities: (data.amenities || []).length ? 80 : 0,
    roomDetails: (data.bedrooms || []).length ? 75 : 0,
    policies: data.cancellationPolicy || (data.houseRules || []).length ? 70 : 0
  };
}

function getMissingRentalFields_(data) {
  const missing = [];
  if (!data.propertyName) missing.push('property name');
  if (!data.imageUrl && !(data.photoUrls || []).length) missing.push('image');
  if (!Number(data.sleeps || 0)) missing.push('guest capacity');
  if (!Number(data.bedroomCount || 0)) missing.push('bedrooms');
  if (!Number(data.bathroomCount || 0)) missing.push('bathrooms');
  if (!Number(data.totalRentalCost || data.nightlyRate || 0)) missing.push('price');
  return missing;
}

function replaceCabinPhotos_(cabinId, urls, source) {
  deleteById_('Cabin Photos', 'Cabin ID', cabinId);
  uniqueStrings_(urls).slice(0, 40).forEach(function (url, index) {
    appendObject_('Cabin Photos', {
      'Photo ID': uid_('PHOTO'),
      'Cabin ID': cabinId,
      'Photo URL': url,
      'Sort Order': index + 1,
      'Source': source || '',
      'Created At': new Date()
    });
  });
}

function replaceCabinAmenities_(cabinId, amenities, source) {
  deleteById_('Cabin Amenities', 'Cabin ID', cabinId);
  uniqueStrings_(amenities).forEach(function (amenity) {
    appendObject_('Cabin Amenities', {
      'Amenity ID': uid_('AMEN'),
      'Cabin ID': cabinId,
      'Amenity': amenity,
      'Category': categorizeAmenity_(amenity),
      'Source': source || '',
      'Created At': new Date()
    });
  });
}

function categorizeAmenity_(amenity) {
  const text = String(amenity || '').toLowerCase();
  if (/pool|hot tub|spa/.test(text)) return 'Water';
  if (/theater|arcade|game|billiard|foosball/.test(text)) return 'Entertainment';
  if (/kitchen|grill|coffee|dishwasher/.test(text)) return 'Kitchen';
  if (/wifi|internet|tv/.test(text)) return 'Technology';
  if (/parking|garage|ev charger/.test(text)) return 'Parking';
  if (/accessible|wheelchair|elevator/.test(text)) return 'Accessibility';
  return 'Other';
}

function replaceCabinBedrooms_(cabinId, bedrooms) {
  deleteById_('Bedrooms', 'Cabin ID', cabinId);
  (bedrooms || []).forEach(function (room, index) {
    appendObject_('Bedrooms', {
      'Bedroom ID': uid_('ROOM'),
      'Cabin ID': cabinId,
      'Bedroom Name': room.name || ('Bedroom ' + (index + 1)),
      'Floor': room.floor || '',
      'Bed Configuration': room.beds || '',
      'Sleeps': Number(room.sleeps || 0),
      'Private Bathroom': room.privateBathroom ? 'Yes' : 'No',
      'Notes': room.notes || ''
    });
  });
}

function saveCabinDetail_(cabinId, values) {
  const existing = readSheet_('Cabin Details').slice().reverse().find(function (row) {
    return row['Cabin ID'] === cabinId;
  });

  const record = {
    'Detail ID': existing ? existing['Detail ID'] : uid_('DETAIL'),
    'Cabin ID': cabinId,
    'Check In': values.checkIn || '',
    'Check Out': values.checkOut || '',
    'Minimum Age': values.minimumAge || '',
    'Pets': values.pets || '',
    'Pool': values.pool || '',
    'Hot Tub': values.hotTub || '',
    'Theater': values.theater || '',
    'Arcade': values.arcade || '',
    'Kitchen': values.kitchen || '',
    'Laundry': values.laundry || '',
    'Outdoor Space': values.outdoorSpace || '',
    'Internet': values.internet || '',
    'Latitude': values.latitude || '',
    'Longitude': values.longitude || '',
    'Raw Structured Data': values.rawStructuredData || '',
    'Confidence JSON': values.confidenceJson || '',
    'Updated At': new Date()
  };

  if (existing) {
    updateById_('Cabin Details', 'Detail ID', existing['Detail ID'], record);
  } else {
    appendObject_('Cabin Details', record);
  }
}

function logRentalImport_(importId, cabinId, stage, status, message, httpStatus) {
  appendObject_('Rental Import Log', {
    'Log ID': uid_('LOG'),
    'Import ID': importId || '',
    'Cabin ID': cabinId || '',
    'Stage': stage || '',
    'Status': status || '',
    'Message': String(message || '').slice(0, 5000),
    'HTTP Status': httpStatus || '',
    'Created At': new Date()
  });
}

function ensureRentalEnrichmentTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === IMPORT_TRIGGER_FUNCTION;
  });

  if (!exists) {
    ScriptApp.newTrigger(IMPORT_TRIGGER_FUNCTION)
      .timeBased()
      .everyMinutes(1)
      .create();
  }
}

function removeRentalEnrichmentTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === IMPORT_TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function retryFailedRentalImports() {
  assertSpreadsheetAdminContext_();

  const failed = readSheet_('Rental Import Queue').filter(function (row) {
    return ['Quick Error', 'Enrichment Error', 'Quota Waiting'].indexOf(String(row.Status || '')) >= 0 &&
      Number(row.Attempts || 0) < 3;
  });

  failed.forEach(function (row) {
    const nextStatus = row.Status === 'Quick Error' || row.Status === 'Quota Waiting'
      ? 'Quick Queued'
      : 'Enrichment Queued';

    updateById_('Rental Import Queue', 'Queue ID', row['Queue ID'], {
      'Status': nextStatus,
      'Last Error': '',
      'Updated At': new Date()
    });
  });

  if (failed.length) ensureRentalEnrichmentTrigger_();

  safeUiAlert_(
    'Rental retry queued',
    failed.length + ' rental(s) were returned to the automatic import queue.'
  );

  return {queued: failed.length};
}
