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
  config.includes("release: 'V4.4.0-alpha2.22'"),
  'Itinerary comment-lifecycle release must bump the installed PWA cache key.'
);
assert(
  config.includes('itinerary:') &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: true') &&
  config.includes('write: true'),
  'Itinerary must use Supabase-primary reads and writes in alpha2.22.'
);
assert(
  config.includes('travelPlans:') && config.includes('packingItems:') &&
  config.includes('read: true') && config.includes('write: true'),
  'The Itinerary slice must not regress the completed Travel and Packing primary cutovers.'
);
assert(
  config.includes("script.src='./supabase-itinerary-bridge.js?v='"),
  'The PWA must load the release-versioned Itinerary read bridge.'
);

assert(
  hostBridge.includes("const OP_READ = 'itinerary.read'") &&
  hostBridge.includes("const REQUEST_TYPE = 'vacation-portal-supabase-itinerary-request'"),
  'The Itinerary read host bridge must preserve the allow-listed read operation.'
);
assert(
  hostBridge.includes(".from('trip_members')") &&
  hostBridge.includes(".from('itinerary_items')") &&
  hostBridge.includes(".from('itinerary_signups')") &&
  hostBridge.includes(".from('planner_comments')") &&
  hostBridge.includes(".from('travelers')"),
  'Itinerary primary reads must use authenticated RLS-protected Supabase tables and traveler mapping.'
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
  'The read bridge must report release mode and never pass Supabase session tokens into Apps Script.'
);

assert(
  clientBridge.includes('const legacyEnsure=p2PlannerEnsureSocialData_') &&
  clientBridge.includes('sheetsItineraryReady_(0,function(sheetError)') &&
  clientBridge.includes('DATA.deferredLoaded===true') &&
  clientBridge.includes('legacyEnsure.apply(context,args)') &&
  clientBridge.includes('socialReady_(0,function(socialError)') &&
  clientBridge.includes("if(currentView!=='itinerary')"),
  'Primary reads must retain a complete Sheets activities/social rollback snapshot before promoting Supabase.'
);
assert(
  clientBridge.includes("error.code='sheets_itinerary_not_ready'") &&
  clientBridge.includes("error.code='sheets_social_not_ready'") &&
  clientBridge.includes('Array.isArray(DATA.itinerarySignups)') &&
  clientBridge.includes('Array.isArray(DATA.plannerComments)'),
  'Fallback readiness timeouts must remain explicit instead of treating partial Sheets data as complete.'
);
assert(
  clientBridge.includes('if(result&&result.primary===true)') &&
  clientBridge.includes('recordPrimaryResult_(result)') &&
  clientBridge.includes('DATA.itinerary=(result&&result.itinerary)||[]') &&
  clientBridge.includes('DATA.itinerarySignups=(result&&result.itinerarySignups)||[]') &&
  clientBridge.includes("String(row['Planner Type']||'')!=='Itinerary'") &&
  clientBridge.includes('DATA.plannerComments=nonItineraryComments.concat(supabaseComments)'),
  'A primary Supabase response must replace visible Itinerary rows without deleting Meals/non-Itinerary comments.'
);
assert(
  clientBridge.includes("DATA.supabaseDomainSources.itinerary='supabase-primary'") &&
  clientBridge.includes('Supabase Itinerary primary read passed — loaded from Supabase.') &&
  clientBridge.includes('p2PlannerSocialState_.lastLoaded=Date.now()'),
  'A successful primary read must identify Supabase as visible source and keep social freshness coherent.'
);
assert(
  clientBridge.includes("DATA.supabaseDomainSources.itinerary='supabase-primary-fallback-sheets'") &&
  clientBridge.includes('Using Sheets fallback.') &&
  clientBridge.includes('p2PlannerSocialState_.loaded=false') &&
  clientBridge.includes('loadDeferredPortalData_();') &&
  clientBridge.includes('error.primary=Boolean(data.error&&data.error.primary)'),
  'A failed primary read must restore the Sheets fallback path and explicitly identify the fallback runtime.'
);
assert(
  clientBridge.includes('(DATA&&DATA.itinerary)||[]') &&
  clientBridge.includes('(DATA&&DATA.itinerarySignups)||[]') &&
  clientBridge.includes('(DATA&&DATA.plannerComments)||[]') &&
  clientBridge.includes("sectionDiff_('activities'") &&
  clientBridge.includes("sectionDiff_('signups'") &&
  clientBridge.includes("sectionDiff_('comments'") &&
  clientBridge.includes("code:'shadow_mismatch'"),
  'The validated field-for-field comparator must remain available for rollback diagnostics.'
);
assert(
  shell.includes("include('Client_Supabase_Itinerary_Bridge')") &&
  shell.includes("include('Client_Supabase_Itinerary_Write_Bridge')") &&
  shell.includes("include('Client_Supabase_Itinerary_Concurrency_Bridge')") &&
  shell.includes("include('Client_Supabase_Itinerary_Comment_Lifecycle')"),
  'The evaluated Apps Script shell must include all Itinerary cutover and comment-lifecycle layers.'
);
assert(
  plannerSocial.includes('function getPlannerSocialData()') &&
  plannerSocial.includes("readSheet_('Itinerary Signups')") &&
  plannerSocial.includes("readSheet_('Planner Comments')"),
  'Sheets social loading must remain intact as rollback data and backup-token source.'
);
assert(
  serviceWorker.includes('family-vacation-pwa-v4-4-0-alpha2-22') &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-bridge.js')") &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-write-bridge.js')") &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-comment-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The installed PWA must refresh all Itinerary bridges during guarded primary-write testing.'
);

console.log('PASS Supabase Itinerary primary read/write guarded cutover read contract');