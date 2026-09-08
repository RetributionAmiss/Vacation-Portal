'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const hostBridge = fs.readFileSync(path.join(root, 'supabase-domain-bridge.js'), 'utf8');
const packingWriteHost = fs.readFileSync(path.join(root, 'supabase-packing-write-bridge.js'), 'utf8');
const packingBridge = fs.readFileSync(path.join(root, 'Client_Supabase_Packing_Bridge.html'), 'utf8');
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

assert(
  config.includes("release: 'V4.4.0-alpha2.14'"),
  'Packing primary-read release must bump the PWA cache key.'
);
assert(
  config.includes('packingItems:') &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: true') &&
  config.includes('read: true') &&
  config.includes('write: false'),
  'Packing must read from Supabase while Sheets remains the authoritative write path with shadow mirroring.'
);
assert(
  config.includes('travelPlans:') && config.includes('read: true') && config.includes('write: true'),
  'The Packing slice must not regress the completed Travel primary cutover.'
);
assert(
  config.includes("script.src='./supabase-packing-write-bridge.js?v='"),
  'The PWA must keep loading the Packing-only host mutation bridge.'
);
assert(
  hostBridge.includes("const OP_READ_PACKING = 'packingItems.read'") &&
  hostBridge.includes('packingShadowReadEnabled') &&
  hostBridge.includes('packingPrimaryReadEnabled') &&
  hostBridge.includes('primary: packingPrimaryReadEnabled'),
  'The top-level domain bridge must advertise and release-gate Packing primary reads.'
);
assert(
  hostBridge.includes(".from('packing_items')") &&
  hostBridge.includes(".from('trip_members')") &&
  hostBridge.includes(".from('travelers')"),
  'Packing reads must resolve the authenticated membership and RLS-protected traveler mappings.'
);
assert(
  packingWriteHost.includes("const OP_UPSERT_PACKING = 'packingItems.upsert'") &&
  packingWriteHost.includes("const OP_TOGGLE_PACKING = 'packingItems.toggle'") &&
  packingWriteHost.includes("const OP_DELETE_PACKING = 'packingItems.delete'"),
  'Packing shadow writes must remain limited to explicit upsert/toggle/delete operations.'
);
assert(
  packingWriteHost.includes(".upsert(row, { onConflict: 'trip_id,legacy_id' })") &&
  packingWriteHost.includes(".rpc('set_packing_item_packed'") &&
  packingWriteHost.includes(".from('packing_items')") &&
  packingWriteHost.includes('.delete()'),
  'Packing mutations must use stable legacy IDs, the constrained toggle RPC, and RLS-protected table writes.'
);
assert(
  packingWriteHost.includes(".from('trip_members')") &&
  packingWriteHost.includes(".from('travelers')") &&
  !packingWriteHost.includes('access_token') &&
  !packingWriteHost.includes('refresh_token'),
  'Packing writes must resolve server-side membership/traveler IDs without exposing session tokens.'
);
assert(
  packingBridge.includes("const OP_READ_PACKING='packingItems.read'") &&
  packingBridge.includes("const OP_UPSERT_PACKING='packingItems.upsert'") &&
  packingBridge.includes("const OP_TOGGLE_PACKING='packingItems.toggle'") &&
  packingBridge.includes("const OP_DELETE_PACKING='packingItems.delete'"),
  'The Apps Script bridge must know only the allow-listed Packing operations.'
);

const loadStart = packingBridge.indexOf('p3PackingLoad_=function(force)');
const primaryRequest = packingBridge.indexOf('request_(OP_READ_PACKING', loadStart);
const primaryAssignment = packingBridge.indexOf("DATA.supabaseDomainSources.packingItems='supabase-primary'", primaryRequest);
const fallbackAssignment = packingBridge.indexOf("DATA.supabaseDomainSources.packingItems='supabase-primary-fallback-sheets'", primaryRequest);
const fallbackLoad = packingBridge.indexOf('legacyPackingLoad.call(window,true)', fallbackAssignment);
assert(
  loadStart >= 0 && primaryRequest > loadStart && primaryAssignment > primaryRequest,
  'Packing loading must request Supabase first and promote a successful primary response into visible DATA.'
);
assert(
  packingBridge.includes('announcePrimaryReadStatus_()') &&
  packingBridge.includes('Supabase Packing primary read passed — loaded from Supabase.'),
  'The live Packing primary-read stage must expose a one-time success diagnostic.'
);
assert(
  fallbackAssignment > primaryRequest && fallbackLoad > fallbackAssignment &&
  packingBridge.includes('Using Sheets fallback.'),
  'A failed primary Supabase Packing read must explicitly fall back to Sheets.'
);
assert(
  packingBridge.includes('legacyPackingLoad.call(window,force)') &&
  packingBridge.includes('recordComparison_(items,0)') &&
  packingBridge.includes('itemsMatchSheets_'),
  'The deployed bridge must retain the previously validated Sheets-first shadow-read rollback path.'
);
assert(
  packingBridge.includes('legacyPackingSave.apply(this,arguments)') &&
  packingBridge.includes('legacyPackingToggle.apply(this,arguments)') &&
  packingBridge.includes('legacyPackingDelete.apply(this,arguments)') &&
  packingBridge.includes("shadowWrite_('save'") &&
  packingBridge.includes("shadowWrite_('toggle'") &&
  packingBridge.includes("shadowWrite_('delete'"),
  'Every Packing mutation must remain Sheets-first and settle before its Supabase mirror runs.'
);
assert(
  packingBridge.includes("toast('Supabase Packing '+label+' check passed — data matches Sheets.')") &&
  packingBridge.includes('Sheets is still primary.') &&
  packingBridge.includes('Sheets saved successfully.'),
  'Packing mutation checks must retain safe live equivalence diagnostics while reads are primary.'
);
assert(
  shell.includes("include('Client_Supabase_Packing_Bridge')") &&
  shell.indexOf("include('Client_Supabase_Packing_Bridge')") > shell.indexOf("include('Client_P3_Packing_Optimistic')"),
  'The Packing bridge must load after the finalized Packing client implementation.'
);
assert(
  quantityMigration.includes('drop constraint if exists packing_items_quantity_check') &&
  quantityMigration.includes('alter column quantity type text using quantity::text') &&
  quantityMigration.includes("alter column quantity set default ''"),
  'Packing quantity must preserve the existing free-form Sheets semantics.'
);
assert(
  writeMigration.includes('packing_items_trip_legacy_key unique (trip_id, legacy_id)') &&
  writeMigration.includes('security definer') &&
  writeMigration.includes("set search_path = ''") &&
  writeMigration.includes('private.is_trip_member(p_trip_id)') &&
  writeMigration.includes('private.is_trip_organizer(p_trip_id)') &&
  writeMigration.includes('target_bringer is null or target_bringer = current_traveler') &&
  writeMigration.includes('revoke all on function public.set_packing_item_packed') &&
  writeMigration.includes('grant execute on function public.set_packing_item_packed'),
  'Packing write support must remain idempotent and keep shared-item toggles narrowly authorized.'
);
assert(
  serviceWorker.includes("family-vacation-pwa-v4-4-0-alpha2-14") &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-packing-write-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The installed PWA must refresh the Packing host bridges during the primary-read test.'
);

console.log('PASS Supabase Packing primary read / Sheets-primary write guarded cutover contract');
