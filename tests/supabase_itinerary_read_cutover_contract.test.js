'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const hostBridge = fs.readFileSync(path.join(root, 'supabase-itinerary-bridge.js'), 'utf8');
const clientBridge = fs.readFileSync(path.join(root, 'Client_Supabase_Itinerary_Bridge.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const plannerSocial = fs.readFileSync(path.join(root, 'Planner_Social.gs'), 'utf8');

assert(
  config.includes("release: 'V4.4.0-alpha2.17'"),
  'Itinerary shadow diagnostic release must bump the installed PWA cache key.'
);
assert(
  config.includes('itinerary:') &&
  config.includes('shadowRead: true') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: false') &&
  config.includes('write: false'),
  'Itinerary must remain Sheets-primary while only the Supabase shadow read is enabled.'
);
assert(
  config.includes('travelPlans:') && config.includes('packingItems:') &&
  config.includes('read: true') && config.includes('write: true'),
  'The Itinerary slice must not regress the completed Travel and Packing primary cutovers.'
);
assert(
  config.includes("script.src='./supabase-itinerary-bridge.js?v='"),
  'The PWA must load the release-versioned Itinerary host bridge.'
);

assert(
  hostBridge.includes("const OP_READ = 'itinerary.read'") &&
  hostBridge.includes("const REQUEST_TYPE = 'vacation-portal-supabase-itinerary-request'"),
  'The Itinerary host bridge must expose only the allow-listed read operation for this stage.'
);
assert(
  hostBridge.includes(".from('trip_members')") &&
  hostBridge.includes(".from('itinerary_items')") &&
  hostBridge.includes(".from('itinerary_signups')") &&
  hostBridge.includes(".from('planner_comments')") &&
  hostBridge.includes(".from('travelers')"),
  'Itinerary shadow reads must use authenticated RLS-protected Supabase tables and traveler mapping.'
);
assert(
  hostBridge.includes(".eq('planner_type', 'Itinerary')") &&
  hostBridge.includes("'Cost': Number(row.cost_cents || 0) / 100") &&
  hostBridge.includes("'Cost Per': String(row.cost_per || '')") &&
  hostBridge.includes("'Item ID': String(row.item_legacy_id || itemLegacyById"),
  'The Supabase payload must preserve legacy Itinerary cost and comment-link semantics.'
);
assert(
  hostBridge.includes('primary: primaryReadEnabled') &&
  hostBridge.includes('shadow: shadowReadEnabled && !primaryReadEnabled') &&
  !hostBridge.includes('access_token') &&
  !hostBridge.includes('refresh_token'),
  'The bridge must stay release-gated and must never pass Supabase session tokens into Apps Script.'
);

assert(
  clientBridge.includes('const legacyEnsure=p2PlannerEnsureSocialData_') &&
  clientBridge.includes('const result=legacyEnsure.apply(this,arguments)') &&
  clientBridge.includes("if(currentView==='itinerary')") &&
  clientBridge.includes('socialReady_(0,shadowRead_)'),
  'Sheets must load first and remain authoritative while the Itinerary shadow read runs afterward.'
);
assert(
  clientBridge.includes('(DATA&&DATA.itinerary)||[]') &&
  clientBridge.includes('(DATA&&DATA.itinerarySignups)||[]') &&
  clientBridge.includes('(DATA&&DATA.plannerComments)||[]'),
  'The comparator must cover activities, signups, and Itinerary planner comments together.'
);
assert(
  clientBridge.includes("String(row['Planner Type']||'')==='Itinerary'") &&
  clientBridge.includes('Supabase Itinerary check passed — data matches Sheets.') &&
  clientBridge.includes('Supabase Itinerary difference — ') &&
  clientBridge.includes("sectionDiff_('activities'") &&
  clientBridge.includes("sectionDiff_('signups'") &&
  clientBridge.includes("sectionDiff_('comments'") &&
  clientBridge.includes("code:'shadow_mismatch'") &&
  clientBridge.includes('Supabase Itinerary check was unavailable'),
  'The live shadow diagnostic must distinguish match/unavailable states and identify the mismatching Itinerary section.'
);
assert(
  clientBridge.includes("reason:!b?'missing in Supabase':'missing in Sheets'") &&
  clientBridge.includes("reason:'field '+firstChangedField_(a,b)"),
  'Itinerary mismatch diagnostics must identify the first missing row or differing field without exposing row contents.'
);
assert(
  shell.includes("include('Client_Supabase_Itinerary_Bridge')"),
  'The evaluated Apps Script shell must include the Itinerary shadow comparator.'
);
assert(
  plannerSocial.includes('function getPlannerSocialData()') &&
  plannerSocial.includes("readSheet_('Itinerary Signups')") &&
  plannerSocial.includes("readSheet_('Planner Comments')"),
  'The existing Sheets social loader must remain intact as the authoritative path in this stage.'
);
assert(
  serviceWorker.includes('family-vacation-pwa-v4-4-0-alpha2-17') &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The installed PWA must refresh the Itinerary host bridge during guarded live testing.'
);

console.log('PASS Supabase Itinerary shadow-read mismatch diagnostic contract');
