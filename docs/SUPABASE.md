# Supabase foundation

Supabase is the target application database for Family Vacation Portal. Google Sheets remains the current production source of truth until each domain is explicitly migrated and validated.

## Current state

The production Supabase project has the migrations in `supabase/migrations/` applied in order. Planner, packing, travel, traveler, and related records may exist as validated shadow data while Sheets remains authoritative for the live portal.

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

## Hosted Auth configuration

The GitHub PWA owns the Supabase browser session. Access and refresh tokens remain in the top-level PWA and are never posted into the Apps Script iframe.

For the installed-app experience, use email OTP rather than relying on a Magic Link opening a separate Safari storage context.

In Supabase Dashboard:

1. Open **Authentication → URL Configuration** and set the Site URL to `https://retributionamiss.github.io/Vacation-Portal/`.
2. Add that same URL as an allowed redirect URL.
3. Open **Authentication → Email Templates → Magic Link**.
4. Change the template so the message contains the Supabase token variable `{{ .Token }}`. Supabase treats the shared email passwordless flow as an OTP when the template exposes the token instead of relying only on the confirmation link.

A minimal template is:

```html
<h2>Your Family Vacation Portal sign-in code</h2>
<p>Enter this code in the app:</p>
<p style="font-size:24px;font-weight:700">{{ .Token }}</p>
```

The PWA remembers only the last email address used on that device plus a short-lived pending-verification marker. It does not persist the one-time verification code itself.

## Migration sequence

1. Foundation/schema and RLS — complete.
2. Supabase Auth/session integration and organizer onboarding — in progress.
3. Planner, packing, and travel migration — shadow copy established; runtime cutover pending.
4. Payments and budget migration.
5. Rentals, voting, and room assignments migration.
6. Realtime subscriptions and IndexedDB cache.
7. Sheets becomes an optional report/export surface rather than the primary database.

No app domain should switch to Supabase until its read/write equivalence tests and rollback path are in place.

## Secrets

Never commit service-role keys, database passwords, access tokens, refresh tokens, or `.env` files containing secrets.

The project URL and browser publishable key may be shipped to the PWA because RLS is the actual data security boundary. Service-role credentials remain server-only.

## Schema changes

All DDL must be captured as a timestamped SQL migration under `supabase/migrations/` and applied in the same order in every environment. Do not make ad-hoc production schema changes without adding the corresponding migration to source control.
