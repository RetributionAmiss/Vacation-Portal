function selectRoomPlannerCabin(cabinId) {
  const cabin = readSheet_('Cabins').find(function (row) {
    return row['Cabin ID'] === cabinId &&
      String(row.Active || 'Yes').toLowerCase() !== 'no';
  });

  if (!cabin) throw new Error('Select a valid rental property.');

  setSetting_('Trip', 'Selected Cabin ID', cabinId);
  return getPortalData();
}

function deriveCabinFeatureDetails_(source) {
  source = source || {};

  const amenities = Array.isArray(source.amenities)
    ? source.amenities
    : String(source.amenities || source.Amenities || '')
        .split(/\r?\n|,\s*/)
        .map(function (value) { return value.trim(); })
        .filter(Boolean);

  const textParts = amenities.concat([
    source.propertyName || source['Cabin Name'] || '',
    source.description || source.Description || ''
  ]);

  const text = textParts.join('\n');

  function matchFeature_(patterns, fallback) {
    for (let p = 0; p < patterns.length; p++) {
      for (let i = 0; i < textParts.length; i++) {
        const value = String(textParts[i] || '').trim();
        if (value && patterns[p].test(value)) return value.slice(0, 500);
      }
    }
    return fallback || '';
  }

  return {
    pool:
      source.pool ||
      matchFeature_([
        /\bprivate\b.*\bpool\b/i,
        /\bindoor\b.*\bpool\b/i,
        /\bheated\b.*\bpool\b/i,
        /\bpool\b/i
      ]),
    hotTub:
      source.hotTub ||
      matchFeature_([
        /\bhot tubs?\b/i,
        /\bspa\b/i,
        /\bjacuzzi\b/i
      ]),
    theater:
      source.theater ||
      matchFeature_([
        /\bhome theater\b/i,
        /\bmovie theater\b/i,
        /\btheatre\b/i,
        /\bcinema\b/i,
        /\btheater room\b/i
      ]),
    arcade:
      source.arcade ||
      matchFeature_([
        /\barcade\b/i,
        /\bgame room\b/i,
        /\bgames galore\b/i,
        /\bvideo games?\b/i,
        /\bpool table\b/i,
        /\bfoosball\b/i,
        /\bair hockey\b/i
      ]),
    kitchen:
      source.kitchen ||
      matchFeature_([/\bfull kitchen\b/i, /\bkitchen\b/i]),
    laundry:
      source.laundry ||
      matchFeature_([/\bwasher\b/i, /\bdryer\b/i, /\blaundry\b/i]),
    outdoorSpace:
      source.outdoorSpace ||
      matchFeature_([
        /\bdeck\b/i,
        /\bpatio\b/i,
        /\bpavilion\b/i,
        /\bfire pit\b/i,
        /\boutdoor\b/i
      ]),
    internet:
      source.internet ||
      matchFeature_([/\bwi-?fi\b/i, /\binternet\b/i])
  };
}

function saveDerivedCabinDetails_(cabinId, source, additionalValues) {
  const features = deriveCabinFeatureDetails_(source);
  const existing = readSheet_('Cabin Details').slice().reverse().find(function (row) {
    return row['Cabin ID'] === cabinId;
  }) || {};

  additionalValues = additionalValues || {};

  saveCabinDetail_(cabinId, {
    checkIn: additionalValues.checkIn || existing['Check In'] || '',
    checkOut: additionalValues.checkOut || existing['Check Out'] || '',
    minimumAge: additionalValues.minimumAge || existing['Minimum Age'] || '',
    pets: additionalValues.pets || existing.Pets || '',
    pool: additionalValues.pool || features.pool || existing.Pool || '',
    hotTub:
      additionalValues.hotTub ||
      features.hotTub ||
      existing['Hot Tub'] ||
      '',
    theater:
      additionalValues.theater ||
      features.theater ||
      existing.Theater ||
      '',
    arcade:
      additionalValues.arcade ||
      features.arcade ||
      existing.Arcade ||
      '',
    kitchen:
      additionalValues.kitchen ||
      features.kitchen ||
      existing.Kitchen ||
      '',
    laundry:
      additionalValues.laundry ||
      features.laundry ||
      existing.Laundry ||
      '',
    outdoorSpace:
      additionalValues.outdoorSpace ||
      features.outdoorSpace ||
      existing['Outdoor Space'] ||
      '',
    internet:
      additionalValues.internet ||
      features.internet ||
      existing.Internet ||
      '',
    latitude: additionalValues.latitude || existing.Latitude || '',
    longitude: additionalValues.longitude || existing.Longitude || '',
    rawStructuredData:
      additionalValues.rawStructuredData ||
      existing['Raw Structured Data'] ||
      '',
    confidenceJson:
      additionalValues.confidenceJson ||
      existing['Confidence JSON'] ||
      ''
  });

  return features;
}

function syncCabinBedroomPlaceholders_(cabinId, bedroomCount, bathroomCount) {
  bedroomCount = Math.max(0, Math.floor(Number(bedroomCount || 0)));
  bathroomCount = Math.max(0, Number(bathroomCount || 0));

  if (!cabinId || !bedroomCount) return {created: 0};

  const existing = readSheet_('Bedrooms').filter(function (row) {
    return row['Cabin ID'] === cabinId;
  });

  // Never overwrite imported or manually entered room layouts.
  if (existing.length) return {created: 0, existing: existing.length};

  for (let index = 0; index < bedroomCount; index++) {
    appendObject_('Bedrooms', {
      'Bedroom ID': uid_('ROOM'),
      'Cabin ID': cabinId,
      'Bedroom Name': 'Bedroom ' + (index + 1),
      'Floor': '',
      'Bed Configuration': 'Layout not yet confirmed',
      'Sleeps': 0,
      'Private Bathroom': '',
      'Notes':
        'Placeholder created from the listing total of ' +
        bedroomCount +
        ' bedrooms' +
        (bathroomCount ? ' and ' + bathroomCount + ' bathrooms' : '') +
        '. Edit this room when the detailed layout is confirmed.'
    });
  }

  return {created: bedroomCount};
}

function backfillCabinPlanningDetails_() {
  const cabins = readSheet_('Cabins').filter(function (row) {
    return String(row.Active || 'Yes').toLowerCase() !== 'no';
  });

  let detailsUpdated = 0;
  let roomsCreated = 0;

  cabins.forEach(function (cabin) {
    saveDerivedCabinDetails_(cabin['Cabin ID'], {
      propertyName: cabin['Cabin Name'],
      description: cabin.Description,
      amenities: cabin.Amenities
    });
    detailsUpdated++;

    const result = syncCabinBedroomPlaceholders_(
      cabin['Cabin ID'],
      cabin.Bedrooms,
      cabin.Bathrooms
    );
    roomsCreated += Number(result.created || 0);
  });

  return {
    detailsUpdated: detailsUpdated,
    roomsCreated: roomsCreated
  };
}
