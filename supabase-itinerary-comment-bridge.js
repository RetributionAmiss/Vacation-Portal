import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const domainConfig = config.supabaseDomains && config.supabaseDomains.itinerary || {};
const writeEnabled = domainConfig.write === true || domainConfig.shadowWrite === true;
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();

const REQUEST_TYPE = 'vacation-portal-supabase-itinerary-comment-request';
const RESPONSE_TYPE = 'vacation-portal-supabase-domain-response';
const OP_COMMENT_STATUS = 'itinerary.comment.status';
const OP_COMMENT_DELETE = 'itinerary.comment.delete';
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
    throw codedError('bridge_not_configured', 'Supabase Itinerary comment bridge is not configured.');
  }
  return fallbackClient;
}

async function currentMembership(activeClient) {
  const { data: sessionData, error: sessionError } = await activeClient.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData && sessionData.session;
  if (!session || !session.user) {
    throw codedError('not_signed_in', 'Sign in to manage Itinerary comments.');
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

function membershipResult(membership) {
  return {
    role: String(membership && membership.role || 'traveler'),
    travelerLinked: Boolean(membership && membership.traveler_id)
  };
}

function stableLegacyId(value, prefix) {
  const id = String(value || '').trim().toUpperCase();
  const expectedPrefix = String(prefix || '').trim().toUpperCase();
  const pattern = new RegExp('^' + expectedPrefix + '-[A-Z0-9]{10}$');
  if (!id || !pattern.test(id)) {
    throw codedError('unstable_legacy_id', 'A stable ' + expectedPrefix + ' ID is required.');
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
      'itinerary_comment_version_conflict',
      'This comment changed before it could be removed. Refresh Itinerary and try again.'
    );
  }
  return version;
}

async function commentByLegacy(activeClient, membership, legacyId) {
  const { data, error } = await activeClient
    .from('planner_comments')
    .select('id,legacy_id,traveler_id,version')
    .eq('trip_id', membership.trip_id)
    .eq('planner_type', 'Itinerary')
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

async function readComments(activeClient, membership) {
  const { data: commentRows, error: commentError } = await activeClient
    .from('planner_comments')
    .select('id,legacy_id,item_legacy_id,traveler_id,traveler_name,comment,created_at,version')
    .eq('trip_id', membership.trip_id)
    .eq('planner_type', 'Itinerary')
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
      'Planner Type': 'Itinerary',
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

async function deleteComment(activeClient, membership, input, strictPrimary) {
  const comment = input && input.comment || {};
  const legacyId = stableLegacyId(comment['Planner Comment ID'], 'PCOM');
  const existing = await commentByLegacy(activeClient, membership, legacyId);

  if (!existing) {
    if (strictPrimary) {
      throw codedError(
        'itinerary_comment_version_conflict',
        'This comment is no longer available. Refresh Itinerary and review the latest comments.'
      );
    }
  } else {
    let query = activeClient
      .from('planner_comments')
      .delete()
      .eq('id', existing.id)
      .eq('trip_id', membership.trip_id)
      .eq('planner_type', 'Itinerary');

    if (strictPrimary) query = query.eq('version', requireVersion(comment));
    const { data, error } = await query.select('id');
    if (error) throw error;

    if (strictPrimary && (!Array.isArray(data) || data.length !== 1)) {
      throw codedError(
        'itinerary_comment_delete_denied_or_conflict',
        'Comment removal was not accepted. Refresh Itinerary and try again. Travelers can remove their own comments; organizers can remove any Itinerary comment.'
      );
    }
  }

  return {
    plannerComments: await readComments(activeClient, membership),
    membership: membershipResult(membership)
  };
}

async function handleRequest(data) {
  if (!writeEnabled) {
    throw codedError('feature_disabled', 'Supabase Itinerary writes are disabled by the release flag.');
  }

  const operation = String(data && data.operation || '');
  if (operation !== OP_COMMENT_STATUS && operation !== OP_COMMENT_DELETE) {
    throw codedError('unsupported_operation', 'Unsupported Supabase Itinerary comment operation.');
  }

  const activeClient = await getSupabaseClient();
  const membership = await currentMembership(activeClient);

  if (operation === OP_COMMENT_STATUS) {
    return { membership: membershipResult(membership) };
  }

  const input = data && data.data || {};
  const strictPrimary = domainConfig.write === true && String(data && data.writeMode || '') === 'primary';
  return deleteComment(activeClient, membership, input, strictPrimary);
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
        code: String(error && error.code || error && error.name || 'itinerary_comment_error'),
        message: String(error && error.message || 'Supabase Itinerary comment operation failed.')
      }
    }));
});