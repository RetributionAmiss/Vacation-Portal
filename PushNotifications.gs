/**
 * Vacation Portal push notifications.
 * Public OneSignal App ID is stored in Trip -> OneSignal App ID.
 * Secret OneSignal App API key is stored ONLY in Script Properties.
 */

function setOneSignalApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'OneSignal App API key',
    'Paste the App API key from OneSignal → Settings → Keys & IDs. ' +
      'It is stored in Script Properties and is never returned to the browser.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const key = String(response.getResponseText() || '').trim();
  if (!key) {
    safeUiAlert_('OneSignal', 'No API key was saved.');
    return;
  }

  PropertiesService.getScriptProperties()
    .setProperty('ONESIGNAL_APP_API_KEY', key);

  safeUiAlert_(
    'OneSignal',
    'The OneSignal App API key was saved securely in Script Properties.'
  );
}

function getOneSignalStatus(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  const trip = getSettings_('Trip');
  const appId = String(trip['OneSignal App ID'] || '').trim();
  const key = String(
    PropertiesService.getScriptProperties()
      .getProperty('ONESIGNAL_APP_API_KEY') || ''
  ).trim();

  return {
    configured: Boolean(appId && key),
    appIdConfigured: Boolean(appId),
    apiKeyConfigured: Boolean(key),
    pwaUrl: String(trip['PWA URL'] || '').trim()
  };
}

function testOneSignalSetup() {
  const trip = getSettings_('Trip');
  const appId = String(trip['OneSignal App ID'] || '').trim();
  const key = String(
    PropertiesService.getScriptProperties()
      .getProperty('ONESIGNAL_APP_API_KEY') || ''
  ).trim();

  if (!appId) throw new Error('Enter the OneSignal App ID in Trip Settings first.');
  if (!key) throw new Error('Use Vacation Portal → Set OneSignal API key first.');

  safeUiAlert_(
    'OneSignal setup',
    'OneSignal App ID and API key are configured. Install the PWA on a test device and enable notifications before sending a test.'
  );

  return {
    configured: true,
    appIdConfigured: true,
    apiKeyConfigured: true,
    pwaUrl: String(trip['PWA URL'] || '').trim()
  };
}

function sendPortalPushNotification(values) {
  values = values || {};
  assertOrganizerFromValues_(values);

  const title = String(values.title || '').trim().slice(0, 50);
  const message = String(values.message || '').trim().slice(0, 180);
  const audience = String(values.audience || 'everyone').trim();
  const selectedTravelerIds = Array.isArray(values.travelerIds)
    ? values.travelerIds.map(String).filter(Boolean)
    : [];

  if (!title) throw new Error('Enter a notification title.');
  if (!message) throw new Error('Enter a notification message.');

  const trip = getSettings_('Trip');
  const appId = String(trip['OneSignal App ID'] || '').trim();
  const pwaUrl = String(trip['PWA URL'] || '').trim();
  const apiKey = String(
    PropertiesService.getScriptProperties()
      .getProperty('ONESIGNAL_APP_API_KEY') || ''
  ).trim();

  if (!appId) throw new Error('OneSignal App ID is not configured in Trip Settings.');
  if (!apiKey) {
    throw new Error(
      'OneSignal API key is not configured. Use the Vacation Portal spreadsheet menu.'
    );
  }

  const activeTravelers = normalizeTravelerRows_(readSheet_('Travelers'))
    .filter(function(t) {
      return String(t.Active || 'Yes').toLowerCase() !== 'no';
    });

  let targetIds = [];

  if (audience === 'everyone') {
    targetIds = activeTravelers.map(function(t) {
      return String(t['Traveler ID'] || '');
    }).filter(Boolean);
  } else if (audience === 'adults') {
    targetIds = activeTravelers
      .filter(function(t) {
        return String(t['Traveler Type'] || '').toLowerCase() === 'adult';
      })
      .map(function(t) {
        return String(t['Traveler ID'] || '');
      })
      .filter(Boolean);
  } else if (audience === 'selected') {
    const allowed = new Set(activeTravelers.map(function(t) {
      return String(t['Traveler ID'] || '');
    }));
    targetIds = selectedTravelerIds.filter(function(id) {
      return allowed.has(id);
    });
  } else {
    throw new Error('Choose a valid notification audience.');
  }

  targetIds = Array.from(new Set(targetIds));
  if (!targetIds.length) throw new Error('No travelers are selected for this notification.');

  const payload = {
    app_id: appId,
    target_channel: 'push',
    include_aliases: {external_id: targetIds},
    headings: {en: title},
    contents: {en: message}
  };

  if (/^https:\/\//i.test(pwaUrl)) payload.url = pwaUrl;

  const response = UrlFetchApp.fetch(
    'https://api.onesignal.com/notifications',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {Authorization: 'Key ' + apiKey},
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  const bodyText = response.getContentText();
  let body = {};

  try { body = JSON.parse(bodyText || '{}'); }
  catch (ignore) { body = {raw: bodyText}; }

  if (code < 200 || code >= 300) {
    throw new Error(
      'OneSignal returned HTTP ' + code + ': ' +
      String(body.errors || body.raw || bodyText || 'Unknown error')
    );
  }

  return {
    ok: true,
    notificationId: body.id || '',
    targetCount: targetIds.length,
    message: body.id
      ? 'Notification sent to ' + targetIds.length + ' traveler(s).'
      : 'Request accepted, but no subscribed devices matched the selected travelers.'
  };
}
