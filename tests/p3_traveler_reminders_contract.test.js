const fs=require('fs');
const assert=require('assert');

const client=fs.readFileSync('Client_P3_Traveler_Reminders.html','utf8');
const styles=fs.readFileSync('Styles_P3_Traveler_Reminders.html','utf8');
const index=fs.readFileSync('AppsScriptIndex.html','utf8');

assert(client.includes("home.views.indexOf('reminders')"),'Reminders must register under Home navigation');
assert(client.includes("P1_VIEW_LABELS_.reminders='Reminders'"),'Reminders must have a visible navigation label');
assert(client.includes("expected!==String(currentTravelerId||'')"),'Payment reminders must be scoped to the current traveler');
assert(client.includes('paymentScheduleStatus_'),'Payment reminders must use the real ledger-aware schedule status');
assert(client.includes("item.urgency.tone!=='past'"),'Past non-payment reminders must not remain in the feed');
assert(client.includes("type:'meal'"),'Meal responsibilities must create reminders');
assert(client.includes("roles.push('Cooking crew')"),'Cooking crew assignments must be represented');
assert(client.includes("roles.push('Clean up crew')"),'Clean up crew assignments must be represented');
assert(client.includes("type:'activity'"),'Traveler itinerary signups must create reminders');
assert(client.includes("String(signup['Traveler ID']||'')!==String(currentTravelerId||'')"),'Activity reminders must be traveler-scoped');
assert(client.includes("p3ReminderItems_().slice(0,3)"),'Dashboard must show only the top three reminders');
assert(client.includes("navigate('reminders')"),'Dashboard reminder summary must link to the full reminder feed');
assert(styles.includes('@media(max-width:680px)'),'Reminder feed must include a mobile layout');
assert(index.includes("include('Client_P3_Traveler_Reminders')"),'Apps Script index must include reminder client');
assert(index.includes("include('Styles_P3_Traveler_Reminders')"),'Apps Script index must include reminder styles');

console.log('PASS P3 traveler reminder contracts');
