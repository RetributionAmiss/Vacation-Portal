function importRentalWithGemini_(providerInfo, fastData, importId, cabinId) {
  const apiKey = PropertiesService.getScriptProperties()
    .getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Gemini API key is not configured.');

  const schema = {
    type: 'object',
    properties: {
      propertyName: {type: 'string', description: 'Exact listing name.'},
      nickname: {type: 'string'},
      location: {type: 'string'},
      sleeps: {type: 'number'},
      bedroomCount: {type: 'number'},
      bathroomCount: {type: 'number'},
      totalRentalCost: {
        type: 'number',
        description: 'Date-specific total shown for the supplied dates. Zero if not visible.'
      },
      nightlyRate: {type: 'number'},
      rating: {type: 'number'},
      reviewCount: {type: 'number'},
      imageUrl: {type: 'string'},
      photoUrls: {type: 'array', items: {type: 'string'}},
      description: {type: 'string'},
      amenities: {type: 'array', items: {type: 'string'}},
      cancellationPolicy: {type: 'string'},
      feesAndTaxes: {type: 'string'},
      houseRules: {type: 'array', items: {type: 'string'}},
      parking: {type: 'string'},
      accessibility: {type: 'string'},
      nearbyHighlights: {type: 'array', items: {type: 'string'}},
      checkIn: {type: 'string'},
      checkOut: {type: 'string'},
      minimumAge: {type: 'string'},
      pets: {type: 'string'},
      pool: {type: 'string'},
      hotTub: {type: 'string'},
      theater: {type: 'string'},
      arcade: {type: 'string'},
      kitchen: {type: 'string'},
      laundry: {type: 'string'},
      outdoorSpace: {type: 'string'},
      internet: {type: 'string'},
      latitude: {type: 'number'},
      longitude: {type: 'number'},
      bedrooms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {type: 'string'},
            floor: {type: 'string'},
            beds: {type: 'string'},
            sleeps: {type: 'number'},
            privateBathroom: {type: 'boolean'},
            notes: {type: 'string'}
          },
          required: ['name', 'beds']
        }
      },
      confidence: {
        type: 'object',
        properties: {
          name: {type: 'number'},
          image: {type: 'number'},
          location: {type: 'number'},
          sleeps: {type: 'number'},
          bedrooms: {type: 'number'},
          bathrooms: {type: 'number'},
          price: {type: 'number'},
          rating: {type: 'number'},
          description: {type: 'number'},
          amenities: {type: 'number'},
          roomDetails: {type: 'number'},
          policies: {type: 'number'}
        }
      }
    },
    required: [
      'propertyName', 'location', 'description', 'amenities',
      'photoUrls', 'bedrooms', 'confidence'
    ]
  };

  const compactFastData = {
    propertyName: fastData.propertyName || '',
    location: fastData.location || '',
    sleeps: Number(fastData.sleeps || 0),
    bedroomCount: Number(fastData.bedroomCount || 0),
    bathroomCount: Number(fastData.bathroomCount || 0),
    nightlyRate: Number(fastData.nightlyRate || 0),
    rating: Number(fastData.rating || 0),
    reviewCount: Number(fastData.reviewCount || 0),
    imageUrl: fastData.imageUrl || '',
    photoUrls: (fastData.photoUrls || []).slice(0, 15),
    description: String(fastData.description || '').slice(0, 4000),
    sourceSummary: fastData.sourceSummary || {},
    structuredFragments: fastData.sourceSummary && fastData.sourceSummary.structuredFragments
      ? fastData.sourceSummary.structuredFragments
      : {}
  };

  const urls = uniqueStrings_([
    providerInfo.originalUrl,
    providerInfo.canonicalUrl
  ]);

  const prompt =
    'You are enriching a vacation-rental record for a family trip planner.\n' +
    'Provider: ' + providerInfo.provider + '\n' +
    'Property ID: ' + (providerInfo.propertyId || 'unknown') + '\n' +
    'URLs: ' + urls.join(' and ') + '\n\n' +
    'Use URL Context to inspect both URLs when available. The original URL may ' +
    'contain dates and guest counts needed for pricing. The canonical URL identifies ' +
    'the property. Combine the listing with the conservative public metadata below.\n\n' +
    JSON.stringify(compactFastData) + '\n\n' +
    'Rules:\n' +
    '- Extract only facts supported by the listing or supplied metadata.\n' +
    '- Do not invent prices, ratings, policies, amenities, bedroom layouts, or photos.\n' +
    '- Use zero, empty strings, or empty arrays when information is unavailable.\n' +
    '- totalRentalCost must be the full stay total for the dates in the original URL, ' +
    'not a monthly or crossed-out comparison price.\n' +
    '- Return direct image URLs only when visible in retrieved content.\n' +
    '- Confidence values are 0 to 100 and should reflect evidence quality.';

  const payload = {
    contents: [{
      role: 'user',
      parts: [{text: prompt}]
    }],
    tools: [{url_context: {}}],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };

  const configuredModel =
    getSettings_('Trip')['Gemini Model'] || GEMINI_MODEL;

  const models = uniqueStrings_([
    configuredModel,
    GEMINI_MODEL,
    'gemini-flash-latest',
    'gemini-3.1-flash-lite'
  ]).filter(function (model) {
    // Do not retry retired or restricted legacy models stored in older sheets.
    return !/^gemini-(?:1\.|2\.|3\.5-)/i.test(String(model || ''));
  });

  let lastError = '';
  for (let index = 0; index < models.length; index++) {
    const model = models[index];

    try {
      const response = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(model) +
          ':generateContent?key=' + encodeURIComponent(apiKey),
        {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        }
      );

      const status = response.getResponseCode();
      const body = response.getContentText();

      if (status >= 200 && status < 300) {
        const envelope = JSON.parse(body);
        const text = envelope.candidates &&
          envelope.candidates[0] &&
          envelope.candidates[0].content &&
          envelope.candidates[0].content.parts &&
          envelope.candidates[0].content.parts[0] &&
          envelope.candidates[0].content.parts[0].text;

        if (!text) throw new Error('Gemini returned no rental data.');

        const parsedData = JSON.parse(text);
        const urlContextMetadata =
          (envelope.candidates &&
           envelope.candidates[0] &&
           envelope.candidates[0].urlContextMetadata) ||
          envelope.urlContextMetadata ||
          {};

        appendObject_('AI History', {
          'AI History ID': uid_('AI'),
          'Import ID': importId || '',
          'Cabin ID': cabinId || '',
          'Model': model,
          'Prompt Type': 'Rental Enrichment',
          'Request URLs': urls.join('\n'),
          'Response JSON': JSON.stringify({
            rentalData: parsedData,
            urlContextMetadata: urlContextMetadata
          }).slice(0, MAX_AI_HISTORY_CHARS),
          'Status': 'Success',
          'Error': '',
          'Created At': new Date()
        });

        setSetting_('Trip', 'Gemini Model', model);
        return parsedData;
      }

      lastError = 'Gemini returned HTTP ' + status + ': ' + body.slice(0, 1200);

      appendObject_('AI History', {
        'AI History ID': uid_('AI'),
        'Import ID': importId || '',
        'Cabin ID': cabinId || '',
        'Model': model,
        'Prompt Type': 'Rental Enrichment',
        'Request URLs': urls.join('\n'),
        'Response JSON': String(body).slice(0, MAX_AI_HISTORY_CHARS),
        'Status': 'Error',
        'Error': lastError.slice(0, 5000),
        'Created At': new Date()
      });

      if ([400, 404, 429, 503].indexOf(status) < 0) break;
    } catch (error) {
      lastError = String(error.message || error);
    }
  }

  throw new Error(lastError || 'Gemini could not retrieve the listing.');
}
