'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');

const config=fs.readFileSync(path.join(root,'config.js'),'utf8');
const host=fs.readFileSync(path.join(root,'supabase-rentals-shadow-bridge.js'),'utf8');
const client=fs.readFileSync(path.join(root,'Client_Supabase_Finalized_Rental_Shadow.html'),'utf8');
const shell=fs.readFileSync(path.join(root,'AppsScriptIndex.html'),'utf8');
const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260911190000_align_rental_source_shape.sql'),'utf8');

assert(config.includes("release: 'V4.4.0-alpha2.28'"),'alpha2.28 release marker is required.');
assert(/rentals:\s*\{[\s\S]*?shadowRead:\s*true[\s\S]*?shadowWrite:\s*false[\s\S]*?read:\s*false[\s\S]*?write:\s*false/.test(config),'Rentals must remain shadow-read only.');
assert(config.includes("script.src='./supabase-rentals-shadow-bridge.js?v='"),'Rental shadow host bridge loader is missing.');
assert(worker.includes("family-vacation-pwa-v4-4-0-alpha2-28"),'alpha2.28 service worker cache is required.');
assert(worker.includes("url.pathname.endsWith('/supabase-rentals-shadow-bridge.js')"),'Rental shadow host bridge must be network-first.');
assert(shell.includes("include('Client_Supabase_Finalized_Rental_Shadow')"),'Apps Script shell must load the shadow comparator.');

assert(migration.includes('add column if not exists fees_and_taxes text'),'Fees and Taxes must preserve descriptive source text.');
assert(!migration.includes('drop column fees_and_taxes_cents'),'Shadow foundation must not destructively drop the legacy numeric column.');

assert(host.includes(".from('trip_members')")&&host.includes(".eq('auth_user_id', session.user.id)"),'Shadow read must require the authenticated Supabase membership.');
assert(host.includes(".from('rentals')")&&host.includes(".eq('trip_id', membership.trip_id)")&&host.includes(".eq('legacy_id', id)"),'Shadow read must be bounded to the active trip and stable CABIN ID.');
assert(host.includes("'Fees and Taxes': text(row.fees_and_taxes)"),'Rental DTO must use descriptive fees/taxes text.');
assert(!/\.insert\s*\(/.test(host)&&!/\.update\s*\(/.test(host)&&!/\.delete\s*\(/.test(host),'Shadow host must not mutate Rentals.');
assert(host.includes("primary: false")&&host.includes("shadow: true"),'Shadow response must never claim primary authority.');

assert(client.includes("const owned=pending[requestId];")&&client.includes("if(!owned) return;"),'Shared domain responses must be scoped by owned requestId before processing.');
assert(client.includes("trip['Selected Cabin ID']")&&client.includes("stage==='Voting Closed'"),'Comparator must only target the finalized selected cabin.');
assert(client.includes("status:mismatches.length?'mismatch':'match'"),'Comparator must report explicit match/mismatch state.');
assert(!/DATA\.cabins\s*=/.test(client),'Shadow comparator must never replace DATA.cabins.');
assert(!/\.push\s*\([^\n]*DATA\.cabins/.test(client),'Shadow comparator must not mutate the visible cabin collection.');
assert(client.includes("primary:false"),'Client diagnostics must record that this is not primary authority.');

for(const forbidden of ['Price Cap','Cost %','Pay More','traveler_admin','traveler_private']){
  assert(!host.includes(forbidden),`Rental shadow DTO must not expose private/organizer field: ${forbidden}`);
}

console.log('PASS finalized rental Supabase shadow contract');
