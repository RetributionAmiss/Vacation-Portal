function repairGeminiImports() {
  assertSpreadsheetAdminContext_();
  setupVacationPortalSilent_();
  setSetting_('Trip', 'Gemini Model', GEMINI_MODEL);

  const queueRows = readSheet_('Rental Import Queue');
  let requeued = 0;

  queueRows.forEach(function (row) {
    const status = String(row.Status || '');
    const error = String(row['Last Error'] || '');

    const isGeminiFailure =
      status === 'Enrichment Error' ||
      /Gemini returned HTTP 404/i.test(error) ||
      /gemini-2\.5-flash/i.test(error) ||
      /model.+no longer available/i.test(error);

    if (!isGeminiFailure) return;

    updateById_(
      'Rental Import Queue',
      'Queue ID',
      row['Queue ID'],
      {
        'Status': 'Enrichment Queued',
        'Attempts': 0,
        'Last Error': '',
        'Updated At': new Date()
      }
    );

    if (row['Cabin ID']) {
      updateById_(
        'Cabins',
        'Cabin ID',
        row['Cabin ID'],
        {
          'Import Stage': 'Core Ready — Enrichment Queued',
          'Updated At': new Date()
        }
      );

      const importRow = readSheet_('Rental Import')
        .slice()
        .reverse()
        .find(function (item) {
          return item['Cabin ID'] === row['Cabin ID'];
        });

      if (importRow) {
        updateById_(
          'Rental Import',
          'Import ID',
          importRow['Import ID'],
          {
            'Status': 'Enrichment Queued',
            'Notes':
              'Requeued after updating Gemini to ' + GEMINI_MODEL + '.',
            'Updated At': new Date()
          }
        );
      }
    }

    requeued++;
  });

  ensureRentalEnrichmentTrigger_();

  safeUiAlert_(
    'Gemini imports repaired',
    'Gemini model: ' + GEMINI_MODEL + '\n\n' +
    requeued + ' rental(s) were returned to the enrichment queue.'
  );

  return {
    model: GEMINI_MODEL,
    requeued: requeued
  };
}
