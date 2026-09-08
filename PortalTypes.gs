const PORTAL_DATE_FIELDS_ = [
  'Check In', 'Check Out', 'Due Date', 'Payment Date', 'Date',
  'Planned Date', 'Departure Date', 'Arrival Date'
];
const PORTAL_TIME_FIELDS_ = [
  'Start Time', 'End Time', 'Planned Time', 'Departure Time', 'Arrival Time'
];
const PORTAL_MONEY_FIELDS_ = [
  'Price Cap', 'Total Rental Cost', 'Nightly Rate', 'Fees and Taxes',
  'Amount', 'Booking Total', 'Amount Due', 'Cost', 'Cost Per'
];

function portalFieldType_(header) {
  const name = String(header || '').trim();
  if (!name) return 'unknown';
  if (PORTAL_DATE_FIELDS_.indexOf(name) >= 0) return 'date';
  if (PORTAL_TIME_FIELDS_.indexOf(name) >= 0) return 'time';
  if (/\sAt$/.test(name)) return 'datetime';
  if (PORTAL_MONEY_FIELDS_.indexOf(name) >= 0) return 'money';
  if (/%$/.test(name)) return 'percentage';
  if (/\b(?:Count|Attempts|Rank|Score|Sleeps|Bedrooms|Bathrooms|Quantity|Sort Order|Minimum Age|HTTP Status)\b/.test(name)) {
    return 'number';
  }
  if (/\bID$/.test(name) || / IDs$/.test(name)) return 'id';
  if (/URL$/.test(name) || / URLs$/.test(name)) return 'url';
  return 'unknown';
}

function portalTimeZone_() {
  try {
    if (typeof getSettings_ === 'function') {
      const trip = getSettings_('Trip') || {};
      const configured = String(trip['Time Zone'] || '').trim();
      if (configured) return configured;
    }
  } catch (error) {}

  try {
    if (typeof getSpreadsheet_ === 'function') {
      const spreadsheet = getSpreadsheet_();
      if (spreadsheet && typeof spreadsheet.getSpreadsheetTimeZone === 'function') {
        const spreadsheetTimeZone = String(spreadsheet.getSpreadsheetTimeZone() || '').trim();
        if (spreadsheetTimeZone) return spreadsheetTimeZone;
      }
    }
  } catch (error) {}

  try {
    if (typeof Session !== 'undefined' && Session.getScriptTimeZone) {
      const scriptTimeZone = String(Session.getScriptTimeZone() || '').trim();
      if (scriptTimeZone) return scriptTimeZone;
    }
  } catch (error) {}

  return 'UTC';
}

function portalFormatDate_(value, pattern) {
  if (!(value instanceof Date) || !isFinite(value.getTime())) {
    throw new Error('Enter a valid date or time.');
  }
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    return Utilities.formatDate(value, portalTimeZone_(), pattern);
  }
  if (pattern === 'yyyy-MM-dd') return value.toISOString().slice(0, 10);
  if (pattern === 'HH:mm') return value.toISOString().slice(11, 16);
  return value.toISOString();
}

function portalNormalizeDate_(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (value instanceof Date) return portalFormatDate_(value, 'yyyy-MM-dd');

  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  throw new Error('Enter a valid date in YYYY-MM-DD format.');
}

function portalNormalizeTime_(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (value instanceof Date) return portalFormatDate_(value, 'HH:mm');

  const text = String(value || '').trim();
  const twentyFourHour = text.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (twentyFourHour) {
    return String(Number(twentyFourHour[1])).padStart(2, '0') + ':' + twentyFourHour[2];
  }

  const twelveHour = text.match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*([AP]M)$/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (String(twelveHour[3]).toUpperCase() === 'PM') hour += 12;
    return String(hour).padStart(2, '0') + ':' + twelveHour[2];
  }

  throw new Error('Enter a valid time.');
}

function portalNormalizeDateTime_(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (!isFinite(value.getTime())) throw new Error('Enter a valid date and time.');
    return value.toISOString();
  }

  const parsed = new Date(String(value || '').trim());
  if (!isFinite(parsed.getTime())) throw new Error('Enter a valid date and time.');
  return parsed.toISOString();
}

function portalNormalizePercent_(value, options) {
  options = options || {};
  if (value === '' || value === null || value === undefined) {
    return options.defaultValue === undefined ? 0 : Number(options.defaultValue);
  }
  const numeric = Number(String(value).replace(/%/g, '').trim());
  if (!isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error('Enter a percentage from 0 to 100.');
  }
  return numeric;
}

function portalNormalizeInteger_(value, options) {
  options = options || {};
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) throw new Error('Enter a whole number.');
  if (options.min !== undefined && numeric < Number(options.min)) {
    throw new Error('Enter a value of at least ' + options.min + '.');
  }
  if (options.max !== undefined && numeric > Number(options.max)) {
    throw new Error('Enter a value no greater than ' + options.max + '.');
  }
  return numeric;
}

function portalNormalizeBoolean_(value) {
  if (value === true || value === false) return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (['yes', 'true', '1', 'on'].indexOf(normalized) >= 0) return true;
  if (['no', 'false', '0', 'off', ''].indexOf(normalized) >= 0) return false;
  throw new Error('Enter a valid yes/no value.');
}

function portalNormalizeEnum_(value, allowed, label) {
  const text = String(value || '').trim();
  const choices = Array.isArray(allowed) ? allowed.map(String) : [];
  if (choices.indexOf(text) < 0) {
    throw new Error(String(label || 'Value') + ' must be one of: ' + choices.join(', ') + '.');
  }
  return text;
}

function portalNormalizeId_(value, options) {
  options = options || {};
  const text = String(value || '').trim();
  if (!text && options.allowEmpty === true) return '';
  if (!text || text.length > 120 || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new Error('The record ID is invalid.');
  }
  return text;
}

function portalNormalizeUrl_(value, options) {
  options = options || {};
  const text = String(value || '').trim();
  if (!text && options.allowEmpty !== false) return '';
  if (!/^https?:\/\/[^\s]+$/i.test(text)) throw new Error('Enter a valid http or https URL.');
  return text;
}

function serializeFieldValue_(header, value) {
  if (!(value instanceof Date)) return value;

  const type = portalFieldType_(header);
  if (type === 'date') return portalNormalizeDate_(value);
  if (type === 'time') return portalNormalizeTime_(value);
  return portalNormalizeDateTime_(value);
}
