'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const hostBridge = fs.readFileSync(path.join(root, 'supabase-domain-bridge.js'), 'utf8');
const iframeBridge = fs.readFileSync(path.join(root, 'Client_Supabase_Domain_Bridge.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

assert(
  config.includes("release: 'V4.4.0-alpha2.8'"),
  'Travel bridge readiness fix must bump the PWA release cache key.'
);
assert(
  config.includes('travelPlans:') &&
  config.includes('shadowRead: true') &&
  config.includes('read: false') &&
  config.includes('write: false'),
  'Travel Plans must stay in authenticated shadow-read mode while Sheets remains primary.'
);
assert(
  config.includes("script.src='./supabase-domain-bridge.js?v='"),
  'The PWA must load the top-level Supabase domain bridge.'
);
assert(
  hostBridge.includes("const OP_READ_TRAVEL = 'travelPlans.read'"),
  'Host bridge must allow-list the Travel Plans read operation.'
);
assert(
  hostBridge.includes('travelShadowReadEnabled') &&
  hostBridge.includes('travelPrimaryReadEnabled'),
  'Host bridge must distinguish shadow reads from future primary reads.'
);
assert(
  hostBridge.includes(".from('trip_members')") &&
  hostBridge.includes(".from('travel_plans')") &&
  hostBridge.includes(".from('travelers')"),
  'Travel reads must resolve membership and RLS-protected traveler mappings in Supabase.'
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
  'Travel reads should reuse the account-shell Supabase client and tolerate module startup ordering.'
);
assert(
  iframeBridge.includes('window.top') &&
  iframeBridge.includes("error.code='bridge_timeout'") &&
  iframeBridge.includes('DATA.supabaseDomainDiagnostics.travelPlans'),
  'The Apps Script bridge must reach the top-level PWA through the HTML Service sandbox and expose safe diagnostics on failure.'
);
assert(
  iframeBridge.includes('legacyTravelLoad.call(window,force)') &&
  iframeBridge.includes("sheets+supabase-shadow-match") &&
  iframeBridge.includes("sheets+supabase-shadow-mismatch"),
  'Sheets must stay visible while the signed-in Supabase result is compared for equivalence.'
);
assert(
  iframeBridge.includes("DATA.supabaseDomainSources.travelPlans='supabase-primary'"),
  'The bridge must have a feature-flag promotion path for a later primary-read release.'
);
assert(
  shell.includes("include('Client_Supabase_Domain_Bridge')"),
  'Apps Script shell must install the Travel Plans shadow bridge.'
);
assert(
  shell.indexOf("include('Client_Supabase_Domain_Bridge')") > shell.indexOf("include('Client_P3_Travel_Arrivals')"),
  'The bridge override must load after the existing Travel feature.'
);
assert(
  serviceWorker.includes("family-vacation-pwa-v4-4-0-alpha2-8") &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-domain-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The service worker must refresh the Supabase bridge module during the guarded iOS cutover test.'
);

console.log('PASS Supabase Travel Plans nested authenticated shadow-read contract');
