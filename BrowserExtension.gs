const EXTENSION_KEY_PROPERTY = 'VACATION_PORTAL_EXTENSION_KEY';

function setExtensionSubmissionKey() {
  const ui = SpreadsheetApp.getUi();
  const current = getExtensionSubmissionKey_();
  const response = ui.prompt(
    'Chrome extension submission key',
    'Enter a shared key for trusted travelers. Use at least 16 characters.' +
      (current ? '\n\nA key is already configured. Enter a new value to replace it.' : ''),
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const key = String(response.getResponseText() || '').trim();
  if (key.length < 16) {
    ui.alert('Key not saved', 'Please use at least 16 characters.', ui.ButtonSet.OK);
    return;
  }

  PropertiesService.getScriptProperties().setProperty(
    EXTENSION_KEY_PROPERTY,
    key
  );
  ensureRentalEnrichmentTrigger_();

  ui.alert(
    'Extension key saved',
    'Share the key only with travelers who should be able to add rentals.',
    ui.ButtonSet.OK
  );
}

function showExtensionSetup() {
  const url = ScriptApp.getService().getUrl() || 'Deploy the project as a web app first.';
  const configured = Boolean(getExtensionSubmissionKey_());

  SpreadsheetApp.getUi().alert(
    'Chrome extension setup',
    'Portal endpoint:\n' + url +
      '\n\nSubmission key configured: ' + (configured ? 'Yes' : 'No') +
      '\n\nEach traveler enters this endpoint, the shared key, and their name in the extension.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function getExtensionSubmissionKey_() {
  return String(
    PropertiesService.getScriptProperties()
      .getProperty(EXTENSION_KEY_PROPERTY) || ''
  );
}

function doPost(e) {
  try {
    const payload = parseExtensionRequest_(e);
    const action = String(payload.action || 'captureRental');

    if (action === 'ping') {
      validateExtensionKey_(payload.portalKey);
      return jsonResponse_({
        ok: true,
        message: 'Connected to ' + APP_TITLE,
        portalUrl: ScriptApp.getService().getUrl() || ''
      });
    }

    if (action !== 'captureRental') {
      throw new Error('Unsupported action.');
    }

    validateExtensionKey_(payload.portalKey);
    return jsonResponse_(queueBrowserCapturedRental_(payload));
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function parseExtensionRequest_(e) {
  const raw = e && e.postData ? String(e.postData.contents || '') : '';
  if (!raw) throw new Error('The request body was empty.');

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('The extension sent invalid JSON.');
  }
}

function validateExtensionKey_(providedKey) {
  const expected = getExtensionSubmissionKey_();

  if (!expected) {
    throw new Error(
      'The portal extension key has not been configured by the organizer.'
    );
  }

  if (!constantTimeEquals_(expected, String(providedKey || ''))) {
    throw new Error('The portal submission key is incorrect.');
  }
}

function constantTimeEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');

  let difference = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index++) {
    difference |=
      (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}


function queueBrowserCapturedRental_(payload) {
  const compactPayload = compactExtensionPayload_(payload);
  const capture = compactPayload.capture;
  const providerInfo = getRentalProviderInfo_(capture.url);
  const canonicalKey = [
    providerInfo.provider || '',
    providerInfo.propertyId || '',
    providerInfo.canonicalUrl || capture.url || ''
  ].join('|').toLowerCase();

  const queueId = uid_('EXTQ');
  const now = new Date();
  const sheet = getSpreadsheet_().getSheetByName('Extension Capture Queue');

  if (!sheet) {
    throw new Error(
      'The extension spool has not been initialized. Run Vacation Portal → Set up / repair portal once.'
    );
  }

  const payloadJson = fitExtensionPayloadForCell_(compactPayload);

  // One durable sheet append is the only spreadsheet write in the traveler request.
  sheet.appendRow([
    queueId,
    canonicalKey,
    String(compactPayload.submittedBy || '').trim(),
    now,
    'Queued',
    payloadJson,
    0,
    '',
    '',
    now
  ]);

  return {
    ok: true,
    queued: true,
    queueId: queueId,
    message:
      (capture.propertyName || 'Rental') +
      ' was queued. You can keep browsing and add another rental.',
    photoCount: Array.isArray(capture.photoUrls) ? capture.photoUrls.length : 0
  };
}

function compactExtensionPayload_(payload) {
  const capture = sanitizeBrowserCapture_(payload.capture || {});

  // Keep the browser request comfortably below the Google Sheets 50,000-character
  // single-cell limit while retaining the useful gallery and listing fields.
  capture.description = String(capture.description || '').slice(0, 6000);
  capture.photoUrls = (capture.photoUrls || []).slice(0, 80);
  capture.amenities = (capture.amenities || []).slice(0, 60);
  capture.houseRules = (capture.houseRules || []).slice(0, 30);
  capture.nearbyHighlights = (capture.nearbyHighlights || []).slice(0, 30);

  return {
    submittedBy: String(payload.submittedBy || '').trim().slice(0, 250),
    capturedAt: String(payload.capturedAt || '').slice(0, 100),
    capture: capture
  };
}

function fitExtensionPayloadForCell_(payload) {
  let value = JSON.stringify(payload);
  if (value.length <= 48000) return value;

  payload.capture.description = String(payload.capture.description || '').slice(0, 1500);
  payload.capture.amenities = (payload.capture.amenities || []).slice(0, 30);
  payload.capture.houseRules = (payload.capture.houseRules || []).slice(0, 15);
  value = JSON.stringify(payload);
  if (value.length <= 48000) return value;

  payload.capture.photoUrls = (payload.capture.photoUrls || []).slice(0, 50);
  payload.capture.imageUrl =
    payload.capture.imageUrl ||
    payload.capture.photoUrls[0] ||
    '';
  value = JSON.stringify(payload);
  if (value.length <= 48000) return value;

  payload.capture.photoUrls = (payload.capture.photoUrls || []).slice(0, 30);
  return JSON.stringify(payload).slice(0, 48000);
}

function processExtensionCaptureQueue_() {
  const rows = readSheet_('Extension Capture Queue')
    .filter(function (row) {
      return ['Queued', 'Error'].indexOf(String(row.Status || '')) >= 0 &&
        Number(row.Attempts || 0) < 3;
    })
    .slice(0, 3);

  let processed = 0;
  let duplicates = 0;
  let failed = 0;

  rows.forEach(function (row) {
    const queueId = row['Queue ID'];
    const attempts = Number(row.Attempts || 0) + 1;

    updateById_('Extension Capture Queue', 'Queue ID', queueId, {
      'Status': 'Processing',
      'Attempts': attempts,
      'Last Error': '',
      'Updated At': new Date()
    });

    try {
      const payload = JSON.parse(String(row['Payload JSON'] || '{}'));
      const result = submitBrowserCapturedRental_(payload);

      updateById_('Extension Capture Queue', 'Queue ID', queueId, {
        'Status': result.duplicate ? 'Duplicate' : 'Completed',
        'Cabin ID': result.cabinId || '',
        'Last Error': result.duplicate ? result.message : '',
        'Payload JSON': '',
        'Updated At': new Date()
      });

      if (result.duplicate) duplicates++;
      else processed++;
    } catch (error) {
      failed++;
      updateById_('Extension Capture Queue', 'Queue ID', queueId, {
        'Status': attempts >= 3 ? 'Failed' : 'Error',
        'Last Error': String(error && error.message ? error.message : error).slice(0, 5000),
        'Updated At': new Date()
      });
    }
  });

  return {
    processed: processed,
    duplicates: duplicates,
    failed: failed,
    remaining: readSheet_('Extension Capture Queue').filter(function (row) {
      return ['Queued', 'Error', 'Processing'].indexOf(String(row.Status || '')) >= 0 &&
        Number(row.Attempts || 0) < 3;
    }).length
  };
}

function markOrphanedRentalImport_(cabinId) {
  readSheet_('Rental Import').forEach(function (row) {
    if (row['Cabin ID'] !== cabinId) return;

    updateById_('Rental Import', 'Import ID', row['Import ID'], {
      'Status': 'Orphaned',
      'Notes':
        'The referenced cabin row no longer exists. A later browser capture may recreate the rental.',
      'Updated At': new Date()
    });
  });

  readSheet_('Rental Import Queue').forEach(function (row) {
    if (row['Cabin ID'] !== cabinId) return;

    updateById_('Rental Import Queue', 'Queue ID', row['Queue ID'], {
      'Status': 'Orphaned',
      'Last Error':
        'The referenced cabin row was manually removed.',
      'Updated At': new Date()
    });
  });
}

function submitBrowserCapturedRental_(payload) {
  setupVacationPortalSilent_();

  const capture = sanitizeBrowserCapture_(payload.capture || {});
  const providerInfo = getRentalProviderInfo_(capture.url);
  const expediaPropertyId = typeof getExpediaPropertyId_ === 'function'
    ? getExpediaPropertyId_(providerInfo.originalUrl)
    : '';

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error(
      'Another traveler is adding a rental right now. Please try again in a few seconds.'
    );
  }

  try {
    const duplicate = findDuplicateRental_(providerInfo, expediaPropertyId);

    if (duplicate && duplicate.cabinId) {
      const duplicateCabinExists = readSheet_('Cabins').some(function (row) {
        return row['Cabin ID'] === duplicate.cabinId;
      });

      if (duplicateCabinExists) {
        const merged = mergeBrowserCaptureIntoCabin_(
          duplicate.cabinId,
          capture,
          payload,
          providerInfo
        );

        return {
          ok: true,
          duplicate: true,
          updatedExisting: true,
          message:
            (merged.name || duplicate.name || 'Existing rental') +
            ' was already in the portal, so its missing details and photos were updated.',
          cabinId: duplicate.cabinId,
          photoCount: merged.photoCount,
          portalUrl: ScriptApp.getService().getUrl() || ''
        };
      }

      // A Rental Import row can remain after somebody manually deletes only
      // the matching Cabins row. Do not let that orphan block a new capture.
      markOrphanedRentalImport_(duplicate.cabinId);
      duplicate = null;
    }

    const cabinId = uid_('CABIN');
    const importId = uid_('IMPORT');
    const now = new Date();
    const photos = uniqueStrings_(capture.photoUrls || []).slice(0, 80);
    const amenities = uniqueStrings_(capture.amenities || []).slice(0, 100);
    const houseRules = uniqueStrings_(capture.houseRules || []).slice(0, 50);
    const imageUrl = capture.imageUrl || photos[0] || '';
    const confidence = calculateBrowserCaptureConfidence_(capture, photos);
    const missing = getBrowserCaptureMissingFields_(capture, photos);
    const stage = missing.length ? 'Browser Capture — Needs Review' : 'Browser Captured';

    appendObject_('Cabins', {
      'Cabin ID': cabinId,
      'Provider': providerInfo.provider,
      'Provider Property ID': providerInfo.propertyId,
      'Cabin Name':
        capture.propertyName ||
        providerInfo.provider + ' property ' +
          (providerInfo.propertyId || expediaPropertyId || ''),
      'Nickname': '',
      'Rental URL': providerInfo.canonicalUrl,
      'Original Rental URL': providerInfo.originalUrl,
      'Location': capture.location,
      'Sleeps': capture.sleeps,
      'Bedrooms': capture.bedroomCount,
      'Bathrooms': capture.bathroomCount,
      'Total Rental Cost': capture.totalRentalCost,
      'Nightly Rate': capture.nightlyRate,
      'Rating': sanitizeRating_(capture.rating, providerInfo.provider),
      'Review Count': capture.reviewCount,
      'Image URL': imageUrl,
      'Photo URLs': normalizeLines_(photos),
      'Description': capture.description,
      'Amenities': normalizeLines_(amenities),
      'Cancellation Policy': capture.cancellationPolicy,
      'Fees and Taxes': capture.feesAndTaxes,
      'House Rules': normalizeLines_(houseRules),
      'Parking': capture.parking,
      'Accessibility': capture.accessibility,
      'Nearby Highlights': normalizeLines_(capture.nearbyHighlights),
      'Import Stage': stage,
      'Import Confidence': confidence,
      'Status': 'Candidate',
      'Submitted By': String(payload.submittedBy || '').trim(),
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
      'Submitted By': String(payload.submittedBy || '').trim(),
      'Submitted At': now,
      'Status': stage,
      'Cabin ID': cabinId,
      'Property Name': capture.propertyName,
      'Notes': missing.length
        ? 'Captured from the traveler Chrome extension. Review: ' +
          missing.join(', ') + '.'
        : 'Captured directly from the traveler browser.',
      'Updated At': now
    });

    replaceCabinPhotos_(cabinId, photos, 'Chrome Extension');
    replaceCabinAmenities_(cabinId, amenities, 'Chrome Extension');

    saveDerivedCabinDetails_(
      cabinId,
      {
        propertyName: capture.propertyName,
        description: capture.description,
        amenities: amenities,
        pool: capture.pool,
        hotTub: capture.hotTub,
        theater: capture.theater,
        arcade: capture.arcade,
        kitchen: capture.kitchen,
        laundry: capture.laundry,
        outdoorSpace: capture.outdoorSpace,
        internet: capture.internet
      },
      {
        checkIn: capture.checkIn,
        checkOut: capture.checkOut,
        minimumAge: capture.minimumAge,
        pets: capture.pets,
        latitude: capture.latitude,
        longitude: capture.longitude,
        rawStructuredData: JSON.stringify({
          source: 'Chrome Extension',
          capturedAt: payload.capturedAt || '',
          pageTitle: capture.pageTitle,
          photoCount: photos.length,
          capturedBedrooms: capture.bedrooms ? capture.bedrooms.length : 0,
          bedroomSectionText: capture.bedroomSectionText || ''
        }),
        confidenceJson: JSON.stringify({
          name: capture.propertyName ? 100 : 0,
          image: photos.length ? 100 : 0,
          location: capture.location ? 90 : 0,
          sleeps: capture.sleeps ? 85 : 0,
          bedrooms: capture.bedroomCount ? 85 : 0,
          bathrooms: capture.bathroomCount ? 85 : 0,
          price: capture.totalRentalCost || capture.nightlyRate ? 75 : 0,
          rating: capture.rating ? 85 : 0
        })
      }
    );

    if (capture.bedrooms && capture.bedrooms.length) {
      replaceCabinBedrooms_(
        cabinId,
        capture.bedrooms
      );
    } else {
      syncCabinBedroomPlaceholders_(
        cabinId,
        capture.bedroomCount,
        capture.bathroomCount
      );
    }

    logRentalImport_(
      importId,
      cabinId,
      'Browser Capture',
      stage,
      'Captured ' + photos.length + ' photo(s) directly from the traveler browser.',
      ''
    );

    return {
      ok: true,
      duplicate: false,
      message:
        'Added ' +
        (capture.propertyName || 'rental') +
        ' with ' + photos.length + ' photo(s).',
      cabinId: cabinId,
      photoCount: photos.length,
      needsReview: missing,
      portalUrl: ScriptApp.getService().getUrl() || ''
    };
  } finally {
    lock.releaseLock();
  }
}


function mergeBrowserCaptureIntoCabin_(
  cabinId,
  capture,
  payload,
  providerInfo
) {
  const existing = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId;
  });

  if (!existing) {
    throw new Error('The matching cabin could not be found.');
  }

  const existingPhotoUrls = String(existing['Photo URLs'] || '')
    .split(/\r?\n/)
    .map(function (value) { return value.trim(); })
    .filter(Boolean);

  const capturedPhotos = uniqueStrings_(capture.photoUrls || []).slice(0, 80);
  const mergedPhotos = uniqueStrings_(
    capturedPhotos.concat(existingPhotoUrls)
  ).slice(0, 80);

  const existingAmenities = String(existing.Amenities || '')
    .split(/\r?\n/)
    .map(function (value) { return value.trim(); })
    .filter(Boolean);

  const mergedAmenities = uniqueStrings_(
    (capture.amenities || []).concat(existingAmenities)
  ).slice(0, 150);

  const existingRules = String(existing['House Rules'] || '')
    .split(/\r?\n/)
    .map(function (value) { return value.trim(); })
    .filter(Boolean);

  const mergedRules = uniqueStrings_(
    (capture.houseRules || []).concat(existingRules)
  ).slice(0, 80);

  const finalName =
    capture.propertyName ||
    existing['Cabin Name'] ||
    providerInfo.provider + ' property';

  const finalImage =
    capture.imageUrl ||
    mergedPhotos[0] ||
    existing['Image URL'] ||
    '';

  const missing = getBrowserCaptureMissingFields_(
    {
      propertyName: capture.propertyName || existing['Cabin Name'],
      location: capture.location || existing.Location,
      sleeps: capture.sleeps || existing.Sleeps,
      bedroomCount: capture.bedroomCount || existing.Bedrooms,
      bathroomCount: capture.bathroomCount || existing.Bathrooms,
      totalRentalCost:
        capture.totalRentalCost || existing['Total Rental Cost'],
      nightlyRate:
        capture.nightlyRate || existing['Nightly Rate'],
      rating: capture.rating || existing.Rating
    },
    mergedPhotos
  );

  const stage = missing.length
    ? 'Browser Updated — Needs Review'
    : 'Browser Updated';

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Provider': existing.Provider || providerInfo.provider,
    'Provider Property ID':
      existing['Provider Property ID'] || providerInfo.propertyId,
    'Cabin Name': finalName,
    'Rental URL': existing['Rental URL'] || providerInfo.canonicalUrl,
    'Original Rental URL':
      capture.url || existing['Original Rental URL'] || providerInfo.originalUrl,
    'Location': capture.location || existing.Location || '',
    'Sleeps': Number(capture.sleeps || existing.Sleeps || 0),
    'Bedrooms': Number(
      capture.bedroomCount || existing.Bedrooms || 0
    ),
    'Bathrooms': Number(
      capture.bathroomCount || existing.Bathrooms || 0
    ),
    'Total Rental Cost': Number(
      capture.totalRentalCost || existing['Total Rental Cost'] || 0
    ),
    'Nightly Rate': Number(
      capture.nightlyRate || existing['Nightly Rate'] || 0
    ),
    'Rating': sanitizeRating_(
      capture.rating || existing.Rating,
      providerInfo.provider
    ),
    'Review Count': Number(
      capture.reviewCount || existing['Review Count'] || 0
    ),
    'Image URL': finalImage,
    'Photo URLs': normalizeLines_(mergedPhotos),
    'Description':
      capture.description || existing.Description || '',
    'Amenities': normalizeLines_(mergedAmenities),
    'Cancellation Policy':
      capture.cancellationPolicy ||
      existing['Cancellation Policy'] ||
      '',
    'Fees and Taxes':
      capture.feesAndTaxes || existing['Fees and Taxes'] || '',
    'House Rules': normalizeLines_(mergedRules),
    'Parking': capture.parking || existing.Parking || '',
    'Accessibility':
      capture.accessibility || existing.Accessibility || '',
    'Nearby Highlights': normalizeLines_(
      (capture.nearbyHighlights || []).length
        ? capture.nearbyHighlights
        : String(existing['Nearby Highlights'] || '').split(/\r?\n/)
    ),
    'Import Stage': stage,
    'Import Confidence':
      calculateBrowserCaptureConfidence_(capture, mergedPhotos),
    'Updated At': new Date()
  });

  if (capturedPhotos.length) {
    replaceCabinPhotos_(cabinId, mergedPhotos, 'Chrome Extension Update');
  }

  if (capture.amenities && capture.amenities.length) {
    replaceCabinAmenities_(
      cabinId,
      mergedAmenities,
      'Chrome Extension Update'
    );
  }

  saveDerivedCabinDetails_(
    cabinId,
    {
      propertyName: finalName,
      description: capture.description || existing.Description,
      amenities: mergedAmenities,
      pool: capture.pool,
      hotTub: capture.hotTub,
      theater: capture.theater,
      arcade: capture.arcade,
      kitchen: capture.kitchen,
      laundry: capture.laundry,
      outdoorSpace: capture.outdoorSpace,
      internet: capture.internet
    },
    {
      checkIn: capture.checkIn,
      checkOut: capture.checkOut,
      minimumAge: capture.minimumAge,
      pets: capture.pets,
      latitude: capture.latitude,
      longitude: capture.longitude,
      rawStructuredData: JSON.stringify({
        source: 'Chrome Extension Update',
        capturedAt: payload.capturedAt || '',
        pageTitle: capture.pageTitle,
        capturedPhotoCount: capturedPhotos.length,
        totalPhotoCount: mergedPhotos.length,
        capturedBedrooms: capture.bedrooms ? capture.bedrooms.length : 0,
        bedroomSectionText: capture.bedroomSectionText || ''
      }),
      confidenceJson: JSON.stringify({
        name: finalName ? 100 : 0,
        image: mergedPhotos.length ? 100 : 0,
        location: capture.location || existing.Location ? 90 : 0,
        sleeps: capture.sleeps || existing.Sleeps ? 85 : 0,
        bedrooms:
          capture.bedroomCount || existing.Bedrooms ? 85 : 0,
        bathrooms:
          capture.bathroomCount || existing.Bathrooms ? 85 : 0,
        price:
          capture.totalRentalCost ||
          capture.nightlyRate ||
          existing['Total Rental Cost'] ||
          existing['Nightly Rate']
            ? 75
            : 0,
        rating: capture.rating || existing.Rating ? 85 : 0
      })
    }
  );

  if (capture.bedrooms && capture.bedrooms.length) {
    replaceCabinBedrooms_(
      cabinId,
      capture.bedrooms
    );
  } else {
    syncCabinBedroomPlaceholders_(
      cabinId,
      capture.bedroomCount || existing.Bedrooms,
      capture.bathroomCount || existing.Bathrooms
    );
  }

  const importRow = readSheet_('Rental Import')
    .slice()
    .reverse()
    .find(function (row) {
      return row['Cabin ID'] === cabinId;
    });

  if (importRow) {
    updateById_(
      'Rental Import',
      'Import ID',
      importRow['Import ID'],
      {
        'Status': stage,
        'Property Name': finalName,
        'Notes':
          'Updated from the traveler Chrome extension with ' +
          capturedPhotos.length +
          ' newly captured photo(s).' +
          (missing.length
            ? ' Review: ' + missing.join(', ') + '.'
            : ''),
        'Updated At': new Date()
      }
    );
  }

  logRentalImport_(
    importRow ? importRow['Import ID'] : '',
    cabinId,
    'Browser Capture Update',
    stage,
    'Merged browser data into an existing cabin. Captured ' +
      capturedPhotos.length +
      ' new photo(s); ' +
      mergedPhotos.length +
      ' total photo(s) retained.',
    ''
  );

  return {
    name: finalName,
    photoCount: mergedPhotos.length,
    missing: missing
  };
}

function sanitizeBrowserCapture_(capture) {
  const numberValue = function (value) {
    const number = Number(value);
    return isFinite(number) && number > 0 ? number : 0;
  };

  const text = function (value, maxLength) {
    return String(value || '').trim().slice(0, maxLength || 5000);
  };

  return {
    url: text(capture.url, 4000),
    pageTitle: text(capture.pageTitle, 1000),
    propertyName: text(capture.propertyName, 1000),
    location: text(capture.location, 1000),
    sleeps: numberValue(capture.sleeps),
    bedroomCount: numberValue(capture.bedroomCount),
    bathroomCount: numberValue(capture.bathroomCount),
    bedrooms: sanitizeBrowserBedrooms_(capture.bedrooms),
    bedroomSectionText: String(capture.bedroomSectionText || '').trim().slice(0, 6000),
    totalRentalCost: numberValue(capture.totalRentalCost),
    nightlyRate: numberValue(capture.nightlyRate),
    rating: numberValue(capture.rating),
    reviewCount: numberValue(capture.reviewCount),
    imageUrl: text(capture.imageUrl, 4000),
    photoUrls: sanitizeStringArray_(capture.photoUrls, 80, 4000),
    description: text(capture.description, 15000),
    amenities: sanitizeStringArray_(capture.amenities, 100, 500),
    houseRules: sanitizeStringArray_(capture.houseRules, 50, 1000),
    nearbyHighlights: sanitizeStringArray_(capture.nearbyHighlights, 50, 1000),
    cancellationPolicy: text(capture.cancellationPolicy, 5000),
    feesAndTaxes: text(capture.feesAndTaxes, 5000),
    parking: text(capture.parking, 3000),
    accessibility: text(capture.accessibility, 3000),
    checkIn: text(capture.checkIn, 200),
    checkOut: text(capture.checkOut, 200),
    minimumAge: text(capture.minimumAge, 200),
    pets: text(capture.pets, 1000),
    pool: text(capture.pool, 1000),
    hotTub: text(capture.hotTub, 1000),
    theater: text(capture.theater, 1000),
    arcade: text(capture.arcade, 1000),
    kitchen: text(capture.kitchen, 1000),
    laundry: text(capture.laundry, 1000),
    outdoorSpace: text(capture.outdoorSpace, 2000),
    internet: text(capture.internet, 1000),
    latitude: text(capture.latitude, 100),
    longitude: text(capture.longitude, 100)
  };
}

function sanitizeBrowserBedrooms_(rooms) {
  if (!Array.isArray(rooms)) return [];

  return rooms.slice(0, 30).map(function (room, index) {
    room = room || {};

    return {
      name: String(room.name || ('Bedroom ' + (index + 1))).trim().slice(0, 500),
      floor: String(room.floor || '').trim().slice(0, 250),
      beds: String(room.beds || '').trim().slice(0, 1000),
      sleeps: Math.max(0, Number(room.sleeps || 0)),
      privateBathroom: Boolean(room.privateBathroom),
      notes: String(room.notes || '').trim().slice(0, 2000)
    };
  }).filter(function (room) {
    return room.name && room.beds;
  });
}

function sanitizeStringArray_(values, maxItems, maxLength) {
  if (!Array.isArray(values)) return [];

  return uniqueStrings_(
    values
      .map(function (value) {
        return String(value || '').trim().slice(0, maxLength);
      })
      .filter(Boolean)
  ).slice(0, maxItems);
}

function calculateBrowserCaptureConfidence_(capture, photos) {
  const checks = [
    Boolean(capture.propertyName),
    Boolean(capture.location),
    Boolean(photos.length),
    Boolean(capture.sleeps),
    Boolean(capture.bedroomCount),
    Boolean(capture.bathroomCount),
    Boolean(capture.totalRentalCost || capture.nightlyRate),
    Boolean(capture.rating)
  ];

  return Math.round(
    checks.filter(Boolean).length / checks.length * 100
  );
}

function getBrowserCaptureMissingFields_(capture, photos) {
  const missing = [];
  if (!capture.propertyName) missing.push('property name');
  if (!photos.length) missing.push('photos');
  if (!capture.location) missing.push('location');
  if (!capture.sleeps) missing.push('guest capacity');
  if (!capture.bedroomCount) missing.push('bedrooms');
  if (!capture.bathroomCount) missing.push('bathrooms');
  if (!capture.totalRentalCost && !capture.nightlyRate) missing.push('price');
  if (!capture.rating) missing.push('rating');
  return missing;
}
