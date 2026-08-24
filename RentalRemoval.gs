function removeRentalForOrganizer(cabinId, authorization) {
  setupVacationPortalSilent_();

  cabinId = String(cabinId || '').trim();
  authorization = authorization || {};
  assertOrganizerFromValues_(authorization);

  const cabin = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId;
  });

  if (!cabin) throw new Error('The rental property could not be found.');

  const actorLabel = 'organizer';

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Active': 'No',
    'Status': 'Removed',
    'Import Stage': 'Removed by ' + actorLabel,
    'Updated At': new Date()
  });

  readSheet_('Rental Import Queue').forEach(function (row) {
    if (row['Cabin ID'] !== cabinId) return;
    updateById_('Rental Import Queue', 'Queue ID', row['Queue ID'], {
      'Status': 'Cancelled',
      'Last Error': 'Rental removed by ' + actorLabel + '.',
      'Updated At': new Date()
    });
  });

  readSheet_('Rental Edit Queue').forEach(function (row) {
    if (row['Cabin ID'] !== cabinId) return;
    updateById_('Rental Edit Queue', 'Queue ID', row['Queue ID'], {
      'Status': 'Cancelled',
      'Last Error': 'Rental removed by ' + actorLabel + '.',
      'Updated At': new Date()
    });
  });

  readSheet_('Extension Capture Queue').forEach(function (row) {
    if (row['Cabin ID'] !== cabinId) return;
    updateById_('Extension Capture Queue', 'Queue ID', row['Queue ID'], {
      'Status': 'Cancelled',
      'Last Error': 'Rental removed by ' + actorLabel + '.',
      'Updated At': new Date()
    });
  });

  const importRow = readSheet_('Rental Import')
    .slice()
    .reverse()
    .find(function (row) {
      return row['Cabin ID'] === cabinId;
    });

  if (importRow) {
    updateById_('Rental Import', 'Import ID', importRow['Import ID'], {
      'Status': 'Removed',
      'Notes': 'Removed from the portal by ' + actorLabel + '.',
      'Updated At': new Date()
    });
  }

  return {
    ok: true,
    cabinId: cabinId,
    message:
      (cabin.Nickname || cabin['Cabin Name'] || 'Rental') +
      ' was removed from the portal.'
  };
}
