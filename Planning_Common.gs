function plannerDefinitionForDelete_(plannerName) {
  const definitions = {
    'Budget': {sheet: 'Budget', idHeader: 'Budget ID'},
    'Meals': {sheet: 'Meals', idHeader: 'Meal ID'},
    'Grocery List': {sheet: 'Grocery List', idHeader: 'Grocery ID'},
    'Itinerary': {sheet: 'Itinerary', idHeader: 'Itinerary ID'}
  };

  const definition = definitions[String(plannerName || '').trim()];
  if (!definition) throw new Error('Choose a valid planning section.');
  return definition;
}

function deletePlannerItem(plannerName, id) {
  const definition = plannerDefinitionForDelete_(plannerName);
  const result = deletePlannerRecordFast_(
    definition.sheet,
    definition.idHeader,
    id
  );

  if (
    (definition.sheet === 'Itinerary' || definition.sheet === 'Meals') &&
    typeof clearPlannerSocialForItem_ === 'function'
  ) {
    clearPlannerSocialForItem_(definition.sheet, id);
  }

  return result;
}

function deletePlannerRecord_(sheetName, idHeader, id) {
  deleteById_(sheetName, idHeader, id);
  return getPortalData();
}

function savePlannerRecord_(sheetName, idHeader, prefix, values) {
  const id = values[idHeader] || uid_(prefix);
  const record = Object.assign({}, values);
  record[idHeader] = id;
  if (values[idHeader]) updateById_(sheetName, idHeader, id, record);
  else appendObject_(sheetName, record);
  return getPortalData();
}

function savePlannerRecordFast_(sheetName, idHeader, prefix, values) {
  values = values || {};

  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  const grid = sheet.getDataRange().getValues();
  const headers = grid[0].map(function (value) {
    return String(value || '').trim();
  });

  const idIndex = headers.indexOf(idHeader);
  if (idIndex < 0) {
    throw new Error(idHeader + ' column was not found.');
  }

  const id = String(values[idHeader] || '').trim() || uid_(prefix);
  const record = Object.assign({}, values);
  record[idHeader] = id;

  const row = headers.map(function (header) {
    return record[header] !== undefined ? record[header] : '';
  });

  let rowNumber = 0;

  for (let r = 1; r < grid.length; r++) {
    if (String(grid[r][idIndex] || '') === id) {
      rowNumber = r + 1;
      break;
    }
  }

  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.getRange(sheet.getLastRow() + 1, 1, headers.length).setValues([row]);
  }

  const response = {};
  headers.forEach(function (header, index) {
    response[header] = serializeValue_(row[index]);
  });

  return response;
}

function deletePlannerRecordFast_(sheetName, idHeader, id) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (value) {
    return String(value || '').trim();
  });

  const idIndex = headers.indexOf(idHeader);
  if (idIndex < 0) {
    throw new Error(idHeader + ' column was not found.');
  }

  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idIndex] || '') === String(id)) {
      sheet.deleteRow(r + 1);
      return {ok:true,id:String(id)};
    }
  }

  throw new Error('The selected record could not be found.');
}
