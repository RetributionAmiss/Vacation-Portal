'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');

const config=fs.readFileSync(path.join(root,'config.js'),'utf8');
const host=fs.readFileSync(path.join(root,'supabase-rentals-shadow-bridge.js'),'utf8');
const client=fs.readFileSync(path.join(root,'Client_Supabase_Finalized_Rental_Shadow.html'),'utf8');
const previewGate=fs.readFileSync(path.join(root,'preview-auth-gate.js'),'utf8');
const shell=fs.readFileSync(path.join(root,'AppsScriptIndex.html'),'utf8');
const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260911190000_align_rental_source_shape.sql'),'utf8');

assert(config.includes("release: 'V4.4.0-alpha2.28'"),'alpha2.28 release marker is required.');
assert(/rentals:\s*\{[\s\S]*?shadowRead:\s*true[\s\S]*?shadowWrite:\s*false[\s\S]*?read:\s*false[\s\S]*?write:\s*false/.test(config),'Rentals must remain shadow-read only.');
assert(config.includes("script.src='./supabase-rentals-shadow-bridge.js?v='"),'Rental shadow host bridge loader is missing.');
assert(worker.includes("family-vacation-pwa-v4-4-0-alpha2-28"),'alpha2.28 service worker cache is required.');
assert(worker.includes("url.pathname.endsWith('/supabase-rentals-shadow-bridge.js')"),'Rental shadow host bridge must be network-first.');
assert(worker.includes("url.pathname.endsWith('/preview-auth-gate.js')"),'Preview auth/status relay must be network-first.');
assert(shell.includes("include('Client_Supabase_Finalized_Rental_Shadow')"),'Apps Script shell must load the shadow comparator.');

assert(migration.includes('add column if not exists fees_and_taxes text'),'Fees and Taxes must preserve descriptive source text.');
assert(!migration.includes('drop column fees_and_taxes_cents'),'Shadow foundation must not destructively drop the legacy numeric column.');

assert(host.includes(".from('trip_members')")&&host.includes(".eq('auth_user_id', session.user.id)"),'Shadow read must require the authenticated Supabase membership.');
assert(host.includes(".from('rentals')")&&host.includes(".eq('trip_id', membership.trip_id)")&&host.includes(".eq('legacy_id', id)"),'Shadow read must be bounded to the active trip and stable CABIN ID.');
assert(host.includes("'Fees and Taxes': text(row.fees_and_taxes)"),'Rental DTO must use descriptive fees/taxes text.');
assert(!/\.insert\s*\(/.test(host)&&!/\.update\s*\(/.test(host)&&!/\.delete\s*\(/.test(host),'Shadow host must not mutate Rentals.');
assert(host.includes("primary: false")&&host.includes("shadow: true"),'Shadow response must never claim primary authority.');
assert(host.includes("publishPreviewStage('host-request-received'")&&host.includes("publishPreviewStage('host-read-ok'")&&host.includes("publishPreviewStage('host-read-error'"),'Preview host must expose request/read pipeline stages without changing authority.');
assert(host.includes("publishPreviewStage('host-request-rejected'")&&host.includes("'untrusted_request_source'"),'Preview diagnostics must expose rejected request sources without weakening source validation.');

assert(client.includes("const owned=pending[requestId];")&&client.includes("if(!owned) return;"),'Shared domain responses must be scoped by owned requestId before processing.');
assert(client.includes("trip['Selected Cabin ID']")&&client.includes("stage==='Voting Closed'"),'Comparator must only target the finalized selected cabin.');
assert(client.includes("if(field==='Active')")&&client.includes("if(!active||active==='yes'||active==='true'||active==='1'||active==='on') return 'Yes';"),'Blank Sheet Active values must retain the portal\'s existing default-active semantics during shadow comparison.');
assert(client.includes("status:mismatches.length?'mismatch':'match'"),'Comparator must report explicit match/mismatch state.');
assert(client.includes('const RESPONSE_TIMEOUT_MS=8000;')&&client.includes('const RETRY_DELAY_MS=1500;'),'Shadow request must have a bounded startup-race timeout and retry delay.');
assert(client.includes("if(fingerprint===completedFingerprint||inFlightFingerprint||Date.now()<retryNotBefore) return;")&&client.includes("finishPending_(requestId,false)"),'A dropped startup request must clear its in-flight fingerprint so the same finalized rental can retry.');
assert(client.includes("'shadow_bridge_timeout'")&&client.includes('The check will retry.'),'Timeout diagnostics must distinguish a lost bridge startup message from a completed comparison.');
const errorBranch=client.indexOf('if(!data.ok){');
const errorFinish=client.indexOf('finishPending_(requestId,false);',errorBranch);
const successFinish=client.indexOf('finishPending_(requestId,true);',errorBranch);
assert(errorBranch>=0&&errorFinish>errorBranch&&successFinish>errorFinish,'Error responses must clear the request without marking the rental fingerprint completed; only a successful response may complete it.');
assert(client.includes('retryNotBefore=Date.now()+RETRY_DELAY_MS;'),'Transient shadow response failures must be eligible for a bounded retry.');
assert(!/DATA\.cabins\s*=/.test(client),'Shadow comparator must never replace DATA.cabins.');
assert(!/\.push\s*\([^\n]*DATA\.cabins/.test(client),'Shadow comparator must not mutate the visible cabin collection.');
assert(client.includes("primary:false"),'Client diagnostics must record that this is not primary authority.');
assert(client.includes("status:'checking',stage:'request-posted'")&&client.includes("status:'waiting'")&&client.includes('PREVIEW_DIAGNOSTIC_TYPE'),'Preview comparator must distinguish pre-request waiting from active request checking.');
assert(client.includes("publishEligibilityStage_('sheet-data'")&&client.includes("publishEligibilityStage_('selected-cabin-row'"),'Preview comparator must expose why a finalized cabin is not yet request-eligible.');

assert(previewGate.includes('let authCheckInFlight=false;')&&previewGate.includes('if(authCheckInFlight) return false;'),'Preview auth polling must not overlap async checks.');
assert(previewGate.includes("'host-read-ok':'Supabase rental read succeeded; waiting for Sheet comparison'")&&previewGate.includes("'selected-cabin-row':'waiting for selected cabin row in DATA.cabins'"),'Preview badge must identify the exact stage instead of remaining generically CHECKING.');
assert(previewGate.includes('data.stage,data.errorCode'),'Preview badge must render sanitized stage/error-code diagnostics.');

for(const forbidden of ['Price Cap','Cost %','Pay More','traveler_admin','traveler_private']){
  assert(!host.includes(forbidden),`Rental shadow DTO must not expose private/organizer field: ${forbidden}`);
}

console.log('PASS finalized rental Supabase shadow contract');
