'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const host = fs.readFileSync(path.join(root, 'supabase-planner-comments-bridge.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'Client_Supabase_Planner_Comments_Bridge.html'), 'utf8');
const snapshotGuard = fs.readFileSync(path.join(root, 'Client_Supabase_Planner_Comments_Snapshot_Guard.html'), 'utf8');
const sheetsDelete = fs.readFileSync(path.join(root, 'Planner_Comment_Delete.gs'), 'utf8');
const plannerSocial = fs.readFileSync(path.join(root, 'Planner_Social.gs'), 'utf8');

for (const [label, html] of [['planner comments bridge', client], ['planner comments snapshot guard', snapshotGuard]]) {
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  assert(match, `${label} must contain a browser script.`);
  assert.doesNotThrow(() => new Function(match[1]), `${label} must remain valid browser JavaScript.`);
}

assert(
  config.includes("release: 'V4.4.0-alpha2.25'") &&
  config.includes('plannerComments: {') &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: true') &&
  config.includes('write: true'),
  'alpha2.25 must enable Supabase-primary planner-comment reads and writes.'
);
assert(
  config.includes("script.src='./supabase-planner-comments-bridge.js?v='"),
  'The PWA must load the shared planner-comments host bridge using the release cache key.'
);
assert(
  serviceWorker.includes('family-vacation-pwa-v4-4-0-alpha2-25') &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-planner-comments-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The installed PWA must refresh the planner-comments bridge network-first.'
);
assert(
  shell.includes("include('Client_Supabase_Planner_Comments_Bridge')") &&
  shell.includes("include('Client_Supabase_Planner_Comments_Snapshot_Guard')") &&
  shell.indexOf("include('Client_Supabase_Planner_Comments_Bridge')") >
    shell.indexOf("include('Client_Supabase_Itinerary_Comment_Lifecycle')") &&
  shell.indexOf("include('Client_Supabase_Planner_Comments_Snapshot_Guard')") >
    shell.indexOf("include('Client_Supabase_Planner_Comments_Bridge')"),
  'Meals authority routing must install after the accepted Itinerary lifecycle and its snapshot guard must install last.'
);

for (const operation of [
  "'plannerComments.status'",
  "'plannerComments.read'",
  "'plannerComments.upsert'",
  "'plannerComments.delete'"
]) {
  assert(host.includes(operation), `Missing allow-listed planner-comment operation ${operation}.`);
}
assert(
  host.includes("type !== 'Meals' && type !== 'Itinerary'") &&
  host.includes("type === 'Meals'") &&
  host.includes("{ table: 'meals', prefix: 'MEAL' }") &&
  host.includes("{ table: 'itinerary_items', prefix: 'PLAN' }") &&
  host.includes('.from(spec.table)'),
  'The host bridge must allow only Meals/Itinerary and select the parent table exclusively from that controlled mapping.'
);
assert(
  host.includes(".from('trip_members')") &&
  host.includes("activeClient.auth.getSession()") &&
  host.includes(".from('planner_comments')") &&
  host.includes("{ table: 'meals', prefix: 'MEAL' }") &&
  host.includes(".from('travelers')") &&
  !host.includes('access_token') &&
  !host.includes('refresh_token') &&
  !host.includes('service_role') &&
  !host.includes('serviceRole'),
  'Planner comments must run in the authenticated browser Supabase context with RLS and no privileged/token forwarding.'
);
assert(
  host.includes("stableLegacyId(comment['Planner Comment ID'], 'PCOM')") &&
  host.includes("stableLegacyId(comment['Item ID'], type === 'Meals' ? 'MEAL' : 'PLAN')") &&
  host.includes("stableLegacyId(comment['Traveler ID'])"),
  'Planner comments must preserve stable legacy comment/item/traveler identifiers.'
);
assert(
  host.includes(".eq('legacy_id', legacyId)") &&
  host.includes('const sameRequest =') &&
  host.includes("throw codedError('planner_comment_id_conflict'") &&
  host.includes(".from('planner_comments').insert({"),
  'Comment creation must be idempotent by stable legacy ID and fail closed on conflicting reuse.'
);
assert(
  host.includes(".eq('version', requireVersion(comment))") &&
  host.includes("'planner_comment_version_conflict'") &&
  host.includes("'planner_comment_delete_denied_or_conflict'") &&
  host.includes(".delete()") &&
  host.includes(".select('id')"),
  'Primary comment deletion must use optimistic Version concurrency and verify one RLS-authorized row.'
);
assert(
  host.includes(".eq('planner_type', type)") &&
  host.includes("plannerComments: await readComments(activeClient, membership, type)") &&
  host.includes('membership: membershipResult(membership)') &&
  host.includes('primary: primaryReadEnabled'),
  'Each readback must be scoped to the requested planner type and return authenticated membership context.'
);

assert(
  client.includes('const waiter=pending[id]') &&
  client.includes('if(!waiter) return;') &&
  !client.includes('if(data.ok&&data.data)'),
  'The Meals client must ignore unrelated responses on the shared Supabase response channel.'
);
assert(
  client.includes("if(currentView==='meals')") &&
  client.includes("request_(OP_READ,{plannerType:'Meals'})") &&
  client.includes("DATA.supabaseDomainSources.plannerComments='supabase-primary'") &&
  client.includes('settleMeals_(result)') &&
  client.indexOf("request_(OP_READ,{plannerType:'Meals'})") < client.indexOf('refreshSheetsBackup_(false);'),
  'Healthy Meals startup must read and settle Supabase before any Sheets rollback refresh begins.'
);
assert(
  client.includes("String(row&&row['Planner Type']||'')!=='Meals'") &&
  client.includes('DATA.plannerComments=nonMeals.concat(meals)') &&
  client.includes('DATA.supabasePlannerCommentsShadow.Meals=cloneComments_(meals)'),
  'Supabase Meals settle must replace only Meals comments and preserve Itinerary comments.'
);
assert(
  client.includes("DATA.supabaseDomainSources.plannerComments='supabase-primary-fallback-sheets'") &&
  client.includes('inheritedEnsure.apply(context,args||[])') &&
  client.includes('Supabase Meal comments were unavailable. Using Sheets fallback.'),
  'Sheets may become visible only after an explicit Supabase Meals read failure.'
);
assert(
  client.includes("if(String(type||'')!=='Meals') return inheritedSave.apply(this,arguments)") &&
  client.includes("if(String(type||'')!=='Meals') return inheritedDelete.apply(this,arguments)"),
  'This slice must delegate all Itinerary comment writes/deletes to the already-accepted Itinerary path.'
);
assert(
  client.includes("request_(OP_UPSERT,{plannerType:'Meals',comment:local},'primary')") &&
  client.includes('backupSave_(settled)') &&
  client.indexOf("request_(OP_UPSERT,{plannerType:'Meals',comment:local},'primary')") < client.indexOf('backupSave_(settled)'),
  'Meal comment creation must commit to Supabase before the Sheets rollback copy is written.'
);
assert(
  client.includes("request_(OP_DELETE,{plannerType:'Meals',comment:row},'primary')") &&
  client.includes('backupDelete_(row)') &&
  client.indexOf("request_(OP_DELETE,{plannerType:'Meals',comment:row},'primary')") < client.lastIndexOf('backupDelete_(row)'),
  'Meal comment removal must commit to Supabase before the Sheets rollback copy is deleted.'
);
assert(
  client.includes('.savePlannerComment({') &&
  client.includes('.deletePlannerComment(backupDeletePayload_(row))') &&
  client.includes('.getPlannerSocialData();') &&
  client.includes("'supabase-primary+sheets-backup-match'") &&
  client.includes("'supabase-primary+sheets-backup-mismatch'") &&
  client.includes("'supabase-primary+sheets-backup-unavailable'"),
  'The rollback copy must reuse validated Sheets endpoints and report match/mismatch/unavailable without undoing Supabase success.'
);
assert(
  client.includes("String(row&&row['Traveler ID']||'')===String(currentTravelerId||'')") &&
  client.includes("membershipRole_()==='organizer'") &&
  client.includes('withOrganizerAuthorization_(invoke)') &&
  sheetsDelete.includes('assertTravelerSelf_(values.deviceId, requesterTravelerId)') &&
  sheetsDelete.includes('assertOrganizerFromValues_(values)'),
  'Removal UX may expose owner/organizer actions, while the Sheets rollback delete still independently validates authorization.'
);
assert(
  plannerSocial.includes('function savePlannerComment(values)') &&
  plannerSocial.includes("if (['Itinerary', 'Meals'].indexOf(plannerType) < 0)") &&
  plannerSocial.includes("plannerSocialRequestedId_(values.commentId, 'PCOM')"),
  'The Sheets rollback save endpoint must remain allow-listed and preserve Supabase-generated PCOM IDs.'
);

assert(
  snapshotGuard.includes('function restorePrimaryMealComments_()') &&
  snapshotGuard.includes("source!=='supabase-primary'") &&
  snapshotGuard.includes('DATA.supabasePlannerCommentsShadow') &&
  snapshotGuard.includes('shadow.Meals.map(function(row)') &&
  snapshotGuard.includes('restorePrimaryMealComments_();') &&
  snapshotGuard.indexOf('restorePrimaryMealComments_();') < snapshotGuard.indexOf('return inheritedEnsure.apply(this,arguments);'),
  'Before the inherited TTL logic runs, the guard must restore the last Supabase-authoritative Meals snapshot.'
);

console.log('PASS Supabase planner-comments primary / Sheets-backup cutover contract');