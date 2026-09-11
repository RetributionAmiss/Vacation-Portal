import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const domainConfig = config.supabaseDomains && config.supabaseDomains.rentals || {};
const shadowReadEnabled = domainConfig.shadowRead === true;
const primaryReadEnabled = domainConfig.read === true;
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();

const REQUEST_TYPE = 'vacation-portal-supabase-rentals-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_STATUS = 'finalizedRental.status';
const OP_READ = 'finalizedRental.read';
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
  return Boolean(childFrameForSource(event.source)) || isTrustedAppsScriptOrigin(event.origin);
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
  if (!fallbackClient) throw codedError('bridge_not_configured', 'Supabase finalized-rental shadow bridge is not configured.');
  return fallbackClient;
}
async function currentMembership(activeClient) {
  const { data: sessionData, error: sessionError } = await activeClient.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData && sessionData.session;
  if (!session || !session.user) throw codedError('not_signed_in', 'Sign in to compare the finalized rental shadow.');

  const { data, error } = await activeClient
    .from('trip_members')
    .select('trip_id,traveler_id,role')
    .eq('auth_user_id', session.user.id)
    .eq('active', true)
    .is('archived_at', null);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) throw codedError('no_membership', 'No active trip membership is linked to this account.');
  if (rows.length > 1) throw codedError('multiple_memberships', 'Multiple active trips are not supported by the finalized-rental shadow yet.');
  return rows[0];
}
function centsToMoney(value) {
  const cents = Number(value || 0);
  return Number.isFinite(cents) ? Math.round(cents) / 100 : 0;
}
function text(value) { return value === null || value === undefined ? '' : String(value); }
function yesNo(value) { return value === false ? 'No' : 'Yes'; }
function rentalDto(row) {
  return {
    'Cabin ID': text(row.legacy_id || row.id),
    'Provider': text(row.provider),
    'Provider Property ID': text(row.provider_property_id),
    'Cabin Name': text(row.name),
    'Nickname': text(row.nickname),
    'Rental URL': text(row.rental_url),
    'Original Rental URL': text(row.original_rental_url),
    'Location': text(row.location),
    'Sleeps': Number(row.sleeps || 0),
    'Bedrooms': Number(row.bedroom_count || 0),
    'Bathrooms': Number(row.bathroom_count || 0),
    'Total Rental Cost': centsToMoney(row.total_rental_cost_cents),
    'Nightly Rate': centsToMoney(row.nightly_rate_cents),
    'Rating': Number(row.rating || 0),
    'Review Count': Number(row.review_count || 0),
    'Image URL': text(row.image_url),
    'Description': text(row.description),
    'Cancellation Policy': text(row.cancellation_policy),
    'Fees and Taxes': text(row.fees_and_taxes),
    'House Rules': text(row.house_rules),
    'Parking': text(row.parking),
    'Accessibility': text(row.accessibility),
    'Nearby Highlights': text(row.nearby_highlights),
    'Import Stage': text(row.import_stage),
    'Import Confidence': Number(row.import_confidence || 0),
    'Status': text(row.status),
    'Active': yesNo(row.active),
    'Version': Number(row.version || 0)
  };
}
async function readFinalizedRental(activeClient, membership, legacyId) {
  const id = String(legacyId || '').trim();
  if (!/^CABIN-[A-Z0-9]+$/i.test(id)) throw codedError('invalid_rental_id', 'A stable CABIN ID is required for finalized-rental shadow comparison.');

  const { data, error } = await activeClient
    .from('rentals')
    .select('id,legacy_id,provider,provider_property_id,name,nickname,rental_url,original_rental_url,location,sleeps,bedroom_count,bathroom_count,total_rental_cost_cents,nightly_rate_cents,rating,review_count,image_url,description,cancellation_policy,fees_and_taxes,house_rules,parking,accessibility,nearby_highlights,import_stage,import_confidence,status,active,version')
    .eq('trip_id', membership.trip_id)
    .eq('legacy_id', id)
    .is('archived_at', null)
    .limit(2);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) throw codedError('finalized_rental_not_seeded', 'The finalized rental has not been seeded into Supabase shadow data yet.');
  if (rows.length > 1) throw codedError('duplicate_rental_legacy_id', 'Supabase has duplicate finalized-rental legacy IDs.');

  return {
    source: 'supabase-shadow',
    primary: false,
    shadow: true,
    rental: rentalDto(rows[0]),
    membership: {
      role: String(membership.role || 'traveler'),
      travelerLinked: Boolean(membership.traveler_id)
    }
  };
}
async function handleRequest(data) {
  const operation = String(data && data.operation || '');
  if (operation === OP_STATUS) {
    return { shadowRead: shadowReadEnabled, primaryRead: primaryReadEnabled, write: false };
  }
  if (operation !== OP_READ) throw codedError('unsupported_operation', 'Unsupported finalized-rental shadow operation.');
  if (!shadowReadEnabled || primaryReadEnabled) throw codedError('feature_disabled', 'Finalized-rental shadow read is not enabled for this release.');

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  return readFinalizedRental(activeClient, membership, data && data.legacyId);
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
        code: String(error && error.code || error && error.name || 'finalized_rental_shadow_error'),
        message: String(error && error.message || 'Supabase finalized-rental shadow read failed.')
      }
    }));
});
