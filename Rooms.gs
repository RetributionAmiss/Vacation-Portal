function saveAssignment(values) {
  return withPortalMutationLock_(function() {
    const existing = readSheet_('Assignments').find(a =>
      a['Cabin ID'] === values.cabinId &&
      a['Traveler ID'] === values.travelerId
    );
    const record = {
      'Cabin ID': values.cabinId,
      'Bedroom ID': values.bedroomId,
      'Traveler ID': values.travelerId,
      'Created At': existing && existing['Created At']
        ? existing['Created At']
        : new Date()
    };
    if (existing) updateById_('Assignments', 'Assignment ID', existing['Assignment ID'], record);
    else {
      record['Assignment ID'] = uid_('ASSIGN');
      appendObject_('Assignments', record);
    }
    return getPortalData();
  });
}

function removeAssignment(id) {
  return withPortalMutationLock_(function() {
    deleteById_('Assignments', 'Assignment ID', id);
    return getPortalData();
  });
}


function replaceBedroomLayout(cabinId, bedrooms) {
  cabinId = String(cabinId || '').trim();

  if (!cabinId) throw new Error('Cabin is required.');
  if (!Array.isArray(bedrooms) || !bedrooms.length) {
    throw new Error('No bedroom layout was found.');
  }

  return withPortalMutationLock_(function() {
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
  });
}


function saveRoomAssignmentsBatch(cabinId, assignments) {
  setupVacationPortalSilent_();

  cabinId = String(cabinId || '').trim();
  assignments = Array.isArray(assignments) ? assignments : [];

  if (!cabinId) throw new Error('Cabin is required.');

  return withPortalMutationLock_(function() {
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

    const existingByTraveler = {};
    readSheet_('Assignments')
      .filter(function(row) { return row['Cabin ID'] === cabinId; })
      .forEach(function(row) {
        const travelerId = String(row['Traveler ID'] || '');
        if (travelerId && !existingByTraveler[travelerId]) {
          existingByTraveler[travelerId] = row;
        }
      });

    const seen = {};
    const normalized = [];
    const now = new Date();

    assignments.forEach(function (item) {
      item = item || {};
      const travelerId = String(item.travelerId || '').trim();
      const bedroomId = String(item.bedroomId || '').trim();

      if (!travelerId || !bedroomId) return;
      if (seen[travelerId]) return;
      if (travelerIds.indexOf(travelerId) < 0) return;
      if (bedroomIds.indexOf(bedroomId) < 0) return;

      seen[travelerId] = true;
      const existing = existingByTraveler[travelerId] || null;
      normalized.push({
        'Assignment ID': existing && existing['Assignment ID']
          ? existing['Assignment ID']
          : uid_('ASSIGN'),
        'Cabin ID': cabinId,
        'Bedroom ID': bedroomId,
        'Traveler ID': travelerId,
        'Created At': existing && existing['Created At']
          ? existing['Created At']
          : now
      });
    });

    replaceSheetRowsByFieldValueUnlocked_(
      'Assignments',
      'Cabin ID',
      cabinId,
      normalized
    );

    return getPortalData();
  });
}

function clearRoomAssignmentsForCabin_(cabinId) {
  replaceSheetRowsByFieldValueUnlocked_(
    'Assignments',
    'Cabin ID',
    String(cabinId || '').trim(),
    []
  );
}

function removeAllBedrooms(cabinId) {
  cabinId = String(cabinId || '').trim();
  if (!cabinId) throw new Error('Cabin is required.');

  return withPortalMutationLock_(function() {
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
  });
}
