function setApifyApiToken() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Set Apify API token',
    'Paste your Apify API token. It is stored in Apps Script properties.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const token = String(response.getResponseText() || '').trim();
  if (!token) throw new Error('An Apify API token is required.');
  PropertiesService.getScriptProperties().setProperty('APIFY_API_TOKEN', token);
  safeUiAlert_('Apify configured', 'The Apify API token was saved.');
}

function testApifyConnection() {
  assertSpreadsheetAdminContext_();

  const token = PropertiesService.getScriptProperties().getProperty('APIFY_API_TOKEN');
  if (!token) throw new Error('Apify API token is not configured.');

  const response = UrlFetchApp.fetch('https://api.apify.com/v2/users/me', {
    method: 'get',
    muteHttpExceptions: true,
    headers: {'Authorization': 'Bearer ' + token}
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Apify connection failed with HTTP ' + status + ': ' +
      response.getContentText().slice(0, 1000));
  }

  safeUiAlert_('Apify connected', 'The Apify API token is working.');
  return {status: 'ok'};
}

function getExpediaPropertyId_(url) {
  const match = String(url || '').match(/[?&]expediaPropertyId=(\d+)/i);
  return match ? match[1] : '';
}

function getRentalSearchParams_(url) {
  const source = String(url || '');
  const params = {};

  source.replace(/[?&]([^=&]+)=([^&]*)/g, function (_, rawKey, rawValue) {
    try {
      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch (error) {
      params[rawKey] = rawValue;
    }
    return _;
  });

  const childValues = String(params.children || '')
    .split(',')
    .filter(Boolean);

  return {
    checkIn:
      params.chkin ||
      params.d1 ||
      params.startDate ||
      '',
    checkOut:
      params.chkout ||
      params.d2 ||
      params.endDate ||
      '',
    adultsCount: Math.max(1, firstNumber_(params.adults || 2)),
    childrenCount: childValues.length
  };
}

function normalizeMemo23Rating_(rating, scale) {
  rating = Number(rating || 0);
  scale = Number(scale || 0);

  if (!isFinite(rating) || rating <= 0) return 0;
  if (scale > 0 && scale !== 5) {
    return Math.round((rating / scale * 5) * 10) / 10;
  }
  if (rating > 5 && rating <= 10) {
    return Math.round((rating / 2) * 10) / 10;
  }
  return rating <= 5 ? Math.round(rating * 10) / 10 : 0;
}

function isApifyQuotaError_(status, body) {
  const text = String(body || '').toLowerCase();
  return Number(status) === 402 || Number(status) === 429 ||
    /quota|usage limit|limit reached|insufficient funds|not enough credits|monthly limit|compute units|actor memory limit/.test(text);
}

function fetchVrboWithApify_(providerInfo) {
  const token = PropertiesService.getScriptProperties().getProperty('APIFY_API_TOKEN');
  if (!token) {
    return {
      configured: false,
      status: 0,
      items: [],
      error: 'Apify API token is not configured.',
      responseBody: ''
    };
  }

  const actor = PropertiesService.getScriptProperties()
    .getProperty('VRBO_APIFY_ACTOR') || DEFAULT_VRBO_APIFY_ACTOR;

  const listingUrl =
    providerInfo.originalUrl ||
    providerInfo.canonicalUrl;

  const endpoint =
    'https://api.apify.com/v2/acts/' +
    encodeURIComponent(actor) +
    '/run-sync-get-dataset-items?clean=true&format=json&timeout=240';

  const searchParams = getRentalSearchParams_(listingUrl);

  const payload = {
    startUrls: [listingUrl],
    checkIn: searchParams.checkIn || undefined,
    checkOut: searchParams.checkOut || undefined,
    adultsCount: searchParams.adultsCount,
    scrapeAvailability: true,
    includeReviews: false,
    maxItems: 1,
    proxy: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL']
    }
  };

  Object.keys(payload).forEach(function (key) {
    if (payload[key] === undefined || payload[key] === '') delete payload[key];
  });

  try {
    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status < 200 || status >= 300) {
      return {
        configured: true,
        status: status,
        items: [],
        error: body.slice(0, 3000),
        responseBody: body.slice(0, 5000),
        quotaLimited: isApifyQuotaError_(status, body)
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      return {
        configured: true,
        status: status,
        items: [],
        error: 'Apify returned non-JSON output: ' + body.slice(0, 1000),
        responseBody: body.slice(0, 5000),
        quotaLimited: isApifyQuotaError_(status, body)
      };
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];

    return {
      configured: true,
      status: status,
      items: items,
      error: '',
      responseBody: body.slice(0, 5000),
      quotaLimited: false
    };
  } catch (error) {
    return {
      configured: true,
      status: 0,
      items: [],
      error: String(error.message || error),
      responseBody: '',
      quotaLimited: isApifyQuotaError_(0, error && error.message)
    };
  }
}

function collectApifyRentalData_(items) {
  const result = {
    propertyName: '', location: '', sleeps: 0, bedroomCount: 0,
    bathroomCount: 0, totalRentalCost: 0, nightlyRate: 0,
    rating: 0, reviewCount: 0, imageUrl: '', photoUrls: [],
    description: '', amenities: [], bedrooms: [],
    cancellationPolicy: '', feesAndTaxes: '', houseRules: []
  };

  const photos = [];
  const amenities = [];
  const bedrooms = [];
  const visited = [];
  let count = 0;

  function mapMemo23Property_(item) {
    if (!item || typeof item !== 'object') return;
    if (item.kind && String(item.kind).toLowerCase() !== 'property') return;

    const address = item.address || {};
    const rates = item.rates || {};
    const reviewSummary = item.reviews || {};

    result.propertyName =
      item.title ||
      item.headline ||
      result.propertyName;

    result.location =
      address.full ||
      [address.city, address.region, address.country]
        .filter(Boolean).join(', ') ||
      result.location;

    result.sleeps = Number(item.sleeps || result.sleeps || 0);
    result.bedroomCount = Number(item.bedrooms || result.bedroomCount || 0);
    result.bathroomCount = Number(item.bathrooms || result.bathroomCount || 0);

    result.nightlyRate = Number(
      item.pricePerNight ||
      rates.nightlyRate ||
      result.nightlyRate ||
      0
    );

    result.totalRentalCost = Number(
      rates.totalPrice ||
      item.totalPrice ||
      result.totalRentalCost ||
      0
    );

    result.rating = normalizeMemo23Rating_(
      item.rating ||
      reviewSummary.average ||
      0,
      item.ratingScale ||
      reviewSummary.scale ||
      0
    );

    result.reviewCount = Number(
      item.reviewCount ||
      reviewSummary.totalCount ||
      result.reviewCount ||
      0
    );

    result.description =
      item.description ||
      item.headline ||
      result.description;

    addPhoto_(item.photos || item.images || item.imageUrls || item.coverPhoto);
    addAmenity_(item.amenities);

    if (Array.isArray(item.bedroomDetails)) {
      item.bedroomDetails.forEach(function (room, index) {
        bedrooms.push({
          name: String(room.name || room.title || ('Bedroom ' + (index + 1))),
          floor: String(room.floor || ''),
          beds: Array.isArray(room.beds)
            ? room.beds.join(', ')
            : String(room.beds || room.bedConfiguration || ''),
          sleeps: firstNumber_(room.sleeps || room.capacity || 0),
          privateBathroom: Boolean(room.privateBathroom || room.ensuite),
          notes: String(room.notes || '')
        });
      });
    }

    result.cancellationPolicy =
      item.policies && item.policies.cancellation
        ? String(item.policies.cancellation)
        : result.cancellationPolicy || '';

    result.houseRules =
      item.policies && Array.isArray(item.policies.rawText)
        ? item.policies.rawText
        : result.houseRules || [];

    result.feesAndTaxes = [
      rates.cleaningFee ? 'Cleaning fee: ' + rates.cleaningFee : '',
      rates.serviceFee ? 'Service fee: ' + rates.serviceFee : '',
      rates.taxes ? 'Taxes: ' + rates.taxes : ''
    ].filter(Boolean).join('\n');
  }

  function seen_(object) {
    for (let i = 0; i < visited.length; i++) {
      if (visited[i] === object) return true;
    }
    if (visited.length < 3000) visited.push(object);
    return false;
  }

  function addPhoto_(value) {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(addPhoto_);
    if (typeof value === 'object') {
      [
        value.url, value.src, value.href, value.uri, value.imageUrl,
        value.originalUrl, value.large, value.medium, value.small
      ].forEach(addPhoto_);
      return;
    }
    const url = normalizeImageCandidate_(value);
    if (url) photos.push(url);
  }

  function addAmenity_(value) {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(addAmenity_);
    if (typeof value === 'object') {
      return addAmenity_(value.name || value.label || value.title || value.description);
    }
    const text = String(value || '').trim();
    if (text) amenities.push(text);
  }

  function walk_(value, key, depth, path) {
    if (count++ > 50000 || depth > 22 || value === null || value === undefined) return;

    const lowerKey = String(key || '').toLowerCase();
    const keyPath = path ? path + '.' + lowerKey : lowerKey;

    if (Array.isArray(value)) {
      if (/photo|image|media|gallery/.test(keyPath)) addPhoto_(value);
      if (/amenit|feature|facility/.test(keyPath)) addAmenity_(value);
      value.slice(0, 1000).forEach(function (item) {
        walk_(item, key, depth + 1, path);
      });
      return;
    }

    if (typeof value !== 'object') {
      const text = String(value || '').trim();

      if (
        /^(raw|rawjson|raw json|data|payload|response)$/.test(lowerKey) &&
        /^[\[{]/.test(text)
      ) {
        try {
          walk_(JSON.parse(text), lowerKey, depth + 1, keyPath);
          return;
        } catch (error) {}
      }

      if (!result.propertyName && /^(name|title|headline|propertyname|listingname)$/.test(lowerKey)) result.propertyName = text;
      if (!result.description && /^(description|overview|summary)$/.test(lowerKey)) result.description = text;
      if (!result.location && /^(location|address|formattedaddress|city)$/.test(lowerKey)) result.location = text;
      if (!result.sleeps && /sleeps|personcapacity|maxguests|guestcapacity/.test(lowerKey)) result.sleeps = firstNumber_(value);
      if (!result.bedroomCount && /bedroomcount|numberofbedrooms/.test(lowerKey)) result.bedroomCount = firstNumber_(value);
      if (!result.bathroomCount && /bathroomcount|numberofbathrooms/.test(lowerKey)) result.bathroomCount = firstNumber_(value);
      if (!result.rating && /averagerating|ratingvalue|rating$/.test(lowerKey)) result.rating = firstNumber_(value);
      if (!result.reviewCount && /reviewcount|ratingcount/.test(lowerKey)) result.reviewCount = firstNumber_(value);
      if (!result.nightlyRate && /nightlyrate|pricepernight|nightlyprice/.test(lowerKey)) result.nightlyRate = firstNumber_(value);
      if (!result.totalRentalCost && /totalprice|staytotal|totalcost/.test(lowerKey)) result.totalRentalCost = firstNumber_(value);
      if (
        /photo|image|media|gallery|cover/.test(keyPath) ||
        /^(url|src|imageurl|coverphoto|cover photo)$/.test(lowerKey)
      ) addPhoto_(value);
      if (/amenit|feature|facility/.test(keyPath)) addAmenity_(value);
      return;
    }

    if (seen_(value)) return;

    const keys = Object.keys(value);
    const joined = keys.join(' ').toLowerCase();

    if (/bed/.test(joined) && /name|title/.test(joined)) {
      const roomName = value.name || value.title || value.label || '';
      const bedText = value.beds || value.bedTypes || value.bedType ||
        value.description || value.details || '';
      if (roomName || bedText) {
        bedrooms.push({
          name: String(roomName || ('Bedroom ' + (bedrooms.length + 1))),
          floor: String(value.floor || ''),
          beds: Array.isArray(bedText) ? bedText.join(', ') : String(bedText || ''),
          sleeps: firstNumber_(value.sleeps || value.capacity || 0),
          privateBathroom: Boolean(value.privateBathroom || value.ensuite),
          notes: String(value.notes || '')
        });
      }
    }

    keys.slice(0, 1000).forEach(function (childKey) {
      walk_(value[childKey], childKey, depth + 1, keyPath);
    });
  }

  (items || []).forEach(function (item) {
    mapMemo23Property_(item);
    walk_(item, '', 0, '');
  });

  result.photoUrls = prioritizePropertyImages_(photos).slice(0, 80);
  result.imageUrl = result.photoUrls[0] || '';
  result.amenities = uniqueStrings_(amenities).slice(0, 150);
  result.bedrooms = bedrooms.slice(0, 50);
  result.rating = sanitizeRating_(result.rating, 'Vrbo');

  return deriveFeatureDetails_(result);
}
