# Supabase foundation

Supabase is the target application database for Family Vacation Portal. Google Sheets remains the current production source of truth until each domain is explicitly migrated and validated.

## Current state

The production Supabase project has the migrations in `supabase/migrations/` applied in order. The schema is intentionally empty of vacation data at this stage.

The foundation provides:

- relational UUID primary keys and foreign keys;
- `legacy_id` columns for safe reconciliation with existing Sheet IDs;
- PostgreSQL `date` for calendar dates, `time` for clock-only values, and `timestamptz` for true instants;
- integer-cent columns for money;
- bounded percentage and count constraints;
- `created_at`, `updated_at`, `created_by`, `version`, and `archived_at` lifecycle fields;
- update triggers that advance `version` for optimistic concurrency;
- Row Level Security on every exposed application table;
- no anonymous table access;
- trip-member, traveler-self, and organizer authorization helpers and policies;
- separate `traveler_private` and `traveler_admin` tables so shared traveler rows do not carry private/admin-only fields.

## Trust boundaries

`travelers` is the shared traveler profile. It contains fields that other members of the same trip may need for planning.

`traveler_private` contains self/organizer information such as email, home location, and personal notes.

`traveler_admin` contains organizer-only pricing controls such as price cap, cost percentage, and Pay More.

This mirrors the browser DTO boundary established before the database migration instead of moving complete spreadsheet rows into a new backend.

## Role model

Initial roles are:

- `organizer`
- `co_organizer`
- `traveler`

A signed-in user becomes a member of a trip through `trip_members`. RLS checks trip membership in PostgreSQL; browser code is not trusted to enforce row visibility on its own.

## Migration sequence

1. Foundation/schema and RLS — complete.
2. Supabase Auth/session integration and organizer onboarding.
3. Planner, packing, and travel migration.
4. Payments and budget migration.
5. Rentals, voting, and room assignments migration.
6. Realtime subscriptions and IndexedDB cache.
7. Sheets becomes an optional report/export surface rather than the primary database.

No app domain should switch to Supabase until its read/write equivalence tests and rollback path are in place.

## Secrets

Never commit service-role keys, database passwords, access tokens, refresh tokens, or `.env` files containing secrets.

The project URL and browser publishable key may eventually be shipped to the PWA because RLS is the actual data security boundary, but they should only be added when the Auth integration is ready. Service-role credentials remain server-only.

## Schema changes

All DDL must be captured as a timestamped SQL migration under `supabase/migrations/` and applied in the same order in every environment. Do not make ad-hoc production schema changes without adding the corresponding migration to source control.
