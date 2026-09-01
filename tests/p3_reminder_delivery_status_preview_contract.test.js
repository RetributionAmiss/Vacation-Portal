const fs=require('fs');
const assert=require('assert');
const vm=require('vm');

const status=fs.readFileSync('Traveler_Reminder_Status.gs','utf8');
const delivery=fs.readFileSync('Traveler_Reminder_Push.gs','utf8');
const client=fs.readFileSync('Client_P3_Smart_Reminder_Settings.html','utf8');

assert(status.includes('function getTravelerReminderDeliveryStatus(values)'));
assert(status.includes('assertOrganizerFromValues_(values)'));
assert(status.includes('smartReminderPaymentCandidates_(context)'));
assert(status.includes('smartReminderMealCandidates_(context)'));
assert(status.includes('smartReminderActivityCandidates_(context)'));
assert(status.includes('!ledger[smartReminderLedgerKey_(item)]'));
assert(status.includes('smartReminderTriggerInstalled_()'));
assert(status.includes('smartReminderReadRunStatus_()'));
assert(status.includes("status.lastRun.outcome === 'failed'"));
assert(status.includes("status.lastRun.outcome === 'partial-failure'"));
assert(status.includes('lastDeliveredAt'));
assert(status.includes('lastRun: smartReminderStatusLastRun_(context)'));
assert(status.includes('travelerPushesDue: travelerIds.length'));
assert(status.includes('previewTruncated: travelerIds.length > previews.length'));
assert(status.includes('previews: previews'));

// The preview and live sender must use the same pure title/body payload builder.
assert(delivery.includes('function smartReminderBuildPushPayload_(context, travelerId, items)'));
assert(delivery.includes('const built = smartReminderBuildPushPayload_(context, travelerId, items)'));
assert(status.includes('const built = smartReminderBuildPushPayload_(context, travelerId, items)'));
assert(delivery.includes('ordered.slice(0, 3)'));
assert(delivery.includes('message = message.slice(0, 220)'));

// Preview must stay read-only: no push send, ledger/status write, or setup/repair side effect.
assert(!status.includes('smartReminderSendPush_('));
assert(!status.includes('UrlFetchApp.fetch'));
assert(!status.includes('setProperty('));
assert(!status.includes('setupVacationPortalSilent_'));

// The delivery runner records bounded outcome telemetry without changing success-only dedupe.
assert(delivery.includes("const SMART_REMINDER_RUN_STATUS_PROPERTY_ = 'SMART_REMINDER_PUSH_STATUS_V1'"));
assert(delivery.includes('function smartReminderWriteRunStatus_(status)'));
assert(delivery.includes('safe.failures = safe.failures.slice(0, 20)'));
assert(delivery.includes("reason: String(failure && failure.reason || 'Delivery failed.').slice(0, 180)"));
for(const outcome of ['disabled','not-configured','partial-failure','failed','delivered','nothing-due']){
  assert(delivery.includes("'"+outcome+"'"),`missing run outcome ${outcome}`);
}
assert(delivery.includes('ledger[smartReminderLedgerKey_(item)] = deliveredAt'));
assert(delivery.includes("console.warn('Traveler reminder push failed for ' + travelerId"));

assert(client.includes('Reminder delivery status & preview'));
assert(client.includes('Open delivery preview'));
assert(client.includes('getTravelerReminderDeliveryStatus(organizerAuthorizationValues_({}))'));
assert(client.includes('Last runner execution'));
assert(client.includes('Delivery failures'));
assert(client.includes('same payload builder used by the live OneSignal delivery runner'));
assert(client.includes('Opening or refreshing this screen does not send a push'));
assert(client.includes('Failed OneSignal requests remain eligible for a later retry'));

// Execute the actual runner functions in a sandbox with Apps Script dependencies stubbed.
// This catches behavioral regressions that source-string contracts cannot.
const propertyStore={};
const scriptProperties={
  getProperty:function(key){
    return Object.prototype.hasOwnProperty.call(propertyStore,key) ? propertyStore[key] : null;
  },
  setProperty:function(key,value){
    propertyStore[key]=String(value);
  }
};
const sandbox={
  console:{warn:function(){}},
  PropertiesService:{getScriptProperties:function(){return scriptProperties;}},
  UrlFetchApp:{fetch:function(){throw new Error('Unexpected live fetch in runner behavior test.');}}
};
vm.createContext(sandbox);
vm.runInContext(delivery,sandbox);

const baseTrip={
  'OneSignal App ID':'test-app-id',
  'PWA URL':'https://example.test/vacation/'
};
const travelers={
  'TRV-A':{Name:'Alpha'},
  'TRV-B':{Name:'Bravo'}
};
function reminder(travelerId,id,priority,line){
  return {
    travelerId:travelerId,
    type:'payment',
    id:id,
    stage:'due-today',
    date:'2026-09-01',
    heading:'Lodging payment reminder',
    line:line,
    priority:priority
  };
}
const reminderA=reminder('TRV-A','DUE-A',5,'Alpha payment is due today.');
const reminderB=reminder('TRV-B','DUE-B',5,'Bravo payment is due today.');

// Shared payload builder: ordering, bundling, target alias, URL, and body cap.
const built=sandbox.smartReminderBuildPushPayload_(
  {trip:baseTrip},
  'TRV-A',
  [
    reminder('TRV-A','DUE-4',30,'Fourth reminder.'),
    reminder('TRV-A','DUE-1',1,'First reminder.'),
    reminder('TRV-A','DUE-3',20,'Third reminder.'),
    reminder('TRV-A','DUE-2',10,'Second reminder.')
  ]
);
assert.strictEqual(built.title,'You have 4 vacation reminders');
assert.strictEqual(built.count,4);
assert.deepStrictEqual(Array.from(built.payload.include_aliases.external_id),['TRV-A']);
assert.strictEqual(built.payload.url,baseTrip['PWA URL']);
assert(built.message.startsWith('First reminder. • Second reminder. • Third reminder.'));
assert(built.message.includes('Plus 1 more reminder in the portal.'));
assert(built.message.length<=220);

// Baseline runner stubs use the actual process/dedupe/outcome code.
sandbox.setupVacationPortalSilent_=function(){};
sandbox.smartReminderPushEnabled_=function(){return true;};
sandbox.getSettings_=function(){return baseTrip;};
sandbox.smartReminderNow_=function(){
  return {date:'2026-09-01',hour:15,minute:34,timeZone:'America/New_York',now:new Date('2026-09-01T15:34:00-04:00')};
};
sandbox.smartReminderTravelerMap_=function(){return travelers;};
sandbox.smartReminderPaymentCandidates_=function(){return [reminderA,reminderB];};
sandbox.smartReminderMealCandidates_=function(){return [];};
sandbox.smartReminderActivityCandidates_=function(){return [];};
sandbox.smartReminderReadLedger_=function(){
  return JSON.parse(propertyStore.SMART_REMINDER_PUSH_LEDGER_V1||'{}');
};
propertyStore.ONESIGNAL_APP_API_KEY='test-api-key';

// One traveler succeeds and one fails. Only the success may enter the dedupe ledger.
sandbox.smartReminderSendPush_=function(context,travelerId,items){
  if(travelerId==='TRV-B') throw new Error('simulated OneSignal failure');
  return {ok:true,count:items.length};
};
let result=sandbox.processTravelerReminderPushes_();
assert.strictEqual(result.outcome,'partial-failure');
assert.strictEqual(result.considered,2);
assert.strictEqual(result.attemptedPushes,2);
assert.strictEqual(result.sent,1);
assert.strictEqual(result.failedPushes,1);
let ledger=JSON.parse(propertyStore.SMART_REMINDER_PUSH_LEDGER_V1||'{}');
let ledgerKeys=Object.keys(ledger);
assert.strictEqual(ledgerKeys.length,1);
assert(ledgerKeys.some(function(key){return key.includes('TRV-A');}));
assert(!ledgerKeys.some(function(key){return key.includes('TRV-B');}));
let runStatus=JSON.parse(propertyStore.SMART_REMINDER_PUSH_STATUS_V1||'null');
assert.strictEqual(runStatus.outcome,'partial-failure');
assert.strictEqual(runStatus.failures.length,1);
assert.strictEqual(runStatus.failures[0].travelerId,'TRV-B');
assert(runStatus.failures[0].reason.includes('simulated OneSignal failure'));

// A later runner execution must retry the failed traveler and then record delivery.
sandbox.smartReminderSendPush_=function(context,travelerId,items){
  return {ok:true,count:items.length};
};
result=sandbox.processTravelerReminderPushes_();
assert.strictEqual(result.outcome,'delivered');
assert.strictEqual(result.considered,1);
assert.strictEqual(result.attemptedPushes,1);
assert.strictEqual(result.sent,1);
assert.strictEqual(result.failedPushes,0);
ledger=JSON.parse(propertyStore.SMART_REMINDER_PUSH_LEDGER_V1||'{}');
ledgerKeys=Object.keys(ledger);
assert.strictEqual(ledgerKeys.length,2);
assert(ledgerKeys.some(function(key){return key.includes('TRV-B');}));

// Once both successful stages are in the ledger, the same candidates become nothing-due.
result=sandbox.processTravelerReminderPushes_();
assert.strictEqual(result.outcome,'nothing-due');
assert.strictEqual(result.considered,0);
assert.strictEqual(result.attemptedPushes,0);
assert.strictEqual(result.sent,0);
assert.strictEqual(result.failedPushes,0);

// Disabled and incomplete setup outcomes are also persisted without delivery attempts.
sandbox.smartReminderPushEnabled_=function(){return false;};
result=sandbox.processTravelerReminderPushes_();
assert.strictEqual(result.outcome,'disabled');
sandbox.smartReminderPushEnabled_=function(){return true;};
sandbox.getSettings_=function(){return {'OneSignal App ID':'','PWA URL':baseTrip['PWA URL']};};
result=sandbox.processTravelerReminderPushes_();
assert.strictEqual(result.outcome,'not-configured');
sandbox.getSettings_=function(){return baseTrip;};

// Failure telemetry is bounded before storage.
const longReason='x'.repeat(250);
sandbox.smartReminderWriteRunStatus_({
  outcome:'failed',
  failures:Array.from({length:25},function(_,index){
    return {travelerId:'TRV-'+index,reason:longReason};
  })
});
runStatus=JSON.parse(propertyStore.SMART_REMINDER_PUSH_STATUS_V1||'null');
assert.strictEqual(runStatus.failures.length,20);
assert.strictEqual(runStatus.failures[0].reason.length,180);

console.log('PASS P3 reminder delivery status, preview, and runner behavior contracts');
