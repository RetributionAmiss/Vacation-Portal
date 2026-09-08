'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const hostBridge = fs.readFileSync(path.join(root, 'supabase-domain-bridge.js'), 'utf8');
const packingWriteHost = fs.readFileSync(path.join(root, 'supabase-packing-write-bridge.js'), 'utf8');
const packingPrimaryWriteHost = fs.readFileSync(path.join(root, 'supabase-packing-primary-write-bridge.js'), 'utf8');
const packingBridge = fs.readFileSync(path.join(root, 'Client_Supabase_Packing_Bridge.html'), 'utf8');
const packingPrimaryClient = fs.readFileSync(path.join(root, 'Client_Supabase_Packing_Primary_Write.html'), 'utf8');
const packingServer = fs.readFileSync(path.join(root, 'Packing.gs'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const quantityMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260908184400_packing_quantity_text_fidelity.sql'),
  'utf8'
);
const writeMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260908191000_packing_shadow_write_support.sql'),
  'utf8'
);
const versionMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260908193800_packing_primary_write_version_guard.sql'),
  'utf8'
);
const releaseMatch = config.match(/release:\s*'([^']+)'/);
assert(releaseMatch, 'The PWA release must be declared in config.js.');
const release = releaseMatch[1];
const cacheRelease = release.toLowerCase().replace(/\./g, '-');

assert(
  /^V4\.4\.0-alpha2\.\d+$/.test(release),
  'Packing primary-write contract must run against the active V4.4 alpha release.'
);
assert(
  config.includes('packingItems:') &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: true') &&
  config.includes('write: true'),
  'Packing must read and write through Supabase in the promoted stage.'
);
assert(
  config.includes('travelPlans:') && config.includes('read: true') && config.includes('write: true'),
  'The Packing slice must not regress the completed Travel primary cutover.'
);
assert(
  config.includes("script.src='./supabase-packing-write-bridge.js?v='") &&
  config.includes("script.src='./supabase-packing-primary-write-bridge.js?v='"),
  'The PWA must keep the validated rollback bridge and load the guarded Packing primary-write bridge.'
);

assert(
  hostBridge.includes("const OP_READ_PACKING = 'packingItems.read'") &&
  hostBridge.includes('packingShadowReadEnabled') &&
  hostBridge.includes('packingPrimaryReadEnabled') &&
  hostBridge.includes('primary: packingPrimaryReadEnabled'),
  'The top-level domain bridge must continue release-gating Packing primary reads.'
);
assert(
  hostBridge.includes(".from('packing_items')") &&
  hostBridge.includes(".from('trip_members')") &&
  hostBridge.includes(".from('travelers')"),
  'Packing reads must continue through authenticated RLS-protected tables.'
);

assert(
  packingWriteHost.includes("const OP_UPSERT_PACKING = 'packingItems.upsert'") &&
  packingWriteHost.includes("const OP_TOGGLE_PACKING = 'packingItems.toggle'") &&
  packingWriteHost.includes("const OP_DELETE_PACKING = 'packingItems.delete'") &&
  packingWriteHost.includes(".upsert(row, { onConflict: 'trip_id,legacy_id' })"),
  'The validated Sheets-first Packing rollback/mirror bridge must remain deployed.'
);
assert(
  !packingWriteHost.includes('access_token') && !packingWriteHost.includes('refresh_token'),
  'The rollback bridge must not expose Supabase session tokens.'
);

assert(
  packingPrimaryWriteHost.includes("const OP_STATUS = 'packingItems.primaryWriteStatus'") &&
  packingPrimaryWriteHost.includes("const OP_UPSERT = 'packingItems.primaryUpsert'") &&
  packingPrimaryWriteHost.includes("const OP_TOGGLE = 'packingItems.primaryToggle'") &&
  packingPrimaryWriteHost.includes("const OP_DELETE = 'packingItems.primaryDelete'"),
  'Packing primary writes must be isolated behind a distinct allow-listed host bridge.'
);
assert(
  packingPrimaryWriteHost.includes(".from('trip_members')") &&
  packingPrimaryWriteHost.includes(".from('travelers')") &&
  packingPrimaryWriteHost.includes(".from('packing_items')") &&
  !packingPrimaryWriteHost.includes('access_token') &&
  !packingPrimaryWriteHost.includes('refresh_token'),
  'Primary Packing writes must resolve membership/traveler mappings under RLS without exposing tokens.'
);
assert(
  packingPrimaryWriteHost.includes(".update(row)") &&
  packingPrimaryWriteHost.includes(".eq('version', version)") &&
  packingPrimaryWriteHost.includes(".upsert(row, { onConflict: 'trip_id,legacy_id' })") &&
  packingPrimaryWriteHost.includes("p_expected_version: version") &&
  packingPrimaryWriteHost.includes(".delete()"),
  'Primary save/toggle/delete mutations must be idempotent for creates and version-guarded for existing rows.'
);
assert(
  packingPrimaryWriteHost.includes('packing_version_conflict') &&
  packingPrimaryWriteHost.includes('Packing item changed on another device. Refresh and try again.'),
  'Primary Packing writes must surface stale-version conflicts instead of silently overwriting newer data.'
);

const loadStart = packingBridge.indexOf('p3PackingLoad_=function(force)');
const primaryRequest = packingBridge.indexOf('request_(OP_READ_PACKING', loadStart);
const primaryAssignment = packingBridge.indexOf("DATA.supabaseDomainSources.packingItems='supabase-primary'", primaryRequest);
const fallbackAssignment = packingBridge.indexOf("DATA.supabaseDomainSources.packingItems='supabase-primary-fallback-sheets'", primaryRequest);
const fallbackLoad = packingBridge.indexOf('legacyPackingLoad.call(window,true)', fallbackAssignment);
assert(
  loadStart >= 0 && primaryRequest > loadStart && primaryAssignment > primaryRequest,
  'Packing loading must still request Supabase first and promote a successful primary response into visible DATA.'
);
assert(
  packingBridge.includes('Supabase Packing primary read passed — loaded from Supabase.') &&
  fallbackAssignment > primaryRequest && fallbackLoad > fallbackAssignment &&
  packingBridge.includes('Using Sheets fallback.'),
  'Packing primary reads must retain their live success diagnostic and explicit Sheets fallback.'
);
assert(
  packingBridge.includes('legacyPackingSave.apply(this,arguments)') &&
  packingBridge.includes('legacyPackingToggle.apply(this,arguments)') &&
  packingBridge.includes('legacyPackingDelete.apply(this,arguments)') &&
  packingBridge.includes("shadowWrite_('save'") &&
  packingBridge.includes("shadowWrite_('toggle'") &&
  packingBridge.includes("shadowWrite_('delete'"),
  'The previously validated Sheets-first mutation path must remain available for runtime rollback.'
);

assert(
  packingPrimaryClient.includes("const OP_UPSERT='packingItems.primaryUpsert'") &&
  packingPrimaryClient.includes("const OP_TOGGLE='packingItems.primaryToggle'") &&
  packingPrimaryClient.includes("const OP_DELETE='packingItems.primaryDelete'") &&
  packingPrimaryClient.includes("DATA.supabaseDomainSources.packingItems==='supabase-primary'"),
  'The client may use primary writes only after the current runtime has a successful Supabase primary read.'
);
assert(
  packingPrimaryClient.includes("return 'PACK-'") &&
  packingPrimaryClient.includes('optimistic.Version=existing?Number(existing.Version||0):0') &&
  packingPrimaryClient.includes("request_(OP_UPSERT,{item:optimistic})") &&
  packingPrimaryClient.includes("request_(OP_TOGGLE,{item:optimistic,packed:Boolean(packed)})") &&
  packingPrimaryClient.includes("request_(OP_DELETE,{item:item})"),
  'Primary Packing mutations must use stable IDs and preserve the Supabase row version through optimistic UI updates.'
);
assert(
  packingPrimaryClient.includes("mirrorPrimaryToSheets_('save',settled)") &&
  packingPrimaryClient.includes("mirrorPrimaryToSheets_('toggle',settled)") &&
  packingPrimaryClient.includes("mirrorPrimaryToSheets_('delete',item)"),
  'Sheets backup writes must run only after the corresponding Supabase primary mutation succeeds.'
);
assert(
  packingPrimaryClient.includes('Supabase Packing '+"'+label+'"+' passed — Sheets backup matches.') &&
  packingPrimaryClient.includes('Sheets backup sync was unavailable') &&
  packingPrimaryClient.includes('packingItemsBackup'),
  'Primary Packing mutations must expose non-blocking Sheets backup equivalence diagnostics.'
);
assert(
  packingPrimaryClient.includes('return fallbackSave.apply(this,arguments)') &&
  packingPrimaryClient.includes('return fallbackToggle.apply(this,arguments)') &&
  packingPrimaryClient.includes('return fallbackDelete.apply(this,arguments)'),
  'A runtime that is not Supabase-primary must retain the already-validated Sheets-first mutation behavior.'
);

assert(
  packingServer.includes('function packingRequestedId_(value)') &&
  packingServer.includes('values.packingId') &&
  packingServer.includes("record['Packing ID'] = requestedId || uid_('PACK')"),
  'Sheets backup saves must accept the stable PACK ID created by the Supabase-primary client.'
);
assert(
  shell.includes("include('Client_Supabase_Packing_Bridge')") &&
  shell.includes("include('Client_Supabase_Packing_Primary_Write')") &&
  shell.indexOf("include('Client_Supabase_Packing_Primary_Write')") > shell.indexOf("include('Client_Supabase_Packing_Bridge')"),
  'The primary-write override must load after the Packing primary-read/rollback bridge.'
);

assert(
  quantityMigration.includes('alter column quantity type text using quantity::text'),
  'Packing quantity must preserve the existing free-form Sheets semantics.'
);
assert(
  writeMigration.includes('packing_items_trip_legacy_key unique (trip_id, legacy_id)') &&
  writeMigration.includes('private.is_trip_organizer(p_trip_id)'),
  'Packing must retain its stable legacy-ID uniqueness and narrow shared-toggle authorization foundation.'
);
assert(
  versionMigration.includes('p_expected_version bigint') &&
  versionMigration.includes('target_version <> p_expected_version') &&
  versionMigration.includes('version = p_expected_version') &&
  versionMigration.includes("errcode = '40001'") &&
  versionMigration.includes('security definer') &&
  versionMigration.includes("set search_path = ''"),
  'The primary-toggle RPC must enforce optimistic concurrency without weakening its security boundary.'
);
assert(
  serviceWorker.includes('family-vacation-pwa-'+cacheRelease) &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-packing-primary-write-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The installed PWA must refresh the Packing primary-write host module during guarded live tests.'
);

console.log('PASS Supabase Packing primary read/write with Sheets backup contract');
