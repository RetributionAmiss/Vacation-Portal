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
const styles = read('Styles_Payments.html');
const archive = read('Archive.gs');

assert(
  config.includes("const PORTAL_SCHEMA_VERSION = '4.4.1'") &&
    config.includes("'Booking Plans': [") &&
    config.includes("'Payment Schedule': [") &&
    config.includes('Payments: ['),
  'Payment feature must version and declare all three persistent sheets.'
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
  'function savePaymentScheduleItem(values)',
  'function deletePaymentScheduleItem(id)',
  'function saveBookingPayment(values)',
  'function deleteBookingPayment(id)'
].forEach((signature) => {
  assert(backend.includes(signature), `Missing payment backend function: ${signature}`);
});

assert(
  backend.includes("recipientType === 'Traveler'") &&
    backend.includes("type: 'Agency'") &&
    backend.includes("bookingIds.indexOf(recipientTravelerId) < 0"),
  'Recipients must distinguish agency payments from reimbursements to booking travelers.'
);

assert(
  backend.includes("'Schedule ID': schedule ? schedule['Schedule ID'] : ''") &&
    backend.includes("throw new Error(\n      'This installment already has payment history."),
  'Payments must be linkable to installments and linked installment history must be protected.'
);

assert(
  index.includes('data-view="payments"') &&
    index.includes("include('Styles_Payments')") &&
    index.includes("include('Client_Payments')") &&
    index.includes("include('Client_Payments_Integration')"),
  'Payments must be reachable from the portal and load its client/style modules.'
);

const clientSource = client
  .replace(/^\s*<script>\s*/, '')
  .replace(/\s*<\/script>\s*$/, '');
const integrationSource = integration
  .replace(/^\s*<script>\s*/, '')
  .replace(/\s*<\/script>\s*$/, '');
new Function(clientSource);
new Function(integrationSource);

assert(
  client.includes("String(row['Paid To Type']||'Agency')==='Agency'") &&
    client.includes("String(row['Paid To Type']||'')==='Traveler'") &&
    client.includes('const remaining=Math.max(0,bookingTotal-paidToAgency);'),
  'Booking balance must be reduced only by agency/property payments, not traveler reimbursements.'
);

assert(
  client.includes('Paid toward booking') &&
    client.includes('Left to pay') &&
    client.includes('Reimbursements') &&
    client.includes('Who has paid what?'),
  'Payment view must expose booking totals, remaining balance, reimbursements, and traveler totals.'
);

assert(
  client.includes("beginBackgroundSave_(label,key)") &&
    client.includes(".getPaymentData()") &&
    client.includes("'saveBookingPayment'") &&
    client.includes("'savePaymentScheduleItem'"),
  'Payment saves must use the shared background-save UX and the payment ledger must lazy-load.'
);

assert(
  integration.includes("currentView!=='payments'") &&
    integration.includes("selectMobileSection_('payments')") &&
    integration.includes('💳'),
  'Payments must render as a normal portal section and be reachable from mobile navigation.'
);

assert(
  styles.includes('.payment-summary-grid') &&
    styles.includes('.payment-schedule-row') &&
    styles.includes('@media(max-width:650px)'),
  'Payment schedule must include responsive summary and ledger styling.'
);

assert(
  archive.includes("'Booking Plans'") &&
    archive.includes("'Payment Schedule'") &&
    archive.includes("'Payments'"),
  'Payment planning data must be included in vacation archive/reset handling.'
);

console.log('PASS payment schedule contracts');
