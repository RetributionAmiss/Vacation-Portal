import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const domainConfig = config.supabaseDomains && config.supabaseDomains.meals || {};
const primaryReadEnabled = domainConfig.read === true;
const primaryWriteEnabled = domainConfig.write === true;
const shadowReadEnabled = domainConfig.shadowRead === true;
const shadowWriteEnabled = domainConfig.shadowWrite === true;
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();

const REQUEST_TYPE = 'vacation-portal-supabase-meals-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_STATUS = 'meals.status';
const OP_READ = 'meals.read';
const OP_UPSERT = 'meals.upsert';
const OP_DELETE = 'meals.delete';
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
  while (Date.now() < deadline) { if (window.VacationSupabase) return window.VacationSupabase; await wait(AUTH_CLIENT_POLL_MS); }
  if (!fallbackClient && supabaseUrl && publishableKey) {
    fallbackClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: true } });
  }
  if (!fallbackClient) throw codedError('bridge_not_configured', 'Supabase Meals bridge is not configured.');
  return fallbackClient;
}
async function currentMembership(activeClient) {
  const { data: sessionData, error: sessionError } = await activeClient.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData && sessionData.session;
  if (!session || !session.user) throw codedError('not_signed_in', 'Sign in to use Supabase Meals.');
  const { data, error } = await activeClient.from('trip_members').select('trip_id,traveler_id,role').eq('auth_user_id', session.user.id).eq('active', true).is('archived_at', null);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) throw codedError('no_membership', 'No active trip membership is linked to this account.');
  if (rows.length > 1) throw codedError('multiple_memberships', 'Multiple active trips are not supported by Meals yet.');
  return rows[0];
}
function membershipResult(membership) { return { role: String(membership && membership.role || 'traveler'), travelerLinked: Boolean(membership && membership.traveler_id) }; }
function normalizeDate(value) { const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/); return match ? match[1] : ''; }
function stableMealId(value) {
  const id = String(value || '').trim().toUpperCase();
  if (!/^MEAL-[A-Z0-9]{10}$/.test(id)) throw codedError('unstable_meal_id', 'A stable MEAL ID is required.');
  return id;
}
function expectedVersion(row) { const version = Number(row && row.Version || 0); return Number.isFinite(version) && version > 0 ? Math.floor(version) : 0; }
function requireVersion(row) {
  const version = expectedVersion(row);
  if (!version) throw codedError('meal_version_conflict', 'This meal changed before the request completed. Refresh and review the latest meal.');
  return version;
}
function versionConflict() { return codedError('meal_version_conflict', 'This meal changed before the request completed. Refresh and review the latest meal.'); }
async function mealByLegacy(activeClient, membership, legacyId) {
  const { data, error } = await activeClient.from('meals').select('id,legacy_id,version').eq('trip_id', membership.trip_id).eq('legacy_id', legacyId).is('archived_at', null).limit(2);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 1) throw codedError('duplicate_meal_legacy_id', 'Supabase has duplicate Meal IDs.');
  return rows[0] || null;
}
async function readMeals(activeClient, membership) {
  const { data, error } = await activeClient.from('meals').select('id,legacy_id,meal_date,meal_type,menu,assigned_to,clean_up,notes,created_at,updated_at,version').eq('trip_id', membership.trip_id).is('archived_at', null).order('meal_date', { ascending: true }).order('legacy_id', { ascending: true });
  if (error) throw error;
  return (data || []).map(row => ({
    'Meal ID': String(row.legacy_id || row.id || ''), 'Date': normalizeDate(row.meal_date), 'Meal': String(row.meal_type || ''), 'Menu': String(row.menu || ''),
    'Assigned To': String(row.assigned_to || ''), 'Clean Up': String(row.clean_up || ''), 'Notes': String(row.notes || ''), 'Created At': row.created_at || '', 'Updated At': row.updated_at || '', 'Version': Number(row.version || 0)
  }));
}
async function readBundle(activeClient, membership) {
  return { source: 'supabase', meals: await readMeals(activeClient, membership), membership: membershipResult(membership), primary: primaryReadEnabled, primaryWrite: primaryWriteEnabled };
}
async function upsertMeal(activeClient, membership, input, strictPrimary) {
  const meal = input && input.meal || {};
  const legacyId = stableMealId(meal['Meal ID']);
  const mealType = String(meal.Meal || '').trim();
  const mealDate = normalizeDate(meal.Date);
  if (!mealType) throw codedError('meal_required', 'A meal name is required.');
  if (!mealDate) throw codedError('meal_date_required', 'Choose a vacation day for this meal.');
  const row = { trip_id: membership.trip_id, meal_date: mealDate, meal_type: mealType, menu: String(meal.Menu || ''), assigned_to: String(meal['Assigned To'] || ''), clean_up: String(meal['Clean Up'] || ''), notes: String(meal.Notes || ''), archived_at: null };
  const existing = await mealByLegacy(activeClient, membership, legacyId);
  const version = expectedVersion(meal);
  if (existing) {
    let query = activeClient.from('meals').update(row).eq('id', existing.id).eq('trip_id', membership.trip_id);
    if (strictPrimary) query = query.eq('version', requireVersion(meal));
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (strictPrimary && (!Array.isArray(data) || data.length !== 1)) throw versionConflict();
  } else {
    if (strictPrimary && version > 0) throw versionConflict();
    const { error } = await activeClient.from('meals').insert(Object.assign({}, row, { legacy_id: legacyId }));
    if (error) throw error;
  }
}
async function deleteMeal(activeClient, membership, input, strictPrimary) {
  const mealInput = input && input.meal || {};
  const legacyId = stableMealId(mealInput['Meal ID'] || input && input.mealId);
  const meal = await mealByLegacy(activeClient, membership, legacyId);
  if (!meal) { if (strictPrimary) throw versionConflict(); return; }
  let query = activeClient.from('meals').delete().eq('id', meal.id).eq('trip_id', membership.trip_id);
  if (strictPrimary) query = query.eq('version', requireVersion(mealInput));
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (strictPrimary && (!Array.isArray(data) || data.length !== 1)) throw versionConflict();
  let result = await activeClient.from('planner_comments').delete().eq('trip_id', membership.trip_id).eq('planner_type', 'Meals').eq('item_id', meal.id);
  if (result.error) throw result.error;
  result = await activeClient.from('planner_comments').delete().eq('trip_id', membership.trip_id).eq('planner_type', 'Meals').eq('item_legacy_id', legacyId);
  if (result.error) throw result.error;
}
async function handleRequest(data) {
  const operation = String(data && data.operation || '');
  if (operation === OP_STATUS) return { primaryRead: primaryReadEnabled, primaryWrite: primaryWriteEnabled, shadowRead: shadowReadEnabled && !primaryReadEnabled, shadowWrite: shadowWriteEnabled && !primaryWriteEnabled };
  if (operation === OP_READ && !primaryReadEnabled && !shadowReadEnabled) throw codedError('feature_disabled', 'Supabase Meals reads are disabled by the release flag.');
  if ((operation === OP_UPSERT || operation === OP_DELETE) && !primaryWriteEnabled && !shadowWriteEnabled) throw codedError('feature_disabled', 'Supabase Meals writes are disabled by the release flag.');
  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  const strictPrimary = primaryWriteEnabled && String(data && data.writeMode || '') === 'primary';
  const input = data && data.data || {};
  if (operation === OP_UPSERT) await upsertMeal(activeClient, membership, input, strictPrimary);
  else if (operation === OP_DELETE) await deleteMeal(activeClient, membership, input, strictPrimary);
  else if (operation !== OP_READ) throw codedError('unsupported_operation', 'Unsupported Supabase Meals operation.');
  return readBundle(activeClient, membership);
}
window.addEventListener('message', event => {
  const data = event && event.data || {};
  if (data.type !== REQUEST_TYPE || !isEligiblePortalRequest(event)) return;
  const requestId = String(data.requestId || '');
  if (!requestId) return;
  Promise.resolve().then(() => handleRequest(data)).then(result => reply(event.source, event.origin, { requestId, ok: true, data: result })).catch(error => reply(event.source, event.origin, {
    requestId, ok: false, error: { code: String(error && error.code || error && error.name || 'meals_error'), message: String(error && error.message || 'Supabase Meals operation failed.') }
  }));
});
