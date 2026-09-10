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
  'The concurrency bridge must install after the primary read/write routing layers.'
);

assert(
  bridgeHtml.includes("Object.defineProperty(state,'loading'") &&
  bridgeHtml.includes('captureStartLastLoaded=Number(state.lastLoaded||0)') &&
  bridgeHtml.includes('Number(state.lastLoaded||0)>captureStartLastLoaded') &&
  bridgeHtml.includes('cacheRows_(DATA.itinerarySignups)'),
  'The bridge must capture the Sheets signup snapshot immediately before Supabase promotion.'
);

assert(
  bridgeHtml.includes("DATA.supabaseDomainSources.itinerary==='supabase-primary'") &&
  bridgeHtml.includes("row.__supabaseUpdatedAt=String(row['Updated At']||'')") &&
  bridgeHtml.includes("row['Updated At']=token.updatedAt"),
  'Primary mutations must keep Supabase Version authority separate from the Sheets Updated At backup token.'
);

assert(
  bridgeHtml.includes("if(primaryRuntime_()){") &&
  bridgeHtml.includes("row['Updated At']=''") &&
  bridgeHtml.includes('instead of allowing the backup to overwrite a newer Sheets row'),
  'A missing Sheets backup token in Supabase-primary mode must not block the primary write and must make the backup fail closed.'
);
assert(
  bridgeHtml.includes('Activity signup version is still syncing. Refresh Itinerary and review the latest signup before saving.') &&
  bridgeHtml.includes('return false;'),
  'The complete Sheets-first fallback path must retain its strict missing-token conflict guard.'
);

assert(
  bridgeHtml.includes('.getPlannerSocialData();') &&
  bridgeHtml.includes('setTimeout(refreshSheetTokens_,1200)') &&
  bridgeHtml.includes('setTimeout(refreshSheetTokens_,3500)') &&
  bridgeHtml.includes('cacheRows_(result.itinerarySignups)'),
  'After a primary mutation the backup token must be refreshed directly from Sheets, never copied from Supabase updated_at.'
);
assert(
  bridgeHtml.includes("String(message||'')==='You’re on the activity list'") &&
  bridgeHtml.includes('refreshSheetTokensAfterPrimary_()') &&
  bridgeHtml.includes('captureSavedSignup_()'),
  'Primary saves must refresh the Sheets backup token while fallback saves retain the validated direct capture behavior.'
);
assert(
  bridgeHtml.includes('const result=primaryRemoveInterest.apply(this,arguments)') &&
  bridgeHtml.includes('if(primaryRuntime_()) refreshSheetTokensAfterPrimary_()'),
  'Signup removal must also refresh the Sheets token map so a later rejoin cannot inherit a stale deleted-pair token.'
);

assert(
  bridgeHtml.includes('installSupabaseItinerarySocialPrimaryGuard_') &&
  bridgeHtml.includes("const OP_STATUS='itinerary.primaryWriteStatus'") &&
  bridgeHtml.includes('function resolvePrimaryMode_()') &&
  bridgeHtml.includes("if(!primarySource_()) return Promise.resolve(false)") &&
  bridgeHtml.includes("if(result&&result.primaryWrite===true) return true"),
  'Social mutations must resolve the current primary-write flag at action time instead of trusting the eager startup probe.'
);

assert(
  bridgeHtml.includes("if(!primarySource_()) return fallbackSaveInterest.apply(this,arguments)") &&
  bridgeHtml.includes("if(!primarySource_()) return fallbackRemoveInterest.apply(this,arguments)") &&
  bridgeHtml.includes("if(type!=='Itinerary'||!primarySource_()) return fallbackSaveComment.apply(this,arguments)") &&
  bridgeHtml.includes("error.code='primary_write_not_enabled'"),
  'Sheets-first fallback must be used only when the visible Itinerary read source is not Supabase-primary.'
);

assert(
  bridgeHtml.includes('sheetSignupContext_(itemId,travelerId,Boolean(existing))') &&
  bridgeHtml.includes("request_(OP_SIGNUP_UPSERT,{signup:local},'primary')") &&
  bridgeHtml.includes("request_(OP_SIGNUP_DELETE,{signup:existing},'primary')") &&
  bridgeHtml.includes("'Version':existing?Number(existing.Version||0):0"),
  'Signup update/leave must use the Supabase Version for the primary mutation while capturing Sheets backup state separately.'
);

assert(
  bridgeHtml.includes("request_(OP_COMMENT_INSERT,{comment:local},'primary')") &&
  bridgeHtml.includes("backupComment_(settled,'comment')") &&
  bridgeHtml.includes("toast('Supabase Itinerary '+label+' passed — Sheets backup matches.')"),
  'Itinerary comments must go Supabase-first and only then mirror to Sheets with explicit backup diagnostics.'
);

console.log('PASS Supabase-primary Itinerary / Sheets-backup dual concurrency contract');
