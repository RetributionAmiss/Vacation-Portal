function normalizeVotingMethod_(value) {
  return /^rank/i.test(String(value || '').trim())
    ? 'Ranking'
    : 'Rating';
}

function getVotingMethod_() {
  return normalizeVotingMethod_(getSettings_('Trip')['Voting Method']);
}

function getFinalistCabinIds_() {
  return String(getSettings_('Trip')['Finalist Cabin IDs'] || '')
    .split('|')
    .map(function (value) { return value.trim(); })
    .filter(Boolean);
}

function saveTripSettings(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  if (values['Voting Method'] !== undefined) {
    const currentMethod = getVotingMethod_();
    const nextMethod = normalizeVotingMethod_(values['Voting Method']);

    if (currentMethod !== nextMethod) {
      const round = String(
        getSettings_('Trip')['Voting Round'] || 'Preliminary'
      );
      const roundHasVotes = readSheet_('Votes').some(function (vote) {
        return String(vote['Voting Round'] || 'Preliminary') === round;
      });

      if (roundHasVotes) {
        throw new Error(
          'Voting method cannot be changed after votes have been cast in this round. ' +
          'Restart preliminary voting or begin a fresh round before switching methods.'
        );
      }

      setSetting_('Trip', 'Voting Method', nextMethod);
    } else if (!String(getSettings_('Trip')['Voting Method'] || '').trim()) {
      setSetting_('Trip', 'Voting Method', currentMethod);
    }
  }

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

  if (values['OneSignal App ID'] !== undefined) {
    const submittedAppId = String(values['OneSignal App ID'] || '').trim();
    const currentAppId = String(
      getSettings_('Trip')['OneSignal App ID'] || ''
    ).trim();

    if (submittedAppId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submittedAppId)) {
        throw new Error(
          'The OneSignal App ID does not look valid. ' +
          'Paste the App ID from OneSignal → Settings → Keys & IDs.'
        );
      }

      setSetting_('Trip', 'OneSignal App ID', submittedAppId);
    } else if (!currentAppId) {
      setSetting_('Trip', 'OneSignal App ID', '');
    }
  }

  if (values['Smart Reminder Push Enabled'] !== undefined) {
    const enabled = String(values['Smart Reminder Push Enabled'] || 'No') === 'Yes';
    setSetting_('Trip', 'Smart Reminder Push Enabled', enabled ? 'Yes' : 'No');
    if (enabled && typeof ensureTravelerReminderTrigger_ === 'function') {
      ensureTravelerReminderTrigger_();
    }
  }

  return getPortalData();
}

function saveFinalists(values) {
  setupVacationPortalSilent_();
  values = values || {};
  assertOrganizerFromValues_(values);

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
  assertOrganizerFromValues_(values);

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
  assertOrganizerFromValues_(values);

  setSetting_('Trip', 'Portal Stage', 'Voting Closed');
  setSetting_('Trip', 'Voting Round', 'Final');
  setSetting_('Trip', 'Final Voting Closed', 'Yes');
  return getPortalData();
}

function reopenFinalVoting(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  setSetting_('Trip', 'Portal Stage', 'Final Voting');
  setSetting_('Trip', 'Voting Round', 'Final');
  setSetting_('Trip', 'Final Voting Closed', 'No');
  return getPortalData();
}

function restartPreliminaryVoting(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  const sheet = getSpreadsheet_().getSheetByName('Votes');
  if (!sheet) throw new Error('Votes sheet was not found.');

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
