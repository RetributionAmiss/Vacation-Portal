function saveAssignment(values) {
  const existing = readSheet_('Assignments').find(a =>
    a['Cabin ID'] === values.cabinId &&
    a['Traveler ID'] === values.travelerId
  );
  const record = {
    'Cabin ID': values.cabinId,
    'Bedroom ID': values.bedroomId,
    'Traveler ID': values.travelerId,
    'Created At': new Date()
  };
  if (existing) updateById_('Assignments', 'Assignment ID', existing['Assignment ID'], record);
  else {
    record['Assignment ID'] = uid_('ASSIGN');
    appendObject_('Assignments', record);
  }
  return getPortalData();
}

function removeAssignment(id) {
  deleteById_('Assignments', 'Assignment ID', id);
  return getPortalData();
}


function replaceBedroomLayout(cabinId, bedrooms) {
  cabinId = String(cabinId || '').trim();

  if (!cabinId) throw new Error('Cabin is required.');
  if (!Array.isArray(bedrooms) || !bedrooms.length) {
    throw new Error('No bedroom layout was found.');
  }

  const cabin = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId;
  });

  if (!cabin) throw new Error('Cabin not found.');

  const normalized = bedrooms.slice(0, 30).map(function (room, index) {
    room = room || {};
    return {
      name: String(room.name || ('Bedroom ' + (index + 1))).trim(),
      floor: String(room.floor || '').trim(),
      beds: String(room.beds || '').trim(),
      sleeps: Math.max(0, Number(room.sleeps || 0)),
      privateBathroom: Boolean(room.privateBathroom),
      notes: String(room.notes || '').trim()
    };
  }).filter(function (room) {
    return room.name;
  });

  replaceCabinBedrooms_(cabinId, normalized);

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Bedrooms': normalized.length,
    'Updated At': new Date()
  });

  return getPortalData();
}


function saveRoomAssignmentsBatch(cabinId, assignments) {
  setupVacationPortalSilent_();

  cabinId = String(cabinId || '').trim();
  assignments = Array.isArray(assignments) ? assignments : [];

  if (!cabinId) throw new Error('Cabin is required.');

  const cabin = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId;
  });
  if (!cabin) throw new Error('Cabin not found.');

  const bedroomIds = readSheet_('Bedrooms')
    .filter(function (row) { return row['Cabin ID'] === cabinId; })
    .map(function (row) { return row['Bedroom ID']; });

  const travelerIds = normalizeTravelerRows_(readSheet_('Travelers'))
    .filter(function (row) {
      return String(row.Active || 'Yes').toLowerCase() !== 'no';
    })
    .map(function (row) { return row['Traveler ID']; });

  const seen = {};
  const normalized = [];

  assignments.forEach(function (item) {
    item = item || {};
    const travelerId = String(item.travelerId || '').trim();
    const bedroomId = String(item.bedroomId || '').trim();

    if (!travelerId || !bedroomId) return;
    if (seen[travelerId]) return;
    if (travelerIds.indexOf(travelerId) < 0) return;
    if (bedroomIds.indexOf(bedroomId) < 0) return;

    seen[travelerId] = true;
    normalized.push({
      'Assignment ID': uid_('ASSIGN'),
      'Cabin ID': cabinId,
      'Bedroom ID': bedroomId,
      'Traveler ID': travelerId,
      'Created At': new Date()
    });
  });

  const sheet = getSpreadsheet_().getSheetByName('Assignments');
  const grid = sheet.getDataRange().getValues();
  const headers = grid[0].map(function (v) { return String(v || '').trim(); });
  const cabinIndex = headers.indexOf('Cabin ID');

  const retained = grid.slice(1).filter(function (row) {
    return String(row[cabinIndex] || '') !== cabinId;
  });

  const newRows = normalized.map(function (record) {
    return headers.map(function (header) {
      return record[header] !== undefined ? record[header] : '';
    });
  });

  const output = [headers].concat(retained, newRows);

  sheet.clearContents();
  sheet.getRange(1, 1, output.length, headers.length).setValues(output);

  return getPortalData();
}

function clearRoomAssignmentsForCabin_(cabinId) {
  const sheet = getSpreadsheet_().getSheetByName('Assignments');
  if (!sheet) return;

  const grid = sheet.getDataRange().getValues();
  if (!grid.length) return;

  const headers = grid[0].map(function (v) {
    return String(v || '').trim();
  });
  const cabinIndex = headers.indexOf('Cabin ID');
  if (cabinIndex < 0) return;

  const retained = grid.slice(1).filter(function (row) {
    return String(row[cabinIndex] || '') !== cabinId;
  });

  const output = [headers].concat(retained);
  sheet.clearContents();
  sheet.getRange(1, 1, output.length, headers.length).setValues(output);
}

function removeAllBedrooms(cabinId) {
  cabinId = String(cabinId || '').trim();
  if (!cabinId) throw new Error('Cabin is required.');

  const cabin = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId;
  });
  if (!cabin) throw new Error('Cabin not found.');

  replaceCabinBedrooms_(cabinId, []);
  clearRoomAssignmentsForCabin_(cabinId);

  updateById_('Cabins', 'Cabin ID', cabinId, {
    'Bedrooms': 0,
    'Updated At': new Date()
  });

  return getPortalData();
}
