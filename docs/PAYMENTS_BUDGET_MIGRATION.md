# Payments/Budget migration: source preflight

Status: preparation only, following merged PR #67. No primary reads/writes or deployment in this PR.

## Verified baseline (2026-09-14)

Repository base: 88dc954421649e815b5219e22cee2195dab12b72, production @220.

Read-only inspection of the current portal Sheet found:
| Domain | Sheet records | Supabase records |
|---|---:|---:|
| Booking Plans | 1 | 0 |
| Payment Shares | 16 | 0 |
| Payment Schedule | 32 | 0 |
| Payments | 1 | 0 |
| Budget | 1 | 0 |

These are point-in-time counts, not a durable import snapshot. No source records, personal details, payment amounts, credentials, or financial exports are committed here. All five Supabase tables have RLS enabled. This is not proof of authenticated policy behavior; member/organizer tests remain required.

The finalized rental parent was established by #67. No financial child data has been seeded.

## Source fidelity findings

| Source field | Existing database representation | Required before seed |
|---|---|---|
| Booking Plans / Split Basis | No column | Preserve explicit Adult/Bedroom and established blank-as-Adult semantics |
| Payment confirmation status/source/actor/time | No columns | Preserve the four confirmation fields supported by Payments_Confirmation.gs; current payment Sheet has not yet added them |
| Budget / Paid By | Traveler UUID only | Preserve original free text and resolve identities without guessing |
| Budget / Split Between | Traveler join table only | Preserve source string, delimiters, and intent before creating relationships |
| Budget / Split Method and Date | No matching columns | Preserve these legacy columns found in the live Sheet, even though absent from Config.gs |
| Payment Shares / Calculated Share | Integer cents | Preserve fractional source values alongside the reviewed cents conversion |

Fourteen calculated shares have sub-cent precision. The strict source audit correctly rejects those fields. An explicit, non-mutating normalization proposal uses the exact adaptive-epsilon rounding in DataIntegrity.gs. It produces preservation evidence with the original value and proposed integer cents. It never recalculates Adjusted Share, changes another traveler's allocation, or modifies Sheets.

After this proposal was applied **in memory**, all 51 records passed the scoped checks. The raw live Sheet still contains its original values. This is not a seeded or cut-over state.

## Tool contract

`scripts/payments_budget_preflight.cjs` exports:
- `audit(snapshot)`: stable/duplicate IDs, rental/traveler relationships, payment-to-schedule rental consistency, recipient types, and exact monetary precision/range checks.
- `planCalculatedShareNormalization(snapshot)`: explicit dry-run proposal for the known fractional calculated-share field only. Preserve its `preservation` evidence before any later seed.
- `moneyToCents(value)`: strict decimal parsing to BigInt cents; rejects blanks, negatives, currency-formatted values, nonfinite values, sub-cent amounts and bigint overflow.

Audit output always includes `readyForCutover:false`. Partial totals have `totalsComplete:false` for invalid fields. Valid source checks are not authorization or source/destination parity.

Input envelope:
```json
{
  "tripLegacyId": "TRIP-EXAMPLE",
  "rentalIds": ["CABIN-EXAMPLE"],
  "travelerIds": ["TRAV-EXAMPLE"],
  "plans": [],
  "shares": [],
  "schedule": [],
  "payments": [],
  "budget": []
}
```

Each domain contains complete row objects keyed by original Sheet headers. All five arrays are mandatory; missing data must not be interpreted as an empty table. The rental/traveler inventories must belong to the same trip. Inventory provenance and completeness must be verified by the future exporter; this utility cannot authenticate a supplied JSON file.

Example local PowerShell usage for an already prepared private snapshot:
```powershell
Get-Content -Raw ".\money-snapshot.json" | node .\scripts\payments_budget_preflight.cjs
```
Exit 0 means these source checks passed; 1 means validation issues; 2 means invalid input. Keep source snapshots and detailed output out of Git and CI artifacts.

## Next implementation gates

1. Add reviewed, additive source-shape support. Preserve Budget legacy fields and raw calculated shares. No destructive schema edits.
2. Capture a fresh Sheet snapshot with trip binding and date/timezone fidelity; resolve Supabase rental/traveler UUIDs. Refuse ambiguous identity matches and orphan links.
3. Idempotently seed parents, booking travelers, shares, schedules, ledger and Budget relationships in dependency order. Produce exact before/after counts and cents reconciliation; do not modify rollback Sheets.
4. Add authenticated, trip-scoped shadow reads and comparisons. Empty destination data must report missing records, not MATCH. Never replace visible paymentData or DATA.budget.
5. Isolated manual preview: amounts, installments, agency payments, reimbursements, confirmation lifecycle, shared-budget totals and refresh/navigation. Add non-organizer RLS coverage.
6. Promote reads, then writes in separate accepted slices. Preserve optimistic concurrency, request idempotency, immutable payer ownership and recipient/organizer confirmation authorization.
7. Production promotion requires separate explicit authorization.

No schema migration, seed, live shadow reader, or frontend change is included in this preparation PR. Source dates, snapshot atomicity, complete destination schema parity, row-level security behavior, and financial calculation parity remain explicit gates, not claimed passes.
