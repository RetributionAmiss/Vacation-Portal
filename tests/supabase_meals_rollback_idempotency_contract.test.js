'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const client = fs.readFileSync(
  path.join(__dirname, '..', 'Client_Supabase_Meals_Bridge.html'),
  'utf8'
);

const freshRequestIds = client.match(/requestId:requestId_\(\)/g) || [];

assert(
  freshRequestIds.length >= 2,
  'Primary and fallback Meal backup saves must each generate a fresh mutation request ID.'
);
assert(
  !client.includes("requestId:String(meal['Meal ID']||'')"),
  'The stable Meal ID must never be reused as the Sheets backup idempotency request ID.'
);

console.log('PASS Supabase Meals rollback idempotency contract');