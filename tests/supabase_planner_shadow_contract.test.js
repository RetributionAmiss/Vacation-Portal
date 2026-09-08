'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260908041800_align_planner_source_shapes.sql'),
  'utf8'
);
const runbook = fs.readFileSync(path.join(root, 'docs', 'SUPABASE_MIGRATION_RUNBOOK.md'), 'utf8');

assert(
  migration.includes('alter table public.itinerary_items alter column event_date drop not null'),
  'Itinerary ideas must be allowed to exist before a date is chosen.'
);
assert(
  migration.includes('drop column cost_per_cents') &&
  migration.includes("add column cost_per text not null default 'Person'"),
  'Itinerary Cost Per must be modeled as a semantic label, not money.'
);
assert(
  migration.includes('alter table public.grocery_items alter column quantity type text using quantity::text'),
  'Grocery quantity must preserve free-form source values such as 2lb and 5 Cups.'
);

for (const checkpoint of [
  '| Travelers | 18 | 18 |',
  '| Meals | 7 | 7 |',
  '| Grocery items | 10 | 10 |',
  '| Itinerary items | 10 | 10 |',
  '| Itinerary signups | 3 | 3 |',
  '| Planner comments | 0 | 0 |',
  '| Packing items | 3 | 3 |',
  '| Travel plans | 1 | 1 |'
]) {
  assert(runbook.includes(checkpoint), `Missing shadow reconciliation checkpoint: ${checkpoint}`);
}

assert(
  runbook.includes('Google Sheets remains the live application source of truth'),
  'Shadow migration must not claim an application cutover before runtime validation.'
);
assert(
  runbook.includes('Personally identifying traveler data and live vacation records must not be committed'),
  'Production shadow data must remain out of repository fixtures.'
);
assert(
  runbook.includes('No organizer role is inferred from Sheet data'),
  'Organizer privilege must never be inferred from imported traveler data.'
);
assert(
  runbook.includes('explicit rollback switch back to Sheets'),
  'Every Supabase domain cutover must retain a rollback path during validation.'
);
assert(
  runbook.includes('Travel plans') && runbook.includes('Packing items') && runbook.includes('Grocery list'),
  'Runbook must define an incremental Planner/Packing/Travel cutover order.'
);

console.log('PASS Supabase Planner + Packing + Travel shadow migration contract');
