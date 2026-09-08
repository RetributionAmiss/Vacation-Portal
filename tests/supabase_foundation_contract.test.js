'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migrationDir = path.join(root, 'supabase', 'migrations');
const names = fs.readdirSync(migrationDir).sort();

const expected = [
  '20260908035803_initial_vacation_portal_schema.sql',
  '20260908035822_harden_public_security_definer.sql',
  '20260908035906_split_traveler_privacy_and_add_rls.sql',
  '20260908040200_optimize_rls_and_foreign_key_indexes.sql',
  '20260908041100_auth_invitations_and_membership_claim.sql',
  '20260908041300_move_invitation_claim_definer_private.sql',
  '20260908041800_align_planner_source_shapes.sql'
];
expected.forEach(name => assert(names.includes(name), `Missing Supabase migration ${name}`));

const initial = fs.readFileSync(path.join(migrationDir, expected[0]), 'utf8');
const privacy = fs.readFileSync(path.join(migrationDir, expected[2]), 'utf8');
const optimize = fs.readFileSync(path.join(migrationDir, expected[3]), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs', 'SUPABASE.md'), 'utf8');

for (const table of [
  'trips','travelers','trip_members','rentals','votes','favorites','room_assignments',
  'booking_plans','payment_shares','payment_schedules','payments','budget_items',
  'meals','grocery_items','itinerary_items','itinerary_signups','planner_comments',
  'packing_items','travel_plans','notifications','activity_log'
]) {
  assert(initial.includes(`create table public.${table}`), `Foundation must create ${table}`);
}

assert(/amount_cents\s+bigint/.test(initial), 'Payment money must be stored as integer cents.');
assert(/cost_cents\s+bigint/.test(initial), 'Itinerary money must be stored as integer cents.');
assert(/departure_date\s+date/.test(initial), 'Travel dates must use PostgreSQL date.');
assert(/departure_time\s+time/.test(initial), 'Travel clock values must use PostgreSQL time.');
assert(/created_at\s+timestamptz/.test(initial), 'True timestamps must use timestamptz.');
assert(initial.includes('alter table public.%I enable row level security'), 'Foundation must enable RLS before browser integration.');
assert(initial.includes('revoke all on table public.%I from anon'), 'Anonymous table access must be closed by default.');

assert(privacy.includes('create table public.traveler_private'), 'Traveler-private fields need a separate table.');
assert(privacy.includes('create table public.traveler_admin'), 'Organizer-only traveler pricing controls need a separate table.');
assert(privacy.includes('drop column email'), 'Shared travelers must not retain email after the privacy split.');
assert(privacy.includes('drop column price_cap_cents'), 'Shared travelers must not retain organizer price caps.');
assert(privacy.includes('private.is_trip_member'), 'RLS must enforce trip membership in PostgreSQL.');
assert(privacy.includes('private.is_trip_organizer'), 'RLS must enforce organizer access in PostgreSQL.');
assert(privacy.includes('private.current_traveler_id'), 'RLS must resolve the signed-in traveler server-side.');

assert(!/for all to authenticated[\s\S]{0,180}private\.is_trip_organizer\(trip_id\)/.test(optimize), 'Shared organizer policies should be split by action to avoid overlapping SELECT policies.');
assert(optimize.includes('travel_plans_self_insert'), 'Traveler-owned travel writes must be explicit.');
assert(optimize.includes('packing_items_owner_update'), 'Packing writes must be owner-scoped.');
assert(optimize.includes('itinerary_signups_self_delete'), 'Itinerary signup writes must be self-scoped.');
assert(optimize.includes('create index if not exists travel_plans_traveler_idx'), 'RLS/query foreign keys must be indexed.');

assert(docs.includes('Google Sheets remains the current production source of truth'), 'Docs must state the migration cutover boundary.');
assert(docs.includes('No app domain should switch to Supabase until'), 'Docs must require equivalence/rollback before domain cutover.');
assert(docs.includes('Never commit service-role keys'), 'Docs must prohibit committing server secrets.');

console.log('PASS Supabase foundation contract');
require('./supabase_auth_permissions_contract.test.js');
require('./supabase_planner_shadow_contract.test.js');
