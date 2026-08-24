function travelerRecordFromValues_(values, existing, allowAdminFields) {
  values = values || {};
  existing = existing || {};

  const id = String(values.id || existing['Traveler ID'] || '').trim();
  const travelerType = allowAdminFields
    ? (String(values.travelerType || existing['Traveler Type'] || 'Adult').trim() === 'Child' ? 'Child' : 'Adult')
    : getTravelerType_(existing);

  const parentId = allowAdminFields
    ? (travelerType === 'Child' ? String(values.parentGuardianId || '').trim() : '')
    : String(existing['Parent/Guardian ID'] || '');

  const name = String(values.name !== undefined ? values.name : existing.Name || '').trim();
  if (!name) throw new Error('Traveler name is required.');

  if (travelerType === 'Child' && !parentId) {
    throw new Error('Select the adult responsible for this child.');
  }
  if (parentId && parentId === id) {
    throw new Error('A traveler cannot be their own parent or guardian.');
  }

  let parentName = '';
  if (parentId) {
    const parent = readSheet_('Travelers').find(function(row) {
      return row['Traveler ID'] === parentId;
    });
    if (!parent) throw new Error('The selected parent or guardian was not found.');
    if (getTravelerType_(parent) !== 'Adult') {
      throw new Error('A child must be assigned to an adult traveler.');
    }
    parentName = String(parent.Name || '').trim();
  }

  const record = {
    'Traveler ID': id,
    'Name': name,
    'Email': String(values.email !== undefined ? values.email : existing.Email || '').trim(),
    'Group': String(values.group !== undefined ? values.group : existing.Group || '').trim(),
    'Traveler Type': travelerType,
    'Parent/Guardian ID': parentId,
    'Adults': travelerType === 'Adult' ? 1 : 0,
    'Children': travelerType === 'Child' ? 1 : 0,
    'Price Cap': allowAdminFields && travelerType === 'Adult'
      ? Math.max(0, Number(values.priceCap || 0))
      : Number(existing['Price Cap'] || 0),
    'Cost %': allowAdminFields && travelerType === 'Adult'
      ? Math.max(0, Math.min(100, Number(
          values.costPercent === '' || values.costPercent === undefined
            ? 100
            : values.costPercent
        )))
      : Number(existing['Cost %'] === '' || existing['Cost %'] === undefined ? 100 : existing['Cost %']),
    'Pay More': allowAdminFields && travelerType === 'Adult'
      ? (Boolean(values.payMore) ? 'Yes' : 'No')
      : String(existing['Pay More'] || 'No'),
    'Willing to Share Room': travelerType === 'Adult' && Boolean(values.shareRoom)
      ? 'Yes'
      : 'No',
    'Home Location': String(values.homeLocation !== undefined ? values.homeLocation : existing['Home Location'] || '').trim(),
    'Notes': String(values.notes !== undefined ? values.notes : existing.Notes || '').trim(),
    'Active': allowAdminFields
      ? (values.active === false ? 'No' : 'Yes')
      : String(existing.Active || 'Yes')
  };

  return {record: record, parentName: parentName};
}

function writeTravelerRecord_(record, parentName, isNew) {
  const sheet = getSpreadsheet_().getSheetByName('Travelers');
  const grid = sheet.getDataRange().getValues();
  const headers = grid[0].map(function(value) {
    return String(value || '').trim();
  });
  const idIndex = headers.indexOf('Traveler ID');
  if (idIndex < 0) throw new Error('Traveler ID column was not found.');

  const outputRow = headers.map(function(header) {
    return record[header] !== undefined ? record[header] : '';
  });

  let rowNumber = 0;
  if (!isNew) {
    for (let r = 1; r < grid.length; r++) {
      if (String(grid[r][idIndex] || '') === record['Traveler ID']) {
        rowNumber = r + 1;
        break;
      }
    }
    if (!rowNumber) throw new Error('The selected traveler could not be found.');
  }

  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([outputRow]);
  } else {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([outputRow]);
  }

  const response = {};
  headers.forEach(function(header, index) {
    response[header] = serializeValue_(outputRow[index]);
  });
  response.parentName = parentName;
  return response;
}

function saveTraveler(values) {
  values = values || {};
  const requestedId = String(values.id || '').trim();
  const isNew = !requestedId;

  if (isNew) {
    assertOrganizerFromValues_(values);
    const id = uid_('TRAV');
    const prepared = travelerRecordFromValues_(
      Object.assign({}, values, {id: id}),
      {},
      true
    );
    return writeTravelerRecord_(prepared.record, prepared.parentName, true);
  }

  const existing = readSheet_('Travelers').find(function(row) {
    return String(row['Traveler ID'] || '') === requestedId;
  });
  if (!existing) throw new Error('The selected traveler could not be found.');

  let organizer = false;
  try {
    assertOrganizerFromValues_(values);
    organizer = true;
  } catch (error) {
    if (String(error && error.message || '').indexOf('ORGANIZER_AUTH_') !== 0) {
      throw error;
    }
  }

  if (!organizer) {
    assertTravelerSelf_(values.deviceId, requestedId);
  }

  const prepared = travelerRecordFromValues_(values, existing, organizer);
  return writeTravelerRecord_(prepared.record, prepared.parentName, false);
}

function deleteTraveler(values) {
  values = values || {};
  assertOrganizerFromValues_(values);
  const id = String(values.id || '').trim();

  const children = readSheet_('Travelers').filter(function(row) {
    return row['Parent/Guardian ID'] === id &&
      String(row.Active || 'Yes').toLowerCase() !== 'no';
  });

  if (children.length) {
    throw new Error(
      'Reassign ' + children.length +
      ' child traveler(s) before deleting this adult.'
    );
  }

  deleteById_('Travelers', 'Traveler ID', id);
  return getPortalData();
}

function getTravelerType_(row) {
  const explicit = String(row['Traveler Type'] || '').trim();
  if (explicit === 'Child' || explicit === 'Adult') return explicit;
  return Number(row.Children || 0) > 0 && Number(row.Adults || 0) === 0
    ? 'Child'
    : 'Adult';
}

function normalizeTravelerRows_(rows) {
  return rows.map(function(row) {
    const type = getTravelerType_(row);
    return Object.assign({}, row, {
      'Traveler Type': type,
      Adults: type === 'Adult' ? 1 : 0,
      Children: type === 'Child' ? 1 : 0
    });
  });
}

function migrateTravelerTypes_() {
  const sheet = getSpreadsheet_().getSheetByName('Travelers');
  if (!sheet || sheet.getLastRow() < 2) return;

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(value) {
    return String(value || '').trim();
  });

  const typeIndex = headers.indexOf('Traveler Type');
  const parentIndex = headers.indexOf('Parent/Guardian ID');
  const adultIndex = headers.indexOf('Adults');
  const childIndex = headers.indexOf('Children');

  if (typeIndex < 0 || parentIndex < 0 || adultIndex < 0 || childIndex < 0) return;

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    const currentType = String(values[rowIndex][typeIndex] || '').trim();
    const inferredType = currentType === 'Child' || currentType === 'Adult'
      ? currentType
      : (Number(values[rowIndex][childIndex] || 0) > 0 &&
          Number(values[rowIndex][adultIndex] || 0) === 0
            ? 'Child'
            : 'Adult');

    const rowNumber = rowIndex + 1;
    sheet.getRange(rowNumber, typeIndex + 1).setValue(inferredType);
    sheet.getRange(rowNumber, adultIndex + 1).setValue(inferredType === 'Adult' ? 1 : 0);
    sheet.getRange(rowNumber, childIndex + 1).setValue(inferredType === 'Child' ? 1 : 0);

    if (inferredType === 'Adult' && values[rowIndex][parentIndex]) {
      sheet.getRange(rowNumber, parentIndex + 1).clearContent();
    }
  }
}
