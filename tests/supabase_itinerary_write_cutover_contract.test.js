'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'supabase-itinerary-write-bridge.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'Client_Supabase_Itinerary_Write_Bridge.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const plannerCommon = fs.readFileSync(path.join(root, 'Planning_Common.gs'), 'utf8');
const plannerSocial = fs.readFileSync(path.join(root, 'Planner_Social.gs'), 'utf8');
const dataHelpers = fs.readFileSync(path.join(root, 'Data.gs'), 'utf8');

const releaseMatch = config.match(/release:\s*'V4\.4\.0-alpha2\.(\d+)'/);
assert(releaseMatch, 'A V4.4.0-alpha2.x release marker is required.');
const releaseNumber = Number(releaseMatch[1]);
assert(
  releaseNumber >= 27 &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: true') &&
  config.includes('write: true'),
  'Itinerary must remain Supabase-primary for reads and writes in alpha2.27 and later releases.'
);
assert(
  config.includes("script.src='./supabase-itinerary-write-bridge.js?v='"),
  'The PWA must keep loading the release-versioned Itinerary write bridge.'
);
assert(
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-write-bridge.js')") &&
  serviceWorker.includes(`family-vacation-pwa-v4-4-0-alpha2-${releaseNumber}`),
  'The installed PWA must keep fetching the current Itinerary write bridge network-first.'
);
assert(
  shell.includes("include('Client_Supabase_Itinerary_Bridge')") &&
  shell.includes("include('Client_Supabase_Itinerary_Write_Bridge')") &&
  shell.indexOf("include('Client_Supabase_Itinerary_Write_Bridge')") > shell.indexOf("include('Client_P3_Planner_Social_Reliability')"),
  'The evaluated Apps Script shell must preserve accepted Itinerary write routing after reliable planner/social functions.'
);

for (const operation of [
  "'itinerary.primaryWriteStatus'",
  "'itinerary.item.upsert'",
  "'itinerary.item.delete'",
  "'itinerary.signup.upsert'",
  "'itinerary.signup.delete'",
  "'itinerary.comment.insert'"
]) {
  assert(host.includes(operation), `Missing allow-listed Itinerary write operation ${operation}.`);
}
assert(
  host.includes("const REQUEST_TYPE = 'vacation-portal-supabase-itinerary-write-request'") &&
  host.includes(".from('trip_members')") &&
  host.includes(".from('itinerary_items')") &&
  host.includes(".from('itinerary_signups')") &&
  host.includes(".from('planner_comments')") &&
  host.includes(".from('travelers')"),
  'Itinerary primary writes must continue executing only in the authenticated top-level Supabase context.'
);
assert(
  !host.includes('access_token') && !host.includes('refresh_token'),
  'Supabase session tokens must never be sent into the Apps Script iframe.'
);
assert(
  host.includes("const strictPrimary = primaryWriteEnabled && String(data && data.writeMode || '') === 'primary'") &&
  host.includes("codedError(\n    'itinerary_version_conflict'") &&
  host.includes(".eq('version', requireVersion(item, 'Itinerary item'))") &&
  host.includes(".eq('version', requireVersion(signup, 'Activity signup'))") &&
  host.includes(".select('id')"),
  'Existing primary activity/signup mutations must keep using the Supabase Version read by the client and verify one affected row.'
);
assert(
  host.includes("if (String(error.code || '') === '23505') throw versionConflict('Activity signup')") &&
  host.includes(".upsert(row, { onConflict: 'itinerary_item_id,traveler_id' })"),
  'Primary signup creation must fail closed on a duplicate while the Sheets-first rollback mirror remains idempotent.'
);
assert(
  host.includes("stableLegacyId(item['Itinerary ID'], 'PLAN')") &&
  host.includes("stableLegacyId(signup['Signup ID'], 'SIGNUP')") &&
  host.includes("stableLegacyId(comment['Planner Comment ID'], 'PCOM')") &&
  host.includes("stableLegacyId(signup['Traveler ID'])"),
  'Generated Itinerary IDs must stay stable while existing legacy traveler IDs remain compatible.'
);
assert(
  host.includes("cost_cents: Math.max(0, Math.round(Number(item.Cost || 0) * 100))") &&
  host.includes("cost_per: String(item['Cost Per'] || 'Person')"),
  'Primary activity writes must preserve cents and Cost Per semantics.'
);
assert(
  host.includes(".eq('planner_type', 'Itinerary')") &&
  host.includes(".eq('item_id', item.id)") &&
  host.includes(".eq('item_legacy_id', legacyId)"),
  'Deleting an Itinerary item must continue clearing linked Supabase comments while signup FK cascade handles signups.'
);
assert(
  host.includes('return readItinerary(activeClient, membership)') &&
  host.includes('primaryWrite: primaryWriteEnabled'),
  'Every Supabase mutation must return a fresh authoritative bundle and expose its release write mode.'
);

assert(
  client.includes('let configuredWriteMode=\'unknown\'') &&
  client.includes("request_(OP_STATUS,{})") &&
  client.includes("configuredWriteMode=result&&result.primaryWrite===true?'primary':'legacy'") &&
  client.includes("DATA.supabaseDomainSources.itinerary==='supabase-primary'"),
  'The iframe must promote Itinerary writes only when the host flag is primary and the visible read source is Supabase.'
);
assert(
  client.includes("stableId_('PLAN')") &&
  client.includes("stableId_('SIGNUP')") &&
  client.includes("stableId_('PCOM')"),
  'New primary Itinerary records must receive stable legacy IDs before the first Supabase mutation.'
);
assert(
  client.includes("request_(OP_ITEM_UPSERT,{item:object},'primary')") &&
  client.includes("request_(OP_ITEM_DELETE,{item:item},'primary')") &&
  client.includes("request_(OP_SIGNUP_UPSERT,{signup:local},'primary')") &&
  client.includes("request_(OP_SIGNUP_DELETE,{signup:existing},'primary')") &&
  client.includes("request_(OP_COMMENT_INSERT,{comment:local},'primary')"),
  'All five live Itinerary mutation paths must continue explicitly requesting strict primary mode.'
);
assert(
  client.includes('markPrimarySuccess_(result)') &&
  client.includes("DATA.supabaseDomainSources.itineraryWrite='supabase-primary'") &&
  client.includes("String(row['Planner Type']||'')!=='Itinerary'") &&
  client.includes('DATA.plannerComments=nonItineraryComments.concat'),
  'Primary Itinerary mutation results must settle visible state from Supabase without deleting other planner comments.'
);
assert(
  client.includes("backupItemSave_(settled,'save')") &&
  client.includes("backupItemDelete_(id,'delete')") &&
  client.includes("backupSignupSave_(settled,expectedSheetsUpdatedAt,'signup')") &&
  client.includes("backupSignupDelete_(existing,expectedSheetsUpdatedAt,'signup removal')") &&
  client.includes("backupComment_(settled,'comment')"),
  'Successful primary mutations must keep starting a non-blocking Sheets rollback backup for every Itinerary write path.'
);
assert(
  client.includes('.saveItinerary(payload)') &&
  client.includes(".deletePlannerItem('Itinerary',String(id||''))") &&
  client.includes('.saveItineraryInterest({') &&
  client.includes('.removeItineraryInterest({') &&
  client.includes('.savePlannerComment({'),
  'The Itinerary backup layer must keep reusing the existing validated Sheets mutation endpoints.'
);
assert(
  client.includes("signupId:String(signup&&signup['Signup ID']||'')") &&
  client.includes("commentId:String(comment&&comment['Planner Comment ID']||'')"),
  'Sheets backup creation must preserve the primary Supabase signup/comment legacy IDs.'
);
assert(
  client.includes("'supabase-primary+sheets-backup-match'") &&
  client.includes("'supabase-primary+sheets-backup-mismatch'") &&
  client.includes("'supabase-primary+sheets-backup-unavailable'") &&
  client.includes('passed — Sheets backup matches.'),
  'Primary-write diagnostics must distinguish matching, mismatched, and unavailable Sheets backups without undoing Supabase success.'
);
assert(
  client.includes('mirrorShadow_(OP_ITEM_UPSERT') &&
  client.includes('mirrorShadow_(OP_SIGNUP_UPSERT') &&
  client.includes('mirrorShadow_(OP_COMMENT_INSERT') &&
  client.includes("if(primaryWriteEnabled_()) return primarySavePlanner_") &&
  client.includes('return shadowSavePlanner_'),
  'The validated Sheets-first + Supabase mirror path must remain available when the Itinerary runtime is on Sheets fallback.'
);
assert(
  client.includes('const legacySavePlannerForm=savePlannerForm') &&
  client.includes('const legacyDeletePlannerItem=deletePlannerItem_') &&
  client.includes('const legacySaveInterest=saveP2ItineraryInterest_') &&
  client.includes('const legacyRemoveInterest=removeP2ItineraryInterest_') &&
  client.includes('const legacySaveComment=saveP2PlannerComment_'),
  'Primary Itinerary write routing must wrap rather than remove the validated legacy functions.'
);
assert(
  client.includes("if(name!=='Itinerary') return legacySavePlannerForm.apply(this,arguments)") &&
  client.includes("if(type!=='Itinerary') return legacySaveComment.apply(this,arguments)"),
  'Non-Itinerary behavior must still delegate out of the accepted Itinerary bridge.'
);

assert(
  plannerSocial.includes('function plannerSocialRequestedId_(value, prefix)') &&
  plannerSocial.includes("plannerSocialRequestedId_(values.signupId, 'SIGNUP')") &&
  plannerSocial.includes("requestedSignupId || uid_('SIGNUP')") &&
  plannerSocial.includes("plannerSocialRequestedId_(values.commentId, 'PCOM')") &&
  plannerSocial.includes("requestedCommentId || uid_('PCOM')"),
  'Authorized Sheets backup endpoints must accept validated primary IDs while preserving legacy ID generation when no ID is supplied.'
);
assert(
  plannerSocial.includes('function saveItineraryInterest(values)') &&
  plannerSocial.includes("appendObject_('Itinerary Signups', record)") &&
  plannerSocial.includes('function removeItineraryInterest(values)') &&
  plannerSocial.includes("deleteById_('Itinerary Signups', 'Signup ID', signup['Signup ID'])") &&
  plannerSocial.includes('function savePlannerComment(values)') &&
  plannerSocial.includes("appendObject_('Planner Comments', record)"),
  'Join, leave, and comment Sheets backups must stay on validated one-row append/delete helpers.'
);
assert(
  plannerCommon.includes("'Itinerary': {sheet: 'Itinerary', idHeader: 'Itinerary ID'}") &&
  plannerCommon.includes("clearPlannerSocialForItem_(definition.sheet, id)") &&
  plannerCommon.includes('sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row])') &&
  !plannerCommon.includes('sheet.getRange(sheet.getLastRow() + 1, 1, headers.length).setValues([row])'),
  'The Sheets rollback path must retain dependent cleanup and the fixed one-row planner append shape.'
);
assert(
  dataHelpers.includes('function appendObject_(sheetName, object)') &&
  dataHelpers.includes("sheet.appendRow(headers.map(header => object[header] !== undefined ? object[header] : ''));"),
  'Social backups must append exactly one spreadsheet row.'
);
assert(
  plannerSocial.includes("if (['Itinerary', 'Meals'].indexOf(plannerType) < 0)") &&
  plannerSocial.includes("const sheetName = plannerType === 'Meals' ? 'Meals' : 'Itinerary'"),
  'The shared Sheets rollback endpoint must continue supporting Meals without cross-domain behavior drift.'
);

console.log('PASS Supabase Itinerary primary-write / Sheets-backup cutover contract');