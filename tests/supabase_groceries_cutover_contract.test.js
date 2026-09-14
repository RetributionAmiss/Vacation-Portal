'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const host = fs.readFileSync(path.join(root, 'supabase-groceries-bridge.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'Client_Supabase_Groceries_Bridge.html'), 'utf8');
const groceriesGs = fs.readFileSync(path.join(root, 'Groceries.gs'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260911172000_grocery_items_shared_member_writes.sql'),
  'utf8'
);

const clientJs = client.match(/<script>([\s\S]*)<\/script>/);
assert(clientJs, 'Grocery client bridge must contain a browser script.');
assert.doesNotThrow(() => new Function(clientJs[1]), 'Grocery client bridge must remain valid browser JavaScript.');
const hostForSyntax = host.replace(/^import[^\n]*\n/, '');
assert.doesNotThrow(() => new Function(hostForSyntax), 'Grocery host bridge must remain valid browser module JavaScript after removing its import line.');

const releaseMatch = config.match(/release:\s*'V4\.4\.0-alpha2\.(\d+)'/);
assert(releaseMatch, 'A V4.4.0-alpha2.x release marker is required.');
const releaseNumber = Number(releaseMatch[1]);
assert(
  releaseNumber >= 27 &&
  config.includes('groceryItems: {') &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: true') &&
  config.includes('write: true'),
  'alpha2.27 and later releases must preserve Supabase-primary Grocery List reads and writes.'
);
assert(
  config.includes("script.src='./supabase-groceries-bridge.js?v='") &&
  serviceWorker.includes(`family-vacation-pwa-v4-4-0-alpha2-${releaseNumber}`) &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-groceries-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The release-versioned Grocery host bridge must be network-first in the installed PWA.'
);
assert(
  shell.includes("include('Client_Supabase_Groceries_Bridge')") &&
  shell.indexOf("include('Client_Supabase_Groceries_Bridge')") > shell.indexOf("include('Client_Supabase_Meals_Bridge')") &&
  shell.indexOf("include('Client_Supabase_Groceries_Bridge')") < shell.indexOf("include('Client_P3_Startup_Performance')"),
  'Grocery authority must install after Meals and before startup-performance finalization.'
);

for (const operation of ["'groceries.status'", "'groceries.read'", "'groceries.upsert'", "'groceries.delete'"]) {
  assert(host.includes(operation), `Missing allow-listed Grocery operation ${operation}.`);
}
assert(
  host.includes("const REQUEST_TYPE = 'vacation-portal-supabase-groceries-request'") &&
  host.includes('activeClient.auth.getSession()') &&
  host.includes(".from('trip_members')") &&
  host.includes(".from('grocery_items')") &&
  !host.includes('access_token') &&
  !host.includes('refresh_token') &&
  !host.includes('service_role') &&
  !host.includes('serviceRole'),
  'Grocery operations must execute in the authenticated browser Supabase context with RLS and no privileged/token forwarding.'
);
assert(
  host.includes("/^GROCERY-[A-Z0-9]{10}$/.test(id)") &&
  host.includes("codedError('unstable_grocery_id'") &&
  host.includes('legacy_id: legacyId'),
  'Grocery primary writes must require stable GROCERY-* legacy IDs.'
);
assert(
  host.includes("'Version': Number(row.version || 0)") &&
  host.includes(".eq('version', requireVersion(grocery))") &&
  host.includes("'grocery_version_conflict'") &&
  host.includes(".select('id')"),
  'Primary Grocery update/delete must use Version optimistic concurrency and verify one affected row.'
);
assert(
  host.includes("String(error.code || '') === '23505'") &&
  migration.includes('grocery_items_trip_legacy_active_unique'),
  'Stable Grocery IDs must be uniqueness-protected and duplicate creates must fail as a concurrency conflict.'
);
assert(
  host.includes('return readBundle(activeClient, membership)') &&
  host.includes('primary: primaryReadEnabled') &&
  host.includes('primaryWrite: primaryWriteEnabled'),
  'Every Grocery operation must return a fresh authoritative Supabase bundle and release authority flags.'
);

assert(
  migration.includes('drop policy if exists grocery_items_organizer_insert') &&
  migration.includes('drop policy if exists grocery_items_organizer_update') &&
  migration.includes('drop policy if exists grocery_items_organizer_delete') &&
  migration.includes('create policy grocery_items_member_insert') &&
  migration.includes('create policy grocery_items_member_update') &&
  migration.includes('create policy grocery_items_member_delete') &&
  migration.includes('private.is_trip_member(grocery_items.trip_id)'),
  'Grocery RLS must preserve the existing shared-traveler mutation model instead of regressing Grocery List to organizer-only writes.'
);

assert(
  client.includes('const waiter=pending[id]') &&
  client.includes('if(!waiter) return;'),
  'The Grocery client must ignore unrelated messages on the shared Supabase response channel.'
);
assert(
  client.includes('const inheritedRenderGroceries=renderP2Groceries_') &&
  client.includes('const inheritedSavePlannerForm=savePlannerForm') &&
  client.includes('const inheritedDeletePlannerItem=deletePlannerItem_') &&
  client.includes('const inheritedQuickSetBringing=quickSetGroceryBringing_') &&
  client.includes('const inheritedQuickSetPurchased=quickSetP2GroceryPurchased_') &&
  client.includes("if(String(name||'')!=='Grocery List') return inheritedSavePlannerForm.apply(this,arguments)") &&
  client.includes("if(String(name||'')!=='Grocery List') return inheritedDeletePlannerItem.apply(this,arguments)"),
  'The Grocery bridge must wrap only Grocery List behaviors and delegate every other planner domain unchanged.'
);
assert(
  client.includes('startPrimaryRead_();') &&
  client.includes('return loadingView_();') &&
  client.includes("DATA.supabaseDomainSources.groceryItems='supabase-primary'") &&
  client.indexOf('request_(OP_READ,{})') < client.indexOf('refreshSheetsBackup_(false);'),
  'Healthy Grocery startup must withhold Sheets rows, settle Supabase first, then refresh the rollback copy.'
);
assert(
  client.includes('DATA.supabaseGroceriesShadow=cloneRows_(groceries)') &&
  client.includes('function reapplyPrimarySnapshot_()') &&
  client.includes('DATA.groceries=cloneRows_(DATA.supabaseGroceriesShadow)') &&
  client.indexOf('reapplyPrimarySnapshot_();') < client.indexOf('return inheritedRenderGroceries.apply(this,arguments);'),
  'Every primary Grocery render must restore the authoritative Supabase snapshot before inherited rendering can expose deferred Sheets data.'
);
assert(
  client.includes("DATA.supabaseDomainSources.groceryItems='supabase-primary-fallback-sheets'") &&
  client.includes('requestSheetsFallback_();') &&
  client.includes('loadDeferredPortalData_();'),
  'Sheets may become the visible Grocery source only after an explicit primary-read failure.'
);
assert(
  client.includes("return 'GROCERY-'+suffix.slice(0,10)") &&
  client.includes("if(!existingId) grocery['Grocery ID']=stableGroceryId_();") &&
  !client.includes("'LOCAL-"),
  'New Grocery items must receive a stable GROCERY-* ID before optimistic or Supabase writes; LOCAL IDs are forbidden in this primary layer.'
);
assert(
  client.includes("request_(OP_UPSERT,{grocery:grocery},'primary')") &&
  client.includes('settleGroceries_(result)') &&
  client.includes('backupSave_(saved)') &&
  client.indexOf("request_(OP_UPSERT,{grocery:grocery},'primary')") < client.indexOf('backupSave_(saved)'),
  'Grocery save must commit and settle Supabase before the Sheets rollback save starts.'
);
assert(
  client.includes("request_(OP_DELETE,{grocery:input},'primary')") &&
  client.includes('backupDelete_(id)') &&
  client.indexOf("request_(OP_DELETE,{grocery:input},'primary')") < client.indexOf('backupDelete_(id)'),
  'Grocery removal must commit and settle Supabase before the Sheets rollback delete starts.'
);
assert(
  client.includes("'supabase-primary+sheets-backup-match'") &&
  client.includes("'supabase-primary+sheets-backup-mismatch'") &&
  client.includes("'supabase-primary+sheets-backup-unavailable'") &&
  client.includes("toast('Supabase Grocery '+label+' passed — Sheets backup matches.')"),
  'Grocery backup diagnostics must report match/mismatch/unavailable without rolling back Supabase success.'
);
assert(
  client.includes("Object.assign({},grocery,{requestId:requestId_()})") &&
  client.includes('.saveGrocery(payload)') &&
  client.includes(".deletePlannerItem('Grocery List',String(groceryId||''))") &&
  client.includes('.getGroceriesBackup();') &&
  !client.includes('withOrganizerAuthorization_') &&
  !client.includes('organizerAuthorizationValues_'),
  'Grocery Sheets rollback must preserve shared-traveler mutation semantics and use a fresh idempotency key per background save.'
);
assert(
  groceriesGs.includes('function getGroceriesBackup()') &&
  groceriesGs.includes("groceries: readSheet_('Grocery List')"),
  'Apps Script must expose a bounded Grocery rollback snapshot for verification.'
);
assert(
  client.includes('quickSetGroceryBringing_=function(id,bringing)') &&
  client.includes('quickSetP2GroceryPurchased_=function(id,purchased)') &&
  client.includes('return primaryQuickSave_(id,function(updated)') &&
  client.includes("updated.Purchased=purchased?'Yes':'No'") &&
  client.includes("updated.Bringing=bringing?'Yes':'No'"),
  'Bringing and Purchased quick toggles must remain available but route through Supabase-primary writes.'
);

console.log('PASS Supabase Grocery List primary / Sheets-backup cutover contract');