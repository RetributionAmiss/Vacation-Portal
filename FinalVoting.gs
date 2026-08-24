function isJustinTraveler_(travelerId) {
  travelerId = String(travelerId || '').trim();

  const traveler = normalizeTravelerRows_(readSheet_('Travelers'))
    .find(function (row) {
      return String(row['Traveler ID'] || '') === travelerId;
    });

  return Boolean(
    traveler &&
    /^justin(?:\s|$)/i.test(String(traveler.Name || '').trim())
  );
}

function getFinalistCabinIds_() {
  return String(getSettings_('Trip')['Finalist Cabin IDs'] || '')
    .split('|')
    .map(function (value) { return value.trim(); })
    .filter(Boolean);
}

function saveTripSettings(values) {
  values = values || {};

  [
    'Trip Name',
    'Destination',
    'Start Date',
    'End Date',
    'Portal Stage',
    'Voting Round'
  ].forEach(function (key) {
    if (values[key] !== undefined) {
      setSetting_('Trip', key, values[key]);
    }
  });

  // OneSignal App ID is a public UUID used by the browser SDK.
  // Preserve an already-configured ID if a blank form value is submitted,
  // and reject malformed values instead of replacing a working ID.
  if (values['OneSignal App ID'] !== undefined) {
    const submittedAppId = String(
      values['OneSignal App ID'] || ''
    ).trim();

    const currentAppId = String(
      getSettings_('Trip')['OneSignal App ID'] || ''
    ).trim();

    if (submittedAppId) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          .test(submittedAppId)
      ) {
        throw new Error(
          'The OneSignal App ID does not look valid. ' +
          'Paste the App ID from OneSignal → Settings → Keys & IDs.'
        );
      }

      setSetting_('Trip', 'OneSignal App ID', submittedAppId);
    } else if (!currentAppId) {
      // No existing value and no submitted value: leave it blank.
      setSetting_('Trip', 'OneSignal App ID', '');
    }
  }

  return getPortalData();
}

function saveFinalists(values) {
  setupVacationPortalSilent_();

  values = values || {};
  const travelerId = String(values.travelerId || '').trim();

  if (!isJustinTraveler_(travelerId)) {
    throw new Error('Only the Justin traveler profile can choose finalists.');
  }

  const ids = Array.isArray(values.cabinIds)
    ? values.cabinIds.map(function (value) {
        return String(value || '').trim();
      }).filter(Boolean)
    : [];

  const unique = [];
  ids.forEach(function (id) {
    if (unique.indexOf(id) < 0) unique.push(id);
  });

  if (unique.length !== 3) {
    throw new Error('Select exactly three finalist cabins.');
  }

  const activeIds = readSheet_('Cabins')
    .filter(function (row) {
      return String(row.Active || 'Yes').toLowerCase() !== 'no';
    })
    .map(function (row) { return row['Cabin ID']; });

  unique.forEach(function (id) {
    if (activeIds.indexOf(id) < 0) {
      throw new Error('One of the selected finalist cabins is no longer active.');
    }
  });

  setSetting_('Trip', 'Finalist Cabin IDs', unique.join('|'));

  return getPortalData();
}

function startFinalVoting(values) {
  values = values || {};

  if (!isJustinTraveler_(values.travelerId)) {
    throw new Error('Only the Justin traveler profile can start final voting.');
  }

  if (getFinalistCabinIds_().length !== 3) {
    throw new Error('Choose exactly three finalists first.');
  }

  setSetting_('Trip', 'Portal Stage', 'Final Voting');
  setSetting_('Trip', 'Voting Round', 'Final');
  setSetting_('Trip', 'Final Voting Closed', 'No');

  return getPortalData();
}

function closeFinalVoting(values) {
  values = values || {};

  if (!isJustinTraveler_(values.travelerId)) {
    throw new Error('Only the Justin traveler profile can close final voting.');
  }

  setSetting_('Trip', 'Portal Stage', 'Voting Closed');
  setSetting_('Trip', 'Voting Round', 'Final');
  setSetting_('Trip', 'Final Voting Closed', 'Yes');

  return getPortalData();
}

function reopenFinalVoting(values) {
  values = values || {};

  if (!isJustinTraveler_(values.travelerId)) {
    throw new Error('Only the Justin traveler profile can reopen final voting.');
  }

  setSetting_('Trip', 'Portal Stage', 'Final Voting');
  setSetting_('Trip', 'Voting Round', 'Final');
  setSetting_('Trip', 'Final Voting Closed', 'No');

  return getPortalData();
}

function restartPreliminaryVoting(values) {
  values = values || {};

  if (!isJustinTraveler_(values.travelerId)) {
    throw new Error('Only the Justin traveler profile can restart preliminary voting.');
  }

  const sheet = getSpreadsheet_().getSheetByName('Votes');

  if (!sheet) {
    throw new Error('Votes sheet was not found.');
  }

  // Keep the headers but remove all Preliminary and Final voting history so
  // this is a genuinely clean voting cycle.
  if (sheet.getLastRow() > 1) {
    sheet.getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      sheet.getLastColumn()
    ).clearContent();
  }

  setSetting_('Trip', 'Portal Stage', 'Preliminary Voting');
  setSetting_('Trip', 'Voting Round', 'Preliminary');
  setSetting_('Trip', 'Finalist Cabin IDs', '');
  setSetting_('Trip', 'Final Voting Closed', 'No');

  return getPortalData();
}
