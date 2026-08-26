function repairRentalProcessing() {
  assertSpreadsheetAdminContext_();
  setupVacationPortalSilent_();
  ensureRentalEnrichmentTrigger_();

  const extensionRows = readSheet_('Extension Capture Queue');
  let reset = 0;

  extensionRows.forEach(function (row) {
    const status = String(row.Status || '');

    if (
      status === 'Processing' ||
      (status === 'Error' && Number(row.Attempts || 0) >= 3)
    ) {
      updateById_(
        'Extension Capture Queue',
        'Queue ID',
        row['Queue ID'],
        {
          'Status': 'Queued',
          'Attempts': 0,
          'Last Error': '',
          'Updated At': new Date()
        }
      );
      reset++;
    }
  });

  const result = processRentalEnrichmentQueue_();

  safeUiAlert_(
    'Rental processing repaired',
    'Reset ' + reset + ' extension queue item(s).\n\n' +
    'Processed now: ' + Number(result.extensionProcessed || 0) + '\n' +
    'Duplicates/updates: ' + Number(result.extensionDuplicates || 0) + '\n' +
    'Failed: ' + Number(result.extensionFailed || 0) + '\n' +
    'Still waiting: ' + Number(result.extensionRemaining || 0)
  );

  return result;
}

function getRentalQueueHealth_() {
  const extensionRows = readSheet_('Extension Capture Queue');
  const rentalRows = readSheet_('Rental Import Queue');

  return {
    extension: extensionRows.reduce(function (map, row) {
      const key = String(row.Status || 'Blank');
      map[key] = Number(map[key] || 0) + 1;
      return map;
    }, {}),
    rental: rentalRows.reduce(function (map, row) {
      const key = String(row.Status || 'Blank');
      map[key] = Number(map[key] || 0) + 1;
      return map;
    }, {}),
    triggers: ScriptApp.getProjectTriggers().map(function (trigger) {
      return {
        handler: trigger.getHandlerFunction(),
        type: String(trigger.getEventType())
      };
    })
  };
}
