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

const PORTAL_SHARED_IMPORT_FIELDS_ = [
  'Import ID',
  'Provider',
  'Status',
  'Cabin ID',
  'Property Name',
  'Submitted At',
  'Updated At'
];

const PORTAL_SHARED_QUEUE_FIELDS_ = [
  'Queue ID',
  'Import ID',
  'Cabin ID',
  'Provider',
  'Status',
  'Created At',
  'Updated At'
];

const PORTAL_SHARED_CABIN_DETAIL_FIELDS_ = [
  'Detail ID',
  'Cabin ID',
  'Check In',
  'Check Out',
  'Minimum Age',
  'Pets',
  'Pool',
  'Hot Tub',
  'Theater',
  'Arcade',
  'Kitchen',
  'Laundry',
  'Outdoor Space',
  'Internet',
  'Latitude',
  'Longitude',
  'Updated At'
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

function serializeSharedRentalImport_(row) {
  if (!row) return null;
  return portalPickFields_(row, PORTAL_SHARED_IMPORT_FIELDS_);
}

function serializeSharedRentalQueue_(row) {
  if (!row) return null;
  return portalPickFields_(row, PORTAL_SHARED_QUEUE_FIELDS_);
}

function serializeSharedCabinDetail_(row) {
  if (!row) return null;
  return portalPickFields_(row, PORTAL_SHARED_CABIN_DETAIL_FIELDS_);
}

function sanitizeSharedCabin_(cabin) {
  const result = Object.assign({}, cabin || {});

  if (Object.prototype.hasOwnProperty.call(result, 'import')) {
    result.import = serializeSharedRentalImport_(result.import);
  }
  if (Object.prototype.hasOwnProperty.call(result, 'queue')) {
    result.queue = serializeSharedRentalQueue_(result.queue);
  }
  if (Object.prototype.hasOwnProperty.call(result, 'detail')) {
    result.detail = serializeSharedCabinDetail_(result.detail);
  }

  return result;
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

function portalPayloadHasPricingPolicies_(travelers) {
  return (travelers || []).some(function(row) {
    return Object.prototype.hasOwnProperty.call(row || {}, 'Price Cap') ||
      Object.prototype.hasOwnProperty.call(row || {}, 'Cost %') ||
      Object.prototype.hasOwnProperty.call(row || {}, 'Pay More');
  });
}

function sanitizePortalPayloadForViewer_(payload, deviceId) {
  payload = payload || {};
  const result = Object.assign({}, payload);
  const travelers = Array.isArray(payload.travelers) ? payload.travelers : [];

  // Pricing rules are organizer-controlled and must not be copied to every
  // browser. Derive the amounts while the full rows are still server-side,
  // then expose only calculation results.
  if (
    !result.rentalPricing &&
    portalPayloadHasPricingPolicies_(travelers) &&
    typeof buildPortalPricingSnapshot_ === 'function'
  ) {
    result.rentalPricing = buildPortalPricingSnapshot_(payload);
  }

  result.travelers = travelers.map(serializeSharedTraveler_);
  result.travelerPrivate = null;
  result.organizerTravelers = [];

  if (Array.isArray(payload.cabins)) {
    result.cabins = payload.cabins.map(sanitizeSharedCabin_);
  }

  if (Array.isArray(payload.imports)) {
    result.imports = payload.imports.map(serializeSharedRentalImport_);
  }

  if (Array.isArray(payload.importQueue)) {
    result.importQueue = payload.importQueue.map(serializeSharedRentalQueue_);
  }

  if (deviceId && typeof addDeviceTravelerBindingToPayload_ === 'function') {
    addDeviceTravelerBindingToPayload_(result, deviceId);
  }

  return result;
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

function getOrganizerRentalDiagnostics(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};
  assertOrganizerFromValues_(values);

  return {
    imports: readSheet_('Rental Import'),
    importQueue: readSheet_('Rental Import Queue'),
    editQueue: readSheet_('Rental Edit Queue'),
    serverTime: new Date().toISOString()
  };
}
