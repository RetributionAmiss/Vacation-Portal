const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){console.error('FAIL',message);process.exit(1);}}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const client=read('Client_Payment_Remaining_Balance.html');
const styles=read('Styles_Payment_Remaining_Balance.html');
const index=read('AppsScriptIndex.html');

assert(client.includes('Add remaining balance'), 'Payments must expose the Organizer remaining-balance tool');
assert(client.includes('paymentOrganizerUi_()'), 'remaining-balance tool must be Organizer-only in the client');
assert(client.includes('paymentSummary_(cabin)'), 'tool must derive booking balance from existing payment accounting');
assert(client.includes("String(row['Recipient Type']||'Agency')==='Agency'"), 'only agency-directed schedule rows should offset the unscheduled booking balance');
assert(client.includes('paymentScheduleStatus_(row,payments).remaining'), 'tool must subtract only unpaid scheduled agency amounts');
assert(client.includes('Math.max(0,Number(summary.remaining||0)-outstandingAgencySchedule)'), 'unscheduled balance must equal booking balance left minus unpaid agency-directed schedule');
assert(client.includes('Booking balance left'), 'modal must show current booking balance');
assert(client.includes('Already scheduled to agency'), 'modal must show already scheduled agency amount');
assert(client.includes('Unscheduled balance'), 'modal must clearly show the default unscheduled amount');
assert(client.includes("'savePaymentScheduleItem'"), 'remaining balance must reuse the normal schedule-item write path');
assert(client.includes("recipientType:'Agency'"), 'remaining balance installment must be an agency/property obligation');
assert(client.includes("expectedPayerTravelerId:String(val('paymentRemainingPayer')||'')"), 'Organizer must be able to optionally assign the installment to a booking traveler');
assert(client.includes('The current booking balance is already fully covered by unpaid agency-directed installments.'), 'tool must warn instead of silently double-scheduling a fully covered balance');

assert(index.includes("include('Client_Payment_Remaining_Balance')"), 'AppsScriptIndex must load remaining-balance client');
assert(index.includes("include('Styles_Payment_Remaining_Balance')"), 'AppsScriptIndex must load remaining-balance styles');
assert(styles.includes('@media(max-width:900px)') && styles.includes('@media(max-width:560px)'), 'remaining-balance tool must be responsive');

new Function(scriptBody(client));
console.log('PASS payment remaining balance contracts');
