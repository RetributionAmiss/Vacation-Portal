const fs=require('fs');
const path=require('path');
const assert=require('assert');
const crypto=require('crypto');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function blockFor(source,name,length=1200){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' must exist');
  return source.slice(start,start+length);
}

const auth=read('Authorization.gs');
const app=read('App.gs');
const voting=read('FinalVoting.gs');
const travelers=read('Travelers.gs');
const removal=read('RentalRemoval.gs');
const push=read('PushNotifications.gs');
const archive=read('Archive.gs');
const planning=read('Planning_Common.gs');
const diagnostics=read('Diagnostics.gs');
const organizerSummary=read('OrganizerSummary.gs');
const rentalEdits=read('RentalEditQueue.gs');
const rentalEngine=read('RentalImportEngine.gs');
const rentalQueueAuth=read('RentalQueueAuthorization.gs');
const rentals=read('Rentals.gs');
const setup=read('Setup.gs');
const cabinMaintenance=read('CabinMaintenance.gs');
const repair=read('RentalProcessingRepair.gs');
const clientAuth=read('Client_Authorization.html');
const clientRentalAuth=read('Client_Authorization_Rentals.html');
const agents=read('AGENTS.md');

// ---------------------------------------------------------------------------
// Static contract tests: these prove source-level authorization requirements.
// ---------------------------------------------------------------------------
assert.match(auth,/function assertOrganizer_\(/,'central organizer assertion is required');
assert.match(auth,/function createOrganizerSession\(/,'server must issue organizer sessions');
assert.match(auth,/ORGANIZER_SESSION_TTL_MS_\s*=\s*12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,'organizer sessions must expire');
assert.match(auth,/ORGANIZER_AUTH_HASH_PROPERTY_/,'organizer access key must be represented by a stored hash');
assert.doesNotMatch(auth,/^\s*const\s+.*ACCESS.*=\s*['"][^'"]{12,}['"]/m,'no organizer secret may be committed');
assert.match(auth,/ORGANIZER_SESSION_PREFIX_ \+ tokenHash/,'server must store session by token hash');
assert.doesNotMatch(auth,/setProperty\([^\n]*token\s*\)/,'raw organizer session token must not be stored server-side');

['saveTripSettings','saveFinalists','startFinalVoting','closeFinalVoting','reopenFinalVoting','restartPreliminaryVoting']
  .forEach(name=>{
    assert.match(blockFor(voting,name),/assertOrganizerFromValues_\(/,name+' must enforce organizer auth');
  });

assert.match(blockFor(removal,'removeRentalForOrganizer'),/assertOrganizerFromValues_\(/,'rental removal must enforce organizer auth');
assert.match(blockFor(push,'sendPortalPushNotification'),/assertOrganizerFromValues_\(/,'push sending must enforce organizer auth');
assert.match(blockFor(push,'getOneSignalStatus'),/assertOrganizerFromValues_\(/,'push setup status must enforce organizer auth');
assert.match(blockFor(archive,'resetPlanningPortalToGathering'),/assertOrganizerFromValues_\(/,'planning reset must enforce organizer auth');
assert.match(blockFor(diagnostics,'runPortalDiagnostics'),/assertOrganizerFromValues_\(/,'web diagnostics must enforce organizer auth');
assert.match(blockFor(organizerSummary,'getOrganizerVotingSummary'),/assertOrganizerFromValues_\(/,'organizer voting summary must enforce organizer auth');
assert.match(blockFor(rentalEdits,'queueCabinEdit'),/assertOrganizerFromValues_\(/,'manual rental editing must enforce organizer auth');

// Rental import/maintenance closure.
assert.match(blockFor(rentalEngine,'refreshCabinPhotos'),/assertOrganizerFromValues_\(/,'refreshCabinPhotos must require organizer authorization');
assert.match(blockFor(rentalEngine,'enrichCabinNow'),/assertOrganizerFromValues_\(/,'enrichCabinNow must require organizer authorization');
assert.doesNotMatch(rentalEngine,/function processRentalEnrichmentQueue\s*\(/,'generic enrichment worker must not be a public Apps Script endpoint');
assert.match(rentalEngine,/function processRentalEnrichmentQueue_\s*\(/,'private enrichment worker must remain available for time-driven trigger execution');
assert.match(blockFor(rentalEngine,'retryFailedRentalImports'),/assertSpreadsheetAdminContext_\(/,'rental retry must require spreadsheet admin context');
assert.match(rentalQueueAuth,/function processRentalEnrichmentQueueMenu\s*\([\s\S]*?assertSpreadsheetAdminContext_\([\s\S]*?processRentalEnrichmentQueue_\(/,'menu wrapper must gate the private enrichment worker with spreadsheet admin context');
assert.match(clientRentalAuth,/withOrganizerAuthorization_\([\s\S]*?\.enrichCabinNow\(/,'client enrichment must acquire organizer authorization');
assert.match(clientRentalAuth,/\.enrichCabinNow\([\s\S]*?organizerAuthorizationValues_\(/,'client enrichment must send organizer session values');
assert.match(clientRentalAuth,/withOrganizerAuthorization_\([\s\S]*?\.refreshCabinPhotos\(/,'client photo refresh must acquire organizer authorization');
assert.match(clientRentalAuth,/\.refreshCabinPhotos\([\s\S]*?organizerAuthorizationValues_\(/,'client photo refresh must send organizer session values');
assert.match(clientRentalAuth,/\.queueCabinEdit\([\s\S]*?organizerAuthorizationValues_\(v\)/,'client rental edit must send organizer session values');

// Old cabin-maintenance mutations are no longer public alternate paths. The
// current web client uses queueCabinEdit/removeRentalForOrganizer instead.
assert.doesNotMatch(rentals,/function saveCabin\s*\(/,'legacy saveCabin admin mutation must not remain public');
assert.doesNotMatch(rentals,/function archiveCabin\s*\(/,'legacy archiveCabin admin mutation must not remain public');
assert.doesNotMatch(rentals,/function reviewCabin\s*\(/,'legacy reviewCabin admin mutation must not remain public');
assert.match(rentals,/function saveCabin_\s*\(/,'legacy saveCabin implementation may remain private for internal compatibility');
assert.match(rentals,/function archiveCabin_\s*\(/,'legacy archiveCabin implementation may remain private for internal compatibility');
assert.match(rentals,/function reviewCabin_\s*\(/,'legacy reviewCabin implementation may remain private for internal compatibility');

assert.doesNotMatch(app,/function getJustinVotingSummary\s*\(/,'legacy Justin-ID voting summary endpoint must not be public');
assert.doesNotMatch(app,/requestingTravelerId/,'legacy caller-supplied Justin summary identity must be removed');

assert.match(travelers,/assertTravelerSelf_\(values\.deviceId, requestedId\)/,'traveler self edit must check the permanent device binding');
assert.match(travelers,/if \(isNew\) \{\s*assertOrganizerFromValues_/,'new travelers must require organizer auth');
assert.match(blockFor(travelers,'deleteTraveler'),/assertOrganizerFromValues_\(/,'traveler deletion must require organizer auth');
assert.match(travelers,/const travelerType = allowAdminFields/,'traveler type must be organizer-controlled');
assert.match(travelers,/'Price Cap': allowAdminFields/,'Price Cap must be organizer-controlled');
assert.match(travelers,/'Cost %': allowAdminFields/,'Cost % must be organizer-controlled');
assert.match(travelers,/'Pay More': allowAdminFields/,'Pay More must be organizer-controlled');
assert.match(travelers,/'Active': allowAdminFields/,'Active must be organizer-controlled');

assert.doesNotMatch(planning,/function deletePlannerRecordFast\(/,'arbitrary public fast delete helper must not remain exposed');
assert.doesNotMatch(planning,/function deletePlannerRecord\(/,'arbitrary public delete helper must not remain exposed');
assert.match(planning,/function deletePlannerItem\(/,'allow-listed planner delete endpoint must exist');
assert.match(planning,/const definitions = \{[\s\S]*'Budget'[\s\S]*'Meals'[\s\S]*'Grocery List'[\s\S]*'Itinerary'/,'planner deletion must use an allow-list');

assert.match(blockFor(setup,'setupVacationPortal'),/assertSpreadsheetAdminContext_\(/,'setup must require spreadsheet admin context');
assert.match(blockFor(cabinMaintenance,'clearCabinData'),/assertSpreadsheetAdminContext_\(/,'clear cabin data must require spreadsheet admin context');
assert.doesNotMatch(cabinMaintenance,/function setCabinOriginalUrl\s*\(/,'generic cabin URL maintenance helper must not be public');
assert.doesNotMatch(repair,/function getRentalQueueHealth\s*\(/,'rental queue health helper must not be public');

assert.match(clientAuth,/getOrganizerAuthorizationStatus/,'client must validate cached organizer session with server');
assert.match(clientAuth,/getOrganizerVotingSummary/,'client must use authorized voting summary');
assert.match(agents,/Never authorize an organizer\/admin action from traveler name/,'Codex security invariant must be documented');
assert.match(agents,/Device IDs identify an app\/browser instance; they are not organizer credentials/,'Device ID must not be treated as organizer authorization');

// ---------------------------------------------------------------------------
// Executable behavioral tests for Authorization.gs using Apps Script mocks.
// ---------------------------------------------------------------------------
const propertyMap=new Map();
const scriptProperties={
  getProperty:key=>propertyMap.has(key)?propertyMap.get(key):null,
  setProperty:(key,value)=>{propertyMap.set(key,String(value));return scriptProperties;},
  deleteProperty:key=>{propertyMap.delete(key);return scriptProperties;},
  getProperties:()=>Object.fromEntries(propertyMap.entries())
};

let uuidCounter=0;
let boundTraveler='TRAV-A';
const context={
  console,
  Date,
  Math,
  JSON,
  String,
  Number,
  Boolean,
  Error,
  Utilities:{
    DigestAlgorithm:{SHA_256:'SHA_256'},
    Charset:{UTF_8:'UTF_8'},
    computeDigest:(_algorithm,value)=>Array.from(crypto.createHash('sha256').update(String(value),'utf8').digest()).map(v=>v>127?v-256:v),
    getUuid:()=>`00000000-0000-4000-8000-${String(++uuidCounter).padStart(12,'0')}`
  },
  PropertiesService:{getScriptProperties:()=>scriptProperties},
  SpreadsheetApp:{getUi:()=>({ButtonSet:{OK:'OK'}})},
  normalizePortalDeviceId_:value=>String(value||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,80),
  getDeviceTravelerBinding_:deviceId=>deviceId==='DEVICE-A'?{travelerId:boundTraveler}:null
};
vm.createContext(context);
vm.runInContext(auth,context,{filename:'Authorization.gs'});

const accessKey='correct horse battery staple';
const salt='test-salt';
scriptProperties.setProperty('ORGANIZER_ACCESS_SALT',salt);
scriptProperties.setProperty('ORGANIZER_ACCESS_HASH',context.authHexDigest_(salt+':'+accessKey));

assert.throws(
  ()=>context.createOrganizerSession('wrong key','DEVICE-A'),
  /ORGANIZER_AUTH_INVALID/,
  'invalid organizer access key must be rejected'
);

const session=context.createOrganizerSession(accessKey,'DEVICE-A');
assert.ok(session.token&&session.expiresAt,'valid organizer key must issue a session');
assert.doesNotThrow(()=>context.assertOrganizer_(session.token,'DEVICE-A'),'valid organizer session must authorize');
assert.throws(()=>context.assertOrganizer_(session.token,'DEVICE-B'),/different device/,'organizer session must be device-bound');
assert.throws(()=>context.assertOrganizer_('malformed-token','DEVICE-A'),/ORGANIZER_AUTH_REQUIRED/,'malformed token must fail closed');
assert.throws(()=>context.assertOrganizer_('','DEVICE-A'),/ORGANIZER_AUTH_REQUIRED/,'Device ID alone must not authorize');

// Rebinding a device to Justin changes normal traveler identity only. It cannot
// manufacture an organizer bearer token or make assertOrganizer_ accept the device.
boundTraveler='TRAV-JUSTIN';
assert.doesNotThrow(()=>context.assertTravelerSelf_('DEVICE-A','TRAV-JUSTIN'),'a rebound device can satisfy the documented normal-traveler self-service binding');
assert.throws(()=>context.assertOrganizer_('','DEVICE-A'),/ORGANIZER_AUTH_REQUIRED/,'rebinding a device to Justin must not create organizer authorization');
boundTraveler='TRAV-A';

const tokenHash=context.authHexDigest_(session.token);
const sessionKey='ORGANIZER_SESSION_'+tokenHash;
const expired=JSON.parse(scriptProperties.getProperty(sessionKey));
expired.expiresAt=Date.now()-1;
scriptProperties.setProperty(sessionKey,JSON.stringify(expired));
assert.throws(()=>context.assertOrganizer_(session.token,'DEVICE-A'),/ORGANIZER_AUTH_REQUIRED/,'expired organizer session must fail closed');

const revoked=context.createOrganizerSession(accessKey,'DEVICE-A');
context.revokeOrganizerSessions_();
assert.throws(()=>context.assertOrganizer_(revoked.token,'DEVICE-A'),/ORGANIZER_AUTH_REQUIRED/,'revoked organizer session must fail closed');

assert.doesNotThrow(()=>context.assertTravelerSelf_('DEVICE-A','TRAV-A'),'saved traveler may pass the self-service device check');
assert.throws(()=>context.assertTravelerSelf_('DEVICE-A','TRAV-B'),/TRAVELER_AUTH_REQUIRED/,'a mismatched traveler ID must fail the self-service device check');

console.log('PASS static authorization contracts');
console.log('PASS executable organizer-session behavior');
console.log('PASS rental administration authorization contracts');
console.log('NOTE traveler self-service device binding is tested for mismatch rejection and organizer-boundary isolation, not as strong user authentication');
