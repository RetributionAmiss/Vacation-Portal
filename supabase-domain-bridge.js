import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();
const travelReadEnabled = Boolean(
  config.supabaseDomains &&
  config.supabaseDomains.travelPlans &&
  config.supabaseDomains.travelPlans.read === true
);

const REQUEST_TYPE = 'vacation-portal-supabase-domain-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_READ_TRAVEL = 'travelPlans.read';

let client = null;

function childFrameForSource(source) {
  try {
    return Array.from(document.querySelectorAll('iframe')).find(frame => frame.contentWindow === source) || null;
  } catch (error) {
    return null;
  }
}

function reply(target, payload) {
  if (!target || typeof target.postMessage !== 'function') return;
  target.postMessage(Object.assign({ type: RESPONSE_TYPE }, payload), '*');
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

async function currentMembership() {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData && sessionData.session;
  if (!session || !session.user) {
    const error = new Error('Sign in to use the Supabase travel data source.');
    error.code = 'not_signed_in';
    throw error;
  }

  const { data, error } = await client
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

async function readTravelPlans() {
  if (!travelReadEnabled) {
    const disabled = new Error('Supabase travel reads are disabled by the release flag.');
    disabled.code = 'feature_disabled';
    throw disabled;
  }

  const membership = await currentMembership();
  const { data: plans, error: planError } = await client
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
    const { data: travelers, error: travelerError } = await client
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

async function handleRequest(event) {
  const message = event && event.data || {};
  if (message.type !== REQUEST_TYPE) return;

  // Only requests coming from an iframe hosted by this PWA shell are eligible.
  // The Supabase session itself never leaves the top-level PWA.
  if (!childFrameForSource(event.source)) return;

  const requestId = String(message.requestId || '').trim();
  const operation = String(message.operation || '').trim();
  if (!requestId) return;

  try {
    if (!client) throw new Error('Supabase domain bridge is not configured.');
    if (operation !== OP_READ_TRAVEL) {
      const unsupported = new Error('Unsupported Supabase domain operation.');
      unsupported.code = 'unsupported_operation';
      throw unsupported;
    }

    const data = await readTravelPlans();
    reply(event.source, { requestId, operation, ok: true, data });
  } catch (error) {
    reply(event.source, {
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
  client = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  window.addEventListener('message', handleRequest);
}
