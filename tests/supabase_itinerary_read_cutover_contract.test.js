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
  config.includes("release: 'V4.4.0-alpha2.26'"),
  'The Meals cutover must advance the installed PWA cache key without regressing Itinerary.'
);
assert(
  config.includes('itinerary:') &&
  config.includes('shadowRead: false') &&
  config.includes('shadowWrite: false') &&
  config.includes('read: true') &&
  config.includes('write: true'),
  'Itinerary must remain Supabase-primary for reads and writes in alpha2.26.'
);
assert(
  config.includes('travelPlans:') && config.includes('packingItems:') &&
  config.includes('read: true') && config.includes('write: true'),
  'The Meals cutover must not regress completed Travel and Packing primary cutovers.'
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
  clientBridge.includes("if(currentView==='itinerary')") &&
  clientBridge.includes('itineraryRead_(context,args);') &&
  clientBridge.includes('// Primary path: do not hydrate Sheets first.') &&
  !clientBridge.includes('socialReady_(0,function(socialError)'),
  'Healthy Itinerary startup must request Supabase directly instead of waiting for a Sheets social hydration.'
);
assert(
  clientBridge.includes('function refreshSheetsSocialBackup_(force)') &&
  clientBridge.includes('.getPlannerSocialData();') &&
  clientBridge.includes('DATA.itinerarySheetsBackup=') &&
  clientBridge.includes('DATA.plannerComments=sheetsOtherComments.concat(currentItineraryComments)') &&
  clientBridge.includes("if(currentView==='meals') render();"),
  'The Itinerary bridge must retain its nonblocking Sheets rollback snapshot without replacing Supabase Itinerary rows.'
);
assert(
  clientBridge.includes('DATA.itinerary=(result&&result.itinerary)||[]') &&
  clientBridge.includes('DATA.itinerarySignups=(result&&result.itinerarySignups)||[]') &&
  clientBridge.includes("String(row['Planner Type']||'')!=='Itinerary'") &&
  clientBridge.includes('DATA.plannerComments=nonItineraryComments.concat(supabaseComments)') &&
  clientBridge.includes('rememberMembership_(result)'),
  'A primary Supabase response must replace visible Itinerary rows, retain non-Itinerary comments, and retain authenticated membership.'
);
assert(
  clientBridge.includes("DATA.supabaseDomainSources.itinerary='supabase-primary'") &&
  clientBridge.includes('Supabase Itinerary primary read passed — loaded from Supabase.') &&
  clientBridge.includes('p2PlannerSocialState_.lastLoaded=Date.now()') &&
  clientBridge.indexOf("DATA.supabaseDomainSources.itinerary='supabase-primary'") <
    clientBridge.indexOf('refreshSheetsSocialBackup_(false);'),
  'Supabase must settle as the visible Itinerary authority before any Apps Script rollback refresh begins.'
);
assert(
  clientBridge.includes("DATA.supabaseDomainSources.itinerary='supabase-primary-fallback-sheets'") &&
  clientBridge.includes('Using Sheets fallback.') &&
  clientBridge.includes('function activateSheetsFallback_(context,args)') &&
  clientBridge.includes('sheetsItineraryReady_(0,function(sheetError)') &&
  clientBridge.includes('legacyEnsure.apply(context,args||[])') &&
  clientBridge.includes('loadDeferredPortalData_();'),
  'A failed primary Itinerary read must explicitly promote the complete Sheets fallback path.'
);
assert(
  clientBridge.includes("if(currentView==='meals')") &&
  clientBridge.includes('refreshSheetsSocialBackup_(false);') &&
  shell.includes("include('Client_Supabase_Planner_Comments_Bridge')") &&
  shell.indexOf("include('Client_Supabase_Planner_Comments_Bridge')") >
    shell.indexOf("include('Client_Supabase_Itinerary_Bridge')"),
  'The legacy Meals rollback hook may remain in the Itinerary bridge, but the Supabase planner-comments authority layer must install later.'
);
assert(
  clientBridge.includes("sectionDiff_('activities'") &&
  clientBridge.includes("sectionDiff_('signups'") &&
  clientBridge.includes("sectionDiff_('comments'") &&
  clientBridge.includes("code:'shadow_mismatch'"),
  'The validated comparator must remain available for rollback diagnostics.'
);
assert(
  shell.includes("include('Client_Supabase_Itinerary_Bridge')") &&
  shell.includes("include('Client_Supabase_Itinerary_Write_Bridge')") &&
  shell.includes("include('Client_Supabase_Itinerary_Concurrency_Bridge')") &&
  shell.includes("include('Client_Supabase_Itinerary_Comment_Lifecycle')"),
  'The evaluated Apps Script shell must include every Itinerary cutover layer.'
);
assert(
  plannerSocial.includes('function getPlannerSocialData()') &&
  plannerSocial.includes("readSheet_('Itinerary Signups')") &&
  plannerSocial.includes("readSheet_('Planner Comments')"),
  'Sheets rollback loading must remain available even though it is no longer on the healthy primary startup path.'
);
assert(
  serviceWorker.includes('family-vacation-pwa-v4-4-0-alpha2-26') &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-bridge.js')") &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-write-bridge.js')") &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-comment-bridge.js')") &&
  serviceWorker.includes('networkFirst(request)'),
  'The installed PWA must keep every accepted Itinerary bridge network-first in alpha2.26.'
);

console.log('PASS Supabase-first Itinerary read authority contract');