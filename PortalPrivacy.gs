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
