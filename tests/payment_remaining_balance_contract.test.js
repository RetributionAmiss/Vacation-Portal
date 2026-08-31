const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){console.error('FAIL',message);process.exit(1);}}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const remaining=read('Client_Payment_Remaining_Balance.html');
const integration=read('Client_Payment_Remaining_Generator.html');
const generator=read('Client_Payment_Installment_Generation.html');
const backend=read('Payments_Installment_Generation.gs');
const paymentsBackend=read('Payments.gs');
const index=read('AppsScriptIndex.html');
const styles=read('Styles_Payment_Remaining_Generator.html');

assert(remaining.includes('paymentRemainingBalancePosition_'), 'remaining-balance calculator must retain agency balance logic');
assert(remaining.includes("String(row['Recipient Type']||'Agency')==='Agency'"), 'agency remaining balance must only subtract agency-directed schedule rows');
assert(remaining.includes('paymentScheduleStatus_(row,payments).remaining'), 'remaining calculator must subtract only unpaid scheduled amounts');
assert(remaining.includes('Math.max(0,Number(summary.remaining||0)-outstandingAgencySchedule)'), 'unscheduled agency balance must equal booking balance left minus unpaid agency schedule');

assert(remaining.includes('paymentRemainingReimbursementPosition_'), 'remaining calculator must retain booking-traveler reimbursement logic');
assert(remaining.includes('paymentExpectedShareForTraveler_(cabin,id)'), 'reimbursement balance must reuse adjusted expected-share math');
assert(remaining.includes("paymentTravelerPaidTotal_(cabinId,id,'')"), 'reimbursement balance must subtract recorded outgoing traveler payments');
assert(remaining.includes("String(row['Recipient Type']||'')!=='Traveler'"), 'reimbursement schedule coverage must only count traveler-directed installments');
assert(remaining.includes("String(row['Recipient Traveler ID']||'')!==recipientId"), 'reimbursement schedule coverage must target the selected booking traveler');
assert(remaining.includes('Math.max(0,remainingShares-scheduledToRecipient)'), 'unscheduled reimbursement must subtract existing unpaid reimbursements');

assert(integration.includes('Use remaining balance'), 'generator milestone rows must expose Use remaining balance');
assert(integration.includes('paymentGenerationRemainingCalculation_'), 'generator must calculate recipient-aware remaining balance');
assert(integration.includes('paymentGenerationRecipientValues_()'), 'remaining balance calculation must follow the generator recipient selection');
assert(integration.includes('paymentRemainingBalancePosition_(cabinId)'), 'agency generator mode must use unscheduled agency balance');
assert(integration.includes('paymentRemainingReimbursementPosition_'), 'traveler generator mode must use unscheduled reimbursement balance');
assert(integration.includes("amountInput.value=calculation.amount.toFixed(2)"), 'Use remaining balance must populate the milestone amount');
assert(integration.includes("labelInput.value='Final booking balance'"), 'blank auto-filled milestone should receive a useful final-balance label');
assert(integration.includes('refreshPaymentGenerationAutoRemaining_'), 'auto-filled remaining balance must stay in sync when recipient changes');
assert(integration.includes("row.dataset.generationAutoRemaining=''"), 'manual amount edits must turn off automatic remaining-balance behavior');
assert(integration.includes('openPaymentRemainingBalanceTool_'), 'integration must explicitly identify and remove the old one-off remaining balance entry point');
assert(integration.includes("Add remaining balance</button>"), 'integration must strip the standalone Add remaining balance button from rendered Payments UI');

assert(generator.includes('paymentGenerationLocalRows_'), 'remaining balance must continue through the normal traveler installment generator');
assert(generator.includes('paymentGenerationSavedShares_(cabinId)'), 'generator must still create rows from saved traveler shares');
assert(generator.includes("'Expected Payer Traveler ID':share.travelerId"), 'generated balance must create traveler-specific installments');
assert(generator.includes('.generatePaymentInstallments('), 'auto-filled remaining balance must save through the normal batch generator endpoint');
assert(backend.includes('allocateGeneratedPaymentCents_'), 'backend must retain exact proportional cent allocation');
assert(backend.includes("rows.push({"), 'backend must create individual schedule rows for generated milestones');

assert(paymentsBackend.includes("bookingIds.indexOf(recipientTravelerId) < 0"), 'server must still restrict traveler recipients to booking travelers');
assert(paymentsBackend.includes("type: 'Traveler'") && paymentsBackend.includes('travelerId: recipientTravelerId'), 'server must normalize booking-traveler recipients through the schedule recipient contract');

assert(index.includes("include('Client_Payment_Remaining_Generator')"), 'AppsScriptIndex must load remaining-balance generator integration last');
assert(index.includes("include('Styles_Payment_Remaining_Generator')"), 'AppsScriptIndex must load remaining-balance generator styles');
assert(styles.includes('payment-generation-use-remaining'), 'remaining generator action must have responsive styling');

new Function(scriptBody(remaining));
new Function(scriptBody(integration));
console.log('PASS remaining balance generates traveler installments through the standard generator');
