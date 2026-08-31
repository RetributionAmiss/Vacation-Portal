function getPlannerSocialData() {
  ensurePortalSchemaCurrent_();

  const travelers = normalizeTravelerRows_(readSheet_('Travelers'));
  const travelerMap = {};
  travelers.forEach(function (traveler) {
    travelerMap[String(traveler['Traveler ID'] || '')] = traveler;
  });

  const signups = readSheet_('Itinerary Signups').map(function (row) {
    const traveler = travelerMap[String(row['Traveler ID'] || '')] || {};
    return Object.assign({}, row, {
      travelerName: String(traveler.Name || row['Traveler ID'] || '')
    });
  });

  const comments = readSheet_('Planner Comments').map(function (row) {
    const traveler = travelerMap[String(row['Traveler ID'] || '')] || {};
    return Object.assign({}, row, {
      travelerName: String(row['Traveler Name'] || traveler.Name || row['Traveler ID'] || '')
    });
  });

  return {
    itinerarySignups: signups,
    plannerComments: comments,
    serverTime: new Date().toISOString()
  };
}

function plannerSocialTraveler_(values) {
  values = values || {};
  const travelerId = String(values.travelerId || '').trim();
  if (!travelerId) throw new Error('Choose your traveler profile first.');

  assertTravelerSelf_(values.deviceId, travelerId);

  const traveler = normalizeTravelerRows_(readSheet_('Travelers')).find(function (row) {
    return String(row['Traveler ID'] || '') === travelerId &&
      String(row.Active || 'Yes').toLowerCase() !== 'no';
  });

  if (!traveler) throw new Error('That traveler is not active in this trip.');
  return traveler;
}

function plannerSocialDate_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error('Choose a valid vacation day.');
  return match[1] + '-' + match[2] + '-' + match[3];
}

function plannerSocialTime_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{2}):(\d{2})/);
  if (!match) throw new Error('Choose a time for this activity.');

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Choose a valid time for this activity.');
  }

  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

function plannerSocialItineraryItem_(itineraryId) {
  const id = String(itineraryId || '').trim();
  if (!id) throw new Error('Choose an activity first.');

  const item = readSheet_('Itinerary').find(function (row) {
    return String(row['Itinerary ID'] || '') === id;
  });

  if (!item) throw new Error('That activity could not be found.');
  return item;
}

function saveItineraryInterest(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const traveler = plannerSocialTraveler_(values);
  const travelerId = String(traveler['Traveler ID'] || '');
  const itinerary = plannerSocialItineraryItem_(values.itineraryId);
  const itineraryId = String(itinerary['Itinerary ID'] || '');
  const plannedDate = plannerSocialDate_(values.plannedDate);
  const plannedTime = plannerSocialTime_(values.plannedTime);
  const now = new Date();

  const existing = readSheet_('Itinerary Signups').find(function (row) {
    return String(row['Itinerary ID'] || '') === itineraryId &&
      String(row['Traveler ID'] || '') === travelerId;
  });

  const signupId = existing
    ? String(existing['Signup ID'] || '')
    : uid_('SIGNUP');

  const record = {
    'Signup ID': signupId,
    'Itinerary ID': itineraryId,
    'Traveler ID': travelerId,
    'Planned Date': plannedDate,
    'Planned Time': plannedTime,
    'Created At': existing ? existing['Created At'] : now,
    'Updated At': now
  };

  if (existing) {
    updateById_('Itinerary Signups', 'Signup ID', signupId, record);
  } else {
    appendObject_('Itinerary Signups', record);
  }

  let notification = {sent: false, reason: existing ? 'updated-existing-signup' : ''};
  if (!existing) {
    try {
      notification = notifyItineraryInterest_(traveler, itinerary, record);
    } catch (error) {
      console.warn('Itinerary signup notification failed.', error);
      notification = {sent: false, reason: 'notification-error'};
    }
  }

  return {
    signup: Object.assign({}, record, {
      travelerName: String(traveler.Name || travelerId)
    }),
    notification: notification
  };
}

function removeItineraryInterest(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const traveler = plannerSocialTraveler_(values);
  const travelerId = String(traveler['Traveler ID'] || '');
  const itineraryId = String(values.itineraryId || '').trim();
  plannerSocialItineraryItem_(itineraryId);

  const signup = readSheet_('Itinerary Signups').find(function (row) {
    return String(row['Itinerary ID'] || '') === itineraryId &&
      String(row['Traveler ID'] || '') === travelerId;
  });

  if (!signup) return {ok: true, itineraryId: itineraryId, travelerId: travelerId};

  deleteById_('Itinerary Signups', 'Signup ID', signup['Signup ID']);
  return {ok: true, itineraryId: itineraryId, travelerId: travelerId};
}

function savePlannerComment(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const traveler = plannerSocialTraveler_(values);
  const plannerType = String(values.plannerType || '').trim();
  const itemId = String(values.itemId || '').trim();
  const comment = String(values.comment || '').trim().slice(0, 800);

  if (['Itinerary', 'Meals'].indexOf(plannerType) < 0) {
    throw new Error('Comments are not available for that planning section.');
  }
  if (!itemId) throw new Error('Choose an item first.');
  if (!comment) throw new Error('Write a comment first.');

  const sheetName = plannerType === 'Meals' ? 'Meals' : 'Itinerary';
  const idHeader = plannerType === 'Meals' ? 'Meal ID' : 'Itinerary ID';
  const itemExists = readSheet_(sheetName).some(function (row) {
    return String(row[idHeader] || '') === itemId;
  });
  if (!itemExists) throw new Error('That planner item could not be found.');

  const record = {
    'Planner Comment ID': uid_('PCOM'),
    'Planner Type': plannerType,
    'Item ID': itemId,
    'Traveler ID': String(traveler['Traveler ID'] || ''),
    'Traveler Name': String(traveler.Name || ''),
    'Comment': comment,
    'Created At': new Date()
  };

  appendObject_('Planner Comments', record);

  return Object.assign({}, record, {
    travelerName: String(traveler.Name || record['Traveler ID'])
  });
}

function notifyItineraryInterest_(traveler, itinerary, signup) {
  const trip = getSettings_('Trip');
  const appId = String(trip['OneSignal App ID'] || '').trim();
  const apiKey = String(
    PropertiesService.getScriptProperties().getProperty('ONESIGNAL_APP_API_KEY') || ''
  ).trim();

  if (!appId || !apiKey) {
    return {sent: false, reason: 'push-not-configured'};
  }

  const signerId = String(traveler['Traveler ID'] || '');
  const targetIds = normalizeTravelerRows_(readSheet_('Travelers'))
    .filter(function (row) {
      return String(row.Active || 'Yes').toLowerCase() !== 'no' &&
        String(row['Traveler ID'] || '') !== signerId;
    })
    .map(function (row) { return String(row['Traveler ID'] || ''); })
    .filter(Boolean);

  if (!targetIds.length) return {sent: false, reason: 'no-other-travelers'};

  const dateParts = String(signup['Planned Date'] || '').split('-');
  const dateLabel = dateParts.length === 3
    ? dateParts[1] + '/' + dateParts[2] + '/' + dateParts[0]
    : String(signup['Planned Date'] || '');

  const timeParts = String(signup['Planned Time'] || '').split(':');
  let timeLabel = String(signup['Planned Time'] || '');
  if (timeParts.length >= 2) {
    const hour24 = Number(timeParts[0]);
    const minute = timeParts[1];
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = ((hour24 + 11) % 12) + 1;
    timeLabel = hour12 + ':' + minute + ' ' + suffix;
  }

  const activity = String(itinerary.Activity || 'an activity').trim();
  const travelerName = String(traveler.Name || 'A traveler').trim();
  const payload = {
    app_id: appId,
    target_channel: 'push',
    include_aliases: {external_id: targetIds},
    headings: {en: travelerName + ' wants to go!'},
    contents: {
      en: travelerName + ' signed up for ' + activity + ' on ' + dateLabel +
        ' at ' + timeLabel + '. Want to join them?'
    }
  };

  const pwaUrl = String(trip['PWA URL'] || '').trim();
  if (/^https:\/\//i.test(pwaUrl)) payload.url = pwaUrl;

  const response = UrlFetchApp.fetch('https://api.onesignal.com/notifications', {
    method: 'post',
    contentType: 'application/json',
    headers: {Authorization: 'Key ' + apiKey},
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('OneSignal returned HTTP ' + code + '.');
  }

  return {sent: true, targetCount: targetIds.length};
}

function clearPlannerSocialForItem_(plannerType, itemId) {
  const type = String(plannerType || '').trim();
  const id = String(itemId || '').trim();
  if (!id) return;

  const ss = getSpreadsheet_();
  const commentsSheet = ss.getSheetByName('Planner Comments');
  if (commentsSheet && commentsSheet.getLastRow() > 1) {
    const values = commentsSheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const typeIndex = headers.indexOf('Planner Type');
    const itemIndex = headers.indexOf('Item ID');
    for (let r = values.length - 1; r >= 1; r--) {
      if (String(values[r][typeIndex] || '') === type &&
          String(values[r][itemIndex] || '') === id) {
        commentsSheet.deleteRow(r + 1);
      }
    }
  }

  if (type === 'Itinerary') {
    const signupSheet = ss.getSheetByName('Itinerary Signups');
    if (signupSheet && signupSheet.getLastRow() > 1) {
      const values = signupSheet.getDataRange().getValues();
      const headers = values[0].map(String);
      const itemIndex = headers.indexOf('Itinerary ID');
      for (let r = values.length - 1; r >= 1; r--) {
        if (String(values[r][itemIndex] || '') === id) {
          signupSheet.deleteRow(r + 1);
        }
      }
    }
  }
}
