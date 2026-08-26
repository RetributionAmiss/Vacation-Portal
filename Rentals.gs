function saveCabin_(values) {
  const id = values.id || uid_('CABIN');
  const now = new Date();
  const record = {
    'Cabin ID': id,
    'Provider': String(values.provider || '').trim(),
    'Provider Property ID': String(values.providerPropertyId || '').trim(),
    'Cabin Name': String(values.name || '').trim(),
    'Nickname': String(values.nickname || '').trim(),
    'Rental URL': String(values.url || '').trim(),
    'Original Rental URL': String(values.originalUrl || values.url || '').trim(),
    'Location': String(values.location || '').trim(),
    'Sleeps': Number(values.sleeps || 0),
    'Bedrooms': Number(values.bedrooms || 0),
    'Bathrooms': Number(values.bathrooms || 0),
    'Total Rental Cost': Number(values.totalCost || 0),
    'Nightly Rate': Number(values.nightlyRate || 0),
    'Rating': Number(values.rating || 0),
    'Review Count': Number(values.reviewCount || 0),
    'Image URL': String(values.imageUrl || '').trim(),
    'Photo URLs': normalizeLines_(values.photoUrls),
    'Description': String(values.description || '').trim(),
    'Amenities': normalizeLines_(values.amenities),
    'Cancellation Policy': String(values.cancellationPolicy || '').trim(),
    'Fees and Taxes': String(values.feesAndTaxes || '').trim(),
    'House Rules': normalizeLines_(values.houseRules),
    'Parking': String(values.parking || '').trim(),
    'Accessibility': String(values.accessibility || '').trim(),
    'Nearby Highlights': normalizeLines_(values.nearbyHighlights),
    'Import Stage': String(values.importStage || 'Manual'),
    'Import Confidence': Number(values.importConfidence || 100),
    'Status': String(values.status || 'Candidate'),
    'Submitted By': String(values.submittedBy || '').trim(),
    'Updated At': now,
    'Active': values.active === false ? 'No' : 'Yes'
  };

  if (!record['Cabin Name']) throw new Error('Property name is required.');

  if (values.id) {
    updateById_('Cabins', 'Cabin ID', id, record);
  } else {
    record['Created At'] = now;
    appendObject_('Cabins', record);
  }

  if (values.photoUrls) {
    replaceCabinPhotos_(id, normalizeLines_(values.photoUrls).split('\n'), 'Manual');
  }
  if (values.amenities) {
    replaceCabinAmenities_(id, normalizeLines_(values.amenities).split('\n'), 'Manual');
  }

  saveDerivedCabinDetails_(
    id,
    {
      propertyName: record['Cabin Name'],
      description: record.Description,
      amenities: record.Amenities,
      pool: values.pool,
      hotTub: values.hotTub,
      theater: values.theater,
      arcade: values.arcade
    },
    {
      pool: values.pool,
      hotTub: values.hotTub,
      theater: values.theater,
      arcade: values.arcade
    }
  );

  syncCabinBedroomPlaceholders_(
    id,
    record.Bedrooms,
    record.Bathrooms
  );

  return getPortalData();
}

function archiveCabin_(id) {
  updateById_('Cabins', 'Cabin ID', id, {
    'Active': 'No',
    'Updated At': new Date()
  });
  return getPortalData();
}

function normalizeLines_(value) {
  if (Array.isArray(value)) {
    return value.map(String).map(function (item) {
      return item.trim();
    }).filter(Boolean).join('\n');
  }

  return String(value || '')
    .split(/\r?\n|,\s*/)
    .map(function (item) { return item.trim(); })
    .filter(Boolean)
    .join('\n');
}

function saveBedroom(values) {
  const id = values.id || uid_('ROOM');
  const record = {
    'Bedroom ID': id,
    'Cabin ID': values.cabinId,
    'Bedroom Name': String(values.name || '').trim(),
    'Floor': String(values.floor || '').trim(),
    'Bed Configuration': String(values.beds || '').trim(),
    'Sleeps': Number(values.sleeps || 0),
    'Private Bathroom': values.privateBathroom ? 'Yes' : 'No',
    'Notes': String(values.notes || '').trim()
  };

  if (!record['Cabin ID'] || !record['Bedroom Name']) {
    throw new Error('Cabin and bedroom name are required.');
  }

  if (values.id) updateById_('Bedrooms', 'Bedroom ID', id, record);
  else appendObject_('Bedrooms', record);
  return getPortalData();
}

function deleteBedroom(id) {
  deleteById_('Bedrooms', 'Bedroom ID', id);
  return getPortalData();
}

function reviewCabin_(values) {
  const cabin = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === values.id;
  });
  if (!cabin) throw new Error('Cabin not found.');

  saveCabin_(values);

  const imports = readSheet_('Rental Import').filter(function (row) {
    return row['Cabin ID'] === values.id;
  });

  if (imports.length) {
    const latest = imports[imports.length - 1];
    updateById_('Rental Import', 'Import ID', latest['Import ID'], {
      'Status': 'Imported',
      'Property Name': values.name,
      'Notes': 'Reviewed and completed in the portal.',
      'Updated At': new Date()
    });
  }

  updateById_('Cabins', 'Cabin ID', values.id, {
    'Import Stage': 'Reviewed',
    'Updated At': new Date()
  });

  return getPortalData();
}
