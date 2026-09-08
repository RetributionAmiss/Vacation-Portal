import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();
const travelDomainConfig = config.supabaseDomains && config.supabaseDomains.travelPlans || {};
const travelShadowReadEnabled = travelDomainConfig.shadowRead === true;
const travelPrimaryReadEnabled = travelDomainConfig.read === true;
const travelReadEnabled = travelShadowReadEnabled || travelPrimaryReadEnabled;
const travelShadowWriteEnabled = travelDomainConfig.shadowWrite === true;
const travelPrimaryWriteEnabled = travelDomainConfig.write === true;
const travelWriteEnabled = travelShadowWriteEnabled || travelPrimaryWriteEnabled;

const REQUEST_TYPE = 'vacation-portal-supabase-domain-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_READ_TRAVEL = 'travelPlans.read';
const OP_UPSERT_TRAVEL = 'travelPlans.upsert';
const OP_DELETE_TRAVEL = 'travelPlans.delete';
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

  // Apps Script HTML Service itself runs inside an additional Google sandbox
  // iframe. Requests posted from that inner frame reach the PWA as a nested
  // source rather than portalFrame.contentWindow, so validate its Google-hosted
  // origin instead of requiring it to be a direct child frame.
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

  // Normally the account shell owns the one browser client. Keep a fallback so
  // the bridge can still restore the persisted session if module startup
  // ordering delays that shared client beyond the readiness window.
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
    const error = new Error('Supabase domain bridge is not configured.');
    error.code = 'bridge_not_configured';
    throw error;
  }
  return fallbackClient;
}

function normalizeClock(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return ('0' + Number(match[1])).slice(-2) + ':' + match[2];
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

async function currentMembership(activeClient) {
  const { data: sessionData, error: sessionError } = await activeClient.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData && sessionData.session;
  if (!session || !session.user) {
    const error = new Error('Sign in to use the Supabase travel data source.');
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
    const noMembership = new Error('No active trip membership is linked to this account.');
    noMembership.code = 'no_membership';
    throw noMembership;
  }
  if (rows.length > 1) {
    const multiple = new Error('Multiple active trips are not supported by this cutover slice yet.');
    multiple.code = 'multiple_memberships';
    throw multiple;
  }
  return rows[0];
}

async function linkedTraveler(activeClient, membership) {
  if (!membership || !membership.traveler_id) {
    const error = new Error('This account is not linked to a traveler profile.');
    error.code = 'no_traveler_link';
    throw error;
  }

  const { data, error } = await activeClient
    .from('travelers')
    .select('id,legacy_id')
    .eq('id', membership.traveler_id)
    .eq('trip_id', membership.trip_id)
    .is('archived_at', null)
    .limit(1);

  if (error) throw error;
  const traveler = Array.isArray(data) ? data[0] : null;
  if (!traveler) {
    const missing = new Error('The linked traveler profile is unavailable.');
    missing.code = 'traveler_not_found';
    throw missing;
  }
  return traveler;
}

async function readTravelPlansFor(activeClient, membership) {
  const { data: plans, error: planError } = await activeClient
    .from('travel_plans')
    .select('id,legacy_id,trip_id,traveler_id,mode,leaving_from,departure_date,departure_time,arrival_date,arrival_time,travel_details,notes,created_at,updated_at,version')
    .eq('trip_id', membership.trip_id)
    .is('archived_at', null)
    .order('arrival_date', { ascending: true, nullsFirst: false })
    .order('arrival_time', { ascending: true, nullsFirst: false });

  if (planError) throw planError;

  const rows = Array.isArray(plans) ? plans : [];
  const travelerIds = Array.from(new Set(rows.map(row => row.traveler_id).filter(Boolean)));
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
    primary: travelPrimaryReadEnabled,
    plans: rows.map(row => ({
      'Travel Plan ID': String(row.legacy_id || row.id || ''),
      'Traveler ID': String(travelerLegacyById[String(row.traveler_id || '')] || ''),
      'Mode': String(row.mode || 'Driving'),
      'Leaving From': String(row.leaving_from || ''),
      'Departure Date': normalizeDate(row.departure_date),
      'Departure Time': normalizeClock(row.departure_time),
      'Arrival Date': normalizeDate(row.arrival_date),
      'Arrival Time': normalizeClock(row.arrival_time),
      'Travel Details': String(row.travel_details || ''),
      'Notes': String(row.notes || ''),
      'Created At': row.created_at || '',
      'Updated At': row.updated_at || '',
      'Version': Number(row.version || 0)
    })),
    membership: {
      role: String(membership.role || 'traveler'),
      travelerLinked: Boolean(membership.traveler_id)
    }
  };
}

async function readTravelPlans() {
  if (!travelReadEnabled) {
    const disabled = new Error('Supabase travel reads are disabled by the release flag.');
    disabled.code = 'feature_disabled';
    throw disabled;
  }

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  return readTravelPlansFor(activeClient, membership);
}

function assertTravelerMatch(plan, traveler) {
  const requestedTravelerId = String(plan && plan['Traveler ID'] || '').trim();
  const linkedLegacyId = String(traveler && traveler.legacy_id || '').trim();
  if (requestedTravelerId && linkedLegacyId && requestedTravelerId !== linkedLegacyId) {
    const error = new Error('The signed-in traveler does not match this Travel plan.');
    error.code = 'traveler_mismatch';
    throw error;
  }
}

async function upsertTravelPlan(input) {
  if (!travelWriteEnabled) {
    const disabled = new Error('Supabase travel writes are disabled by the release flag.');
    disabled.code = 'feature_disabled';
    throw disabled;
  }

  const plan = input && input.plan || {};
  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  const traveler = await linkedTraveler(activeClient, membership);
  assertTravelerMatch(plan, traveler);

  const arrivalDate = normalizeDate(plan['Arrival Date']);
  if (!arrivalDate) {
    const invalid = new Error('Travel plan arrival date is required.');
    invalid.code = 'invalid_travel_plan';
    throw invalid;
  }

  const row = {
    trip_id: membership.trip_id,
    traveler_id: traveler.id,
    legacy_id: String(plan['Travel Plan ID'] || '').trim() || null,
    mode: String(plan.Mode || 'Driving'),
    leaving_from: String(plan['Leaving From'] || ''),
    departure_date: normalizeDate(plan['Departure Date']) || null,
    departure_time: normalizeClock(plan['Departure Time']) || null,
    arrival_date: arrivalDate,
    arrival_time: normalizeClock(plan['Arrival Time']) || null,
    travel_details: String(plan['Travel Details'] || ''),
    notes: String(plan.Notes || ''),
    archived_at: null
  };

  const { error } = await activeClient
    .from('travel_plans')
    .upsert(row, { onConflict: 'trip_id,traveler_id' });

  if (error) throw error;
  const result = await readTravelPlansFor(activeClient, membership);
  result.mutation = 'upsert';
  result.shadow = travelShadowWriteEnabled && !travelPrimaryWriteEnabled;
  return result;
}

async function deleteTravelPlan(input) {
  if (!travelWriteEnabled) {
    const disabled = new Error('Supabase travel writes are disabled by the release flag.');
    disabled.code = 'feature_disabled';
    throw disabled;
  }

  const plan = input && input.plan || {};
  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  const traveler = await linkedTraveler(activeClient, membership);
  assertTravelerMatch(plan, traveler);

  const { error } = await activeClient
    .from('travel_plans')
    .delete()
    .eq('trip_id', membership.trip_id)
    .eq('traveler_id', traveler.id);

  if (error) throw error;
  const result = await readTravelPlansFor(activeClient, membership);
  result.mutation = 'delete';
  result.shadow = travelShadowWriteEnabled && !travelPrimaryWriteEnabled;
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
    if (operation === OP_READ_TRAVEL) {
      data = await readTravelPlans();
    } else if (operation === OP_UPSERT_TRAVEL) {
      data = await upsertTravelPlan(message.data || {});
    } else if (operation === OP_DELETE_TRAVEL) {
      data = await deleteTravelPlan(message.data || {});
    } else {
      const unsupported = new Error('Unsupported Supabase domain operation.');
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
        message: String(error && error.message || 'Supabase domain request failed.')
      }
    });
  }
}

if (supabaseUrl && publishableKey) {
  window.addEventListener('message', handleRequest);
}
