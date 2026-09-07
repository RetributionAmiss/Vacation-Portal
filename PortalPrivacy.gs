const PORTAL_SHARED_TRAVELER_FIELDS_ = [
  'Traveler ID',
  'Name',
  'Group',
  'Traveler Type',
  'Parent/Guardian ID',
  'Adults',
  'Children',
  'Willing to Share Room',
  'Active'
];

const PORTAL_PRIVATE_TRAVELER_FIELDS_ = [
  'Email',
  'Home Location',
  'Notes'
];

const PORTAL_ORGANIZER_TRAVELER_FIELDS_ = [
  'Price Cap',
  'Cost %',
  'Pay More'
];

function portalPickFields_(row, fields) {
  const source = row || {};
  const result = {};

  (fields || []).forEach(function(field) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  });

  return result;
}

function serializeSharedTraveler_(row) {
  const result = portalPickFields_(row, PORTAL_SHARED_TRAVELER_FIELDS_);

  if (row && Object.prototype.hasOwnProperty.call(row, 'parentName')) {
    result.parentName = row.parentName;
  }

  return result;
}

function serializeTravelerPrivateProfile_(row) {
  return Object.assign(
    {},
    serializeSharedTraveler_(row),
    portalPickFields_(row, PORTAL_PRIVATE_TRAVELER_FIELDS_)
  );
}

function serializeOrganizerTraveler_(row) {
  return Object.assign(
    {},
    serializeTravelerPrivateProfile_(row),
    portalPickFields_(row, PORTAL_ORGANIZER_TRAVELER_FIELDS_)
  );
}

function buildTravelerPrivacyPayload_(rows, viewerTravelerId, organizer) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const viewerId = String(viewerTravelerId || '').trim();
  const viewer = viewerId
    ? normalizedRows.find(function(row) {
        return String(row && row['Traveler ID'] || '') === viewerId;
      }) || null
    : null;

  return {
    travelers: normalizedRows.map(serializeSharedTraveler_),
    travelerPrivate: viewer ? serializeTravelerPrivateProfile_(viewer) : null,
    organizerTravelers: organizer === true
      ? normalizedRows.map(serializeOrganizerTraveler_)
      : []
  };
}

function portalPrivacyTravelerRows_() {
  const rows = normalizeTravelerRows_(readSheet_('Travelers'));
  const byId = {};

  rows.forEach(function(row) {
    byId[String(row['Traveler ID'] || '')] = row;
  });

  rows.forEach(function(row) {
    const parent = byId[String(row['Parent/Guardian ID'] || '')];
    row.parentName = parent ? String(parent.Name || '') : '';
  });

  return rows;
}

function getTravelerPrivateProfile(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const travelerId = String(values.travelerId || '').trim();
  if (!travelerId) throw new Error('Choose your traveler profile first.');

  assertTravelerSelf_(values.deviceId, travelerId);

  const traveler = portalPrivacyTravelerRows_().find(function(row) {
    return String(row['Traveler ID'] || '') === travelerId;
  });

  if (!traveler) throw new Error('That traveler could not be found.');

  return {
    traveler: serializeTravelerPrivateProfile_(traveler),
    serverTime: new Date().toISOString()
  };
}

function getOrganizerTravelerData(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};
  assertOrganizerFromValues_(values);

  return {
    travelers: portalPrivacyTravelerRows_().map(serializeOrganizerTraveler_),
    serverTime: new Date().toISOString()
  };
}
