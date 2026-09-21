# Financial authority cutover: Supabase primary, Google Sheets backup

Baseline: PR #71 merged into `main` at `f1c0c0ec44e92b6f20147b4a9f0fd37b16d85fa9` (2026-09-18). No cutover has occurred in this branch. The production `paymentsBudget` domain remains `read:false/write:false`; a separate verified-read bridge can display Supabase only after a fresh Sheet fingerprint match. Sheets still accepts payment, confirmation, booking-plan, share, installment and Budget saves. Budget and payment mirrors are organizer-operated, eventual shadow copies, not transactional backup queues.

## Current seed and missing dependencies

The live Supabase project was inspected read-only on 2026-09-21. Active rows: one finalized rental, one booking plan, one booking-plan traveler link, 16 shares, 32 installments, one payment and one Budget item. Row counts are **not** freshness/equivalence evidence. The existing payment mirror explicitly rejects payments that reference missing installments; booking-plan/share/installment writes are not mirrored yet. The original Sheet is preserved.

Supabase RLS presently grants mutations to organizers for all five financial tables, including payments, whereas the legacy payment UI supports traveler self-service. A primary-write implementation must explicitly add authenticated, trip-bound, self-only authorization and preserve organizer-only confirmation/administration. Planning As, Device IDs and supplied traveler names/IDs are not sufficient to authenticate an actor. Do not enable primary writes for travelers by granting blanket financial table writes.

## Required order of implementation

1. Capture a **single persisted and mutation-locked** finalized-rental snapshot for booking plans, shares and installments; reject unknown columns, missing tabs, wrong rental and incomplete snapshots. `getFinancialDependencyShadowSource()` provides this bounded read; it does not write or replace visible UI state.
2. Preserve legacy IDs, original calculated share precision and Sheet `Created At`/`Updated At` tokens. Add separate source timestamp columns rather than overriding Supabase's native update/version trigger. Implement an authenticated organizer-only `SECURITY INVOKER` transaction that validates exact integer cents and every trip/rental/traveler/plan/schedule link; compares the destination snapshot before write; rejects stale/reused source times; upserts/archives atomically; rejects deleting an installment still referenced by a payment; reads back and verifies. Never guess missing foreign-key parents or truncate a share calculation.
3. Test actual-role SQL cases inside `BEGIN`/`ROLLBACK`: organizer/member/nonmember/anonymous, insert/edit/archive, duplicate retry without version increase, changed destination, stale source, missing traveler, missing plan, unseeded installment, fractional cent, partial-batch rollback and payment references. Integrate browser host/iframe contract, preserve existing payment/math tests. Do not apply the schema migration to production until these pass.
4. Verify every current financial record against a fresh Sheet manifest and the Supabase candidate, including all five domains (booking plans, shares, installments, payments and Budget). Verify a legitimate edit and refresh on an isolated preview. No public authority flag or production deployment changes before user acceptance.
5. Build **Supabase primary writes** for plan/share/installment/payment/confirmation/Budget with idempotent request IDs, version-checked mutation and authenticated actor binding. Move any server-side rental pricing/Budget consumers to an authoritative read before switching writes; otherwise new Supabase Budget values will be invisible to cost calculations.
6. Only after Supabase confirms a mutation and a fresh readback agrees, enqueue the **Google Sheets backup** with a durable record of the mutation, target row version and stable operation ID. Apps Script must apply backups idempotently, reject stale overwrites and never write back to Supabase from that backup. Surface `backup pending`/`backup mismatch`/`backup unavailable` without undoing a successful Supabase write. Browser-only polling/localStorage is not a durable backup queue.
7. Promote read authority to Supabase without a Sheets-first manifest. Use Sheets for outage recovery only when its last synchronized version is proven current; never label an older backup as primary or replay a timed-out Supabase write in Sheets. A timed-out primary commit requires an idempotency/readback check, not a second uncontrolled mutation.
8. Disable legacy Sheet-first mutation entry points (including direct Apps Script calls) at cutover so that there is exactly one write authority. Preserve a separately reviewed rollback plan, then require authenticated manual acceptance and explicit production promotion approval.

## Scope for this branch

This branch starts stage 1: a fixed, read-only persisted source endpoint and regression test. **It does not implement or enable primary writes or Sheets backup writes.** The existing financial flags, RLS, seed data, payment math, pricing and production deployment must remain unchanged until subsequent code and tests satisfy the gates above.

## Acceptance gate for the eventual cutover

- Full 51-row-equivalent baseline, including stable IDs, joins, amounts, fractional calculated shares, dates, confirmation metadata and version tokens; no missing or duplicate IDs.
- All current traveler self-service and organizer controls enforced by database authorization, with denied cross-traveler attempts and no browser tokens sent to Apps Script.
- Supabase create/edit/delete/confirm is atomic and idempotent, with stale-version and unknown-result recovery tests.
- Durable, independently retryable Sheets backup with exact readback and mismatch reporting. Test Sheets outage, Supabase outage, offline reconnection, duplicate delivery, stale backup and no dual authority.
- Payment totals, split math, room/pricing calculations and mobile flows remain unchanged, verified in isolated preview and by the user before a production PR is merged.
