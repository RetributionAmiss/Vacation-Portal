function travelArrivalTravelerMap_() {
  const map = {};
  normalizeTravelerRows_(readSheet_('Travelers')).forEach(function(row) {
    if (String(row.Active || 'Yes').toLowerCase() === 'no') return;
    const id = String(row['Traveler ID'] || '').trim();
    if (id) map[id] = row;
  });
  return map;
}

function travelArrivalMode_(value) {
  const text = String(value || '').trim();
  const allowed = ['Driving', 'Flying', 'Train', 'Other'];
  return allowed.indexOf(text) >= 0 ? text : 'Driving';
}

function travelArrivalDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error('Choose a valid travel date.');
  return match[1] + '-' + match[2] + '-' + match[3];
}

function travelArrivalTime_(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new Error('Choose a valid travel time.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Choose a valid travel time.');
  }
  return ('0' + hour).slice(-2) + ':' + ('0' + minute).slice(-2);
}

/*
 * Travel departure/arrival values are clock times, not instants in time.
 * Google Sheets may expose a time-only cell as a Date. Serializing that Date
 * with toISOString() converts the displayed clock time to UTC and shifts it.
 * Read these two columns in the spreadsheet timezone and return literal HH:mm.
 */
function travelArrivalReadPlans_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName('Travel Plans');
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(function(value) {
    return String(value || '').trim();
  });
  const spreadsheetTimeZone = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  const timeHeaders = {
    'Departure Time': true,
    'Arrival Time': true
  };

  return values
    .filter(function(row) {
      return row.some(function(value) { return value !== '' && value !== null; });
    })
    .map(function(row) {
      const obj = {};
      headers.forEach(function(header, index) {
        const value = row[index];
        if (timeHeaders[header] && value instanceof Date && !isNaN(value.getTime())) {
          obj[header] = Utilities.formatDate(value, spreadsheetTimeZone, 'HH:mm');
          return;
        }
        obj[header] = serializeValue_(value);
      });
      return obj;
    });
}

function travelArrivalPlanForTraveler_(travelerId) {
  const id = String(travelerId || '').trim();
  if (!id) return null;
  return readSheet_('Travel Plans').find(function(row) {
    return String(row['Traveler ID'] || '') === id;
  }) || null;
}

function getTravelArrivalData() {
  ensurePortalSchemaCurrent_();
  return {
    plans: travelArrivalReadPlans_(),
    serverTime: new Date().toISOString()
  };
}

function saveMyTravelPlan(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const travelerId = String(values.travelerId || '').trim();
  assertTravelerSelf_(values.deviceId, travelerId);

  const travelerMap = travelArrivalTravelerMap_();
  if (!travelerMap[travelerId]) {
    throw new Error('That traveler is no longer active.');
  }

  const arrivalDate = travelArrivalDate_(values.arrivalDate);
  if (!arrivalDate) throw new Error('Choose your estimated arrival date.');

  const now = new Date();
  const existing = travelArrivalPlanForTraveler_(travelerId);
  const record = {
    'Traveler ID': travelerId,
    'Mode': travelArrivalMode_(values.mode),
    'Leaving From': String(values.leavingFrom || '').trim().slice(0, 120),
    'Departure Date': travelArrivalDate_(values.departureDate),
    'Departure Time': travelArrivalTime_(values.departureTime),
    'Arrival Date': arrivalDate,
    'Arrival Time': travelArrivalTime_(values.arrivalTime),
    'Travel Details': String(values.travelDetails || '').trim().slice(0, 160),
    'Notes': String(values.notes || '').trim().slice(0, 500),
    'Updated At': now
  };

  if (existing) {
    updateById_('Travel Plans', 'Travel Plan ID', existing['Travel Plan ID'], record);
  } else {
    record['Travel Plan ID'] = uid_('TRAVEL');
    record['Created At'] = now;
    appendObject_('Travel Plans', record);
  }

  return getTravelArrivalData();
}

function deleteMyTravelPlan(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const travelerId = String(values.travelerId || '').trim();
  assertTravelerSelf_(values.deviceId, travelerId);

  const existing = travelArrivalPlanForTraveler_(travelerId);
  if (!existing) return getTravelArrivalData();

  deleteById_('Travel Plans', 'Travel Plan ID', existing['Travel Plan ID']);
  return getTravelArrivalData();
}
