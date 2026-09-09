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

assert(
  config.includes("release: 'V4.4.0-alpha2.20'") &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: true') &&
  config.includes('read: true') &&
  config.includes('write: false'),
  'Itinerary must use Supabase-primary reads while writes remain Sheets-primary with shadow mirroring in alpha2.20.'
);
assert(
  config.includes("script.src='./supabase-itinerary-write-bridge.js?v='"),
  'The PWA must load the release-versioned Itinerary write host bridge.'
);
assert(
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-write-bridge.js')") &&
  serviceWorker.includes('family-vacation-pwa-v4-4-0-alpha2-20'),
  'The installed PWA must fetch the Itinerary write host bridge network-first.'
);
assert(
  shell.includes("include('Client_Supabase_Itinerary_Bridge')") &&
  shell.includes("include('Client_Supabase_Itinerary_Write_Bridge')") &&
  shell.indexOf("include('Client_Supabase_Itinerary_Write_Bridge')") > shell.indexOf("include('Client_P3_Planner_Social_Reliability')"),
  'The evaluated Apps Script shell must install the shadow-write wrappers after the reliable planner/social functions.'
);

for (const operation of [
  "'itinerary.item.upsert'",
  "'itinerary.item.delete'",
  "'itinerary.signup.upsert'",
  "'itinerary.signup.delete'",
  "'itinerary.comment.insert'"
]) {
  assert(host.includes(operation), `Missing allow-listed Itinerary shadow-write operation ${operation}.`);
}
assert(
  host.includes("const REQUEST_TYPE = 'vacation-portal-supabase-itinerary-write-request'") &&
  host.includes(".from('trip_members')") &&
  host.includes(".from('itinerary_items')") &&
  host.includes(".from('itinerary_signups')") &&
  host.includes(".from('planner_comments')") &&
  host.includes(".from('travelers')"),
  'Itinerary shadow writes must execute only in the authenticated top-level Supabase context.'
);
assert(
  !host.includes('access_token') && !host.includes('refresh_token'),
  'Supabase session tokens must never be sent into the Apps Script iframe.'
);
assert(
  host.includes(".upsert(row, { onConflict: 'itinerary_item_id,traveler_id' })"),
  'Activity signups must stay idempotent by itinerary item and traveler.'
);
assert(
  host.includes(".eq('planner_type', 'Itinerary')") &&
  host.includes(".eq('item_id', item.id)") &&
  host.includes(".eq('item_legacy_id', legacyId)"),
  'Deleting an Itinerary item must clear its Supabase planner comments while signup FK cascade handles signups.'
);
assert(
  host.includes("cost_cents: Math.max(0, Math.round(Number(item.Cost || 0) * 100))") &&
  host.includes("cost_per: String(item['Cost Per'] || 'Person')"),
  'Itinerary shadow writes must preserve cents and semantic Cost Per source shapes.'
);
assert(
  host.includes("throw codedError('feature_disabled'") &&
  host.includes('return readItinerary(activeClient, membership)'),
  'The host bridge must stay release-gated and return the full Supabase bundle after a mirror mutation.'
);

assert(
  client.includes('const legacySavePlannerForm=savePlannerForm') &&
  client.includes('const legacyDeletePlannerItem=deletePlannerItem_') &&
  client.includes('const legacySaveInterest=saveP2ItineraryInterest_') &&
  client.includes('const legacyRemoveInterest=removeP2ItineraryInterest_') &&
  client.includes('const legacySaveComment=saveP2PlannerComment_'),
  'The shadow-write layer must wrap, not remove, the validated Sheets planner paths.'
);
assert(
  client.includes("if(name!=='Itinerary')") &&
  client.includes('legacySavePlannerForm.apply(this,arguments)') &&
  client.includes('legacyDeletePlannerItem.apply(this,arguments)') &&
  client.includes("if(type!=='Itinerary')") &&
  client.includes('legacySaveComment.apply(this,arguments)'),
  'Non-Itinerary planner behavior must remain untouched by this migration slice.'
);
assert(
  client.includes("mirror_(OP_ITEM_UPSERT,{item:saved},'save')") &&
  client.includes("mirror_(OP_ITEM_DELETE,{itineraryId:String(id||'')},'delete')") &&
  client.includes("mirror_(OP_SIGNUP_UPSERT,{signup:saved},'signup')") &&
  client.includes("mirror_(OP_SIGNUP_DELETE,{itineraryId:itemId,travelerId:travelerId},'signup removal')") &&
  client.includes("mirror_(OP_COMMENT_INSERT,{comment:saved},'comment')"),
  'Every live Itinerary mutation path must mirror only after Sheets succeeds.'
);
assert(
  client.includes('Sheets change was kept.') &&
  client.includes('check passed — data matches Sheets.') &&
  client.includes('shadow_write_mismatch'),
  'Shadow-write diagnostics must explicitly preserve Sheets authority on Supabase mismatch or failure.'
);
assert(
  client.includes("DATA.itinerarySignups=(DATA.itinerarySignups||[]).filter") &&
  client.includes("String(row['Planner Type']||'')==='Itinerary'") &&
  client.includes("String(row['Item ID']||'')===String(id||'')"),
  'Optimistic Itinerary deletion must mirror the Sheets dependent signup/comment cleanup before equivalence comparison.'
);
assert(
  plannerCommon.includes("'Itinerary': {sheet: 'Itinerary', idHeader: 'Itinerary ID'}") &&
  plannerCommon.includes("clearPlannerSocialForItem_(definition.sheet, id)"),
  'Sheets must remain authoritative for Itinerary delete and dependent social cleanup.'
);
assert(
  plannerSocial.includes('function saveItineraryInterest(values)') &&
  plannerSocial.includes('function removeItineraryInterest(values)') &&
  plannerSocial.includes('function savePlannerComment(values)'),
  'Validated Sheets social mutation endpoints must remain intact.'
);

console.log('PASS Supabase Itinerary primary read / Sheets-primary shadow-write cutover contract');
