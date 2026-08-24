function readSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(value => String(value || '').trim());
  return values.filter(row => row.some(value => value !== '' && value !== null))
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = serializeValue_(row[index]);
      });
      return obj;
    });
}

function serializeValue_(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function appendObject_(sheetName, object) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(value => String(value || '').trim());
  sheet.appendRow(headers.map(header => object[header] !== undefined ? object[header] : ''));
}

function updateById_(sheetName, idHeader, idValue, changes) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(value => String(value || '').trim());
  const idIndex = headers.indexOf(idHeader);
  if (idIndex < 0) throw new Error(idHeader + ' column was not found.');

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idIndex] || '') === String(idValue)) {
      Object.keys(changes).forEach(header => {
        const index = headers.indexOf(header);
        if (index >= 0) sheet.getRange(r + 1, index + 1).setValue(changes[header]);
      });
      return;
    }
  }
  throw new Error('The selected record could not be found.');
}

function deleteById_(sheetName, idHeader, idValue) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idIndex = headers.indexOf(idHeader);
  for (let r = values.length - 1; r >= 1; r--) {
    if (String(values[r][idIndex] || '') === String(idValue)) sheet.deleteRow(r + 1);
  }
}

function uid_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}
