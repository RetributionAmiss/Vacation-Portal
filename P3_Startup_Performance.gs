function p3StartupPerformanceCacheKey_() {
  return 'p3-startup-core-' + String(PORTAL_SCHEMA_VERSION || 'current');
}

function p3StartupPerformanceStripDevice_(payload) {
  const copy = JSON.parse(JSON.stringify(payload || {}));
  delete copy.deviceId;
  delete copy.deviceTravelerId;
  delete copy.deviceTravelerName;
  delete copy.deviceTravelerSavedAt;
  return copy;
}

function p3StartupPerformanceFreshTrip_(payload) {
  payload = payload || {};
  payload.trip = getSettings_('Trip');
  payload.serverTime = new Date().toISOString();
  return payload;
}

function getPortalStartupDataPerformanceFocused(deviceId) {
  ensurePortalSchemaCurrent_();

  const cache = CacheService.getScriptCache();
  const cacheKey = p3StartupPerformanceCacheKey_();
  let payload = null;

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      payload = JSON.parse(cached);
      payload.fromPerformanceCache = true;
    }
  } catch (error) {}

  if (payload) {
    p3StartupPerformanceFreshTrip_(payload);
  } else {
    payload = getPortalStartupData(deviceId);

    // The base startup cache may contain Trip settings that are a few seconds old.
    // Keep first paint responsive without sacrificing final-rental freshness.
    if (payload && payload.fromServerCache) {
      p3StartupPerformanceFreshTrip_(payload);
    }

    try {
      cache.put(
        cacheKey,
        JSON.stringify(p3StartupPerformanceStripDevice_(payload)),
        120
      );
    } catch (error) {}
  }

  const selectedId = finalizedRentalFocusIdFromTrip_(payload && payload.trip);
  if (selectedId) {
    focusPortalPayloadToFinalRental_(payload, selectedId);
  }

  return addDeviceTravelerBindingToPayload_(payload, deviceId);
}
