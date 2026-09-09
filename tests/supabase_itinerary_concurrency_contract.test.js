'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const bridgeHtml = fs.readFileSync(path.join(root, 'Client_Supabase_Itinerary_Concurrency_Bridge.html'), 'utf8');
const bridgeJs = bridgeHtml
  .replace(/^\s*<script>\s*/, '')
  .replace(/\s*<\/script>\s*$/, '');

assert.doesNotThrow(
  () => new Function(bridgeJs),
  'The Itinerary concurrency bridge must remain valid browser JavaScript.'
);

assert(
  shell.includes("include('Client_Supabase_Itinerary_Concurrency_Bridge')") &&
  shell.indexOf("include('Client_Supabase_Itinerary_Concurrency_Bridge')") >
    shell.indexOf("include('Client_Supabase_Itinerary_Write_Bridge')"),
  'The concurrency bridge must install after the primary-read and shadow-write wrappers.'
);

assert(
  bridgeHtml.includes("Object.defineProperty(state,'loading'") &&
  bridgeHtml.includes('captureStartLastLoaded=Number(state.lastLoaded||0)') &&
  bridgeHtml.includes('Number(state.lastLoaded||0)>captureStartLastLoaded') &&
  bridgeHtml.includes('cacheRows_(DATA.itinerarySignups)'),
  'The bridge must capture the authoritative Sheets signup snapshot only after a successful Sheets social refresh.'
);

assert(
  bridgeHtml.includes("row.__supabaseUpdatedAt=String(row['Updated At']||'')") &&
  bridgeHtml.includes("row['Updated At']=token.updatedAt") &&
  bridgeHtml.includes('prepareExistingSignup_(itemId,travelerId)'),
  'Existing signup mutations must use the Sheets Updated At token while retaining the Supabase timestamp only for diagnostics.'
);

assert(
  bridgeHtml.includes('Activity signup version is still syncing. Refresh Itinerary and review the latest signup before saving.') &&
  bridgeHtml.includes('if(!token)') &&
  !bridgeHtml.includes("row['Updated At']=''") &&
  !bridgeHtml.includes('expectedUpdatedAt:null'),
  'A missing authoritative Sheets token must block an existing signup edit instead of disabling conflict detection.'
);

assert(
  bridgeHtml.includes("String(message||'')==='You’re on the activity list'") &&
  bridgeHtml.includes('captureSavedSignup_()') &&
  bridgeHtml.includes("String(fallback||'')==='Signup could not be saved'"),
  'The cached Sheets token must advance only after a successful signup save and remain unchanged after a failed save.'
);

console.log('PASS Supabase-primary Itinerary / Sheets-authoritative signup concurrency contract');
