import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const domainConfig = config.supabaseDomains && config.supabaseDomains.itinerary || {};
const shadowWriteEnabled = domainConfig.shadowWrite === true;
const primaryWriteEnabled = domainConfig.write === true;
const writeEnabled = shadowWriteEnabled || primaryWriteEnabled;
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();

const REQUEST_TYPE = 'vacation-portal-supabase-itinerary-write-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_STATUS = 'itinerary.primaryWriteStatus';
const OP_ITEM_UPSERT = 'itinerary.item.upsert';
const OP_ITEM_DELETE = 'itinerary.item.delete';
const OP_SIGNUP_UPSERT = 'itinerary.signup.upsert';
const OP_SIGNUP_DELETE = 'itinerary.signup.delete';
const OP_COMMENT_INSERT = 'itinerary.comment.insert';
const AUTH_CLIENT_WAIT_MS = 3000;
const AUTH_CLIENT_POLL_MS = 75;
let fallbackClient = null;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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
    throw codedError('bridge_not_configured', 'Supabase Itinerary write bridge is not configured.');
  }
  return fallbackClient;
}

async function currentMembership(activeClient) {
  const { data: sessionData, error: sessionError } = await activeClient.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData && sessionData.session;
  if (!session || !session.user) {
    throw codedError('not_signed_in', 'Sign in to update Itinerary in Supabase.');
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
    throw codedError('no_membership', 'No active trip membership is linked to this account.');
  }
  if (rows.length > 1) {
    throw codedError('multiple_memberships', 'Multiple active trips are not supported by this Itinerary cutover slice yet.');
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

function stableLegacyId(value, prefix) {
  const id = String(value || '').trim().toUpperCase();
  if (!id || id.startsWith('LOCAL-')) {
    throw codedError('unstable_legacy_id', 'A stable legacy ID is required.');
  }
  const expectedPrefix = String(prefix || '').trim().toUpperCase();
  if (expectedPrefix) {
    const pattern = new RegExp('^' + expectedPrefix + '-[A-Z0-9]{10}$');
    if (!pattern.test(id)) {
      throw codedError('unstable_legacy_id', 'A stable ' + expectedPrefix + ' ID is required.');
    }
  }
  return id;
}

function expectedVersion(row) {
  const version = Number(row && row.Version || 0);
  return Number.isFinite(version) && version > 0 ? Math.floor(version) : 0;
}

function versionConflict(label) {
  return codedError(
    'itinerary_version_conflict',
    String(label || 'Itinerary record') + ' changed on another device. Refresh and review the latest version before saving again.'
  );
}

function requireVersion(row, label) {
  const version = expectedVersion(row);
  if (!version) throw versionConflict(label);
  return version;
}

async function itineraryItemByLegacy(activeClient, membership, legacyId, required = true) {
  const { data, error } = await activeClient
    .from('itinerary_items')
    .select('id,legacy_id,version')
    .eq('trip_id', membership.trip_id)
    .eq('legacy_id', legacyId)
    .is('archived_at', null)
    .limit(2);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 1) {
    throw codedError('duplicate_itinerary_legacy_id', 'Supabase has duplicate Itinerary legacy IDs.');
  }
  if (!rows.length && required) {
    throw codedError('itinerary_item_not_found', 'The Supabase Itinerary item could not be resolved.');
  }
  return rows[0] || null;
}

async function travelerByLegacy(activeClient, membership, legacyId) {
  const { data, error } = await activeClient
    .from('travelers')
    .select('id,legacy_id,name')
    .eq('trip_id', membership.trip_id)
    .eq('legacy_id', legacyId)
    .is('archived_at', null)
    .limit(2);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length !== 1) {
    throw codedError('traveler_not_found', 'The Supabase traveler could not be resolved uniquely.');
  }
  return rows[0];
}

async function signupByPair(activeClient, membership, itemId, travelerId) {
  const { data, error } = await activeClient
    .from('itinerary_signups')
    .select('id,legacy_id,version')
    .eq('trip_id', membership.trip_id)
    .eq('itinerary_item_id', itemId)
    .eq('traveler_id', travelerId)
    .is('archived_at', null)
    .limit(2);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 1) {
    throw codedError('duplicate_itinerary_signup', 'Supabase has duplicate activity signups for this traveler.');
  }
  return rows[0] || null;
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
    shadowWrite: shadowWriteEnabled && !primaryWriteEnabled,
    primaryWrite: primaryWriteEnabled,
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
    })
  };
}

async function upsertItineraryItem(activeClient, membership, input, strictPrimary) {
  const item = input && input.item || {};
  const legacyId = stableLegacyId(item['Itinerary ID'], 'PLAN');
  const activity = String(item.Activity || '').trim();
  if (!activity) throw codedError('activity_required', 'An Itinerary activity name is required.');

  const row = {
    trip_id: membership.trip_id,
    event_date: normalizeDate(item.Date) || null,
    start_time: normalizeClock(item['Start Time']) || null,
    end_time: normalizeClock(item['End Time']) || null,
    activity,
    location: String(item.Location || ''),
    event_url: String(item['Event URL'] || ''),
    assigned_to: String(item['Assigned To'] || ''),
    cost_cents: Math.max(0, Math.round(Number(item.Cost || 0) * 100)),
    cost_per: String(item['Cost Per'] || 'Person') || 'Person',
    notes: String(item.Notes || ''),
    archived_at: null
  };

  const existing = await itineraryItemByLegacy(activeClient, membership, legacyId, false);
  const version = expectedVersion(item);
  if (existing) {
    let query = activeClient
      .from('itinerary_items')
      .update(row)
      .eq('id', existing.id)
      .eq('trip_id', membership.trip_id);
    if (strictPrimary) query = query.eq('version', requireVersion(item, 'Itinerary item'));
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (strictPrimary && (!Array.isArray(data) || data.length !== 1)) {
      throw versionConflict('Itinerary item');
    }
  } else {
    if (strictPrimary && version > 0) throw versionConflict('Itinerary item');
    const { error } = await activeClient
      .from('itinerary_items')
      .insert(Object.assign({}, row, { legacy_id: legacyId }));
    if (error) throw error;
  }
}

async function deleteItineraryItem(activeClient, membership, input, strictPrimary) {
  const itemInput = input && input.item || {};
  const legacyId = stableLegacyId(
    itemInput['Itinerary ID'] || input && input.itineraryId,
    'PLAN'
  );
  const item = await itineraryItemByLegacy(activeClient, membership, legacyId, false);
  if (!item) {
    if (strictPrimary) throw versionConflict('Itinerary item');
    return;
  }

  let query = activeClient
    .from('itinerary_items')
    .delete()
    .eq('id', item.id)
    .eq('trip_id', membership.trip_id);
  if (strictPrimary) query = query.eq('version', requireVersion(itemInput, 'Itinerary item'));
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (strictPrimary && (!Array.isArray(data) || data.length !== 1)) {
    throw versionConflict('Itinerary item');
  }

  let result = await activeClient
    .from('planner_comments')
    .delete()
    .eq('trip_id', membership.trip_id)
    .eq('planner_type', 'Itinerary')
    .eq('item_id', item.id);
  if (result.error) throw result.error;

  result = await activeClient
    .from('planner_comments')
    .delete()
    .eq('trip_id', membership.trip_id)
    .eq('planner_type', 'Itinerary')
    .eq('item_legacy_id', legacyId);
  if (result.error) throw result.error;
}

async function upsertItinerarySignup(activeClient, membership, input, strictPrimary) {
  const signup = input && input.signup || {};
  const legacyId = stableLegacyId(signup['Signup ID'], 'SIGNUP');
  const itineraryLegacyId = stableLegacyId(signup['Itinerary ID'], 'PLAN');
  const travelerLegacyId = stableLegacyId(signup['Traveler ID']);
  const item = await itineraryItemByLegacy(activeClient, membership, itineraryLegacyId, true);
  const traveler = await travelerByLegacy(activeClient, membership, travelerLegacyId);

  const row = {
    trip_id: membership.trip_id,
    itinerary_item_id: item.id,
    traveler_id: traveler.id,
    legacy_id: legacyId,
    planned_date: normalizeDate(signup['Planned Date']) || null,
    planned_time: normalizeClock(signup['Planned Time']) || null,
    archived_at: null
  };

  if (strictPrimary) {
    const existing = await signupByPair(activeClient, membership, item.id, traveler.id);
    const version = expectedVersion(signup);
    if (existing) {
      const { data, error } = await activeClient
        .from('itinerary_signups')
        .update(row)
        .eq('id', existing.id)
        .eq('trip_id', membership.trip_id)
        .eq('version', requireVersion(signup, 'Activity signup'))
        .select('id');
      if (error) throw error;
      if (!Array.isArray(data) || data.length !== 1) throw versionConflict('Activity signup');
    } else {
      if (version > 0) throw versionConflict('Activity signup');
      const { error } = await activeClient.from('itinerary_signups').insert(row);
      if (error) {
        if (String(error.code || '') === '23505') throw versionConflict('Activity signup');
        throw error;
      }
    }
    return;
  }

  const { error } = await activeClient
    .from('itinerary_signups')
    .upsert(row, { onConflict: 'itinerary_item_id,traveler_id' });
  if (error) throw error;
}

async function deleteItinerarySignup(activeClient, membership, input, strictPrimary) {
  const signup = input && input.signup || {};
  const itineraryLegacyId = stableLegacyId(
    signup['Itinerary ID'] || input && input.itineraryId,
    'PLAN'
  );
  const travelerLegacyId = stableLegacyId(
    signup['Traveler ID'] || input && input.travelerId
  );
  const item = await itineraryItemByLegacy(activeClient, membership, itineraryLegacyId, false);
  if (!item) {
    if (strictPrimary) throw versionConflict('Activity signup');
    return;
  }
  const traveler = await travelerByLegacy(activeClient, membership, travelerLegacyId);

  let query = activeClient
    .from('itinerary_signups')
    .delete()
    .eq('trip_id', membership.trip_id)
    .eq('itinerary_item_id', item.id)
    .eq('traveler_id', traveler.id);
  if (strictPrimary) query = query.eq('version', requireVersion(signup, 'Activity signup'));
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (strictPrimary && (!Array.isArray(data) || data.length !== 1)) {
    throw versionConflict('Activity signup');
  }
}

async function insertItineraryComment(activeClient, membership, input) {
  const comment = input && input.comment || {};
  if (String(comment['Planner Type'] || '') !== 'Itinerary') {
    throw codedError('invalid_planner_type', 'Only Itinerary comments are supported by this bridge.');
  }

  const legacyId = stableLegacyId(comment['Planner Comment ID'], 'PCOM');
  const itineraryLegacyId = stableLegacyId(comment['Item ID'], 'PLAN');
  const travelerLegacyId = stableLegacyId(comment['Traveler ID']);
  const item = await itineraryItemByLegacy(activeClient, membership, itineraryLegacyId, true);
  const traveler = await travelerByLegacy(activeClient, membership, travelerLegacyId);
  const text = String(comment.Comment || '').trim();
  if (!text) throw codedError('comment_required', 'A planner comment is required.');

  const row = {
    trip_id: membership.trip_id,
    legacy_id: legacyId,
    planner_type: 'Itinerary',
    item_id: item.id,
    item_legacy_id: itineraryLegacyId,
    traveler_id: traveler.id,
    traveler_name: String(comment['Traveler Name'] || traveler.name || ''),
    comment: text,
    archived_at: null
  };

  const { data: existingRows, error: existingError } = await activeClient
    .from('planner_comments')
    .select('id')
    .eq('trip_id', membership.trip_id)
    .eq('legacy_id', legacyId)
    .limit(2);
  if (existingError) throw existingError;
  const existing = Array.isArray(existingRows) ? existingRows : [];
  if (existing.length > 1) {
    throw codedError('duplicate_comment_legacy_id', 'Supabase has duplicate planner comment legacy IDs.');
  }

  if (existing.length) {
    const { error } = await activeClient
      .from('planner_comments')
      .update(row)
      .eq('id', existing[0].id)
      .eq('trip_id', membership.trip_id);
    if (error) throw error;
  } else {
    const { error } = await activeClient.from('planner_comments').insert(row);
    if (error) throw error;
  }
}

async function handleRequest(data) {
  const operation = String(data && data.operation || '');
  if (operation === OP_STATUS) {
    return {
      primaryWrite: primaryWriteEnabled,
      shadowWrite: shadowWriteEnabled && !primaryWriteEnabled
    };
  }

  if (!writeEnabled) {
    throw codedError('feature_disabled', 'Supabase Itinerary writes are disabled by the release flag.');
  }

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  const input = data && data.data || {};
  const strictPrimary = primaryWriteEnabled && String(data && data.writeMode || '') === 'primary';

  if (operation === OP_ITEM_UPSERT) {
    await upsertItineraryItem(activeClient, membership, input, strictPrimary);
  } else if (operation === OP_ITEM_DELETE) {
    await deleteItineraryItem(activeClient, membership, input, strictPrimary);
  } else if (operation === OP_SIGNUP_UPSERT) {
    await upsertItinerarySignup(activeClient, membership, input, strictPrimary);
  } else if (operation === OP_SIGNUP_DELETE) {
    await deleteItinerarySignup(activeClient, membership, input, strictPrimary);
  } else if (operation === OP_COMMENT_INSERT) {
    await insertItineraryComment(activeClient, membership, input);
  } else {
    throw codedError('unsupported_operation', 'Unsupported Supabase Itinerary write operation.');
  }

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
        code: String(error && error.code || error && error.name || 'itinerary_write_error'),
        message: String(error && error.message || 'Supabase Itinerary write failed.')
      }
    }));
});
