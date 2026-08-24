const ORGANIZER_AUTH_VERSION_ = 'V4.4.0-alpha1';
const ORGANIZER_AUTH_HASH_PROPERTY_ = 'ORGANIZER_ACCESS_HASH';
const ORGANIZER_AUTH_SALT_PROPERTY_ = 'ORGANIZER_ACCESS_SALT';
const ORGANIZER_SESSION_PREFIX_ = 'ORGANIZER_SESSION_';
const ORGANIZER_SESSION_TTL_MS_ = 12 * 60 * 60 * 1000;

function authHexDigest_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function authRandomToken_() {
  return [
    Utilities.getUuid(),
    Utilities.getUuid(),
    Utilities.getUuid()
  ].join('.');
}

function assertSpreadsheetAdminContext_() {
  // Portal/web-app executions do not have an interactive Spreadsheet UI.
  // Calling getUi() first makes spreadsheet-menu maintenance functions fail
  // before they mutate data when invoked through google.script.run.
  SpreadsheetApp.getUi();
  return true;
}

function organizerAccessConfigured_() {
  const props = PropertiesService.getScriptProperties();
  return Boolean(
    props.getProperty(ORGANIZER_AUTH_HASH_PROPERTY_) &&
    props.getProperty(ORGANIZER_AUTH_SALT_PROPERTY_)
  );
}

function setOrganizerAccessKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Set organizer access key',
    'Enter a private organizer access key. This key is only used to issue secure organizer sessions; the plaintext key is never stored.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const accessKey = String(response.getResponseText() || '').trim();

  if (accessKey.length < 12) {
    ui.alert(
      'Organizer access key',
      'Use at least 12 characters. A longer passphrase is recommended.',
      ui.ButtonSet.OK
    );
    return;
  }

  const salt = Utilities.getUuid() + Utilities.getUuid();
  const hash = authHexDigest_(salt + ':' + accessKey);
  const props = PropertiesService.getScriptProperties();

  props.setProperty(ORGANIZER_AUTH_SALT_PROPERTY_, salt);
  props.setProperty(ORGANIZER_AUTH_HASH_PROPERTY_, hash);
  revokeOrganizerSessions_();

  ui.alert(
    'Organizer access key',
    'Organizer authorization is configured. Existing organizer sessions were revoked.',
    ui.ButtonSet.OK
  );
}

function revokeOrganizerSessions() {
  const ui = SpreadsheetApp.getUi();
  revokeOrganizerSessions_();
  ui.alert(
    'Organizer sessions',
    'All organizer sessions were revoked.',
    ui.ButtonSet.OK
  );
}

function revokeOrganizerSessions_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();

  Object.keys(all).forEach(function(key) {
    if (key.indexOf(ORGANIZER_SESSION_PREFIX_) === 0) {
      props.deleteProperty(key);
    }
  });
}

function verifyOrganizerAccessKey_(accessKey) {
  const props = PropertiesService.getScriptProperties();
  const salt = String(
    props.getProperty(ORGANIZER_AUTH_SALT_PROPERTY_) || ''
  );
  const expected = String(
    props.getProperty(ORGANIZER_AUTH_HASH_PROPERTY_) || ''
  );

  if (!salt || !expected) return false;

  const actual = authHexDigest_(salt + ':' + String(accessKey || ''));
  if (actual.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) {
    mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return mismatch === 0;
}

function createOrganizerSession(accessKey, deviceId) {
  if (!organizerAccessConfigured_()) {
    throw new Error(
      'ORGANIZER_AUTH_NOT_CONFIGURED: Set the organizer access key from the Vacation Portal spreadsheet menu first.'
    );
  }

  if (!verifyOrganizerAccessKey_(accessKey)) {
    throw new Error('ORGANIZER_AUTH_INVALID: The organizer access key is not correct.');
  }

  const normalizedDeviceId = normalizePortalDeviceId_(deviceId);
  const token = authRandomToken_();
  const tokenHash = authHexDigest_(token);
  const expiresAt = Date.now() + ORGANIZER_SESSION_TTL_MS_;

  PropertiesService.getScriptProperties().setProperty(
    ORGANIZER_SESSION_PREFIX_ + tokenHash,
    JSON.stringify({
      expiresAt: expiresAt,
      deviceId: normalizedDeviceId,
      createdAt: new Date().toISOString(),
      version: ORGANIZER_AUTH_VERSION_
    })
  );

  return {
    ok: true,
    token: token,
    expiresAt: new Date(expiresAt).toISOString(),
    deviceId: normalizedDeviceId
  };
}

function organizerSessionRecord_(token) {
  token = String(token || '').trim();
  if (!token) return null;

  const tokenHash = authHexDigest_(token);
  const propertyKey = ORGANIZER_SESSION_PREFIX_ + tokenHash;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(propertyKey);

  if (!raw) return null;

  try {
    const record = JSON.parse(raw);

    if (!record || Number(record.expiresAt || 0) <= Date.now()) {
      props.deleteProperty(propertyKey);
      return null;
    }

    return record;
  } catch (error) {
    props.deleteProperty(propertyKey);
    return null;
  }
}

function assertOrganizer_(token, deviceId) {
  const record = organizerSessionRecord_(token);

  if (!record) {
    throw new Error(
      'ORGANIZER_AUTH_REQUIRED: Organizer authorization is required for this action.'
    );
  }

  const expectedDeviceId = String(record.deviceId || '');
  const suppliedDeviceId = normalizePortalDeviceId_(deviceId);

  if (expectedDeviceId && expectedDeviceId !== suppliedDeviceId) {
    throw new Error(
      'ORGANIZER_AUTH_REQUIRED: This organizer session belongs to a different device.'
    );
  }

  return record;
}

function assertOrganizerFromValues_(values) {
  values = values || {};
  return assertOrganizer_(
    values.organizerToken,
    values.organizerDeviceId
  );
}

function getOrganizerAuthorizationStatus(token, deviceId) {
  const configured = organizerAccessConfigured_();

  if (!configured) {
    return {
      configured: false,
      authorized: false,
      expiresAt: ''
    };
  }

  const record = organizerSessionRecord_(token);
  const suppliedDeviceId = normalizePortalDeviceId_(deviceId);
  const authorized = Boolean(
    record &&
    (!record.deviceId || record.deviceId === suppliedDeviceId)
  );

  return {
    configured: true,
    authorized: authorized,
    expiresAt: authorized
      ? new Date(Number(record.expiresAt)).toISOString()
      : ''
  };
}

function assertTravelerSelf_(deviceId, travelerId) {
  const normalizedDeviceId = normalizePortalDeviceId_(deviceId);
  const id = String(travelerId || '').trim();

  if (!normalizedDeviceId || !id) {
    throw new Error('TRAVELER_AUTH_REQUIRED: This device is not linked to a traveler.');
  }

  const profile = getDeviceTravelerBinding_(normalizedDeviceId);

  if (!profile || String(profile.travelerId || '') !== id) {
    throw new Error(
      'TRAVELER_AUTH_REQUIRED: You can only edit the traveler profile saved to this device.'
    );
  }

  return profile;
}

function organizerTokenFromValues_(values) {
  values = values || {};
  return {
    organizerToken: String(values.organizerToken || ''),
    organizerDeviceId: String(values.organizerDeviceId || '')
  };
}
