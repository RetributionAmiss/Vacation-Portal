'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const config = read('Config.gs');
const backend = read('Payments.gs');
const index = read('AppsScriptIndex.html');
const client = read('Client_Payments.html');
const integration = read('Client_Payments_Integration.html');
const sharesClient = read('Client_Payments_Shares.html');
const selfClient = read('Client_Payments_SelfService.html');
const optimisticClient = read('Client_Payments_Optimistic.html');
const optimisticReconcileClient = read('Client_Payments_Optimistic_Reconcile.html');
const styles = read('Styles_Payments.html');
const stylesV2 = read('Styles_Payments_V2.html');
const archive = read('Archive.gs');

assert(
  config.includes("const PORTAL_SCHEMA_VERSION = '4.4.1'") &&
    config.includes("'Booking Plans': [") &&
    config.includes("'Payment Schedule': [") &&
    config.includes('Payments: ['),
  'Payment feature must version and declare its base persistent sheets.'
);

[
  'Booking Traveler IDs',
  'Booking Total',
  'Expected Payer Traveler ID',
  'Recipient Type',
  'Paid By Traveler ID',
  'Paid To Type',
  'Amount',
  'Payment Date'
].forEach((header) => {
  assert(config.includes(`'${header}'`), `Missing payment schema field: ${header}`);
});

[
  'function getPaymentData()',
  'function saveBookingPlan(values)',
  'function savePaymentShares(values)',
  'function savePaymentScheduleItem(values)',
  'function deletePaymentScheduleItem(values)',
  'function saveBookingPayment(values)',
  'function deleteBookingPayment(values)'
].forEach((signature) => {
  assert(backend.includes(signature), `Missing payment backend function: ${signature}`);
});

assert(
  backend.includes('const PAYMENT_SHARES_HEADERS_') &&
    backend.includes("ensureSheet_(ss, 'Payment Shares', PAYMENT_SHARES_HEADERS_)") &&
    backend.includes("'Calculated Share'") &&
    backend.includes("'Adjusted Share'") &&
    backend.includes("'Split Basis'"),
  'Payment shares must persist calculated Rental-board values separately from organizer adjustments.'
);

assert(
  backend.includes('assertOrganizerFromValues_(values);') &&
    backend.includes('function paymentWriteMode_(values, existing, requestedPayerId)') &&
    backend.includes('assertTravelerSelf_(values.deviceId, payerId);') &&
    backend.includes('You cannot change who made an existing payment'),
  'Plan/schedule/share writes must be organizer-protected while traveler payment writes are restricted to the saved device traveler.'
);

assert(
  backend.includes("recipientType === 'Traveler'") &&
    backend.includes("type: 'Agency'") &&
    backend.includes("bookingIds.indexOf(recipientTravelerId) < 0"),
  'Recipients must distinguish agency payments from reimbursements to booking travelers.'
);

assert(
  backend.includes("'Schedule ID': schedule ? schedule['Schedule ID'] : ''") &&
    backend.includes('This installment already has payment history.'),
  'Payments must be linkable to installments and linked installment history must be protected.'
);

assert(
  index.includes('data-view="payments"') &&
    index.includes("include('Styles_Payments')") &&
    index.includes("include('Styles_Payments_V2')") &&
    index.includes("include('Client_Payments')") &&
    index.includes("include('Client_Payments_Integration')") &&
    index.includes("include('Client_Payments_Shares')") &&
    index.includes("include('Client_Payments_SelfService')") &&
    index.includes("include('Client_Payments_Optimistic')") &&
    index.includes("include('Client_Payments_Optimistic_Reconcile')"),
  'Payments and its refinement layers must be reachable and loaded after the stable portal UI.'
);

[
  client,
  integration,
  sharesClient,
  selfClient,
  optimisticClient,
  optimisticReconcileClient
].forEach((source, indexNumber) => {
  const js = source
    .replace(/^\s*<script>\s*/, '')
    .replace(/\s*<\/script>\s*$/, '');
  assert.doesNotThrow(() => new Function(js), `Payment client layer ${indexNumber + 1} must parse.`);
});

assert(
  client.includes("String(row['Paid To Type']||'Agency')==='Agency'") &&
    client.includes("String(row['Paid To Type']||'')==='Traveler'") &&
    client.includes('const remaining=Math.max(0,bookingTotal-paidToAgency);'),
  'Booking balance must be reduced only by agency/property payments, not traveler reimbursements.'
);

assert(
  sharesClient.includes('cappedAdultSplit_(cabin,total)') &&
    sharesClient.includes('cappedBedroomSplit_(cabin,total)') &&
    sharesClient.includes('Adjust multiple travelers') &&
    sharesClient.includes('Automatically add traveler shares from the Rental board'),
  'Traveler targets must seed from the Rental board split math and support organizer bulk adjustment.'
);

assert(
  selfClient.includes('Each traveler can record their own payment') &&
    selfClient.includes('Enter a specific amount') &&
    selfClient.includes('Pay in full') &&
    selfClient.includes('paymentFullAmountFor_') &&
    selfClient.includes("payload.deviceId=String(PWA_DEVICE_ID_||'')"),
  'Traveler self-service must provide manual and pay-in-full payment entry tied to device identity.'
);

assert(
  optimisticClient.includes("if(method==='saveBookingPayment')") &&
    optimisticClient.includes("paymentOptimisticReplaceById_('payments','Payment ID',id,row)") &&
    optimisticClient.includes("if(method==='savePaymentShares')") &&
    optimisticClient.includes("if(method==='savePaymentScheduleItem')") &&
    optimisticClient.includes('paymentOptimisticRender_();') &&
    optimisticClient.indexOf('paymentOptimisticRender_();') < optimisticClient.indexOf('paymentOptimisticPump_();'),
  'Payment state must be mutated and rendered locally before the background sheet write begins.'
);

assert(
  optimisticReconcileClient.includes('paymentOptimisticQueue_.running') &&
    optimisticReconcileClient.includes('paymentOptimisticRebaseAfterSuccess_') &&
    optimisticReconcileClient.includes('queued.rollback=paymentOptimisticApply_') &&
    optimisticReconcileClient.includes('for(let index=failedJobs.length-1;index>=0;index--)') &&
    optimisticReconcileClient.includes('loadPaymentData_(true)'),
  'Optimistic payment saves must serialize background writes, rebase queued changes, and roll back on failure.'
);

assert(
  client.includes('Paid toward booking') &&
    client.includes('Left to pay') &&
    client.includes('Reimbursements') &&
    client.includes('Who has paid what?'),
  'Payment view must expose booking totals, remaining balance, reimbursements, and traveler totals.'
);

assert(
  integration.includes("currentView!=='payments'") &&
    integration.includes("selectMobileSection_('payments')") &&
    integration.includes('💳'),
  'Payments must render as a normal portal section and be reachable from mobile navigation.'
);

assert(
  styles.includes('.payment-summary-grid') &&
    stylesV2.includes('.payment-share-grid') &&
    stylesV2.includes('.payment-amount-options') &&
    stylesV2.includes('@media(max-width:650px)'),
  'Payment schedule and traveler-share controls must stay responsive.'
);

assert(
  archive.includes("'Booking Plans'") &&
    archive.includes("'Payment Shares'") &&
    archive.includes("'Payment Schedule'") &&
    archive.includes("'Payments'"),
  'Payment planning data and adjusted share targets must be included in vacation archive/reset handling.'
);

console.log('PASS payment schedule, traveler shares, self-service, and optimistic update contracts');
