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

console.log('PASS P3 reminder delivery status and preview contracts');
