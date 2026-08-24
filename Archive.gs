function startNewVacation() {
  const confirmed = safeUiConfirm_(
    'Start a new vacation?',
    'This archives the current planning sheets into a timestamped spreadsheet and clears planning activity. Cabins and travelers are retained.'
  );

  if (!confirmed) return {status: 'cancelled'};

  const ss = getSpreadsheet_();
  const archive = SpreadsheetApp.create(
    APP_TITLE + ' Archive ' + Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HHmm'
    )
  );

  ['Trip','Votes','Comments','Favorites','Assignments','Budget','Meals','Grocery List','Itinerary','Rental Import'].forEach(function(name) {
    const source = ss.getSheetByName(name);
    if (source) source.copyTo(archive).setName(name);
  });

  ['Votes','Comments','Favorites','Assignments','Budget','Meals','Grocery List','Itinerary','Rental Import'].forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
  });

  setSetting_('Trip', 'Portal Stage', 'Gathering');
  setSetting_('Trip', 'Voting Round', 'Preliminary');
  setSetting_('Trip', 'Vacation Status', 'Planning');
  safeUiAlert_('New vacation started', 'Archive created: ' + archive.getUrl());

  return {status: 'ok', archiveUrl: archive.getUrl()};
}

function resetPlanningPortalToGathering(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  const allowedSections = {
    'Votes': true,
    'Favorites': true,
    'Comments': true,
    'Assignments': true,
    'Budget': true,
    'Meals': true,
    'Grocery List': true,
    'Itinerary': true
  };

  const requested = Array.isArray(values.sections)
    ? values.sections
        .map(function(name) { return String(name || '').trim(); })
        .filter(function(name) { return allowedSections[name]; })
    : [];

  const ss = getSpreadsheet_();
  const stamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HHmm'
  );

  const archive = SpreadsheetApp.create(
    APP_TITLE + ' Planning Reset Archive ' + stamp
  );

  ['Trip','Votes','Comments','Favorites','Assignments','Budget','Meals','Grocery List','Itinerary']
    .forEach(function(name) {
      const source = ss.getSheetByName(name);
      if (source) source.copyTo(archive).setName(name);
    });

  requested.forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        sheet.getLastColumn()
      ).clearContent();
    }
  });

  setSetting_('Trip', 'Portal Stage', 'Gathering');
  setSetting_('Trip', 'Voting Round', 'Preliminary');
  setSetting_('Trip', 'Finalist Cabin IDs', '');
  setSetting_('Trip', 'Final Voting Closed', 'No');
  setSetting_('Trip', 'Selected Cabin ID', '');
  setSetting_('Trip', 'Vacation Status', 'Planning');

  return {
    data: getPortalData(),
    archiveUrl: archive.getUrl(),
    clearedSections: requested
  };
}
