const fs=require('fs');
const path=require('path');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const auth=read('Authorization.gs');
const voting=read('FinalVoting.gs');
const travelers=read('Travelers.gs');
const removal=read('RentalRemoval.gs');
const push=read('PushNotifications.gs');
const archive=read('Archive.gs');
const planning=read('Planning_Common.gs');
const clientAuth=read('Client_Authorization.html');
const agents=read('AGENTS.md');

assert.match(auth,/function assertOrganizer_\(/,'central organizer assertion is required');
assert.match(auth,/function createOrganizerSession\(/,'server must issue organizer sessions');
assert.match(auth,/ORGANIZER_SESSION_TTL_MS_/,'organizer sessions must expire');
assert.doesNotMatch(auth,/^\s*const\s+.*ACCESS.*=\s*['"][^'"]{12,}['"]/m,'no organizer secret may be committed');

['saveTripSettings','saveFinalists','startFinalVoting','closeFinalVoting','reopenFinalVoting','restartPreliminaryVoting']
  .forEach(name=>{
    const start=voting.indexOf('function '+name+'(');
    assert.ok(start>=0,name+' must exist');
    const block=voting.slice(start,start+500);
    assert.match(block,/assertOrganizerFromValues_\(/,name+' must enforce organizer auth');
  });

assert.match(removal,/function removeRentalForOrganizer[\s\S]*?assertOrganizerFromValues_\(/,'rental removal must enforce organizer auth');
assert.match(push,/function sendPortalPushNotification[\s\S]*?assertOrganizerFromValues_\(/,'push sending must enforce organizer auth');
assert.match(archive,/function resetPlanningPortalToGathering[\s\S]*?assertOrganizerFromValues_\(/,'planning reset must enforce organizer auth');

assert.match(travelers,/assertTravelerSelf_\(values\.deviceId, requestedId\)/,'traveler self edit must bind to saved device traveler');
assert.match(travelers,/if \(isNew\) \{\s*assertOrganizerFromValues_/,'new travelers must require organizer auth');
assert.match(travelers,/function deleteTraveler\(values\)[\s\S]*?assertOrganizerFromValues_/,'traveler deletion must require organizer auth');

assert.doesNotMatch(planning,/function deletePlannerRecordFast\(/,'arbitrary public fast delete helper must not remain exposed');
assert.doesNotMatch(planning,/function deletePlannerRecord\(/,'arbitrary public delete helper must not remain exposed');
assert.match(planning,/function deletePlannerItem\(/,'allow-listed planner delete endpoint must exist');

assert.match(clientAuth,/getOrganizerAuthorizationStatus/,'client must validate cached organizer session with server');
assert.match(clientAuth,/getOrganizerVotingSummary/,'client must use authorized voting summary');
assert.match(agents,/Never authorize an organizer\/admin action from traveler name/,'Codex security invariant must be documented');

console.log('authorization contract tests passed');
