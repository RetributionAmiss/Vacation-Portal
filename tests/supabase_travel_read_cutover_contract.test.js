'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const hostBridge = fs.readFileSync(path.join(root, 'supabase-domain-bridge.js'), 'utf8');
const iframeBridge = fs.readFileSync(path.join(root, 'Client_Supabase_Domain_Bridge.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');

assert(
  config.includes("release: 'V4.4.0-alpha2.7'"),
  'Travel shadow validation must bump the PWA release cache key.'
);
assert(
  config.includes('travelPlans:') &&
  config.includes('shadowRead: true') &&
  config.includes('read: false') &&
  config.includes('write: false'),
  'Travel Plans must start in authenticated shadow-read mode while Sheets remains primary.'
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
  !hostBridge.includes('access_token') &&
  !hostBridge.includes('refresh_token'),
  'The domain bridge must accept only child-frame requests and must not expose session tokens.'
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

console.log('PASS Supabase Travel Plans authenticated shadow-read contract');
