function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');

  template.pwaDeviceId = normalizePortalDeviceId_(
    e && e.parameter ? e.parameter.deviceId : ''
  );

  template.pwaInstalled = Boolean(
    e &&
    e.parameter &&
    String(e.parameter.pwaInstalled || '') === '1'
  );

  return template
    .evaluate()
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Vacation Portal')
    .addItem('Set up / repair portal', 'setupVacationPortal')
    .addItem('Run diagnostics', 'runSetupDiagnostics')
    .addItem('Set Gemini API key', 'setGeminiApiKey')
    .addItem('Test Gemini connection', 'testGeminiConnection')
    .addItem('Repair Gemini imports', 'repairGeminiImports')
    .addItem('Set Apify API token', 'setApifyApiToken')
    .addSeparator()
    .addItem('Set OneSignal API key', 'setOneSignalApiKey')
    .addItem('Test OneSignal setup', 'testOneSignalSetup')
    .addItem('Test Apify connection', 'testApifyConnection')
    .addSeparator()
    .addItem('Set Chrome extension key', 'setExtensionSubmissionKey')
    .addItem('Show Chrome extension setup', 'showExtensionSetup')
    .addSeparator()
    .addItem('Process rental queues now', 'processRentalEnrichmentQueue')
    .addItem('Repair rental processing', 'repairRentalProcessing')
    .addItem('Retry failed rental edits', 'retryFailedRentalEdits')
    .addItem('Retry failed rental imports', 'retryFailedRentalImports')
    .addItem('Clear Cabin Data', 'clearCabinData')
    .addSeparator()
    .addItem('Open rental gathering', 'openRentalGathering')
    .addItem('Open preliminary voting', 'openPreliminaryVoting')
    .addItem('Open finalist voting', 'openFinalistVoting')
    .addSeparator()
    .addItem('Start a new vacation', 'startNewVacation')
    .addToUi();
}

function getPortalData() {
  ensurePortalSchemaCurrent_();
  return buildPortalDataFull_();
}

function normalizePortalDeviceId_(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 80);
}

function portalDeviceProfilePropertyKey_(deviceId) {
  const normalized = normalizePortalDeviceId_(deviceId);
  return normalized ? 'PORTAL_DEVICE_PROFILE_' + normalized : '';
}

function getDeviceTravelerBinding_(deviceId) {
  const key = portalDeviceProfilePropertyKey_(deviceId);
  if (!key) return null;

  try {
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    if (!raw) return null;

    const profile = JSON.parse(raw);
    if (!profile || !profile.travelerId) return null;

    return {
      travelerId: String(profile.travelerId || ''),
      travelerName: String(profile.travelerName || ''),
      savedAt: String(profile.savedAt || ''),
      pwaInstalled: Boolean(profile.pwaInstalled)
    };
  } catch (error) {
    return null;
  }
}

function saveDeviceTravelerBinding(deviceId, travelerId, travelerName, pwaInstalled) {
  const key = portalDeviceProfilePropertyKey_(deviceId);

  if (!key) {
    throw new Error('This app instance does not have a valid device ID.');
  }

  const id = String(travelerId || '').trim();
  if (!id) throw new Error('Choose a traveler first.');

  const traveler = normalizeTravelerRows_(readSheet_('Travelers'))
    .find(function(row) {
      return String(row['Traveler ID'] || '') === id;
    });

  if (!traveler) {
    throw new Error('That traveler could not be found.');
  }

  const existing = getDeviceTravelerBinding_(deviceId);

  const profile = {
    travelerId: id,
    travelerName: String(traveler.Name || travelerName || ''),
    savedAt: new Date().toISOString(),
    pwaInstalled: Boolean(pwaInstalled) ||
      Boolean(existing && existing.pwaInstalled)
  };

  PropertiesService.getScriptProperties()
    .setProperty(key, JSON.stringify(profile));

  return {
    ok: true,
    travelerId: profile.travelerId,
    travelerName: profile.travelerName,
    savedAt: profile.savedAt,
    pwaInstalled: Boolean(profile.pwaInstalled)
  };
}

function markDeviceTravelerInstalled(deviceId, travelerId) {
  const normalizedDeviceId = normalizePortalDeviceId_(deviceId);
  const id = String(travelerId || '').trim();

  if (!normalizedDeviceId || !id) {
    return { ok: false };
  }

  const existing = getDeviceTravelerBinding_(normalizedDeviceId);

  return saveDeviceTravelerBinding(
    normalizedDeviceId,
    id,
    existing ? existing.travelerName : '',
    true
  );
}

function clearDeviceTravelerBinding(deviceId) {
  const key = portalDeviceProfilePropertyKey_(deviceId);
  if (!key) return { ok: true };

  PropertiesService.getScriptProperties().deleteProperty(key);
  return { ok: true };
}

function addDeviceTravelerBindingToPayload_(payload, deviceId) {
  const profile = getDeviceTravelerBinding_(deviceId);

  payload.deviceId = normalizePortalDeviceId_(deviceId);
  payload.deviceTravelerId = profile ? profile.travelerId : '';
  payload.deviceTravelerName = profile ? profile.travelerName : '';
  payload.deviceTravelerSavedAt = profile ? profile.savedAt : '';

  return payload;
}

function getJustinVotingSummary(requestingTravelerId) {
  const requester = normalizeTravelerRows_(readSheet_('Travelers'))
    .find(function(row) {
      return String(row['Traveler ID'] || '') ===
        String(requestingTravelerId || '');
    });

  if (
    !requester ||
    !/^justin(?:\s|$)/i.test(String(requester.Name || '').trim())
  ) {
    throw new Error('Only Justin can view the voting summary.');
  }

  const trip = getSettings_('Trip');
  const round = String(trip['Voting Round'] || 'Preliminary');
  const stage = String(trip['Portal Stage'] || '');
  const travelers = normalizeTravelerRows_(readSheet_('Travelers'))
    .filter(function(row) {
      return String(row.Active || 'Yes').toLowerCase() !== 'no';
    });

  const cabins = readSheet_('Cabins').filter(function(row) {
    return String(row.Active || 'Yes').toLowerCase() !== 'no';
  });

  const finalistIds = String(trip['Finalist Cabin IDs'] || '')
    .split('|')
    .map(function(value) { return value.trim(); })
    .filter(Boolean);

  const eligibleCabins =
    round === 'Final' &&
    finalistIds.length
      ? cabins.filter(function(cabin) {
          return finalistIds.indexOf(String(cabin['Cabin ID'] || '')) >= 0;
        })
      : cabins;

  const eligibleIds = {};
  const cabinById = {};

  eligibleCabins.forEach(function(cabin) {
    const id = String(cabin['Cabin ID'] || '');
    if (!id) return;
    eligibleIds[id] = true;
    cabinById[id] = cabin;
  });

  const votes = readSheet_('Votes').filter(function(vote) {
    return String(vote['Voting Round'] || 'Preliminary') === round &&
      Boolean(eligibleIds[String(vote['Cabin ID'] || '')]);
  });

  // One current vote per traveler/cabin. If duplicate legacy rows exist,
  // use the latest Created At value.
  const latestVotes = {};

  votes.forEach(function(vote) {
    const travelerId = String(vote['Traveler ID'] || '');
    const cabinId = String(vote['Cabin ID'] || '');

    if (!travelerId || !cabinId) return;

    const key = travelerId + '|' + cabinId;
    const current = latestVotes[key];
    const incomingTime = new Date(vote['Created At'] || 0).getTime() || 0;
    const currentTime = current
      ? (new Date(current['Created At'] || 0).getTime() || 0)
      : -1;

    if (!current || incomingTime >= currentTime) {
      latestVotes[key] = vote;
    }
  });

  const devicesByTraveler = {};
  const allProperties = PropertiesService
    .getScriptProperties()
    .getProperties();

  Object.keys(allProperties).forEach(function(key) {
    if (key.indexOf('PORTAL_DEVICE_PROFILE_') !== 0) return;

    try {
      const profile = JSON.parse(allProperties[key] || '{}');
      const travelerId = String(profile.travelerId || '');
      if (!travelerId) return;

      if (!devicesByTraveler[travelerId]) {
        devicesByTraveler[travelerId] = {
          linked: 0,
          installed: 0
        };
      }

      devicesByTraveler[travelerId].linked += 1;

      if (Boolean(profile.pwaInstalled)) {
        devicesByTraveler[travelerId].installed += 1;
      }
    } catch (error) {}
  });

  function cabinName_(cabin) {
    return String(
      cabin['Rental Name'] ||
      cabin.Name ||
      cabin['Property Name'] ||
      cabin['Provider Property ID'] ||
      cabin['Cabin ID'] ||
      'Rental'
    ).trim();
  }

  const rows = travelers
    .map(function(traveler) {
      const travelerId = String(traveler['Traveler ID'] || '');

      const travelerVotes = Object.keys(latestVotes)
        .map(function(key) { return latestVotes[key]; })
        .filter(function(vote) {
          return String(vote['Traveler ID'] || '') === travelerId;
        });

      const ranked = travelerVotes
        .map(function(vote) {
          const cabinId = String(vote['Cabin ID'] || '');
          const cabin = cabinById[cabinId];

          return {
            cabinId: cabinId,
            name: cabin ? cabinName_(cabin) : cabinId,
            score: Number(vote.Score || 0),
            firstChoice:
              String(vote['First Choice'] || '').toLowerCase() === 'yes'
          };
        })
        .filter(function(item) {
          return item.cabinId && item.score >= 1 && item.score <= 5;
        })
        .sort(function(left, right) {
          return Number(right.firstChoice) - Number(left.firstChoice) ||
            right.score - left.score ||
            left.name.localeCompare(right.name);
        })
        .slice(0, 3);

      const deviceInfo = devicesByTraveler[travelerId] || {
        linked: 0,
        installed: 0
      };

      return {
        travelerId: travelerId,
        travelerName: String(traveler.Name || 'Traveler'),
        family: String(traveler.Group || traveler.Family || ''),
        votedCount: travelerVotes.length,
        eligibleRentalCount: eligibleCabins.length,
        top3: ranked,
        appInstalled: deviceInfo.installed > 0,
        installedDeviceCount: deviceInfo.installed,
        linkedDeviceCount: deviceInfo.linked
      };
    })
    .sort(function(left, right) {
      return left.travelerName.localeCompare(right.travelerName);
    });

  return {
    round: round,
    stage: stage,
    eligibleRentalCount: eligibleCabins.length,
    rows: rows,
    generatedAt: new Date().toISOString()
  };
}

function getPortalStartupData(deviceId) {
  ensurePortalSchemaCurrent_();

  const cache = CacheService.getScriptCache();
  const cacheKey = 'portal-startup-v4-2-0';

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      parsed.serverTime = new Date().toISOString();
      parsed.fromServerCache = true;
      return addDeviceTravelerBindingToPayload_(parsed, deviceId);
    }
  } catch (cacheError) {
    // Startup should never fail because CacheService was unavailable.
  }

  const trip = getSettings_('Trip');
  const travelers = normalizeTravelerRows_(readSheet_('Travelers'));
  const cabins = readSheet_('Cabins').filter(function (row) {
    return String(row.Active || 'Yes').toLowerCase() !== 'no';
  });
  const votes = readSheet_('Votes');
  const imports = readSheet_('Rental Import');

  const travelerMap = {};
  travelers.forEach(function (traveler) {
    travelerMap[traveler['Traveler ID']] = traveler;
  });

  travelers.forEach(function (traveler) {
    const parent = travelerMap[traveler['Parent/Guardian ID']];
    traveler.parentName = parent ? parent.Name : '';
  });

  const votesByCabin = indexRowsBy_(votes, 'Cabin ID');
  const latestImportByCabin = latestRowsBy_(imports, 'Cabin ID');

  const startupCabins = cabins.map(function (cabin) {
    const cabinId = cabin['Cabin ID'];
    const cabinVotes = votesByCabin[cabinId] || [];
    const scores = cabinVotes
      .map(function (vote) { return Number(vote.Score || 0); })
      .filter(function (score) { return isFinite(score); });

    return Object.assign({}, cabin, {
      bedrooms: [],
      comments: [],
      favoriteCount: 0,
      voteCount: scores.length,
      averageScore: scores.length
        ? scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length
        : 0,
      import: latestImportByCabin[cabinId] || null,
      queue: null,
      detail: null,
      photos: [],
      amenityRows: []
    });
  });

  const payload = {
    trip: trip,
    travelers: travelers,
    cabins: startupCabins,
    votes: votes,
    favorites: [],
    assignments: [],
    budget: [],
    meals: [],
    groceries: [],
    itinerary: [],
    imports: imports,
    importQueue: [],
    deferredLoaded: false,
    serverTime: new Date().toISOString()
  };

  try {
    // Keep this deliberately short-lived. It primarily helps a family opening
    // the portal together, while the deferred refresh always follows.
    // IMPORTANT: device traveler identity is deliberately NOT cached here
    // because the startup cache is shared across all travelers/devices.
    cache.put(cacheKey, JSON.stringify(payload), 15);
  } catch (cacheError) {}

  return addDeviceTravelerBindingToPayload_(payload, deviceId);
}

function getPortalDeferredData() {
  ensurePortalSchemaCurrent_();
  const result = buildPortalDataFull_();
  result.deferredLoaded = true;
  return result;
}

function buildPortalDataFull_() {
  const trip = getSettings_('Trip');
  const travelers = normalizeTravelerRows_(readSheet_('Travelers'));
  const cabins = readSheet_('Cabins')
    .filter(function (row) {
      return String(row.Active || 'Yes').toLowerCase() !== 'no';
    });

  const bedrooms = readSheet_('Bedrooms');
  const votes = readSheet_('Votes');
  const comments = readSheet_('Comments');
  const favorites = readSheet_('Favorites');
  const assignments = readSheet_('Assignments');
  const imports = readSheet_('Rental Import');
  const details = readSheet_('Cabin Details');
  const photos = readSheet_('Cabin Photos');
  const amenities = readSheet_('Cabin Amenities');
  const queue = readSheet_('Rental Import Queue');

  const travelerMap = {};
  travelers.forEach(function (traveler) {
    travelerMap[traveler['Traveler ID']] = traveler;
  });

  travelers.forEach(function (traveler) {
    const parent = travelerMap[traveler['Parent/Guardian ID']];
    traveler.parentName = parent ? parent.Name : '';
  });

  // Build indexes once instead of repeatedly filtering every full sheet
  // for every cabin.
  const bedroomsByCabin = indexRowsBy_(bedrooms, 'Cabin ID');
  const votesByCabin = indexRowsBy_(votes, 'Cabin ID');
  const commentsByCabin = indexRowsBy_(comments, 'Cabin ID');
  const favoritesByCabin = indexRowsBy_(favorites, 'Cabin ID');
  const photosByCabin = indexRowsBy_(photos, 'Cabin ID');
  const amenitiesByCabin = indexRowsBy_(amenities, 'Cabin ID');
  const latestImportByCabin = latestRowsBy_(imports, 'Cabin ID');
  const latestDetailByCabin = latestRowsBy_(details, 'Cabin ID');

  const activeQueueByCabin = {};
  queue.forEach(function (row) {
    const status = String(row.Status || '');

    if (
      [
        'Quick Queued',
        'Quick Processing',
        'Quick Error',
        'Enrichment Queued',
        'Enriching',
        'Enrichment Error',
        'Quota Waiting'
      ].indexOf(status) >= 0
    ) {
      activeQueueByCabin[row['Cabin ID']] = row;
    }
  });

  const enrichedCabins = cabins.map(function (cabin) {
    const cabinId = cabin['Cabin ID'];
    const cabinVotes = votesByCabin[cabinId] || [];
    const scores = cabinVotes
      .map(function (vote) { return Number(vote.Score || 0); })
      .filter(function (score) { return isFinite(score); });

    const cabinPhotos = (photosByCabin[cabinId] || [])
      .slice()
      .sort(function (a, b) {
        return Number(a['Sort Order'] || 0) - Number(b['Sort Order'] || 0);
      });

    return Object.assign({}, cabin, {
      bedrooms: bedroomsByCabin[cabinId] || [],
      comments: (commentsByCabin[cabinId] || []).map(function (comment) {
        return Object.assign({}, comment, {
          travelerName: travelerMap[comment['Traveler ID']]
            ? travelerMap[comment['Traveler ID']].Name
            : comment['Traveler ID']
        });
      }),
      favoriteCount: (favoritesByCabin[cabinId] || []).length,
      voteCount: scores.length,
      averageScore: scores.length
        ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length
        : 0,
      import: latestImportByCabin[cabinId] || null,
      queue: activeQueueByCabin[cabinId] || null,
      detail: latestDetailByCabin[cabinId] || null,
      photos: cabinPhotos,
      amenityRows: amenitiesByCabin[cabinId] || []
    });
  });

  return {
    trip: trip,
    travelers: travelers,
    cabins: enrichedCabins,
    votes: votes,
    favorites: favorites,
    assignments: assignments,
    budget: readSheet_('Budget'),
    meals: readSheet_('Meals'),
    groceries: readSheet_('Grocery List'),
    itinerary: readSheet_('Itinerary'),
    imports: imports,
    importQueue: queue,
    deferredLoaded: true,
    serverTime: new Date().toISOString()
  };
}

function indexRowsBy_(rows, key) {
  const map = {};

  (rows || []).forEach(function (row) {
    const id = String(row[key] || '');
    if (!id) return;

    if (!map[id]) map[id] = [];
    map[id].push(row);
  });

  return map;
}

function latestRowsBy_(rows, key) {
  const map = {};

  (rows || []).forEach(function (row) {
    const id = String(row[key] || '');
    if (!id) return;
    map[id] = row;
  });

  return map;
}

function ensurePortalSchemaCurrent_() {
  const props = PropertiesService.getScriptProperties();

  if (
    props.getProperty('PORTAL_SCHEMA_VERSION') ===
    PORTAL_SCHEMA_VERSION
  ) {
    return;
  }

  setupVacationPortalSilent_();
}

function setupVacationPortalSilent_() {
  const ss = getSpreadsheet_();

  Object.keys(SCHEMAS).forEach(function (name) {
    ensureSheet_(ss, name, SCHEMAS[name]);
  });

  const defaults = {
    'Trip Name': 'Smoky Mountain Family Vacation',
    'Destination': 'Smoky Mountains',
    'Portal Stage': 'Gathering',
    'Voting Round': 'Preliminary',
    'Finalist Count': '3',
    'Finalist Cabin IDs': '',
    'Final Voting Closed': 'No',
    'Vacation Status': 'Planning',
    'Gemini Model': GEMINI_MODEL,
    'PWA URL': 'https://retributionamiss.github.io/Vacation-Portal/',
    'OneSignal App ID': ''
  };

  Object.keys(defaults).forEach(function (key) {
    ensureSetting_('Trip', key, defaults[key]);
  });

  const savedGeminiModel = String(
    getSettings_('Trip')['Gemini Model'] || ''
  );

  if (
    !savedGeminiModel ||
    /^gemini-(?:1\.|2\.|3\.5-)/i.test(savedGeminiModel)
  ) {
    setSetting_('Trip', 'Gemini Model', GEMINI_MODEL);
  }

  migrateTravelerTypes_();

  PropertiesService
    .getScriptProperties()
    .setProperty('PORTAL_SCHEMA_VERSION', PORTAL_SCHEMA_VERSION);
}


function getRentalImportUpdates() {
  setupVacationPortalSilent_();

  const cabins = readSheet_('Cabins').filter(function (row) {
    return String(row.Active || 'Yes').toLowerCase() !== 'no';
  });

  const queue = readSheet_('Rental Import Queue');
  const editQueue = readSheet_('Rental Edit Queue');
  const imports = readSheet_('Rental Import');
  const photos = readSheet_('Cabin Photos');

  const updates = cabins.map(function (cabin) {
    const cabinId = cabin['Cabin ID'];

    const queueRow = queue.slice().reverse().find(function (row) {
      return row['Cabin ID'] === cabinId;
    }) || null;

    const importRow = imports.slice().reverse().find(function (row) {
      return row['Cabin ID'] === cabinId;
    }) || null;

    const editRow = editQueue.slice().reverse().find(function (row) {
      return row['Cabin ID'] === cabinId &&
        ['Queued', 'Processing', 'Error'].indexOf(String(row.Status || '')) >= 0;
    }) || null;

    const firstPhoto = photos
      .filter(function (row) { return row['Cabin ID'] === cabinId; })
      .sort(function (a, b) {
        return Number(a['Sort Order'] || 0) - Number(b['Sort Order'] || 0);
      })[0];

    return {
      cabinId: cabinId,
      stage: cabin['Import Stage'] || '',
      queueStatus: queueRow ? queueRow.Status : '',
      queueError: queueRow ? queueRow['Last Error'] || '' : '',
      editStatus: editRow ? editRow.Status || '' : '',
      editError: editRow ? editRow['Last Error'] || '' : '',
      importStatus: importRow ? importRow.Status || '' : '',
      updatedAt: cabin['Updated At'] || '',
      name: cabin['Cabin Name'] || '',
      location: cabin.Location || '',
      sleeps: cabin.Sleeps || 0,
      bedrooms: cabin.Bedrooms || 0,
      bathrooms: cabin.Bathrooms || 0,
      totalCost: cabin['Total Rental Cost'] || 0,
      nightlyRate: cabin['Nightly Rate'] || 0,
      rating: cabin.Rating || 0,
      reviewCount: cabin['Review Count'] || 0,
      imageUrl: cabin['Image URL'] ||
        (firstPhoto ? firstPhoto['Photo URL'] : '')
    };
  });

  return {
    active:
      editQueue.some(function (row) {
        return ['Queued', 'Processing', 'Error']
          .indexOf(String(row.Status || '')) >= 0;
      }) ||
      queue.some(function (row) {
      return [
        'Quick Queued',
        'Quick Processing',
        'Quick Error',
        'Enrichment Queued',
        'Enriching',
        'Enrichment Error',
        'Quota Waiting'
      ].indexOf(String(row.Status || '')) >= 0;
    }),
    updates: updates,
    serverTime: new Date().toISOString()
  };
}
