'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

function read(relative){return fs.readFileSync(path.join(__dirname,'..',relative),'utf8');}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const server=read('FinalizedRentalFocus.gs');
const client=read('Client_Pricing_Branch_Polish.html');
const styles=read('Styles_Pricing_Branch_Polish.html');
const index=read('AppsScriptIndex.html');

assert(server.includes("trip['Final Voting Closed']"),'final-rental focus must require final voting to be closed');
assert(server.includes("trip['Selected Cabin ID']"),'final-rental focus must use the explicitly selected rental');
assert(/function\s+getPortalStartupDataFocused\s*\(/.test(server),'focused startup endpoint must exist');
assert(/function\s+getPortalDeferredDataWithPaymentsFocused\s*\(/.test(server),'focused deferred endpoint must preserve bundled payments');
assert(/function\s+getPaymentDataFastFocused\s*\(/.test(server),'focused payment refresh endpoint must exist');
assert(/function\s+getPortalDeltaFocused\s*\(/.test(server),'focused delta endpoint must exist');
assert(server.includes("payload.cabins = filterRowsForFinalRental_"),'focused payload must remove non-selected rentals');
assert(server.includes("payload.paymentData = filterPaymentDataForFinalRental_"),'bundled payment data must be filtered to selected rental');
assert(server.includes("['plans', 'shares', 'schedule', 'payments']"),'all payment collections must be filtered to selected rental');

assert(client.includes('function p21ReimbursementGroups_'),'Money overview must group reimbursement installments');
assert(client.includes("String(row['Recipient Type']||'')==='Traveler'"),'reimbursement board must include only traveler-recipient installments');
assert(client.includes("const key=[label,dueDate,recipientId].join('|')"),'reimbursements must group by installment label/date/recipient');
assert(client.includes('group.total+=amount'),'reimbursement group must total scheduled reimbursement amount');
assert(client.includes('group.paid+=paid'),'reimbursement group must total marked-paid amount');
assert(client.includes("expectedPayer===travelerId"),'reimbursement group must determine the current traveler assigned portion');
assert(client.includes('Still owed'),'reimbursement UI must emphasize what the booking traveler is still owed');
assert(client.includes('Total reimbursement'),'reimbursement UI must show installment reimbursement total');
assert(client.includes('Marked paid'),'reimbursement UI must show amount recorded as paid');
assert(client.includes('Your portion'),'reimbursement UI must show current traveler portion status');

assert(client.includes("mobile.insertAdjacentElement('afterend',shell)"),'mobile secondary navigation must be placed below main icon navigation');
assert(client.includes("window.matchMedia('(max-width:650px)')"),'navigation hierarchy must switch specifically for mobile');
assert(styles.includes('.p21-mobile-secondary-shell .p1-secondary-nav-button'),'mobile secondary navigation must have compact dedicated styling');
assert(styles.includes('font-size:9px'),'secondary nav must be visually subordinate to main icon navigation');

assert(client.includes('.getPortalStartupDataFocused(PWA_DEVICE_ID_)'),'client startup must use focused endpoint');
assert(client.includes('.getPortalDeferredDataWithPaymentsFocused()'),'client deferred load must use focused endpoint');
assert(client.includes('.getPaymentDataFastFocused(Boolean(force))'),'payment refresh must remain focused after finalization');
assert(client.includes('.getPortalDeltaFocused(portalDeltaSince)'),'delta sync must remain focused after finalization');
assert(client.includes('p21ApplyFinalRentalClientFocus_'),'cached/client state must also hide non-selected rentals');
assert(client.includes('scheduleRentalPolling_=function()'),'rental import polling must be suppressible after finalization');
assert(client.includes('startLiveActivityPolling_=function()'),'new-rental activity polling must be suppressible after finalization');

assert(styles.includes('overflow-x:hidden'),'mobile Money layout must prevent page-level horizontal overflow');
assert(styles.includes('.p1-money-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}'),'mobile Money summaries must use bounded two-column tracks');
assert(styles.includes('overflow-wrap:anywhere'),'long Money copy must wrap instead of widening the viewport');

assert(index.includes("include('Styles_Pricing_Branch_Polish')"),'pricing polish styles must be loaded');
assert(index.includes("include('Client_Pricing_Branch_Polish')"),'pricing polish client must be loaded last');

assert.doesNotThrow(()=>new Function(scriptBody(client)),'pricing branch client layer must parse');
console.log('PASS pricing branch reimbursement, mobile hierarchy, and finalized-rental contracts');
