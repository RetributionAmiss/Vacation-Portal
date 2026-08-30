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
assert(client.includes('paymentScheduleStatus_(row,payments).remaining'), 'tool must subtract only unpaid scheduled amounts');
assert(client.includes('Math.max(0,Number(summary.remaining||0)-outstandingAgencySchedule)'), 'unscheduled agency balance must equal booking balance left minus unpaid agency-directed schedule');
assert(client.includes('Booking balance left'), 'modal must show current booking balance');
assert(client.includes('Unpaid installments already scheduled to agency'), 'modal must show unpaid agency schedule coverage');
assert(client.includes('Unscheduled agency balance'), 'modal must clearly show the agency-only unscheduled amount');
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

assert(client.includes('paymentRemainingReimbursementPosition_'), 'tool must calculate a separate reimbursement balance for booking-traveler recipients');
assert(client.includes('paymentExpectedShareForTraveler_(cabin,id)'), 'traveler reimbursement balance must reuse the approved adjusted expected-share calculation');
assert(client.includes("paymentTravelerPaidTotal_(cabinId,id,'')"), 'traveler reimbursement balance must subtract all recorded outgoing payments by each payer');
assert(client.includes("String(row['Recipient Type']||'')!=='Traveler'"), 'scheduled reimbursement coverage must be limited to traveler-directed installments');
assert(client.includes("String(row['Recipient Traveler ID']||'')!==recipientId"), 'scheduled reimbursement coverage must target the selected booking traveler');
assert(client.includes('Math.max(0,remainingShares-scheduledToRecipient)'), 'unscheduled reimbursement must subtract existing unpaid reimbursements to the selected recipient');
assert(client.includes('syncPaymentRemainingCalculation_()'), 'recipient/payer changes must recalculate the displayed remaining amount live');
assert(client.includes('Unscheduled reimbursement'), 'traveler mode must clearly label the calculated reimbursement balance');
assert(client.includes("amount.value=nextAmount>0.005?nextAmount.toFixed(2):''"), 'calculated recipient-aware balance must populate the installment amount');
assert(client.includes("expectedPayerTravelerId===recipientTravelerId"), 'tool must block self-reimbursement when a specific payer is the recipient');
assert(client.includes('Choose a booking traveler recipient to calculate reimbursements'), 'zero property balance must direct Organizer to reimbursement calculation instead of implying all obligations are finished');

assert(paymentsBackend.includes("bookingIds.indexOf(recipientTravelerId) < 0"), 'server must restrict traveler recipients to travelers handling the booking');
assert(paymentsBackend.includes("type: 'Traveler'") && paymentsBackend.includes('travelerId: recipientTravelerId'), 'server must normalize booking-traveler recipients through the existing schedule recipient contract');

assert(index.includes("include('Client_Payment_Remaining_Balance')"), 'AppsScriptIndex must load remaining-balance client');
assert(index.includes("include('Styles_Payment_Remaining_Balance')"), 'AppsScriptIndex must load remaining-balance styles');
assert(styles.includes('payment-balance-recipient-grid'), 'styles must support the recipient-aware calculation summary');
assert(styles.includes('@media(max-width:900px)') && styles.includes('@media(max-width:560px)'), 'remaining-balance tool must be responsive');

new Function(scriptBody(client));
console.log('PASS recipient-aware payment remaining balance contracts');
