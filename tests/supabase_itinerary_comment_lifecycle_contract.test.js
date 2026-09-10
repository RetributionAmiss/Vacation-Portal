'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'AppsScriptIndex.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'Client_Supabase_Itinerary_Comment_Lifecycle.html'), 'utf8');
const host = fs.readFileSync(path.join(root, 'supabase-itinerary-comment-bridge.js'), 'utf8');
const sheetsDelete = fs.readFileSync(path.join(root, 'Planner_Comment_Delete.gs'), 'utf8');

const clientJs = client.match(/<script>([\s\S]*)<\/script>/);
assert(clientJs, 'Comment lifecycle bridge must contain a browser script.');
assert.doesNotThrow(
  () => new Function(clientJs[1]),
  'Comment lifecycle bridge must remain valid browser JavaScript.'
);

assert(
  config.includes("release: 'V4.4.0-alpha2.22'") &&
  config.includes("script.src='./supabase-itinerary-comment-bridge.js?v='"),
  'alpha2.22 must load the release-versioned Supabase Itinerary comment bridge.'
);
assert(
  serviceWorker.includes('family-vacation-pwa-v4-4-0-alpha2-22') &&
  serviceWorker.includes("url.pathname.endsWith('/supabase-itinerary-comment-bridge.js')"),
  'The installed PWA must fetch the new comment bridge network-first.'
);
assert(
  shell.includes("include('Client_Supabase_Itinerary_Comment_Lifecycle')") &&
  shell.indexOf("include('Client_Supabase_Itinerary_Comment_Lifecycle')") >
    shell.indexOf("include('Client_Supabase_Itinerary_Concurrency_Bridge')"),
  'Comment lifecycle behavior must install after the read/write/concurrency bridges.'
);

assert(
  client.includes("DATA.supabaseDomainSources.itinerary==='supabase-primary'") &&
  client.includes('DATA.supabaseItineraryShadow.plannerComments') &&
  client.includes('p2PlannerComments_=function(type,itemId)') &&
  client.includes("setTimeout(function(){if(currentView==='itinerary') render();},0)"),
  'Visible Itinerary comments must come from the authoritative Supabase snapshot and rerender after the bridge response settles.'
);
assert(
  client.includes("membershipRole_()==='organizer'") &&
  client.includes("String(row&&row['Traveler ID']||'')===String(currentTravelerId||'')") &&
  client.includes('deleteP2PlannerComment_') &&
  client.includes('Remove</button>'),
  'The UI must expose comment removal for the owner and authenticated Supabase organizer role.'
);
assert(
  client.includes("request_(OP_COMMENT_DELETE,{comment:row},'primary')") &&
  client.includes("request_(OP_COMMENT_DELETE,{comment:row},'shadow')"),
  'Itinerary comment removal must use strict Supabase-primary mode or the existing fallback mirror mode as appropriate.'
);
assert(
  client.includes('.deletePlannerComment(sheetsPayload_(row))') &&
  client.includes('.getPlannerSocialData()') &&
  client.includes('Supabase Itinerary comment removal passed — Sheets backup matches.'),
  'Primary comment removal must update and verify the Sheets rollback backup without undoing Supabase success.'
);
assert(
  client.includes("String(row['Planner Type']||'')!=='Itinerary'") &&
  client.includes('nonItinerary.concat'),
  'Refreshing/removing Itinerary comments must preserve Meals comments.'
);

assert(
  host.includes("const OP_COMMENT_DELETE = 'itinerary.comment.delete'") &&
  host.includes(".from('trip_members')") &&
  host.includes(".from('planner_comments')") &&
  host.includes(".eq('version', requireVersion(comment))") &&
  host.includes(".delete()") &&
  host.includes(".select('id')"),
  'Supabase comment deletion must be authenticated, version-checked, and verify one affected row.'
);
assert(
  host.includes("'itinerary_comment_delete_denied_or_conflict'") &&
  host.includes('Travelers can remove their own comments; organizers can remove any Itinerary comment.') &&
  !host.includes('service_role') && !host.includes('serviceRole'),
  'Comment deletion must fail closed through RLS without exposing privileged credentials.'
);

assert(
  sheetsDelete.includes('function deletePlannerComment(values)') &&
  sheetsDelete.includes("deleteById_('Planner Comments', 'Planner Comment ID', commentId)") &&
  sheetsDelete.includes('assertTravelerSelf_(values.deviceId, requesterTravelerId)') &&
  sheetsDelete.includes('assertOrganizerFromValues_(values)'),
  'Sheets backup deletion must authorize owners through traveler binding and other-comment deletion through centralized organizer assertion.'
);
assert(
  sheetsDelete.includes("['Itinerary', 'Meals'].indexOf(plannerType) < 0") &&
  sheetsDelete.includes("actualPlannerType !== plannerType"),
  'The Sheets delete endpoint must remain generic for Itinerary/Meals while preventing cross-section ID misuse.'
);

console.log('PASS Supabase Itinerary comment freshness/removal contract');
