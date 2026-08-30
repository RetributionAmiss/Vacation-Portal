const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){console.error('FAIL',message);process.exit(1);}}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const backend=read('Payments_Installment_Generation.gs');
const client=read('Client_Payment_Installment_Generation.html');
const styles=read('Styles_Payment_Installment_Generation.html');
const index=read('AppsScriptIndex.html');

assert(/function\s+generatePaymentInstallments\s*\(/.test(backend),'backend must expose generatePaymentInstallments');
assert(backend.includes('assertOrganizerFromValues_(values)'), 'installment generation must remain Organizer-authorized');
assert(backend.includes("paymentShareRowsForCabin_(cabinId)"), 'generation must use saved Payment Shares');
assert(backend.includes("'Adjusted Share'"), 'generation must use Organizer-adjusted traveler shares');
assert(backend.includes('allocateGeneratedPaymentCents_'), 'backend must allocate milestone totals in cents');
assert(backend.includes('index === shares.length - 1') && backend.includes('? totalCents'), 'final traveler must absorb rounding remainder so each milestone reconciles exactly');
assert(backend.includes("bookingIds.indexOf(recipientTravelerId) < 0"), 'traveler reimbursement recipient must be one of the booking travelers');
assert(backend.includes("payerId !== recipientTravelerId"), 'booking recipient must not be given a self-reimbursement installment');
assert(backend.includes("'Recipient Type': reimburseAnotherTraveler ? 'Traveler' : 'Agency'"), 'recipient booker own share must fall back to the agency');
assert(backend.includes('appendGeneratedPaymentScheduleRows_'), 'generated rows should be written as one schedule batch');
assert(!/deleteById_\('Payment Schedule'/.test(backend), 'generator must not replace or delete existing schedule rows');

assert(client.includes('Generate traveler installments'), 'Payments UI must expose the generator');
assert(client.includes('Booking milestone amount'), 'Organizer must enter overall booking milestone amounts');
assert(client.includes('paymentGenerationSavedShares_'), 'client preview must use saved traveler shares');
assert(client.includes('paymentGenerationAllocateCents_'), 'optimistic preview must use cent-aware proportional allocation');
assert(client.includes('Agency / property directly') && client.includes('A traveler handling the booking'), 'Organizer must choose direct agency payment or booking-traveler reimbursement');
assert(client.includes('Existing schedule rows are left untouched.'), 'generator must warn that generation is additive');
assert(client.includes('payment-generation-traveler-preview'), 'preview must show generated batch amount by traveler');
assert(client.includes("paymentState_.schedule=previous.concat(localRows)"), 'generated schedule rows must appear optimistically before the server returns');
assert(client.indexOf('paymentState_.schedule=previous.concat(localRows)') < client.indexOf('.generatePaymentInstallments('), 'optimistic UI update must occur before Apps Script persistence');
assert(client.includes("paymentState_.schedule=previous;"), 'failed generation must roll the optimistic schedule back');
assert(client.includes("document.addEventListener('input'"), 'milestone preview must update live as amounts/dates are edited');

assert(index.includes("include('Client_Payment_Installment_Generation')"), 'AppsScriptIndex must load installment generator client');
assert(index.includes("include('Styles_Payment_Installment_Generation')"), 'AppsScriptIndex must load installment generator styles');
assert(styles.includes('@media(max-width:760px)') && styles.includes('@media(max-width:520px)'), 'generator must include responsive layouts');

new Function(scriptBody(client));
console.log('PASS payment installment generation contracts');
