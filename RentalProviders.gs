function getRentalProviderInfo_(value) {
  let originalUrl = String(value || '').trim();
  if (!originalUrl) throw new Error('Enter a rental URL.');
  if (!/^https?:\/\//i.test(originalUrl)) originalUrl = 'https://' + originalUrl;

  const match = originalUrl.match(/^https?:\/\/([^\/?#]+)([^?#]*)/i);
  if (!match) throw new Error('Enter a valid rental URL.');

  const host = match[1].toLowerCase().replace(/^www\./, '');
  const path = match[2] || '/';
  let provider = 'Other';
  let propertyId = '';
  let canonicalUrl = 'https://' + host + path.replace(/\/+$/, '');

  if (host.indexOf('vrbo.') >= 0) {
    provider = 'Vrbo';
    const idMatch = path.match(/\/(\d{5,})/);
    if (idMatch) {
      propertyId = idMatch[1];
      canonicalUrl = 'https://www.vrbo.com/' + propertyId;
    }
  } else if (host.indexOf('airbnb.') >= 0) {
    provider = 'Airbnb';
    const idMatch = path.match(/\/rooms\/(\d+)/);
    if (idMatch) {
      propertyId = idMatch[1];
      canonicalUrl = 'https://www.airbnb.com/rooms/' + propertyId;
    }
  } else if (host.indexOf('vacasa.') >= 0) {
    provider = 'Vacasa';
  } else if (host.indexOf('booking.') >= 0) {
    provider = 'Booking.com';
  }

  return {
    originalUrl: originalUrl,
    canonicalUrl: canonicalUrl,
    provider: provider,
    propertyId: propertyId
  };
}

function normalizeUrl_(value) {
  return getRentalProviderInfo_(value).canonicalUrl;
}

function fetchRentalHtml_(providerInfo) {
  const urls = [providerInfo.originalUrl, providerInfo.canonicalUrl]
    .filter(function (url, index, array) {
      return url && array.indexOf(url) === index;
    });

  let lastError = '';
  for (let index = 0; index < urls.length; index++) {
    try {
      const response = UrlFetchApp.fetch(urls[index], {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/124.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });

      const status = response.getResponseCode();
      const html = response.getContentText();
      if (status >= 200 && status < 400 && html) {
        return {
          url: urls[index],
          status: status,
          html: html,
          headers: response.getAllHeaders()
        };
      }
      lastError = 'HTTP ' + status;
    } catch (error) {
      lastError = String(error.message || error);
    }
  }

  return {
    url: providerInfo.originalUrl,
    status: 0,
    html: '',
    headers: {},
    error: lastError || 'The listing page could not be fetched.'
  };
}

function decodeHtml_(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003D/g, '=')
    .replace(/\\\//g, '/')
    .trim();
}

function extractMetaMap_(html) {
  const map = {};
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];

  tags.forEach(function (tag) {
    const attrs = {};
    const attrPattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match;
    while ((match = attrPattern.exec(tag))) {
      attrs[String(match[1] || '').toLowerCase()] =
        decodeHtml_(match[2] !== undefined ? match[2] : match[3]);
    }

    const key = attrs.property || attrs.name || attrs.itemprop;
    if (key && attrs.content && !map[key]) map[key] = attrs.content;
  });

  const titleMatch = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) map.title = decodeHtml_(titleMatch[1].replace(/<[^>]+>/g, ''));

  return map;
}

function extractJsonLdObjects_(html) {
  const objects = [];
  const scripts = String(html || '').match(
    /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>[\s\S]*?<\/script>/gi
  ) || [];

  scripts.forEach(function (script) {
    const match = script.match(/>([\s\S]*?)<\/script>/i);
    if (!match) return;
    const raw = decodeHtml_(match[1]).trim();
    if (!raw) return;

    try {
      flattenJsonLd_(JSON.parse(raw), objects);
    } catch (error) {
      // Ignore malformed provider JSON-LD.
    }
  });

  return objects;
}

function flattenJsonLd_(value, target) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach(function (item) { flattenJsonLd_(item, target); });
    return;
  }
  if (typeof value !== 'object') return;

  if (Array.isArray(value['@graph'])) {
    value['@graph'].forEach(function (item) {
      flattenJsonLd_(item, target);
    });
  }

  target.push(value);
}

function extractEmbeddedJsonObjects_(html) {
  const results = [];
  const patterns = [
    /<script\b[^>]*id\s*=\s*(?:"__NEXT_DATA__"|'__NEXT_DATA__')[^>]*>([\s\S]*?)<\/script>/gi,
    /<script\b[^>]*type\s*=\s*(?:"application\/json"|'application\/json')[^>]*>([\s\S]*?)<\/script>/gi
  ];

  patterns.forEach(function (pattern) {
    let match;
    while ((match = pattern.exec(String(html || '')))) {
      const raw = decodeHtml_(match[1]).trim();
      if (!raw || raw.length > 2500000) continue;
      try {
        results.push(JSON.parse(raw));
      } catch (error) {
        // Ignore malformed application state.
      }
    }
  });

  const assignments = [
    /(?:window\.)?__INITIAL_STATE__\s*=\s*({[\s\S]{100,}?});\s*<\/script>/gi,
    /(?:window\.)?__APOLLO_STATE__\s*=\s*({[\s\S]{100,}?});\s*<\/script>/gi
  ];

  assignments.forEach(function (pattern) {
    let match;
    while ((match = pattern.exec(String(html || '')))) {
      const raw = decodeHtml_(match[1]).trim();
      if (!raw || raw.length > 2500000) continue;
      try {
        results.push(JSON.parse(raw));
      } catch (error) {
        // Ignore malformed state assignments.
      }
    }
  });

  return results;
}

function collectStructuredCandidates_(roots) {
  const candidates = {
    names: [],
    descriptions: [],
    locations: [],
    sleeps: [],
    bedrooms: [],
    bathrooms: [],
    ratings: [],
    reviewCounts: [],
    prices: [],
    images: [],
    amenities: [],
    roomObjects: []
  };

  const visited = [];
  let visitedCount = 0;
  const maxVisited = 40000;

  function rememberObject_(object) {
    for (let i = 0; i < visited.length; i++) {
      if (visited[i] === object) return false;
    }
    if (visited.length < 4000) visited.push(object);
    return true;
  }

  function add_(target, value) {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      value.forEach(function (item) { add_(target, item); });
      return;
    }

    if (typeof value === 'object') {
      [
        value.url,
        value.secureUrl,
        value.contentUrl,
        value.src,
        value.href,
        value.uri,
        value.imageUrl,
        value.originalUrl,
        value.mediaUrl,
        value.large,
        value.medium,
        value.small
      ].forEach(function (candidate) {
        if (candidate) add_(target, candidate);
      });
      return;
    }

    const decoded = decodeHtml_(value);
    if (decoded) target.push(decoded);
  }

  function isImageContext_(keyPath) {
    return /(?:^|\.)(?:image|images|photo|photos|picture|pictures|media|gallery|hero|thumbnail|thumbnails)(?:\.|$)/i
      .test(String(keyPath || ''));
  }

  function walk_(value, key, depth, parentPath) {
    if (
      visitedCount++ > maxVisited ||
      depth > 20 ||
      value === null ||
      value === undefined
    ) return;

    const keyPath = parentPath
      ? parentPath + '.' + String(key || '')
      : String(key || '');

    const lowerKey = String(key || '').toLowerCase();
    const imageContext = isImageContext_(keyPath);

    if (Array.isArray(value)) {
      if (imageContext) add_(candidates.images, value);
      value.slice(0, 800).forEach(function (item) {
        walk_(item, key, depth + 1, parentPath);
      });
      return;
    }

    if (typeof value !== 'object') {
      if (/^(name|headline|title|propertyname|listingname)$/.test(lowerKey)) {
        add_(candidates.names, value);
      }
      if (/description|summary|overview/.test(lowerKey)) {
        add_(candidates.descriptions, value);
      }
      if (/location|address|locality|city|region/.test(lowerKey)) {
        add_(candidates.locations, value);
      }
      if (/sleeps|guestcapacity|maxguests|personcapacity|occupancy/.test(lowerKey)) {
        add_(candidates.sleeps, value);
      }
      if (/bedroomcount|numberofbedrooms|bedrooms$/.test(lowerKey)) {
        add_(candidates.bedrooms, value);
      }
      if (/bathroomcount|numberofbathrooms|bathrooms/.test(lowerKey)) {
        add_(candidates.bathrooms, value);
      }
      if (/ratingvalue|averagerating|rating$/.test(lowerKey)) {
        add_(candidates.ratings, value);
      }
      if (/reviewcount|ratingcount|numberofreviews/.test(lowerKey)) {
        add_(candidates.reviewCounts, value);
      }
      if (/price|amount|total|nightly/.test(lowerKey)) {
        add_(candidates.prices, value);
      }

      if (
        imageContext ||
        (
          /^(?:url|src|href|uri|secureurl|contenturl|imageurl|originalurl|mediaurl)$/
            .test(lowerKey) &&
          /https?:|\\u002f|\\\//i.test(String(value || ''))
        )
      ) {
        add_(candidates.images, value);
      }

      if (/amenit|feature|facility/.test(lowerKey)) {
        add_(candidates.amenities, value);
      }
      return;
    }

    if (!rememberObject_(value)) return;

    if (imageContext) add_(candidates.images, value);

    const keys = Object.keys(value);
    const keyText = keys.join(' ').toLowerCase();

    if (
      (/bed|sleep|room/.test(keyText)) &&
      (/name|title|type/.test(keyText)) &&
      (/bed|sleep/.test(keyText))
    ) {
      candidates.roomObjects.push(value);
    }

    keys.slice(0, 800).forEach(function (childKey) {
      walk_(value[childKey], childKey, depth + 1, keyPath);
    });
  }

  (roots || []).forEach(function (root) {
    walk_(root, '', 0, '');
  });

  Object.keys(candidates).forEach(function (key) {
    if (key !== 'roomObjects') {
      candidates[key] = uniqueStrings_(candidates[key]).slice(0, 500);
    }
  });

  candidates.roomObjects = candidates.roomObjects.slice(0, 75);
  return candidates;
}

function firstNumber_(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function firstReasonableNumber_(values, min, max) {
  for (let i = 0; i < (values || []).length; i++) {
    const number = firstNumber_(values[i]);
    if (isFinite(number) && number >= min && number <= max) return number;
  }
  return 0;
}

function firstText_(values) {
  for (let index = 0; index < values.length; index++) {
    const text = String(values[index] || '').trim();
    if (text) return text;
  }
  return '';
}

function uniqueStrings_(values) {
  const seen = {};
  return (values || [])
    .map(function (value) { return String(value || '').trim(); })
    .filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
}

function normalizeImageCandidate_(value) {
  let url = decodeHtml_(value)
    .replace(/^["']|["']$/g, '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\\//g, '/');

  const embedded = url.match(/https?:\/\/[^\s"'<>\\]+/i);
  if (embedded) url = embedded[0];

  url = url
    .replace(/[),;\]}]+$/, '')
    .replace(/&amp;/gi, '&');

  if (!/^https:\/\//i.test(url)) return '';
  if (/sprite|logo|icon|avatar|map|tracking|pixel|analytics/i.test(url)) return '';

  return url;
}

function isTrustedRentalImageUrl_(url) {
  return /(?:trvl-media|expedia|vrbo|homeaway|cloudfront|akamaihd|scene7|imgix)/i
    .test(String(url || '')) ||
    /\/lodging\/|\/property-images\/|\/images\//i.test(String(url || ''));
}

function validateImageUrls_(urls, maxToTest) {
  const candidates = uniqueStrings_((urls || []).map(normalizeImageCandidate_))
    .filter(Boolean)
    .slice(0, maxToTest || 50);

  if (!candidates.length) {
    return {valid: [], diagnostics: [], candidates: []};
  }

  const requests = candidates.map(function (url) {
    return {
      url: url,
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.vrbo.com/'
      }
    };
  });

  const diagnostics = [];
  const valid = [];

  try {
    const responses = UrlFetchApp.fetchAll(requests);

    responses.forEach(function (response, index) {
      const status = response.getResponseCode();
      const headers = response.getAllHeaders();
      const contentType = String(
        headers['Content-Type'] || headers['content-type'] || ''
      ).toLowerCase();
      const contentDisposition = String(
        headers['Content-Disposition'] || headers['content-disposition'] || ''
      ).toLowerCase();

      const isImage =
        /^image\//.test(contentType) ||
        /\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(candidates[index]) ||
        /filename=.*\.(?:jpe?g|png|webp|avif)/i.test(contentDisposition);

      const accepted = status >= 200 && status < 400 && isImage;

      diagnostics.push({
        url: candidates[index],
        status: status,
        contentType: contentType,
        trustedHost: isTrustedRentalImageUrl_(candidates[index]),
        valid: accepted
      });

      if (accepted) valid.push(candidates[index]);
    });
  } catch (error) {
    diagnostics.push({
      url: '',
      status: 0,
      contentType: '',
      trustedHost: false,
      valid: false,
      error: String(error.message || error)
    });
  }

  const trustedFallback = candidates.filter(function (url) {
    return isTrustedRentalImageUrl_(url);
  });

  return {
    valid: uniqueStrings_(valid.concat(trustedFallback)),
    diagnostics: diagnostics,
    candidates: candidates
  };
}


function fetchReaderFallback_(providerInfo) {
  const targetUrl = providerInfo.canonicalUrl || providerInfo.originalUrl;
  const readerUrl = 'https://r.jina.ai/http://' +
    targetUrl.replace(/^https?:\/\//i, '');

  try {
    const response = UrlFetchApp.fetch(readerUrl, {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        'Accept': 'text/plain,text/markdown;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const status = response.getResponseCode();
    const content = response.getContentText();

    return {
      url: readerUrl,
      status: status,
      content: status >= 200 && status < 400 ? content : '',
      error: status >= 200 && status < 400
        ? ''
        : 'Reader fallback returned HTTP ' + status
    };
  } catch (error) {
    return {
      url: readerUrl,
      status: 0,
      content: '',
      error: String(error.message || error)
    };
  }
}

function extractReaderImageUrls_(content) {
  const urls = [];
  const text = String(content || '');

  const markdownImages = text.match(
    /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi
  ) || [];

  markdownImages.forEach(function (match) {
    const urlMatch = match.match(/\((https?:\/\/[^)\s]+)\)/i);
    if (urlMatch) urls.push(urlMatch[1]);
  });

  const vrboMediaUrls = text.match(
    /https?:\/\/media\.vrbo\.com\/lodging\/[^\s"'<>\\)]+/gi
  ) || [];

  vrboMediaUrls.forEach(function (url) {
    urls.push(url);
  });

  return uniqueStrings_(urls)
    .map(normalizeImageCandidate_)
    .filter(Boolean);
}

function preferLargeVrboImage_(url) {
  url = String(url || '');
  if (!/media\.vrbo\.com\/lodging\//i.test(url)) return url;

  const separator = url.indexOf('?') >= 0 ? '&' : '?';

  url = url
    .replace(/([?&])rw=\d+/gi, '$1rw=1200')
    .replace(/([?&])ra=[^&]+/gi, '$1ra=fit')
    .replace(/([?&])impolicy=[^&]+/gi, '$1impolicy=resizecrop');

  if (!/[?&]rw=/i.test(url)) url += separator + 'rw=1200';
  return url;
}

function prioritizePropertyImages_(urls) {
  const normalized = uniqueStrings_((urls || [])
    .map(normalizeImageCandidate_)
    .filter(Boolean)
    .map(preferLargeVrboImage_));

  const property = normalized.filter(function (url) {
    return /media\.vrbo\.com\/lodging\//i.test(url);
  });

  const other = normalized.filter(function (url) {
    return !/media\.vrbo\.com\/lodging\//i.test(url);
  });

  return uniqueStrings_(property.concat(other));
}

function extractFastRentalData_(providerInfo, fetchResult) {
  const html = fetchResult.html || '';
  const readerResult = fetchReaderFallback_(providerInfo);
  const readerContent = readerResult.content || '';
  const readerImages = extractReaderImageUrls_(readerContent);

  const apifyResult = providerInfo.provider === 'Vrbo'
    ? fetchVrboWithApify_(providerInfo)
    : {configured: false, status: 0, items: [], error: ''};
  const apifyData = collectApifyRentalData_(apifyResult.items || []);

  const meta = extractMetaMap_(html);
  const jsonLd = extractJsonLdObjects_(html);
  const embeddedJson = extractEmbeddedJsonObjects_(html);
  const candidates = collectStructuredCandidates_(jsonLd.concat(embeddedJson));

  let primary = {};
  for (let index = 0; index < jsonLd.length; index++) {
    const type = String(jsonLd[index]['@type'] || '').toLowerCase();
    if (
      type.indexOf('lodging') >= 0 ||
      type.indexOf('vacationrental') >= 0 ||
      type.indexOf('product') >= 0 ||
      type.indexOf('accommodation') >= 0 ||
      type.indexOf('house') >= 0
    ) {
      primary = jsonLd[index];
      break;
    }
  }
  if (!Object.keys(primary).length && jsonLd.length) primary = jsonLd[0];

  const offers = primary.offers || {};
  const aggregateRating = primary.aggregateRating || {};
  const address = primary.address || {};
  const images = [];

  function addImages(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(addImages);
    } else if (typeof value === 'object') {
      addImages(value.url || value.contentUrl || value.src);
    } else {
      const text = normalizeImageCandidate_(value);
      if (text) images.push(text);
    }
  }

  addImages(apifyData.photoUrls || []);
  addImages(readerImages);
  addImages(primary.image);
  addImages(meta['og:image']);
  addImages(meta['twitter:image']);
  addImages(candidates.images);

  const broadImageMatches = html.match(
    /https?:\\?\/\\?\/[^"'<>\\\s]+?(?:\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'<>\\\s]*)?|\/images?\/[^"'<>\\\s]+|\/lodging\/[^"'<>\\\s]+)/gi
  ) || [];
  broadImageMatches.slice(0, 250).forEach(addImages);

  const prioritizedImages = prioritizePropertyImages_(images);
  const imageValidation = validateImageUrls_(prioritizedImages, 80);

  const bodyText = decodeHtml_(
    html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  );

  const bedroomMatch = bodyText.match(/(\d+(?:\.\d+)?)\s+bedrooms?\b/i);
  const bathroomMatch = bodyText.match(/(\d+(?:\.\d+)?)\s+bathrooms?\b/i);
  const sleepsMatch = bodyText.match(/sleeps?\s+(\d+)|(\d+)\s+guests?\b/i);

  const location = typeof address === 'string'
    ? address
    : [
        address.addressLocality,
        address.addressRegion,
        address.addressCountry
      ].filter(Boolean).join(', ');

  const amenities = uniqueStrings_(
    candidates.amenities.concat(
      bodyText.match(
        /(?:private\s+)?(?:indoor\s+|outdoor\s+|heated\s+)*(?:pool|hot tubs?|spa|home theater|movie theater|arcade|game room|pool table|foosball|air hockey|wifi|parking|fireplace|grill)/gi
      ) || []
    )
  ).slice(0, 80);

  const rating = sanitizeRating_(
    firstReasonableNumber_([
      aggregateRating.ratingValue,
      meta.rating
    ].concat(candidates.ratings), 0, 10),
    providerInfo.provider
  );

  const price = firstReasonableNumber_(
    [offers.price, meta['product:price:amount']].concat(candidates.prices),
    1,
    100000
  );

  return deriveFeatureDetails_({
    propertyName: firstText_([
      apifyData.propertyName,
      primary.name,
      meta['og:title'],
      meta['twitter:title'],
      meta.title
    ].concat(candidates.names)).replace(/\s*[|–-]\s*Vrbo.*$/i, '').trim(),
    location: firstText_([
      apifyData.location,
      location,
      meta['og:locality']
    ].concat(candidates.locations)),
    sleeps: firstReasonableNumber_([
      apifyData.sleeps,
      primary.occupancy,
      primary.numberOfRooms,
      sleepsMatch ? sleepsMatch[1] || sleepsMatch[2] : 0
    ].concat(candidates.sleeps), 1, 100),
    bedroomCount: firstReasonableNumber_([
      apifyData.bedroomCount,
      primary.numberOfBedrooms,
      bedroomMatch ? bedroomMatch[1] : 0
    ].concat(candidates.bedrooms), 1, 40),
    bathroomCount: firstReasonableNumber_([
      apifyData.bathroomCount,
      primary.numberOfBathroomsTotal,
      primary.numberOfBathrooms,
      bathroomMatch ? bathroomMatch[1] : 0
    ].concat(candidates.bathrooms), 0.5, 40),
    totalRentalCost: Number(apifyData.totalRentalCost || 0),
    nightlyRate: Number(apifyData.nightlyRate || price || 0),
    rating: Number(apifyData.rating || rating || 0),
    reviewCount: firstReasonableNumber_([
      apifyData.reviewCount,
      aggregateRating.reviewCount,
      aggregateRating.ratingCount
    ].concat(candidates.reviewCounts), 0, 1000000),
    imageUrl: firstText_([
      apifyData.imageUrl,
      prioritizePropertyImages_(imageValidation.valid)[0]
    ]),
    photoUrls: prioritizePropertyImages_(
      (apifyData.photoUrls || []).concat(imageValidation.valid || [])
    ).slice(0, 80),
    description: firstText_([
      apifyData.description,
      primary.description,
      meta.description,
      meta['og:description'],
      meta['twitter:description']
    ].concat(candidates.descriptions)),
    amenities: uniqueStrings_(
      (apifyData.amenities || []).concat(amenities)
    ).slice(0, 150),
    bedrooms: apifyData.bedrooms || [],
    cancellationPolicy: apifyData.cancellationPolicy || '',
    feesAndTaxes: apifyData.feesAndTaxes || '',
    houseRules: apifyData.houseRules || [],
    sourceSummary: {
      fetchedUrl: fetchResult.url || '',
      httpStatus: fetchResult.status || 0,
      readerFallbackUrl: readerResult.url || '',
      readerFallbackStatus: readerResult.status || 0,
      readerFallbackError: readerResult.error || '',
      readerImageCount: readerImages.length,
      apifyExpediaPropertyId: getExpediaPropertyId_(providerInfo.originalUrl) || '',
      apifyConfigured: apifyResult.configured || false,
      apifyQuotaLimited: apifyResult.quotaLimited || false,
      apifyStatus: apifyResult.status || 0,
      apifyError: apifyResult.error || '',
      apifyResponseBody: apifyResult.responseBody || '',
      apifyItemCount: (apifyResult.items || []).length,
      apifyPhotoCount: (apifyData.photoUrls || []).length,
      jsonLdCount: jsonLd.length,
      embeddedJsonCount: embeddedJson.length,
      structuredCandidateCounts: {
        names: candidates.names.length,
        descriptions: candidates.descriptions.length,
        locations: candidates.locations.length,
        sleeps: candidates.sleeps.length,
        bedrooms: candidates.bedrooms.length,
        bathrooms: candidates.bathrooms.length,
        ratings: candidates.ratings.length,
        prices: candidates.prices.length,
        images: candidates.images.length,
        amenities: candidates.amenities.length
      },
      structuredFragments: {
        names: candidates.names.slice(0, 20),
        descriptions: candidates.descriptions.slice(0, 10),
        locations: candidates.locations.slice(0, 20),
        sleeps: candidates.sleeps.slice(0, 20),
        bedrooms: candidates.bedrooms.slice(0, 20),
        bathrooms: candidates.bathrooms.slice(0, 20),
        ratings: candidates.ratings.slice(0, 20),
        reviewCounts: candidates.reviewCounts.slice(0, 20),
        prices: candidates.prices.slice(0, 30),
        images: prioritizePropertyImages_(
          readerImages
            .concat(candidates.images)
            .concat(imageValidation.candidates || [])
        ).slice(0, 150),
        amenities: candidates.amenities.slice(0, 50)
      },
      imageDiagnostics: imageValidation.diagnostics.slice(0, 60),
      metaKeys: Object.keys(meta).slice(0, 50)
    }
  });
}

function sanitizeRating_(value, provider) {
  const rating = Number(value);
  if (!isFinite(rating) || rating <= 0) return 0;

  if (String(provider || '').toLowerCase() === 'vrbo') {
    if (rating > 5) {
      if (rating <= 10) return Math.round((rating / 2) * 10) / 10;
      return 0;
    }
    return Math.round(rating * 10) / 10;
  }

  return rating <= 10 ? Math.round(rating * 10) / 10 : 0;
}

function deriveFeatureDetails_(data) {
  data = data || {};
  const text = (data.amenities || []).concat([
    data.description || '',
    data.pool || '',
    data.hotTub || '',
    data.theater || '',
    data.arcade || ''
  ]).join('\n');

  function firstMatch_(patterns) {
    const lines = text.split(/\r?\n|,\s*/).map(function (line) {
      return String(line || '').trim();
    }).filter(Boolean);

    for (let p = 0; p < patterns.length; p++) {
      for (let i = 0; i < lines.length; i++) {
        if (patterns[p].test(lines[i])) return lines[i];
      }
    }
    return '';
  }

  if (!data.pool) {
    data.pool = firstMatch_([
      /\bprivate\b.*\bpool\b/i,
      /\bindoor\b.*\bpool\b/i,
      /\bheated\b.*\bpool\b/i,
      /\bpool\b/i
    ]);
  }
  if (!data.hotTub) {
    data.hotTub = firstMatch_([/\bhot tubs?\b/i, /\bspa\b/i]);
  }
  if (!data.theater) {
    data.theater = firstMatch_([
      /\bhome theater\b/i,
      /\bmovie theater\b/i,
      /\bcinema\b/i,
      /\btheater room\b/i
    ]);
  }
  if (!data.arcade) {
    data.arcade = firstMatch_([
      /\barcade\b/i,
      /\bvideo games?\b/i,
      /\bgame room\b/i,
      /\bpool table\b/i,
      /\bfoosball\b/i,
      /\bair hockey\b/i
    ]);
  }

  return data;
}
