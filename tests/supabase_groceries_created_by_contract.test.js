'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const host = fs.readFileSync(path.join(__dirname, '..', 'supabase-groceries-bridge.js'), 'utf8');

assert(
  host.includes('activeClient.auth.getSession()') &&
  host.includes('auth_user_id: session.user.id') &&
  host.includes('created_by: membership.auth_user_id || null'),
  'New Grocery rows must record the authenticated auth.users ID in created_by.'
);

assert(
  !host.includes('created_by: membership.traveler_id'),
  'Traveler IDs must never be written to grocery_items.created_by because that column references auth.users(id).'
);

console.log('PASS Supabase Grocery created_by auth identity contract');
