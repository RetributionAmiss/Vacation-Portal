const fs=require('fs');
const assert=require('assert');

const server=fs.readFileSync('Traveler_Reminder_Push.gs','utf8');
const voting=fs.readFileSync('FinalVoting.gs','utf8');
const client=fs.readFileSync('Client_P3_Smart_Reminder_Settings.html','utf8');
const index=fs.readFileSync('AppsScriptIndex.html','utf8');

assert(server.includes("const SMART_REMINDER_TRIGGER_HANDLER_ = 'processTravelerReminderPushes_'"));
assert(server.includes('.everyHours(1)'));
assert(server.includes("['Smart Reminder Push Enabled']"));
assert(server.includes("return {enabled: false, sent: 0, reminders: 0}"));

for(const stage of ['7-days','1-day','due-today','overdue']){
  assert(server.includes("stage = '"+stage+"'"),`missing payment stage ${stage}`);
}
assert(server.includes("stage: 'day-before'"));
assert(server.includes("stage: 'coming-up'"));
assert(server.includes('minutesUntil > 0 && minutesUntil <= 180'));

assert(server.includes('SMART_REMINDER_LEDGER_PROPERTY_'));
assert(server.includes('smartReminderLedgerKey_'));
assert(server.includes('!ledger[smartReminderLedgerKey_(item)]'));
assert(server.includes('include_aliases: {external_id: [travelerId]}'));
assert(server.includes("'You have ' + ordered.length + ' vacation reminders'"));
assert(server.includes("ordered.slice(0, 3)"));

assert(voting.includes("values['Smart Reminder Push Enabled']"));
assert(voting.includes("ensureTravelerReminderTrigger_()"));
assert(client.includes('setSmartReminderPushEnabled'));
assert(client.includes('Off — in-app reminders only'));
assert(client.includes('On — send useful reminder pushes'));
assert(index.includes("include('Client_P3_Smart_Reminder_Settings')"));

console.log('PASS P3 smart push reminder contracts');
