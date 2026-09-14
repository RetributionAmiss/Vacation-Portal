# Payments/Budget migration: authenticated shadow

PR #68 follows merged #67. Sheets remains the visible financial read/write authority. No primary financial cutover is included.

## Verified 2026-09-14

Production baseline: 88dc954421649e815b5219e22cee2195dab12b72, Apps Script @220.

| Domain | Sheet records | Supabase shadow records |
|---|---:|---:|
| Booking Plans | 1 | 1 |
| Payment Shares | 16 | 16 |
| Payment Schedule | 32 | 32 |
| Payments | 1 | 1 |
| Budget | 1 | 1 |

One booking-traveler relationship was copied. No Budget traveler relationships were guessed. These are point-in-time counts; the seed is not continuous replication. Sheets was read twice and unchanged before copying. Cross-system reads are not an atomic snapshot.

The additive migration already recorded by the database as `20260914154350_payments_budget_shadow_source_fidelity` is tracked with that exact version. It preserves plan split basis, raw fractional calculated shares, payment confirmation fields and legacy Budget text. Each money table has a `source_record` containing only allowlisted Sheet columns. No source financial exports or credentials are committed.

## Seed and fidelity

`scripts/payments_budget_shadow_seed.cjs` generates SQL offline from a private JSON snapshot. It never connects to either service. Input uses original Sheet-header row objects in mandatory `plans`, `shares`, `schedule`, `payments` and `budget` arrays, plus `tripLegacyId`, `rentalIds`, `travelerIds` and an explicit IANA `timeZone`.

The generator runs the strict preflight, resolves parents by trip-scoped legacy IDs, locks destination tables, rejects inventory changes and conflicting/extra destination records, inserts only absent records, and compares the typed fields before committing. It never updates existing financial rows, overwrites Sheets, or invents an authenticated creator. A rerun with a different source requires reconciliation; this script deliberately refuses to overwrite drift.

Fourteen calculated shares contain fractional cents. Only their calculated-cent representation uses the existing `DataIntegrity.gs` adaptive-epsilon rounding. The original numeric value and source record remain preserved. Adjusted shares and installment allocations are copied exactly, without rebalancing. Budget `Everyone` is retained as text; arbitrary payer/split names fail until a reviewed mapping exists.

Sheet date serials use local calendar dates; timestamp serials use the explicit Sheet timezone, rounded to milliseconds to remove floating-point serial noise. Timestamp text requires an explicit offset. The raw source is retained. Budget has no source creation/update timestamps, so database defaults describe import time; its legacy Date field is preserved separately.

Execution evidence:

- Database dry run completed and rolled back before the real copy.
- All 51 typed records and source snapshots passed transactional comparison.
- A complete second seed left all seven table digests unchanged, including IDs, timestamps and versions.
- Host DTO plus iframe comparator, executed against a fresh destination read and serialized Sheet snapshot, returned MATCH: 1/16/32/1/1 records, zero differences.
- Browser comparison covers IDs, relationships, money, split basis, payment/due dates, confirmation state and Budget text. Import timestamps/source snapshots are verified by the seed, not included in the browser DTO.

Keep private snapshots and generated SQL outside Git and CI artifacts. Example:

```sh
node scripts/payments_budget_shadow_seed.cjs < /private/money-snapshot.json > /private/shadow-seed.sql
```

Source validation always reports `readyForCutover:false`.

## Authenticated diagnostic path

`supabase-payments-budget-shadow-bridge.js` uses the existing authenticated client, verifies the user, resolves one active membership, and scopes all domain reads to that trip. It explicitly selects columns and excludes `source_record`. Missing relationships, unsafe cents, pagination limits and multiple memberships fail closed. Only the diagnostic read operation is accepted; read/write promotion flags disable this shadow-only adapter.

`Client_Supabase_Payments_Budget_Shadow.html` reads lexical `DATA` and `paymentState_` without changing either financial source. Cached payment snapshots wait for a server load. Missing/extra/duplicate records cannot become MATCH. Responses for changed source snapshots are discarded. Errors retry, and unchanged source data is rechecked every 30 seconds. `DATA.supabasePaymentsBudgetShadow` holds diagnostics only. The isolated preview badge exposes status/counts without amounts.

## Authorization verification

RLS remains enabled on all seven financial tables; existing policies were not changed. SQL role tests verified:

- Organizer membership reads all 51 records.
- An authenticated nonmember reads zero financial records.
- Anonymous access is denied by grants.
- A traveler role reads all 51 records but direct updates to all five financial tables affect zero rows. The membership role change used for this test was transaction-local and rolled back; the original organizer role was verified afterward.

These are database-role tests, not end-to-end login or future financial write-API tests. Existing project advisories unrelated to this change remain: [packing SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No financial RLS warning was returned.

## Manual acceptance and later slices

1. In the isolated preview, sign in, open Payments and Budget, and wait for Payments/Budget Shadow MATCH with 51 records.
2. Compare saved shares, installment amounts/due dates, agency payments, reimbursements and shared-budget totals with production. Refresh and navigate away/back; the comparison must recover.
3. Do not create real financial test transactions. This is a read-only migration comparison; the existing UI still writes to Sheets. Source edits after seeding can correctly produce MISMATCH.
4. Accept the shadow slice before a separate primary-read PR. Financial writes follow afterward with request idempotency, optimistic concurrency, immutable payer ownership and recipient/organizer confirmation tests.
5. Production promotion requires explicit approval after manual acceptance. PR #68 remains a draft until that gate passes.
