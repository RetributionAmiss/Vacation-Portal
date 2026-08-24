function removeRentalForOrganizer(cabinId, travelerId) {
  setupVacationPortalSilent_();

  cabinId = String(cabinId || '').trim();
  travelerId = String(travelerId || '').trim();

  const traveler = readSheet_('Travelers').find(function (row) {
    return String(row['Traveler ID'] || '') === travelerId;
  });

  const travelerName = String(
    traveler && traveler.Name || ''
  ).trim();

  if (!/^justin(?:\s|$)/i.test(travelerName)) {
    throw new Error(
      'Only the Justin traveler profile can remove rental properties.'
    );
  }

  const cabin = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId;
  });

  if (!cabin) throw new Error('The rental property could not be found.');

  // Soft removal keeps votes, comments, photos, bedrooms, and historical
  // import data intact while removing the property from every portal view.
  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Active': 'No',
    'Status': 'Removed',
    'Import Stage': 'Removed by ' + travelerName,
    'Updated At': new Date()
  });

  // Stop any pending work from bringing the removed property back.
  readSheet_('Rental Import Queue').forEach(function (row) {
    if (row['Cabin ID'] !== cabinId) return;

    updateById_('Rental Import Queue', 'Queue ID', row['Queue ID'], {
      'Status': 'Cancelled',
      'Last Error': 'Rental removed by ' + travelerName + '.',
      'Updated At': new Date()
    });
  });

  readSheet_('Rental Edit Queue').forEach(function (row) {
    if (row['Cabin ID'] !== cabinId) return;

    updateById_('Rental Edit Queue', 'Queue ID', row['Queue ID'], {
      'Status': 'Cancelled',
      'Last Error': 'Rental removed by ' + travelerName + '.',
      'Updated At': new Date()
    });
  });

  readSheet_('Extension Capture Queue').forEach(function (row) {
    if (row['Cabin ID'] !== cabinId) return;

    updateById_('Extension Capture Queue', 'Queue ID', row['Queue ID'], {
      'Status': 'Cancelled',
      'Last Error': 'Rental removed by ' + travelerName + '.',
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
      'Notes': 'Removed from the portal by ' + travelerName + '.',
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
