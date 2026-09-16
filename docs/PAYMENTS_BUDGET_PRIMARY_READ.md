# Payments/Budget verified primary reads

Baseline: merged #68, commit `e1c9cef56b1a1ef824b021d83428bc7bf54a3f81`, production Apps Script @222. Justin accepted the 51-record shadow preview before this slice.

## Why this needs a freshness gate

Financial writes still go to Sheets. The Supabase seed is a point-in-time copy, not a replication service. Reading it unconditionally would hide later payments, confirmations or Budget edits. This transitional read path uses Supabase only when its complete financial snapshot matches a freshly computed Sheet fingerprint. Otherwise it obtains an uncached Sheet snapshot. It does not copy new Sheet changes into Supabase or migrate writes.

## Read sequence

1. Fixed Apps Script endpoint `getPaymentsBudgetReadManifest()` reads the finalized rental's four payment domains and trip Budget, bypassing the existing 45-second payment cache. It returns SHA-256, source time, finalized rental ID and ordered stable IDs. Unsupported source columns fail verification rather than being silently omitted. It returns no financial amounts or raw records.
2. The host verifies the current Supabase user, exactly one active membership and the configured trip legacy ID. Its explicit column lists omit raw source snapshots. Relationships, integer cents and record completeness must resolve. It scopes payment records to the finalized rental and Budget to the trip.
3. The server and host execute the same canonical contract (`PaymentsBudgetContract.gs` / `payments-budget-contract.js`, byte equivalence tested). The fingerprint includes money, confirmation fields, dates, original calculated shares and Sheet creation/update timestamps. DTOs retain those timestamps as existing Sheet-save concurrency tokens. Stable IDs preserve source row order.
4. Only a fingerprint match produces `supabase-primary-verified`. The iframe rejects responses if its source data, trip, payment epoch or pending-save state changed while waiting. It applies through the existing payment handler and updates Budget together.
5. Mismatch, auth failure or unavailable Supabase uses `getPaymentsBudgetFreshData()` for uncached Sheet data. If verification and fallback both fail, existing visible data stays intact and the diagnostic reports unavailable. Cached browser snapshots do not establish freshness.

The diagnostic is `DATA.paymentsBudgetRead`. Source updates invalidate it. Financial views refresh at most every 15 seconds while idle; unchanged data does not force a rerender. Other views are not rerendered by the new financial read. Set `paymentsBudgetRead.read` to false to restore the existing loader.

This is a verified primary-read transition, not a Sheets-independent performance cutover. A fresh Sheet read remains necessary until writes and synchronization migrate. The two systems do not provide a shared transaction: the fingerprint verifies a source snapshot, not future changes. Subsequent refreshes detect divergence. The existing mutation lock serializes participating portal writes; direct spreadsheet edits and existing endpoints outside that lock are not claimed to become transactional.

## Validation

- Shared canonical contract, precision, timestamps, duplicate IDs, date validation and manifest equivalence.
- Authenticated membership/trip binding, missing relationships and stale seed rejection.
- Runtime primary success, fresh fallback, preserved save timestamps, state changes during requests, active saves, disabled mode and dual read failure.
- Fresh private source and destination reads: all 51 records passed the actual host fingerprint path (1 plan, 16 shares, 32 installments, 1 payment, 1 Budget record). No financial values or exports committed.
- Existing payment, authorization, finalized-rental and load contracts remain covered.

## Preview acceptance

Use the isolated preview download and `start-preview.cmd`. Sign in and open Payments, Money and Budget. Expect **Payments/Budget · SUPABASE READ · VERIFIED · 51 records** when the seed still matches. Compare values and dates, reload, navigate away/back, and confirm existing dialogs open normally. A later Sheet change legitimately produces **SHEETS FALLBACK · latest Sheet values**.

Do not create real test payments: the UI still writes to the live Sheet. Stale-copy and save-race cases are covered with synthetic tests. This PR does not change financial write permissions, calculations, database schema, or the production deployment before acceptance. Promotion requires the next manual acceptance.
