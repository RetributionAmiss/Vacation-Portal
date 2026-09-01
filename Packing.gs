function packingTravelerMap_() {
  const map = {};
  normalizeTravelerRows_(readSheet_('Travelers')).forEach(function(row) {
    if (String(row.Active || 'Yes').toLowerCase() === 'no') return;
    const id = String(row['Traveler ID'] || '').trim();
    if (id) map[id] = row;
  });
  return map;
}

function packingItem_(id) {
  id = String(id || '').trim();
  if (!id) return null;
  return readSheet_('Packing Items').find(function(row) {
    return String(row['Packing ID'] || '') === id;
  }) || null;
}

function packingScope_(value) {
  return String(value || '').toLowerCase() === 'shared' ? 'Shared' : 'Personal';
}

function packingCategory_(value) {
  const allowed = ['Essentials', 'Clothing', 'Toiletries', 'Gear', 'Food', 'Kids', 'Other'];
  const text = String(value || '').trim();
  return allowed.indexOf(text) >= 0 ? text : 'Other';
}

function getPackingData() {
  ensurePortalSchemaCurrent_();
  return {
    items: readSheet_('Packing Items'),
    serverTime: new Date().toISOString()
  };
}

function savePackingItem(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const travelerId = String(values.travelerId || '').trim();
  assertTravelerSelf_(values.deviceId, travelerId);

  const travelerMap = packingTravelerMap_();
  if (!travelerMap[travelerId]) {
    throw new Error('That traveler is no longer active.');
  }

  const id = String(values.id || '').trim();
  const existing = id ? packingItem_(id) : null;
  if (id && !existing) throw new Error('That packing item could not be found.');

  if (existing && String(existing['Owner Traveler ID'] || '') !== travelerId) {
    throw new Error('TRAVELER_AUTH_REQUIRED: Only the traveler who added this item can edit it.');
  }

  const scope = packingScope_(values.scope);
  const item = String(values.item || '').trim().slice(0, 120);
  if (!item) throw new Error('Enter an item to pack.');

  let bringingTravelerId = String(values.bringingTravelerId || '').trim();
  if (scope === 'Personal') {
    bringingTravelerId = travelerId;
  } else if (bringingTravelerId && !travelerMap[bringingTravelerId]) {
    throw new Error('Choose an active traveler who is bringing this shared item.');
  }

  const now = new Date();
  const record = {
    'Scope': scope,
    'Owner Traveler ID': travelerId,
    'Bringing Traveler ID': bringingTravelerId,
    'Category': packingCategory_(values.category),
    'Item': item,
    'Quantity': String(values.quantity || '').trim().slice(0, 40),
    'Packed': existing ? String(existing.Packed || 'No') : 'No',
    'Notes': String(values.notes || '').trim().slice(0, 500),
    'Updated At': now
  };

  if (existing) {
    updateById_('Packing Items', 'Packing ID', existing['Packing ID'], record);
  } else {
    record['Packing ID'] = uid_('PACK');
    record['Created At'] = now;
    appendObject_('Packing Items', record);
  }

  return getPackingData();
}

function togglePackingItem(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const travelerId = String(values.travelerId || '').trim();
  assertTravelerSelf_(values.deviceId, travelerId);

  const item = packingItem_(values.id);
  if (!item) throw new Error('That packing item could not be found.');

  const scope = packingScope_(item.Scope);
  const ownerId = String(item['Owner Traveler ID'] || '');
  const bringerId = String(item['Bringing Traveler ID'] || '');

  if (scope === 'Personal' && ownerId !== travelerId) {
    throw new Error('TRAVELER_AUTH_REQUIRED: You can only check off your own personal items.');
  }
  if (scope === 'Shared' && ownerId !== travelerId && bringerId && bringerId !== travelerId) {
    throw new Error('TRAVELER_AUTH_REQUIRED: Only the person bringing this shared item can check it off.');
  }

  updateById_('Packing Items', 'Packing ID', item['Packing ID'], {
    'Packed': values.packed ? 'Yes' : 'No',
    'Updated At': new Date()
  });

  return getPackingData();
}

function deletePackingItem(values) {
  ensurePortalSchemaCurrent_();
  values = values || {};

  const travelerId = String(values.travelerId || '').trim();
  assertTravelerSelf_(values.deviceId, travelerId);

  const item = packingItem_(values.id);
  if (!item) return getPackingData();

  if (String(item['Owner Traveler ID'] || '') !== travelerId) {
    throw new Error('TRAVELER_AUTH_REQUIRED: Only the traveler who added this item can delete it.');
  }

  deleteById_('Packing Items', 'Packing ID', item['Packing ID']);
  return getPackingData();
}
