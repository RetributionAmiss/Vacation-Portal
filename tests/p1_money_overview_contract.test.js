const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'Client_P1_Money_Overview.html'),'utf8');
const styles=fs.readFileSync(path.join(root,'Styles_P1_Money_Overview.html'),'utf8');
const index=fs.readFileSync(path.join(root,'AppsScriptIndex.html'),'utf8');

assert(/function\s+renderP1MoneyOverview_\s*\(/.test(client),'Money overview renderer is missing');
assert(/moneyGroup\.defaultView\s*=\s*['"]money['"]/.test(client),'Money group must open on the overview');
assert(/moneyGroup\.views\s*=\s*\[['"]money['"],['"]payments['"],['"]budget['"]\]/.test(client),'Money group must keep Overview, Payments, and Budget together');
assert(/P1_VIEW_LABELS_\.money\s*=\s*['"]Overview['"]/.test(client),'Money overview label is missing');
assert(/<span>Money<\/span>/.test(client),'mobile primary navigation must expose Money');

assert(/paymentExpectedShareForTraveler_/.test(client),'Money overview must reuse expected traveler lodging shares');
assert(/paymentTravelerPaidTotal_/.test(client),'Money overview must reuse recorded traveler payment totals');
assert(/paymentScheduleStatus_/.test(client),'Money overview must reuse installment remaining-balance logic');
assert(/Confirmation Status/.test(client),'Money overview must surface reimbursement confirmation state');
assert(/DATA&&DATA\.budget/.test(client),'Money overview must reuse shared Budget data');

[
  'Expected lodging share',
  'Paid by you',
  'Left on lodging',
  'Next payment',
  'Money between travelers',
  'Shared trip extras',
  'Trip costs outside the lodging split'
].forEach(function(label){
  assert(client.includes(label),'Money overview is missing: '+label);
});

assert(/paymentRestoreSnapshot_/.test(client),'Money overview must hydrate from the fast payment snapshot');
assert(/setTimeout\(function\(\)\{loadPaymentData_\(false\);\},0\)/.test(client),'Money refresh must remain non-blocking');
assert(/currentView===['"]money['"]/.test(client),'render integration for the Money view is missing');
assert(/include\('Client_P1_Money_Overview'\)/.test(index),'Money overview client include is missing');
assert(/include\('Styles_P1_Money_Overview'\)/.test(index),'Money overview styles include is missing');
assert(/p1-money-summary-grid/.test(styles),'Money overview responsive summary styles are missing');
assert(/@media\(max-width:650px\)/.test(styles),'Money overview mobile breakpoint is missing');

const js=client.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
new Function(js);

console.log('P1 Money overview contracts passed.');
