const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){console.error('FAIL',message);process.exit(1);}}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const client=read('Client_Payment_Remaining_Balance.html');
const paymentsBackend=read('Payments.gs');
const styles=read('Styles_Payment_Remaining_Balance.html');
const index=read('AppsScriptIndex.html');

assert(client.includes('Add remaining balance'), 'Payments must expose the Organizer remaining-balance tool');
assert(client.includes('paymentOrganizerUi_()'), 'remaining-balance tool must be Organizer-only in the client');
assert(client.includes('paymentSummary_(cabin)'), 'tool must derive booking balance from existing payment accounting');
assert(client.includes("String(row['Recipient Type']||'Agency')==='Agency'"), 'only agency-directed schedule rows should offset the unscheduled booking balance');
assert(client.includes('paymentScheduleStatus_(row,payments).remaining'), 'tool must subtract only unpaid scheduled agency amounts');
assert(client.includes('Math.max(0,Number(summary.remaining||0)-outstandingAgencySchedule)'), 'unscheduled balance must equal booking balance left minus unpaid agency-directed schedule');
assert(client.includes('const defaultAmount=position.unscheduled;'), 'default installment amount must never fall back to a fully scheduled booking balance');
assert(client.includes('Booking balance left'), 'modal must show current booking balance');
assert(client.includes('Unpaid installments already scheduled to agency'), 'modal must show unpaid agency schedule coverage');
assert(client.includes('Unscheduled balance'), 'modal must clearly show the default unscheduled amount');
assert(client.includes("'savePaymentScheduleItem'"), 'remaining balance must reuse the normal schedule-item write path');

assert(client.includes('Pay this installment to'), 'remaining-balance form must expose recipient selection');
assert(client.includes('Booking agency / property'), 'remaining balance must support paying the booking agency/property');
assert(client.includes('Traveler handling the booking'), 'remaining balance must support paying a booking traveler');
assert(client.includes('paymentRemainingRecipientType'), 'recipient type must be captured from the form');
assert(client.includes('paymentRemainingRecipientTraveler'), 'booking-traveler recipient must be selectable');
assert(client.includes('recipientType:recipientType'), 'selected recipient type must be sent through the normal schedule write path');
assert(client.includes('recipientTravelerId:recipientTravelerId'), 'selected booking-traveler recipient id must be sent through the normal schedule write path');
assert(client.includes("recipientName:recipientType==='Agency'"), 'agency recipient name must still be supplied for agency-directed installments');
assert(client.includes('activePaymentTravelers_()'), 'expected payer choices should match normal active traveler scheduling behavior');
assert(client.includes('A payment to a booking traveler is a reimbursement.'), 'recipient choice must explain reimbursement accounting semantics');

assert(paymentsBackend.includes("bookingIds.indexOf(recipientTravelerId) < 0"), 'server must restrict traveler recipients to travelers handling the booking');
assert(paymentsBackend.includes("type: 'Traveler'") && paymentsBackend.includes('travelerId: recipientTravelerId'), 'server must normalize booking-traveler recipients through the existing schedule recipient contract');

assert(client.includes('The current booking balance is already fully covered by unpaid agency-directed installments.'), 'tool must warn instead of silently double-scheduling a fully covered balance');
assert(client.includes('The amount is left blank to prevent duplicate scheduling'), 'fully scheduled balances must require an intentional manual override');

assert(index.includes("include('Client_Payment_Remaining_Balance')"), 'AppsScriptIndex must load remaining-balance client');
assert(index.includes("include('Styles_Payment_Remaining_Balance')"), 'AppsScriptIndex must load remaining-balance styles');
assert(styles.includes('@media(max-width:900px)') && styles.includes('@media(max-width:560px)'), 'remaining-balance tool must be responsive');

new Function(scriptBody(client));
console.log('PASS payment remaining balance contracts');
