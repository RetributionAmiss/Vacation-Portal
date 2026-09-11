import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const domainConfig = config.supabaseDomains && config.supabaseDomains.plannerComments || {};
const primaryReadEnabled = domainConfig.read === true;
const primaryWriteEnabled = domainConfig.write === true;
const shadowReadEnabled = domainConfig.shadowRead === true;
const shadowWriteEnabled = domainConfig.shadowWrite === true;
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();

const REQUEST_TYPE = 'vacation-portal-supabase-planner-comments-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_STATUS = 'plannerComments.status';
const OP_READ = 'plannerComments.read';
const OP_UPSERT = 'plannerComments.upsert';
const OP_DELETE = 'plannerComments.delete';
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
    throw codedError('bridge_not_configured', 'Supabase planner comments bridge is not configured.');
  }
  return fallbackClient;
}

async function currentMembership(activeClient) {
  const { data: sessionData, error: sessionError } = await activeClient.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData && sessionData.session;
  if (!session || !session.user) {
    throw codedError('not_signed_in', 'Sign in to use planner comments.');
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
    throw codedError('multiple_memberships', 'Multiple active trips are not supported by planner comments yet.');
  }
  return rows[0];
}

function membershipResult(membership) {
  return {
    role: String(membership && membership.role || 'traveler'),
    travelerLinked: Boolean(membership && membership.traveler_id)
  };
}

function plannerType(value) {
  const type = String(value || '').trim();
  if (type !== 'Meals' && type !== 'Itinerary') {
    throw codedError('invalid_planner_type', 'Planner comments are available only for Meals and Itinerary.');
  }
  return type;
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

function requireVersion(row) {
  const version = expectedVersion(row);
  if (!version) {
    throw codedError(
      'planner_comment_version_conflict',
      'This comment changed before the request completed. Refresh and review the latest comments.'
    );
  }
  return version;
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

async function plannerItemByLegacy(activeClient, membership, type, legacyId) {
  const spec = type === 'Meals'
    ? { table: 'meals', prefix: 'MEAL' }
    : { table: 'itinerary_items', prefix: 'PLAN' };
  const stableId = stableLegacyId(legacyId, spec.prefix);
  const { data, error } = await activeClient
    .from(spec.table)
    .select('id,legacy_id')
    .eq('trip_id', membership.trip_id)
    .eq('legacy_id', stableId)
    .is('archived_at', null)
    .limit(2);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length !== 1) {
    throw codedError('planner_item_not_found', 'The Supabase planner item could not be resolved uniquely.');
  }
  return rows[0];
}

async function commentByLegacy(activeClient, membership, type, legacyId) {
  const { data, error } = await activeClient
    .from('planner_comments')
    .select('id,legacy_id,planner_type,item_legacy_id,traveler_id,comment,version')
    .eq('trip_id', membership.trip_id)
    .eq('planner_type', type)
    .eq('legacy_id', legacyId)
    .is('archived_at', null)
    .limit(2);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 1) {
    throw codedError('duplicate_comment_legacy_id', 'Supabase has duplicate planner comment legacy IDs.');
  }
  return rows[0] || null;
}

async function readComments(activeClient, membership, type) {
  const { data: commentRows, error: commentError } = await activeClient
    .from('planner_comments')
    .select('id,legacy_id,planner_type,item_id,item_legacy_id,traveler_id,traveler_name,comment,created_at,version')
    .eq('trip_id', membership.trip_id)
    .eq('planner_type', type)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (commentError) throw commentError;

  const comments = Array.isArray(commentRows) ? commentRows : [];
  const travelerIds = Array.from(new Set(comments.map(row => row.traveler_id).filter(Boolean)));
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

  return comments.map(row => {
    const traveler = travelerById[String(row.traveler_id || '')] || {};
    return {
      'Planner Comment ID': String(row.legacy_id || row.id || ''),
      'Planner Type': type,
      'Item ID': String(row.item_legacy_id || ''),
      'Traveler ID': String(traveler.legacy_id || ''),
      'Traveler Name': String(row.traveler_name || traveler.name || traveler.legacy_id || ''),
      'Comment': String(row.comment || ''),
      'Created At': row.created_at || '',
      'Version': Number(row.version || 0),
      travelerName: String(row.traveler_name || traveler.name || traveler.legacy_id || '')
    };
  });
}

async function readBundle(activeClient, membership, type) {
  return {
    source: 'supabase',
    plannerType: type,
    plannerComments: await readComments(activeClient, membership, type),
    membership: membershipResult(membership),
    primary: primaryReadEnabled,
    primaryWrite: primaryWriteEnabled
  };
}

async function upsertComment(activeClient, membership, input) {
  const comment = input && input.comment || {};
  const type = plannerType(comment['Planner Type'] || input && input.plannerType);
  const legacyId = stableLegacyId(comment['Planner Comment ID'], 'PCOM');
  const itemLegacyId = stableLegacyId(comment['Item ID'], type === 'Meals' ? 'MEAL' : 'PLAN');
  const travelerLegacyId = stableLegacyId(comment['Traveler ID']);
  const text = String(comment.Comment || '').trim().slice(0, 800);
  if (!text) throw codedError('comment_required', 'Write a comment first.');

  const item = await plannerItemByLegacy(activeClient, membership, type, itemLegacyId);
  const traveler = await travelerByLegacy(activeClient, membership, travelerLegacyId);
  const existing = await commentByLegacy(activeClient, membership, type, legacyId);

  if (existing) {
    const sameRequest =
      String(existing.item_legacy_id || '') === itemLegacyId &&
      String(existing.traveler_id || '') === String(traveler.id || '') &&
      String(existing.comment || '') === text;
    if (!sameRequest) {
      throw codedError('planner_comment_id_conflict', 'That planner comment ID is already used by a different comment.');
    }
    return;
  }

  const { error } = await activeClient.from('planner_comments').insert({
    trip_id: membership.trip_id,
    legacy_id: legacyId,
    planner_type: type,
    item_id: item.id,
    item_legacy_id: itemLegacyId,
    traveler_id: traveler.id,
    traveler_name: String(comment['Traveler Name'] || traveler.name || ''),
    comment: text,
    archived_at: null
  });
  if (error) throw error;
}

async function deleteComment(activeClient, membership, input, strictPrimary) {
  const comment = input && input.comment || {};
  const type = plannerType(comment['Planner Type'] || input && input.plannerType);
  const legacyId = stableLegacyId(comment['Planner Comment ID'], 'PCOM');
  const existing = await commentByLegacy(activeClient, membership, type, legacyId);

  if (!existing) {
    if (strictPrimary) {
      throw codedError('planner_comment_version_conflict', 'This comment is no longer available. Refresh and review the latest comments.');
    }
    return;
  }

  let query = activeClient
    .from('planner_comments')
    .delete()
    .eq('id', existing.id)
    .eq('trip_id', membership.trip_id)
    .eq('planner_type', type);
  if (strictPrimary) query = query.eq('version', requireVersion(comment));

  const { data, error } = await query.select('id');
  if (error) throw error;
  if (strictPrimary && (!Array.isArray(data) || data.length !== 1)) {
    throw codedError(
      'planner_comment_delete_denied_or_conflict',
      'Comment removal was not accepted. Refresh and try again. Travelers can remove their own comments; organizers can remove any planner comment.'
    );
  }
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

  const input = data && data.data || {};
  const type = plannerType(input.plannerType || input.comment && input.comment['Planner Type']);

  if (operation === OP_READ && !primaryReadEnabled && !shadowReadEnabled) {
    throw codedError('feature_disabled', 'Supabase planner comment reads are disabled by the release flag.');
  }
  if ((operation === OP_UPSERT || operation === OP_DELETE) && !primaryWriteEnabled && !shadowWriteEnabled) {
    throw codedError('feature_disabled', 'Supabase planner comment writes are disabled by the release flag.');
  }

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);
  const strictPrimary = primaryWriteEnabled && String(data && data.writeMode || '') === 'primary';

  if (operation === OP_UPSERT) {
    await upsertComment(activeClient, membership, input);
  } else if (operation === OP_DELETE) {
    await deleteComment(activeClient, membership, input, strictPrimary);
  } else if (operation !== OP_READ) {
    throw codedError('unsupported_operation', 'Unsupported Supabase planner comment operation.');
  }

  return readBundle(activeClient, membership, type);
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
        code: String(error && error.code || error && error.name || 'planner_comment_error'),
        message: String(error && error.message || 'Supabase planner comment operation failed.')
      }
    }));
});
