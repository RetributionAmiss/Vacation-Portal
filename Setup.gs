function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function setupVacationPortal() {
  assertSpreadsheetAdminContext_();

  const ss = getSpreadsheet_();
  Object.keys(SCHEMAS).forEach(name => ensureSheet_(ss, name, SCHEMAS[name]));

  const defaults = {
    'Trip Name': 'Smoky Mountain Family Vacation',
    'Destination': 'Smoky Mountains',
    'Start Date': '',
    'End Date': '',
    'Portal Stage': 'Gathering',
    'Voting Round': 'Preliminary',
    'Voting Method': 'Rating',
    'Finalist Count': '3',
    'Currency': 'USD',
    'Vacation Status': 'Planning',
    'Gemini Model': GEMINI_MODEL,
    'PWA URL': 'https://retributionamiss.github.io/Vacation-Portal/',
    'OneSignal App ID': ''
  };
  Object.keys(defaults).forEach(key => ensureSetting_('Trip', key, defaults[key]));

  migrateTravelerTypes_();
  backfillCabinPlanningDetails_();
  ensureRentalEnrichmentTrigger_();

  PropertiesService
    .getScriptProperties()
    .setProperty('PORTAL_SCHEMA_VERSION', PORTAL_SCHEMA_VERSION);

  safeUiAlert_(
    'Vacation Portal ready',
    'The portal sheets were created or repaired without deleting existing data.'
  );

  return getSystemHealth_();
}

function ensureSheet_(ss, name, requiredHeaders) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(value => String(value || '').trim());

  if (!existing.some(Boolean)) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  } else {
    const missing = requiredHeaders.filter(header => existing.indexOf(header) < 0);
    if (missing.length) {
      sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    }
  }

  const finalHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.getRange(1, 1, 1, finalHeaders.length)
    .setFontWeight('bold')
    .setBackground('#234c3c')
    .setFontColor('#ffffff');

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, Math.min(finalHeaders.length, 12));
  return sheet;
}

function ensureSetting_(sheetName, key, value) {
  const rows = readSheet_(sheetName);
  if (!rows.some(row => String(row.Setting || '') === key)) {
    appendObject_(sheetName, { Setting: key, Value: value });
  }
}

function setSetting_(sheetName, key, value) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0] || '') === key) {
      sheet.getRange(r + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function getSettings_(sheetName) {
  const map = {};
  readSheet_(sheetName).forEach(row => {
    map[String(row.Setting || '')] = row.Value;
  });
  return map;
}

function openRentalGathering() {
  assertSpreadsheetAdminContext_();
  setSetting_('Trip', 'Portal Stage', 'Gathering');
  safeUiAlert_('Vacation Portal', 'Portal stage updated to Rental Gathering.');
  return getPortalData();
}

function openPreliminaryVoting() {
  assertSpreadsheetAdminContext_();
  setSetting_('Trip', 'Portal Stage', 'Preliminary Voting');
  setSetting_('Trip', 'Voting Round', 'Preliminary');
  safeUiAlert_('Vacation Portal', 'Portal stage updated to Preliminary Voting.');
  return getPortalData();
}

function openFinalistVoting() {
  assertSpreadsheetAdminContext_();
  setSetting_('Trip', 'Portal Stage', 'Finalist Voting');
  setSetting_('Trip', 'Voting Round', 'Final');
  safeUiAlert_('Vacation Portal', 'Portal stage updated to Finalist Voting.');
  return getPortalData();
}

function setGeminiApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Gemini API key',
    'Paste the API key from Google AI Studio.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties().setProperty(
      'GEMINI_API_KEY',
      response.getResponseText().trim()
    );
    safeUiAlert_('Gemini API key', 'Gemini API key saved.');
  }
}

function testGeminiConnection() {
  assertSpreadsheetAdminContext_();

  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Set the Gemini API key first.');

  const payload = {
    contents: [{role: 'user', parts: [{text: 'Return exactly {"status":"ok"}'}]}],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {status: {type: 'string'}},
        required: ['status']
      }
    }
  };

  const response = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
    ':generateContent?key=' + encodeURIComponent(apiKey),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  if (response.getResponseCode() >= 300) {
    throw new Error(response.getContentText());
  }

  safeUiAlert_(
    'Gemini connection successful',
    'The portal connected using ' + GEMINI_MODEL + '.'
  );

  return {status: 'ok', model: GEMINI_MODEL};
}
