import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const domainConfig = config.supabaseDomains && config.supabaseDomains.groceryItems || {};
const primaryReadEnabled = domainConfig.read === true;
const primaryWriteEnabled = domainConfig.write === true;
const shadowReadEnabled = domainConfig.shadowRead === true;
const shadowWriteEnabled = domainConfig.shadowWrite === true;
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();

const REQUEST_TYPE = 'vacation-portal-supabase-groceries-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_STATUS = 'groceries.status';
const OP_READ = 'groceries.read';
const OP_UPSERT = 'groceries.upsert';
const OP_DELETE = 'groceries.delete';
const AUTH_CLIENT_WAIT_MS = 3000;
const AUTH_CLIENT_POLL_MS = 75;
let fallbackClient = null;

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function codedError(code, message) { const error = new Error(message); error.code = code; return error; }
function childFrameForSource(source) {
  try { return Array.from(document.querySelectorAll('iframe')).find(frame => frame.contentWindow === source) || null; }
  catch (error) { return null; }
}
function isTrustedAppsScriptOrigin(origin) {
  try {
    const url = new URL(String(origin || ''));
    if (url.protocol !== 'https:') return false;
    const host = String(url.hostname || '').toLowerCase();
    return host === 'script.google.com' || host === 'script.googleusercontent.com' || host.endsWith('.script.googleusercontent.com') || host.endsWith('-script.googleusercontent.com');
  } catch (error) { return false; }
}
function isEligiblePortalRequest(event) {
  if (!event || !event.source || event.source === window) return false;
  if (childFrameForSource(event.source)) return true;
  return isTrustedAppsScriptOrigin(event.origin);
}
function reply(target, targetOrigin, payload) {
  if (!target || typeof target.postMessage !== 'function') return;
  target.postMessage(Object.assign({ type: RESPONSE_TYPE }, payload), targetOrigin && targetOrigin !== 'null' ? targetOrigin : '*');
}
async function getSupabaseClient() {
  const deadline = Date.now() + AUTH_CLIENT_WAIT_MS;
  while (Date.now() < deadline) {
    if (window.VacationSupabase) return window.VacationSupabase;
    await wait(AUTH_CLIENT_POLL_MS);
  }
  if (!fallbackClient && supabaseUrl && publishableKey) {
    fallbackClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: true }
    });
  }
  if (!fallbackClient) throw codedError('bridge_not_configured', 'Supabase Grocery bridge is not configured.');
  return fallbackClient;
}
async function currentMembership(activeClient) {
  const { data: sessionData, error: sessionError } = await activeClient.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData && sessionData.session;
  if (!session || !session.user) throw codedError('not_signed_in', 'Sign in to use the Supabase Grocery List.');

  const { data, error } = await activeClient
    .from('trip_members')
    .select('trip_id,traveler_id,role')
    .eq('auth_user_id', session.user.id)
    .eq('active', true)
    .is('archived_at', null);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) throw codedError('no_membership', 'No active trip membership is linked to this account.');
  if (rows.length > 1) throw codedError('multiple_memberships', 'Multiple active trips are not supported by Grocery List yet.');
  return rows[0];
}
function membershipResult(membership) {
  return {
    role: String(membership && membership.role || 'traveler'),
    travelerLinked: Boolean(membership && membership.traveler_id)
  };
}
function stableGroceryId(value) {
  const id = String(value || '').trim().toUpperCase();
  if (!/^GROCERY-[A-Z0-9]{10}$/.test(id)) throw codedError('unstable_grocery_id', 'A stable GROCERY ID is required.');
  return id;
}
function expectedVersion(row) {
  const version = Number(row && row.Version || 0);
  return Number.isFinite(version) && version > 0 ? Math.floor(version) : 0;
}
function requireVersion(row) {
  const version = expectedVersion(row);
  if (!version) throw versionConflict();
  return version;
}
function versionConflict() {
  return codedError('grocery_version_conflict', 'This grocery item changed before the request completed. Refresh and review the latest item.');
}
function yesNo(value) {
  return String(value || '').trim().toLowerCase() === 'yes' ? 'Yes' : 'No';
}
async function groceryByLegacy(activeClient, membership, legacyId) {
  const { data, error } = await activeClient
    .from('grocery_items')
    .select('id,legacy_id,version')
    .eq('trip_id', membership.trip_id)
    .eq('legacy_id', legacyId)
    .is('archived_at', null)
    .limit(2);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 1) throw codedError('duplicate_grocery_legacy_id', 'Supabase has duplicate Grocery IDs.');
  return rows[0] || null;
}
async function readGroceries(activeClient, membership) {
  const { data, error } = await activeClient
    .from('grocery_items')
    .select('id,legacy_id,store_section,category,item,quantity,bringing,brought_by,assigned_to,purchased,notes,created_at,updated_at,version')
    .eq('trip_id', membership.trip_id)
    .is('archived_at', null)
    .order('store_section', { ascending: true })
    .order('category', { ascending: true })
    .order('item', { ascending: true })
    .order('legacy_id', { ascending: true });
  if (error) throw error;

  return (data || []).map(row => ({
    'Grocery ID': String(row.legacy_id || row.id || ''),
    'Store Section': String(row.store_section || ''),
    'Category': String(row.category || ''),
    'Item': String(row.item || ''),
    'Quantity': String(row.quantity || ''),
    'Bringing': String(row.bringing || ''),
    'Brought By': String(row.brought_by || ''),
    'Assigned To': String(row.assigned_to || ''),
    'Purchased': row.purchased ? 'Yes' : 'No',
    'Notes': String(row.notes || ''),
    'Created At': row.created_at || '',
    'Updated At': row.updated_at || '',
    'Version': Number(row.version || 0)
  }));
}
async function readBundle(activeClient, membership) {
  return {
    source: 'supabase',
    groceries: await readGroceries(activeClient, membership),
    membership: membershipResult(membership),
    primary: primaryReadEnabled,
    primaryWrite: primaryWriteEnabled
  };
}
async function upsertGrocery(activeClient, membership, input, strictPrimary) {
  const grocery = input && input.grocery || {};
  const legacyId = stableGroceryId(grocery['Grocery ID']);
  const item = String(grocery.Item || '').trim();
  if (!item) throw codedError('grocery_item_required', 'A grocery item name is required.');

  const row = {
    trip_id: membership.trip_id,
    store_section: String(grocery['Store Section'] || '').trim(),
    category: String(grocery.Category || '').trim(),
    item,
    quantity: String(grocery.Quantity || '').trim(),
    bringing: yesNo(grocery.Bringing),
    brought_by: String(grocery['Brought By'] || '').trim(),
    assigned_to: String(grocery['Assigned To'] || '').trim(),
    purchased: yesNo(grocery.Purchased) === 'Yes',
    notes: String(grocery.Notes || ''),
    archived_at: null
  };

  const existing = await groceryByLegacy(activeClient, membership, legacyId);
  const version = expectedVersion(grocery);
  if (existing) {
    let query = activeClient.from('grocery_items').update(row).eq('id', existing.id).eq('trip_id', membership.trip_id);
    if (strictPrimary) query = query.eq('version', requireVersion(grocery));
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (strictPrimary && (!Array.isArray(data) || data.length !== 1)) throw versionConflict();
    return;
  }

  if (strictPrimary && version > 0) throw versionConflict();
  const insertRow = Object.assign({}, row, {
    legacy_id: legacyId,
    created_by: membership.traveler_id || null
  });
  const { error } = await activeClient.from('grocery_items').insert(insertRow);
  if (error) {
    if (String(error.code || '') === '23505') throw versionConflict();
    throw error;
  }
}
async function deleteGrocery(activeClient, membership, input, strictPrimary) {
  const groceryInput = input && input.grocery || {};
  const legacyId = stableGroceryId(groceryInput['Grocery ID'] || input && input.groceryId);
  const grocery = await groceryByLegacy(activeClient, membership, legacyId);
  if (!grocery) {
    if (strictPrimary) throw versionConflict();
    return;
  }

  let query = activeClient.from('grocery_items').delete().eq('id', grocery.id).eq('trip_id', membership.trip_id);
  if (strictPrimary) query = query.eq('version', requireVersion(groceryInput));
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (strictPrimary && (!Array.isArray(data) || data.length !== 1)) throw versionConflict();
}
async function handleRequest(data) {
  const operation = String(data && data.operation || '');
  if (operation === OP_STATUS) {
    return {
      primaryRead: primaryReadEnabled,
      primaryWrite: primaryWriteEnabled,
      shadowRead: shadowReadEnabled && !primaryReadEnabled,
      shadowWrite: shadowWriteEnabled && !primaryWriteEnabled
    };
  }
  if (operation === OP_READ && !primaryReadEnabled && !shadowReadEnabled) {
    throw codedError('feature_disabled', 'Supabase Grocery reads are disabled by the release flag.');
  }
  if ((operation === OP_UPSERT || operation === OP_DELETE) && !primaryWriteEnabled && !shadowWriteEnabled) {
    throw codedError('feature_disabled', 'Supabase Grocery writes are disabled by the release flag.');
  }

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  const strictPrimary = primaryWriteEnabled && String(data && data.writeMode || '') === 'primary';
  const input = data && data.data || {};

  if (operation === OP_UPSERT) await upsertGrocery(activeClient, membership, input, strictPrimary);
  else if (operation === OP_DELETE) await deleteGrocery(activeClient, membership, input, strictPrimary);
  else if (operation !== OP_READ) throw codedError('unsupported_operation', 'Unsupported Supabase Grocery operation.');

  return readBundle(activeClient, membership);
}

window.addEventListener('message', event => {
  const data = event && event.data || {};
  if (data.type !== REQUEST_TYPE || !isEligiblePortalRequest(event)) return;
  const requestId = String(data.requestId || '');
  if (!requestId) return;

  Promise.resolve()
    .then(() => handleRequest(data))
    .then(result => reply(event.source, event.origin, { requestId, ok: true, data: result }))
    .catch(error => reply(event.source, event.origin, {
      requestId,
      ok: false,
      error: {
        code: String(error && error.code || error && error.name || 'groceries_error'),
        message: String(error && error.message || 'Supabase Grocery operation failed.')
      }
    }));
});
