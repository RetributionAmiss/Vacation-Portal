const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'Payments_Performance.gs'),'utf8');
const client=fs.readFileSync(path.join(root,'Client_Payments_Performance.html'),'utf8');
const index=fs.readFileSync(path.join(root,'AppsScriptIndex.html'),'utf8');
const host=fs.readFileSync(path.join(root,'config.js'),'utf8');

assert(/function\s+getPaymentDataFast\s*\(\s*forceFresh\s*\)/.test(server),'fast payment read endpoint is missing');
assert(/ensurePortalSchemaCurrent_\s*\(\)/.test(server),'fast endpoint must use the lightweight schema-version check');
assert(/paymentSheetsReady_\s*\(\)/.test(server),'fast endpoint must verify payment sheets');
assert(/ensurePaymentSheets_\s*\(\)/.test(server),'missing payment sheets must fall back to the repair path');
assert(!/setupVacationPortalSilent_\s*\(\)/.test(server),'fast endpoint must not directly run full portal setup');
assert(/CacheService\.getScriptCache\s*\(\)/.test(server),'fast endpoint must use the short server payment cache');
assert(/function\s+getPortalDeferredDataWithPayments\s*\(\)/.test(server),'deferred portal response must bundle payment data');
assert(/result\.paymentData\s*=\s*getPaymentDataFast\s*\(\s*false\s*\)/.test(server),'deferred response must include the payment snapshot');

assert(/PAYMENT_SNAPSHOT_KEY_\s*=\s*['"]vacationPortalPaymentSnapshotV1['"]/.test(client),'client payment snapshot key is missing');
assert(/localStorage\.setItem\s*\(\s*PAYMENT_SNAPSHOT_KEY_/.test(client),'client must persist a local payment snapshot');
assert(/vacation-portal-save-payment-snapshot/.test(client),'client must persist payment snapshots through the PWA host');
assert(/vacation-portal-request-payment-snapshot/.test(client),'client must request the durable PWA payment snapshot');
assert(/paymentRestoreSnapshot_\s*\(\)/.test(client),'Payments must restore a snapshot before waiting for Apps Script');
assert(/renderPayments\s*=\s*function\s*\(\)/.test(client),'Payments renderer must be wrapped for cache-first rendering');
assert(/\.getPaymentDataFast\s*\(\s*Boolean\(force\)\s*\)/.test(client),'client must use the fast payment endpoint');
assert(/getPortalDeferredDataWithPayments\s*\(\)/.test(client),'client deferred loader must use the bundled payment endpoint');
assert(/paymentState_\.fromSnapshot/.test(client),'cached Payments must be distinguishable while revalidating');
assert(/incomingTime[\s\S]*currentTime[\s\S]*incomingTime<currentTime/.test(client),'older cached server responses must not rewind newer payment state');

assert(/vacationPortalPaymentSnapshotV1/.test(host),'PWA host must use the durable payment snapshot key');
assert(/vacation-portal-save-payment-snapshot/.test(host),'PWA host must save payment snapshots');
assert(/vacation-portal-request-payment-snapshot/.test(host),'PWA host must answer payment snapshot requests');
assert(/vacation-portal-payment-snapshot/.test(host),'PWA host must return saved payment snapshots');

assert(/include\('Client_Payments_Performance'\)/.test(index),'payment performance client must be loaded');

const js=client.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
new Function(js);
new Function(host);

console.log('Payment load performance contracts passed.');
