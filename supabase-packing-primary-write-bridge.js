import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();
const packingDomainConfig = config.supabaseDomains && config.supabaseDomains.packingItems || {};
const packingPrimaryWriteEnabled = packingDomainConfig.write === true;

const REQUEST_TYPE = 'vacation-portal-supabase-packing-primary-write-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_STATUS = 'packingItems.primaryWriteStatus';
const OP_UPSERT = 'packingItems.primaryUpsert';
const OP_TOGGLE = 'packingItems.primaryToggle';
const OP_DELETE = 'packingItems.primaryDelete';
const AUTH_CLIENT_WAIT_MS = 3000;
const AUTH_CLIENT_POLL_MS = 75;

let fallbackClient = null;

function childFrameForSource(source) {
  try {
    return Array.from(document.querySelectorAll('iframe')).find(frame => frame.contentWindow === source) || null;
  } catch (error) {
    return null;
  }
}

function isTrustedAppsScriptOrigin(origin) {
  try {
    const url = new URL(String(origin || ''));
    if (url.protocol !== 'https:') return false;
    const host = String(url.hostname || '').toLowerCase();
    return host === 'script.google.com' ||
      host === 'script.googleusercontent.com' ||
      host.endsWith('.script.googleusercontent.com') ||
      host.endsWith('-script.googleusercontent.com');
  } catch (error) {
    return false;
  }
}

function isEligiblePortalRequest(event) {
  if (!event || !event.source || event.source === window) return false;
  if (childFrameForSource(event.source)) return true;
  return isTrustedAppsScriptOrigin(event.origin);
}

function reply(target, targetOrigin, payload) {
  if (!target || typeof target.postMessage !== 'function') return;
  target.postMessage(
    Object.assign({ type: RESPONSE_TYPE }, payload),
    targetOrigin && targetOrigin !== 'null' ? targetOrigin : '*'
  );
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getSupabaseClient() {
  const deadline = Date.now() + AUTH_CLIENT_WAIT_MS;
  while (Date.now() < deadline) {
    if (window.VacationSupabase) return window.VacationSupabase;
    await wait(AUTH_CLIENT_POLL_MS);
  }

  if (!fallbackClient && supabaseUrl && publishableKey) {
    fallbackClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: true
      }
    });
  }

  if (!fallbackClient) {
    const error = new Error('Supabase Packing primary-write bridge is not configured.');
    error.code = 'bridge_not_configured';
    throw error;
  }
  return fallbackClient;
}

async function currentMembership(activeClient) {
  const { data: sessionData, error: sessionError } = await activeClient.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData && sessionData.session;
  if (!session || !session.user) {
    const error = new Error('Sign in to update Packing in Supabase.');
    error.code = 'not_signed_in';
    throw error;
  }

  const { data, error } = await activeClient
    .from('trip_members')
    .select('trip_id,traveler_id,role')
    .eq('auth_user_id', session.user.id)
    .eq('active', true)
    .is('archived_at', null);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    const missing = new Error('No active trip membership is linked to this account.');
    missing.code = 'no_membership';
    throw missing;
  }
  if (rows.length > 1) {
    const multiple = new Error('Multiple active trips are not supported by this cutover slice yet.');
    multiple.code = 'multiple_memberships';
    throw multiple;
  }
  return rows[0];
}

async function travelerIdMap(activeClient, membership, legacyIds) {
  const wanted = Array.from(new Set((legacyIds || [])
    .map(value => String(value || '').trim())
    .filter(Boolean)));
  if (!wanted.length) return {};

  const { data, error } = await activeClient
    .from('travelers')
    .select('id,legacy_id')
    .eq('trip_id', membership.trip_id)
    .in('legacy_id', wanted)
    .is('archived_at', null);

  if (error) throw error;
  return (data || []).reduce((map, traveler) => {
    map[String(traveler.legacy_id || '').trim()] = traveler.id;
    return map;
  }, {});
}

async function readPackingItemsFor(activeClient, membership) {
  const { data: items, error: itemError } = await activeClient
    .from('packing_items')
    .select('id,legacy_id,trip_id,scope,owner_traveler_id,bringing_traveler_id,category,item,quantity,packed,notes,created_at,updated_at,version')
    .eq('trip_id', membership.trip_id)
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (itemError) throw itemError;

  const rows = Array.isArray(items) ? items : [];
  const travelerIds = Array.from(new Set(rows.reduce((all, row) => {
    if (row.owner_traveler_id) all.push(row.owner_traveler_id);
    if (row.bringing_traveler_id) all.push(row.bringing_traveler_id);
    return all;
  }, [])));
  let travelerLegacyById = {};

  if (travelerIds.length) {
    const { data: travelers, error: travelerError } = await activeClient
      .from('travelers')
      .select('id,legacy_id')
      .in('id', travelerIds)
      .eq('trip_id', membership.trip_id)
      .is('archived_at', null);

    if (travelerError) throw travelerError;
    travelerLegacyById = (travelers || []).reduce((map, traveler) => {
      map[String(traveler.id || '')] = String(traveler.legacy_id || '').trim();
      return map;
    }, {});
  }

  return {
    source: 'supabase',
    writePrimary: packingPrimaryWriteEnabled,
    items: rows.map(row => ({
      'Packing ID': String(row.legacy_id || row.id || ''),
      'Scope': String(row.scope || '').toLowerCase() === 'shared' ? 'Shared' : 'Personal',
      'Owner Traveler ID': String(travelerLegacyById[String(row.owner_traveler_id || '')] || ''),
      'Bringing Traveler ID': String(travelerLegacyById[String(row.bringing_traveler_id || '')] || ''),
      'Category': String(row.category || 'Other'),
      'Item': String(row.item || ''),
      'Quantity': row.quantity === null || row.quantity === undefined ? '' : String(row.quantity),
      'Packed': row.packed ? 'Yes' : 'No',
      'Notes': String(row.notes || ''),
      'Created At': row.created_at || '',
      'Updated At': row.updated_at || '',
      'Version': Number(row.version || 0)
    }))
  };
}

function requirePrimaryWrite() {
  if (!packingPrimaryWriteEnabled) {
    const disabled = new Error('Supabase Packing primary writes are disabled by the release flag.');
    disabled.code = 'feature_disabled';
    throw disabled;
  }
}

function requireStablePackingId(item) {
  const packingId = String(item && item['Packing ID'] || '').trim().toUpperCase();
  if (!/^PACK-[A-Z0-9]{10}$/.test(packingId)) {
    const error = new Error('A stable Packing ID is required.');
    error.code = 'packing_id_required';
    throw error;
  }
  return packingId;
}

function expectedVersion(item) {
  const version = Number(item && item.Version || 0);
  return Number.isFinite(version) && version > 0 ? Math.floor(version) : 0;
}

function versionConflict() {
  const error = new Error('Packing item changed on another device. Refresh and try again.');
  error.code = 'packing_version_conflict';
  return error;
}

async function upsertPackingItem(input) {
  requirePrimaryWrite();
  const item = input && input.item || {};
  const packingId = requireStablePackingId(item);
  const ownerLegacyId = String(item['Owner Traveler ID'] || '').trim();
  const bringerLegacyId = String(item['Bringing Traveler ID'] || '').trim();
  if (!ownerLegacyId) {
    const invalid = new Error('Packing item owner is required.');
    invalid.code = 'packing_owner_required';
    throw invalid;
  }

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  const travelerMap = await travelerIdMap(activeClient, membership, [ownerLegacyId, bringerLegacyId]);
  const ownerId = travelerMap[ownerLegacyId];
  const bringerId = bringerLegacyId ? travelerMap[bringerLegacyId] : null;
  if (!ownerId) {
    const missing = new Error('The Packing item owner is not linked to this trip.');
    missing.code = 'packing_owner_not_found';
    throw missing;
  }
  if (bringerLegacyId && !bringerId) {
    const missing = new Error('The selected Packing bringer is not linked to this trip.');
    missing.code = 'packing_bringer_not_found';
    throw missing;
  }

  const row = {
    trip_id: membership.trip_id,
    legacy_id: packingId,
    scope: String(item.Scope || 'Personal').toLowerCase() === 'shared' ? 'shared' : 'personal',
    owner_traveler_id: ownerId,
    bringing_traveler_id: bringerId,
    category: String(item.Category || 'Other'),
    item: String(item.Item || '').trim(),
    quantity: String(item.Quantity === undefined || item.Quantity === null ? '' : item.Quantity).trim(),
    packed: String(item.Packed || 'No') === 'Yes',
    notes: String(item.Notes || '').trim() || null,
    archived_at: null
  };

  if (!row.item) {
    const invalid = new Error('Packing item text is required.');
    invalid.code = 'packing_item_required';
    throw invalid;
  }

  const version = expectedVersion(item);
  if (version > 0) {
    const { data, error } = await activeClient
      .from('packing_items')
      .update(row)
      .eq('trip_id', membership.trip_id)
      .eq('legacy_id', packingId)
      .eq('version', version)
      .select('id');
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) throw versionConflict();
  } else {
    const { error } = await activeClient
      .from('packing_items')
      .upsert(row, { onConflict: 'trip_id,legacy_id' });
    if (error) throw error;
  }

  const result = await readPackingItemsFor(activeClient, membership);
  result.mutation = 'upsert';
  return result;
}

async function togglePackingItem(input) {
  requirePrimaryWrite();
  const item = input && input.item || {};
  const packingId = requireStablePackingId(item);
  const version = expectedVersion(item);
  if (!version) throw versionConflict();

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  const { error } = await activeClient.rpc('set_packing_item_packed', {
    p_trip_id: membership.trip_id,
    p_legacy_id: packingId,
    p_packed: Boolean(input && input.packed),
    p_expected_version: version
  });
  if (error) {
    if (String(error.code || '') === '40001') throw versionConflict();
    throw error;
  }

  const result = await readPackingItemsFor(activeClient, membership);
  result.mutation = 'toggle';
  return result;
}

async function deletePackingItem(input) {
  requirePrimaryWrite();
  const item = input && input.item || {};
  const packingId = requireStablePackingId(item);
  const version = expectedVersion(item);
  if (!version) throw versionConflict();

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  const { data, error } = await activeClient
    .from('packing_items')
    .delete()
    .eq('trip_id', membership.trip_id)
    .eq('legacy_id', packingId)
    .eq('version', version)
    .select('id');

  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) throw versionConflict();

  const result = await readPackingItemsFor(activeClient, membership);
  result.mutation = 'delete';
  return result;
}

async function handleRequest(event) {
  const message = event && event.data || {};
  if (message.type !== REQUEST_TYPE) return;
  if (!isEligiblePortalRequest(event)) return;

  const requestId = String(message.requestId || '').trim();
  const operation = String(message.operation || '').trim();
  if (!requestId) return;

  try {
    let data;
    if (operation === OP_STATUS) {
      data = { writePrimary: packingPrimaryWriteEnabled };
    } else if (operation === OP_UPSERT) {
      data = await upsertPackingItem(message.data || {});
    } else if (operation === OP_TOGGLE) {
      data = await togglePackingItem(message.data || {});
    } else if (operation === OP_DELETE) {
      data = await deletePackingItem(message.data || {});
    } else {
      const unsupported = new Error('Unsupported Supabase Packing primary-write operation.');
      unsupported.code = 'unsupported_operation';
      throw unsupported;
    }

    reply(event.source, event.origin, { requestId, operation, ok: true, data });
  } catch (error) {
    reply(event.source, event.origin, {
      requestId,
      operation,
      ok: false,
      error: {
        code: String(error && error.code || 'bridge_error'),
        message: String(error && error.message || 'Supabase Packing primary-write request failed.')
      }
    });
  }
}

if (supabaseUrl && publishableKey) {
  window.addEventListener('message', handleRequest);
}
