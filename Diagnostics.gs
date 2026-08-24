
function safeUiAlert_(title, message) {
  try {
    SpreadsheetApp.getUi().alert(
      String(title || APP_TITLE),
      String(message || ''),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return true;
  } catch (error) {
    console.log(String(title || APP_TITLE) + ': ' + String(message || ''));
    return false;
  }
}

function safeUiConfirm_(title, message) {
  try {
    return SpreadsheetApp.getUi().alert(
      String(title || APP_TITLE),
      String(message || ''),
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    ) === SpreadsheetApp.getUi().Button.YES;
  } catch (error) {
    throw new Error(
      'This action requires the spreadsheet menu. Open the spreadsheet and run it from Vacation Portal.'
    );
  }
}

function getSystemHealth() {
  const checks = [];
  const startedAt = new Date();

  try {
    const ss = getSpreadsheet_();
    checks.push({
      name: 'Spreadsheet connection',
      status: 'pass',
      detail: ss.getName()
    });
  } catch (error) {
    checks.push({
      name: 'Spreadsheet connection',
      status: 'fail',
      detail: String(error.message || error)
    });
  }

  Object.keys(SCHEMAS).forEach(function (sheetName) {
    try {
      const sheet = getSpreadsheet_().getSheetByName(sheetName);
      checks.push({
        name: 'Sheet: ' + sheetName,
        status: sheet ? 'pass' : 'fail',
        detail: sheet ? 'Available' : 'Missing'
      });
    } catch (error) {
      checks.push({
        name: 'Sheet: ' + sheetName,
        status: 'fail',
        detail: String(error.message || error)
      });
    }
  });

  checks.push({
    name: 'Gemini API key',
    status: PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')
      ? 'pass'
      : 'warn',
    detail: PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')
      ? 'Configured'
      : 'Not configured'
  });

  return {
    status: checks.some(function (check) { return check.status === 'fail'; })
      ? 'fail'
      : checks.some(function (check) { return check.status === 'warn'; })
        ? 'warn'
        : 'pass',
    checks: checks,
    durationMs: new Date().getTime() - startedAt.getTime(),
    timestamp: new Date().toISOString()
  };
}

function runSetupDiagnostics() {
  setupVacationPortalSilent_();
  return getSystemHealth();
}
