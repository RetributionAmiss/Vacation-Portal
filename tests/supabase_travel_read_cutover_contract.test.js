'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const hostBridge = fs.readFileSync(path.join(root, 'supabase-domain-bridge.js'), 'utf8');
const iframeBridge = fs.readFileSync(path.join(root, 'Client_Supabase_Domain_Bridge.html'), 'utf8');
const travelServer = fs.readFileSync(path.join(root, 'Travel_Arrivals.gs'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const releaseMatch = config.match(/release:\s*'([^']+)'/);
assert(releaseMatch, 'The PWA release must be declared in config.js.');
const release = releaseMatch[1];
const cacheRelease = release.toLowerCase().replace(/\./g, '-');

assert(
  /^V4\.4\.0-alpha2\.\d+$/.test(release),
  'Travel primary-write contract must run against the active V4.4 alpha release.'
);
assert(
  config.includes('travelPlans:') &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: true') &&
  config.includes('write: true'),
  'Travel Plans must read and write through Supabase in the promoted stage.'
);
assert(
  config.includes("script.src='./supabase-domain-bridge.js?v='"),
  'The PWA must load the top-level Supabase domain bridge.'
);
assert(
  hostBridge.includes("const OP_READ_TRAVEL = 'travelPlans.read'") &&
  hostBridge.includes("const OP_UPSERT_TRAVEL = 'travelPlans.upsert'") &&
  hostBridge.includes("const OP_DELETE_TRAVEL = 'travelPlans.delete'"),
  'Host bridge must allow-list Travel read/upsert/delete operations.'
);
assert(
  hostBridge.includes('travelShadowReadEnabled') &&
  hostBridge.includes('travelPrimaryReadEnabled') &&
  hostBridge.includes('travelShadowWriteEnabled') &&
  hostBridge.includes('travelPrimaryWriteEnabled'),
  'Host bridge must distinguish shadow and primary read/write stages.'
);
assert(
  hostBridge.includes('writePrimary: travelPrimaryWriteEnabled') &&
  hostBridge.includes('writeShadow: travelShadowWriteEnabled && !travelPrimaryWriteEnabled'),
  'The host must advertise the current write mode to the Apps Script iframe.'
);
assert(
  hostBridge.includes(".from('trip_members')") &&
  hostBridge.includes(".from('travel_plans')") &&
  hostBridge.includes(".from('travelers')"),
  'Travel operations must resolve membership and RLS-protected traveler mappings in Supabase.'
);
assert(
  hostBridge.includes(".upsert(row, { onConflict: 'trip_id,traveler_id' })") &&
  hostBridge.includes(".delete()") &&
  hostBridge.includes('assertTravelerMatch(plan, traveler)'),
  'Primary writes must remain idempotent per traveler and bound to the signed-in traveler mapping.'
);
assert(
  hostBridge.includes('childFrameForSource(event.source)') &&
  hostBridge.includes('isTrustedAppsScriptOrigin(event.origin)') &&
  !hostBridge.includes('access_token') &&
  !hostBridge.includes('refresh_token'),
  'The domain bridge must accept direct or validated nested Apps Script requests without exposing session tokens.'
);
assert(
  hostBridge.includes('window.VacationSupabase') &&
  hostBridge.includes('AUTH_CLIENT_WAIT_MS'),
  'Travel operations should reuse the account-shell Supabase client and tolerate module startup ordering.'
);
assert(
  iframeBridge.includes('window.top') &&
  iframeBridge.includes("error.code='bridge_timeout'") &&
  iframeBridge.includes('DATA.supabaseDomainDiagnostics.travelPlans'),
  'The Apps Script bridge must reach the top-level PWA through the HTML Service sandbox and expose safe diagnostics on failure.'
);

const loadStart = iframeBridge.indexOf('p3TravelArrivalLoad_=function(force)');
const primaryRequest = iframeBridge.indexOf('request_(OP_READ_TRAVEL)', loadStart);
const primaryAssignment = iframeBridge.indexOf("DATA.supabaseDomainSources.travelPlans='supabase-primary'", primaryRequest);
const fallbackAssignment = iframeBridge.indexOf("DATA.supabaseDomainSources.travelPlans='supabase-primary-fallback-sheets'", primaryRequest);
const fallbackLoad = iframeBridge.indexOf('legacyTravelLoad.call(window,true)', fallbackAssignment);
assert(
  loadStart >= 0 && primaryRequest > loadStart && primaryAssignment > primaryRequest,
  'Travel loading must request Supabase first and promote a successful primary response into visible DATA.'
);
assert(
  iframeBridge.includes('announcePrimaryReadStatus_()') &&
  iframeBridge.includes('Supabase Travel primary read passed — loaded from Supabase.'),
  'The live primary-read stage must retain its one-time success diagnostic.'
);
assert(
  fallbackAssignment > primaryRequest && fallbackLoad > fallbackAssignment &&
  iframeBridge.includes("DATA.supabaseTravelWriteMode='legacy'") &&
  iframeBridge.includes('Using Sheets fallback.'),
  'A failed primary Supabase read must fall back to Sheets reads and writes for that runtime.'
);
assert(
  iframeBridge.includes("DATA.supabaseTravelWriteMode='primary'") &&
  iframeBridge.includes('primaryWriteEnabled_()') &&
  iframeBridge.includes('return primarySave_(event)') &&
  iframeBridge.includes('return primaryDelete_()'),
  'A successful read must activate the guarded Supabase-primary mutation path.'
);
assert(
  iframeBridge.includes('request_(OP_UPSERT_TRAVEL,{plan:optimistic})') &&
  iframeBridge.includes('request_(OP_DELETE_TRAVEL,{plan:plan})'),
  'Primary Travel save/delete operations must go to Supabase before any Sheets backup sync.'
);
assert(
  iframeBridge.includes("mirrorPrimaryToSheets_('upsert',settled)") &&
  iframeBridge.includes("mirrorPrimaryToSheets_('delete',plan)"),
  'Successful Supabase mutations must mirror to Sheets only after the primary mutation succeeds.'
);
assert(
  iframeBridge.includes('Supabase Travel '+"'+label+'"+' passed — Sheets backup matches.') &&
  iframeBridge.includes('Sheets backup sync was unavailable'),
  'Primary mutations must expose safe backup-equivalence and backup-failure diagnostics without rolling back Supabase.'
);
assert(
  iframeBridge.includes('legacyTravelSave.apply(this,arguments)') &&
  iframeBridge.includes('legacyTravelDelete.apply(this,arguments)') &&
  iframeBridge.includes("window.p3TravelArrivalShadowWrite_('upsert',settled)") &&
  iframeBridge.includes("window.p3TravelArrivalShadowWrite_('delete',before)"),
  'The same deployed bridge must retain the validated Sheets-first rollback path.'
);
assert(
  travelServer.includes('function travelArrivalRequestedId_(value)') &&
  travelServer.includes('values.travelPlanId') &&
  travelServer.includes("record['Travel Plan ID'] = requestedId || uid_('TRAVEL')"),
  'Sheets backup writes must accept the stable Travel ID created by the Supabase-primary client.'
);
assert(
  shell.includes("include('Client_Supabase_Domain_Bridge')"),
  'Apps Script shell must install the Travel Plans bridge.'
);
assert(
  shell.indexOf("include('Client_Supabase_Domain_Bridge')") > shell.indexOf("include('Client_P3_Travel_Arrivals')"),
  'The bridge override must load after the existing Travel feature.'
);
assert(
  serviceWorker.includes('family-vacation-pwa-' + cacheRelease) &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-domain-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The service worker must track the active release while keeping the Supabase Travel bridge current.'
);

console.log('PASS Supabase Travel Plans primary read/write with Sheets backup contract');
