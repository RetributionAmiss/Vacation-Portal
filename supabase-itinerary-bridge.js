import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const domainConfig = config.supabaseDomains && config.supabaseDomains.itinerary || {};
const shadowReadEnabled = domainConfig.shadowRead === true;
const primaryReadEnabled = domainConfig.read === true;
const readEnabled = shadowReadEnabled || primaryReadEnabled;
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();

const REQUEST_TYPE = 'vacation-portal-supabase-itinerary-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_READ = 'itinerary.read';
const AUTH_CLIENT_WAIT_MS = 3000;
const AUTH_CLIENT_POLL_MS = 75;
let fallbackClient = null;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    const error = new Error('Supabase Itinerary bridge is not configured.');
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
    const error = new Error('Sign in to use the Supabase Itinerary data source.');
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
    const multiple = new Error('Multiple active trips are not supported by this Itinerary cutover slice yet.');
    multiple.code = 'multiple_memberships';
    throw multiple;
  }
  return rows[0];
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function normalizeClock(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return String(Number(match[1])).padStart(2, '0') + ':' + match[2];
}

async function readItinerary(activeClient, membership) {
  const { data: itemRows, error: itemError } = await activeClient
    .from('itinerary_items')
    .select('id,legacy_id,event_date,start_time,end_time,activity,location,event_url,assigned_to,cost_cents,cost_per,notes,version')
    .eq('trip_id', membership.trip_id)
    .is('archived_at', null)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false });
  if (itemError) throw itemError;

  const { data: signupRows, error: signupError } = await activeClient
    .from('itinerary_signups')
    .select('id,legacy_id,itinerary_item_id,traveler_id,planned_date,planned_time,created_at,updated_at,version')
    .eq('trip_id', membership.trip_id)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (signupError) throw signupError;

  const { data: commentRows, error: commentError } = await activeClient
    .from('planner_comments')
    .select('id,legacy_id,planner_type,item_id,item_legacy_id,traveler_id,traveler_name,comment,created_at,version')
    .eq('trip_id', membership.trip_id)
    .eq('planner_type', 'Itinerary')
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (commentError) throw commentError;

  const items = Array.isArray(itemRows) ? itemRows : [];
  const signups = Array.isArray(signupRows) ? signupRows : [];
  const comments = Array.isArray(commentRows) ? commentRows : [];
  const itemLegacyById = items.reduce((map, row) => {
    map[String(row.id || '')] = String(row.legacy_id || row.id || '');
    return map;
  }, {});

  const travelerIds = Array.from(new Set(
    signups.concat(comments).map(row => row.traveler_id).filter(Boolean)
  ));
  let travelerById = {};
  if (travelerIds.length) {
    const { data: travelers, error: travelerError } = await activeClient
      .from('travelers')
      .select('id,legacy_id,name')
      .in('id', travelerIds)
      .eq('trip_id', membership.trip_id)
      .is('archived_at', null);
    if (travelerError) throw travelerError;
    travelerById = (travelers || []).reduce((map, traveler) => {
      map[String(traveler.id || '')] = traveler;
      return map;
    }, {});
  }

  return {
    source: 'supabase',
    primary: primaryReadEnabled,
    shadow: shadowReadEnabled && !primaryReadEnabled,
    itinerary: items.map(row => ({
      'Itinerary ID': String(row.legacy_id || row.id || ''),
      'Date': normalizeDate(row.event_date),
      'Start Time': normalizeClock(row.start_time),
      'End Time': normalizeClock(row.end_time),
      'Activity': String(row.activity || ''),
      'Location': String(row.location || ''),
      'Event URL': String(row.event_url || ''),
      'Assigned To': String(row.assigned_to || ''),
      'Cost': Number(row.cost_cents || 0) / 100,
      'Cost Per': String(row.cost_per || ''),
      'Notes': String(row.notes || ''),
      'Version': Number(row.version || 0)
    })),
    itinerarySignups: signups.map(row => {
      const traveler = travelerById[String(row.traveler_id || '')] || {};
      return {
        'Signup ID': String(row.legacy_id || row.id || ''),
        'Itinerary ID': String(itemLegacyById[String(row.itinerary_item_id || '')] || ''),
        'Traveler ID': String(traveler.legacy_id || ''),
        'Planned Date': normalizeDate(row.planned_date),
        'Planned Time': normalizeClock(row.planned_time),
        'Created At': row.created_at || '',
        'Updated At': row.updated_at || '',
        'Version': Number(row.version || 0),
        travelerName: String(traveler.name || traveler.legacy_id || '')
      };
    }),
    plannerComments: comments.map(row => {
      const traveler = travelerById[String(row.traveler_id || '')] || {};
      return {
        'Planner Comment ID': String(row.legacy_id || row.id || ''),
        'Planner Type': 'Itinerary',
        'Item ID': String(row.item_legacy_id || itemLegacyById[String(row.item_id || '')] || ''),
        'Traveler ID': String(traveler.legacy_id || ''),
        'Traveler Name': String(row.traveler_name || traveler.name || traveler.legacy_id || ''),
        'Comment': String(row.comment || ''),
        'Created At': row.created_at || '',
        'Version': Number(row.version || 0),
        travelerName: String(row.traveler_name || traveler.name || traveler.legacy_id || '')
      };
    }),
    membership: {
      role: String(membership.role || 'traveler'),
      travelerLinked: Boolean(membership.traveler_id)
    }
  };
}

async function handleRequest(data) {
  if (!readEnabled) {
    const error = new Error('Supabase Itinerary reads are disabled by the release flag.');
    error.code = 'feature_disabled';
    throw error;
  }
  if (String(data.operation || '') !== OP_READ) {
    const error = new Error('Unsupported Supabase Itinerary operation.');
    error.code = 'unsupported_operation';
    throw error;
  }

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  return readItinerary(activeClient, membership);
}

window.addEventListener('message', event => {
  const data = event && event.data || {};
  if (data.type !== REQUEST_TYPE || !isEligiblePortalRequest(event)) return;
  const requestId = String(data.requestId || '');
  if (!requestId) return;

  Promise.resolve()
    .then(() => handleRequest(data))
    .then(result => reply(event.source, event.origin, {
      requestId,
      ok: true,
      data: result
    }))
    .catch(error => reply(event.source, event.origin, {
      requestId,
      ok: false,
      error: {
        code: String(error && error.code || error && error.name || 'itinerary_read_error'),
        message: String(error && error.message || 'Supabase Itinerary read failed.'),
        primary: primaryReadEnabled,
        shadow: shadowReadEnabled && !primaryReadEnabled
      }
    }));
});
