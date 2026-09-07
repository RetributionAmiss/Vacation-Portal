'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
function read(name){return fs.readFileSync(path.join(root,name),'utf8');}
function slice(text,name,nextName){
  const start=text.indexOf('function '+name+'(');
  assert(start>=0,'Missing function '+name);
  const end=nextName?text.indexOf('function '+nextName+'(',start+1):text.length;
  assert(end>start,'Missing function boundary after '+name);
  return text.slice(start,end);
}

const integrity=read('DataIntegrity.gs');
const rooms=read('Rooms.gs');
const voting=read('Voting.gs');
const packing=read('Packing.gs');
const packingClient=read('Client_P3_Packing_Optimistic.html');
const social=read('Planner_Social.gs');
const socialClient=read('Client_P3_Planner_Social_Reliability.html');
const travelers=read('Travelers.gs');
const planning=read('Planning_Common.gs');

const grouped=slice(integrity,'replaceSheetRowsByFieldValueUnlocked_','portalMoneyToCents_');
assert(!/clearContents\s*\(/.test(grouped),'grouped row replacement must never clear an entire sheet');
assert(/deleteRow\s*\(/.test(grouped)&&/setValues\s*\(/.test(grouped),'grouped row replacement must use surgical row writes/deletes');

const roomBatch=slice(rooms,'saveRoomAssignmentsBatch','clearRoomAssignmentsForCabin_');
assert(/withPortalMutationLock_\s*\(/.test(roomBatch),'room batch saves must be serialized');
assert(/replaceSheetRowsByFieldValueUnlocked_\s*\(/.test(roomBatch),'room batch saves must use targeted grouped replacement');
assert(!/clearContents\s*\(/.test(roomBatch),'room batch saves must not clear the Assignments sheet');
assert(/existingByTraveler/.test(roomBatch)&&/existing\['Assignment ID'\]/.test(roomBatch),'room moves must preserve stable assignment IDs');

const voteFast=slice(voting,'saveVoteFast','saveVote');
assert(/withPortalMutationLock_\s*\(/.test(voteFast),'rating/ranking vote mutation must be serialized');
assert(/createdAt \|\| new Date\(\)/.test(voteFast),'vote edits must preserve original Created At');
const favorite=slice(voting,'toggleFavorite','saveComment');
assert(/withPortalMutationLock_\s*\(/.test(favorite),'favorite toggles must serialize read/delete-or-create behavior');
const rentalComment=slice(voting,'saveComment',null);
assert(/normalizeMutationRequestId_/.test(rentalComment)&&/rememberMutationResult_/.test(rentalComment),'rental comments must be retry-idempotent when a request ID is supplied');

['savePackingItem','togglePackingItem','deletePackingItem'].forEach(function(name,index){
  const next=['togglePackingItem','deletePackingItem',null][index];
  const body=slice(packing,name,next);
  assert(/withPortalMutationLock_\s*\(/.test(body),name+' must be serialized');
  if(name!=='savePackingItem'||true){
    assert(/assertExpectedVersion_\s*\(/.test(body),name+' must support stale-client detection');
  }
});
const packSave=slice(packing,'savePackingItem','togglePackingItem');
assert(/rememberMutationResult_/.test(packSave),'packing create/edit must be retry-idempotent');
assert(/expectedUpdatedAt/.test(packingClient),'packing optimistic client must send server versions');
assert(/requestId/.test(packingClient),'packing optimistic client must send mutation request IDs');
assert(/p3PackingToggle_=function/.test(packingClient),'final packing optimistic layer must own the conflict-safe toggle');

const signup=slice(social,'saveItineraryInterest','removeItineraryInterest');
assert(/withPortalMutationLock_\s*\(/.test(signup),'itinerary signup save must be serialized');
assert(/assertExpectedVersion_\s*\(/.test(signup),'itinerary signup edits must reject stale versions');
assert(/rememberMutationResult_/.test(signup),'itinerary signup saves must be retry-idempotent');
const signupDelete=slice(social,'removeItineraryInterest','savePlannerComment');
assert(/withPortalMutationLock_\s*\(/.test(signupDelete)&&/assertExpectedVersion_\s*\(/.test(signupDelete),'signup removal must be serialized and version checked');
const plannerComment=slice(social,'savePlannerComment','notifyItineraryInterest_');
assert(/withPortalMutationLock_\s*\(/.test(plannerComment)&&/rememberMutationResult_/.test(plannerComment),'planner comments must serialize append and dedupe retries');
assert(/expectedUpdatedAt/.test(socialClient)&&/requestId/.test(socialClient),'planner social client must send mutation versions/request IDs');

const travelerSave=slice(travelers,'saveTraveler','deleteTraveler');
assert(/withPortalMutationLock_\s*\(/.test(travelerSave),'traveler creates/edits must run under the shared mutation lock');
const travelerDelete=slice(travelers,'deleteTraveler','getTravelerType_');
assert(/withPortalMutationLock_\s*\(/.test(travelerDelete),'traveler child-check and delete must be atomic relative to portal mutations');

const plannerDelete=slice(planning,'deletePlannerItem','deletePlannerRecord_');
assert(/withPortalMutationLock_\s*\(/.test(plannerDelete),'planner item delete + social cleanup must share one mutation lock');
assert(/clearPlannerSocialForItem_/.test(plannerDelete),'planner item delete must clean dependent social records while locked');
const plannerSave=slice(planning,'savePlannerRecordFast_','savePlannerRecordFastUnlocked_');
assert(/withPortalMutationLock_\s*\(/.test(plannerSave)&&/rememberMutationResult_/.test(plannerSave),'fast shared planner saves must serialize and support request-id idempotency');

[packingClient,socialClient].forEach(function(html){
  const js=html.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
  new Function(js);
});

console.log('shared_mutation_integrity_contract.test.js: PASS');
