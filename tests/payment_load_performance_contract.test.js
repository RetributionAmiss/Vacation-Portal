const fs=require('fs');
const path=require('path');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'Payments_Performance.gs'),'utf8');
const client=fs.readFileSync(path.join(root,'Client_Payments_Performance.html'),'utf8');
const index=fs.readFileSync(path.join(root,'AppsScriptIndex.html'),'utf8');

assert(/function\s+getPaymentDataFast\s*\(/.test(server),'fast payment read endpoint is missing');
assert(/ensurePortalSchemaCurrent_\s*\(\)/.test(server),'fast endpoint must use the lightweight schema-version check');
assert(/paymentSheetsReady_\s*\(\)/.test(server),'fast endpoint must verify payment sheets');
assert(/ensurePaymentSheets_\s*\(\)/.test(server),'missing payment sheets must fall back to the repair path');
assert(!/setupVacationPortalSilent_\s*\(\)/.test(server),'fast endpoint must not directly run full portal setup');

assert(/\.getPaymentDataFast\s*\(\)/.test(client),'client must use the fast payment endpoint');
assert(/DATA\s*&&\s*DATA\.deferredLoaded/.test(client),'payment prefetch must wait until deferred portal data is loaded');
assert(/paymentState_\.loaded\s*\|\|\s*paymentState_\.loading/.test(client),'prefetch must avoid duplicate payment requests');
assert(/include\('Client_Payments_Performance'\)/.test(index),'payment performance client must be loaded');

const js=client.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
new Function(js);

console.log('Payment load performance contracts passed.');
