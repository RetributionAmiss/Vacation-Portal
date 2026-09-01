const fs=require('fs');
const assert=require('assert');

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
assert(status.includes("state = smartReminderDeliveryState_(status)"));
assert(status.includes('lastDeliveredAt'));
assert(status.includes('previews: previews'));
assert(status.includes("ordered.slice(0, 3)"));
assert(status.includes("message = message.slice(0, 220)"));

// Preview must stay read-only: no push send, no ledger write, no setup/repair side effect.
assert(!status.includes('smartReminderSendPush_('));
assert(!status.includes('UrlFetchApp.fetch'));
assert(!status.includes('setProperty('));
assert(!status.includes('setupVacationPortalSilent_'));

// Delivery remains success-only in the original pipeline, so failed sends stay retryable.
assert(delivery.includes('ledger[smartReminderLedgerKey_(item)] = Date.now()'));
assert(delivery.includes("console.warn('Traveler reminder push failed for ' + travelerId"));

assert(client.includes('Reminder delivery status & preview'));
assert(client.includes('Open delivery preview'));
assert(client.includes('getTravelerReminderDeliveryStatus(organizerAuthorizationValues_({}))'));
assert(client.includes('Read-only preview. Opening this screen does not send a push'));
assert(client.includes('Failed OneSignal requests stay eligible for a later retry'));

console.log('PASS P3 reminder delivery status and preview contracts');
