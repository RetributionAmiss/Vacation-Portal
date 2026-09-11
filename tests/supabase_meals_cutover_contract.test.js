'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const host = fs.readFileSync(path.join(root, 'supabase-meals-bridge.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'Client_Supabase_Meals_Bridge.html'), 'utf8');
const mealsGs = fs.readFileSync(path.join(root, 'Meals.gs'), 'utf8');

const clientJs = client.match(/<script>([\s\S]*)<\/script>/);
assert(clientJs, 'Meals client bridge must contain a browser script.');
assert.doesNotThrow(() => new Function(clientJs[1]), 'Meals client bridge must remain valid browser JavaScript.');
const hostForSyntax = host.replace(/^import[^\n]*\n/, '');
assert.doesNotThrow(() => new Function(hostForSyntax), 'Meals host bridge must remain valid browser module JavaScript after removing its import line.');

assert(
  config.includes("release: 'V4.4.0-alpha2.27'") &&
  config.includes('meals: {') &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: true') &&
  config.includes('write: true'),
  'alpha2.27 must keep Supabase-primary Meals reads and writes enabled.'
);
assert(
  config.includes("script.src='./supabase-meals-bridge.js?v='") &&
  serviceWorker.includes('family-vacation-pwa-v4-4-0-alpha2-27') &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-meals-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The release-versioned Meals host bridge must remain network-first in the installed PWA.'
);
assert(
  shell.includes("include('Client_Supabase_Meals_Bridge')") &&
  shell.indexOf("include('Client_Supabase_Meals_Bridge')") > shell.indexOf("include('Client_Supabase_Planner_Comments_Snapshot_Guard')") &&
  shell.indexOf("include('Client_Supabase_Meals_Bridge')") < shell.indexOf("include('Client_P3_Startup_Performance')"),
  'Meals authority must install after accepted planner-comment layers and before startup-performance finalization.'
);

for (const operation of ["'meals.status'", "'meals.read'", "'meals.upsert'", "'meals.delete'"]) {
  assert(host.includes(operation), `Missing allow-listed Meals operation ${operation}.`);
}
assert(
  host.includes("const REQUEST_TYPE = 'vacation-portal-supabase-meals-request'") &&
  host.includes("activeClient.auth.getSession()") &&
  host.includes(".from('trip_members')") &&
  host.includes(".from('meals')") &&
  !host.includes('access_token') &&
  !host.includes('refresh_token') &&
  !host.includes('service_role') &&
  !host.includes('serviceRole'),
  'Meals must execute in the authenticated browser Supabase context with RLS and no privileged/token forwarding.'
);
assert(
  host.includes("/^MEAL-[A-Z0-9]{10}$/.test(id)") &&
  host.includes("codedError('unstable_meal_id'") &&
  host.includes("legacy_id: legacyId"),
  'Meals primary writes must require stable MEAL-* legacy IDs.'
);
assert(
  host.includes("'Version': Number(row.version || 0)") &&
  host.includes(".eq('version', requireVersion(meal))") &&
  host.includes("'meal_version_conflict'") &&
  host.includes(".select('id')"),
  'Primary Meal update/delete must use Version optimistic concurrency and verify one affected row.'
);
assert(
  host.includes(".eq('planner_type', 'Meals')") &&
  host.includes(".eq('item_id', meal.id)") &&
  host.includes(".eq('item_legacy_id', legacyId)"),
  'Deleting a Meal must clear linked Supabase Meal comments by UUID and stable legacy ID.'
);
assert(
  host.includes('return readBundle(activeClient, membership)') &&
  host.includes('primary: primaryReadEnabled') &&
  host.includes('primaryWrite: primaryWriteEnabled'),
  'Every Meal operation must return a fresh authoritative Supabase bundle and release authority flags.'
);

assert(
  client.includes('const waiter=pending[id]') &&
  client.includes('if(!waiter) return;') &&
  !client.includes('if(data.ok&&data.data)'),
  'The Meals client must ignore unrelated messages on the shared Supabase response channel.'
);
assert(
  client.includes('const inheritedRenderMeals=renderP2Meals_') &&
  client.includes('const inheritedSavePlannerForm=savePlannerForm') &&
  client.includes('const inheritedDeletePlannerItem=deletePlannerItem_') &&
  client.includes("if(String(name||'')!=='Meals') return inheritedSavePlannerForm.apply(this,arguments)") &&
  client.includes("if(String(name||'')!=='Meals') return inheritedDeletePlannerItem.apply(this,arguments)"),
  'The Meals bridge must wrap only Meals and delegate every other planner domain unchanged.'
);
assert(
  client.includes('startPrimaryRead_();') &&
  client.includes('return loadingView_();') &&
  client.includes("DATA.supabaseDomainSources.meals='supabase-primary'") &&
  client.indexOf("request_(OP_READ,{})") < client.indexOf('refreshSheetsBackup_(false);'),
  'Healthy Meals startup must withhold Sheets rows, settle Supabase first, then refresh the rollback copy.'
);
assert(
  client.includes('DATA.supabaseMealsShadow=cloneRows_(meals)') &&
  client.includes('function reapplyPrimarySnapshot_()') &&
  client.includes('DATA.meals=cloneRows_(DATA.supabaseMealsShadow)') &&
  client.indexOf('reapplyPrimarySnapshot_();') < client.indexOf('return inheritedRenderMeals.apply(this,arguments);'),
  'Every primary Meals render must restore the authoritative Supabase snapshot before inherited rendering can expose deferred Sheets data.'
);
assert(
  client.includes("DATA.supabaseDomainSources.meals='supabase-primary-fallback-sheets'") &&
  client.includes('requestSheetsFallback_();') &&
  client.includes('loadDeferredPortalData_();'),
  'Sheets may become the visible Meals source only after an explicit primary-read failure.'
);
assert(
  client.includes("return 'MEAL-'+suffix.slice(0,10)") &&
  client.includes("if(!existingId) meal['Meal ID']=stableMealId_();") &&
  !client.includes("'LOCAL-"),
  'New Meals must receive a stable MEAL-* ID before optimistic or Supabase writes; LOCAL IDs are forbidden in this primary layer.'
);
assert(
  client.includes("request_(OP_UPSERT,{meal:meal},'primary')") &&
  client.includes('settleMeals_(result)') &&
  client.includes('backupSave_(saved)') &&
  client.indexOf("request_(OP_UPSERT,{meal:meal},'primary')") < client.indexOf('backupSave_(saved)'),
  'Meal save must commit and settle Supabase before the Sheets rollback save starts.'
);
assert(
  client.includes("request_(OP_DELETE,{meal:input},'primary')") &&
  client.includes('backupDelete_(id)') &&
  client.indexOf("request_(OP_DELETE,{meal:input},'primary')") < client.indexOf('backupDelete_(id)'),
  'Meal removal must commit and settle Supabase before the Sheets rollback delete starts.'
);
assert(
  client.includes("'supabase-primary+sheets-backup-match'") &&
  client.includes("'supabase-primary+sheets-backup-mismatch'") &&
  client.includes("'supabase-primary+sheets-backup-unavailable'") &&
  client.includes('Supabase Meal '+"'"+'+label+'+"'"+' passed — Sheets backup matches.'),
  'Meal backup diagnostics must report match/mismatch/unavailable without rolling back Supabase success.'
);
assert(
  client.includes('withOrganizerAuthorization_(function(){') &&
  client.includes('organizerAuthorizationValues_(') &&
  client.includes('.saveMealBackup(payload)') &&
  client.includes('.deleteMealBackup(organizerAuthorizationValues_({mealId:') &&
  client.includes('.getMealsBackup();'),
  'Sheets rollback writes must use separately authorized backup endpoints and verification reads.'
);
assert(
  mealsGs.includes('function saveMealBackup(values)') &&
  mealsGs.includes('function deleteMealBackup(values)') &&
  mealsGs.includes('assertOrganizerFromValues_(values)') &&
  mealsGs.includes("savePlannerRecordFast_('Meals', 'Meal ID', 'MEAL', values)") &&
  mealsGs.includes("deletePlannerRecordFastUnlocked_('Meals', 'Meal ID', mealId)") &&
  mealsGs.includes("clearPlannerSocialForItem_('Meals', mealId)") &&
  mealsGs.includes('function getMealsBackup()'),
  'Apps Script must independently authorize Meal rollback mutations and retain dependent Sheet comment cleanup.'
);

console.log('PASS Supabase Meals primary / Sheets-backup cutover contract');