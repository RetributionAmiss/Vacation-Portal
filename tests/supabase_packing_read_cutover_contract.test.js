'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const hostBridge = fs.readFileSync(path.join(root, 'supabase-domain-bridge.js'), 'utf8');
const packingBridge = fs.readFileSync(path.join(root, 'Client_Supabase_Packing_Bridge.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const quantityMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260908184400_packing_quantity_text_fidelity.sql'),
  'utf8'
);

assert(
  config.includes("release: 'V4.4.0-alpha2.12'"),
  'Packing shadow-read release must bump the PWA cache key.'
);
assert(
  config.includes('packingItems:') &&
  config.includes('shadowRead: true') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: false') &&
  config.includes('write: false'),
  'Packing must remain a Sheets-primary, Supabase-shadow-read domain in this stage.'
);
assert(
  config.includes('travelPlans:') && config.includes('read: true') && config.includes('write: true'),
  'The Packing slice must not regress the completed Travel primary cutover.'
);
assert(
  hostBridge.includes("const OP_READ_PACKING = 'packingItems.read'") &&
  hostBridge.includes('packingShadowReadEnabled') &&
  hostBridge.includes('packingPrimaryReadEnabled'),
  'The top-level bridge must allow-list and release-gate Packing reads.'
);
assert(
  hostBridge.includes(".from('packing_items')") &&
  hostBridge.includes(".from('trip_members')") &&
  hostBridge.includes(".from('travelers')"),
  'Packing reads must resolve the authenticated membership and RLS-protected traveler mappings.'
);
assert(
  hostBridge.includes("'Owner Traveler ID'") &&
  hostBridge.includes("'Bringing Traveler ID'") &&
  hostBridge.includes("'Packed': row.packed ? 'Yes' : 'No'") &&
  hostBridge.includes("'Quantity': row.quantity === null || row.quantity === undefined ? '' : String(row.quantity)"),
  'Supabase Packing rows must map back into the existing Sheets-shaped client contract.'
);
assert(
  !hostBridge.includes('access_token') && !hostBridge.includes('refresh_token'),
  'Packing cutover must not expose Supabase session tokens to the Apps Script iframe.'
);
assert(
  packingBridge.includes("const OP_READ_PACKING='packingItems.read'") &&
  packingBridge.includes('legacyPackingLoad.apply(this,arguments)') &&
  packingBridge.includes('itemsMatchSheets_') &&
  packingBridge.includes('DATA.supabaseDomainDiagnostics.packingItems'),
  'The Apps Script Packing bridge must compare a parallel Supabase read without replacing the Sheets loader.'
);
assert(
  packingBridge.includes('Supabase Packing check passed — data matches Sheets.') &&
  packingBridge.includes('Supabase Packing check found a difference. Sheets is still being used.') &&
  packingBridge.includes('Supabase Packing check was unavailable'),
  'The guarded Packing read must expose safe one-time live diagnostics.'
);
assert(
  !packingBridge.includes('savePackingItem(') &&
  !packingBridge.includes('togglePackingItem(') &&
  !packingBridge.includes('deletePackingItem('),
  'The first Packing cutover slice must not redirect any mutations away from Sheets.'
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
  'Packing quantity must preserve the existing free-form Sheets quantity semantics before write cutover.'
);
assert(
  serviceWorker.includes("family-vacation-pwa-v4-4-0-alpha2-12") &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-domain-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The installed PWA must refresh the host bridge during the guarded Packing test.'
);

console.log('PASS Supabase Packing Sheets-primary / shadow-read guarded cutover contract');
