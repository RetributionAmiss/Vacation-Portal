# Payment record synchronization

Baseline: PR #70, production Apps Script @229. Budget shadow synchronization is enabled. Financial reads require a current Sheet fingerprint match.

## Scope and authority

This stage mirrors the finalized rental's saved **Payments** rows: create, edit, amount/date/notes, payer and recipient links, installment links, confirmation status/source/actor/time, and deletion. Sheets remains the write authority. Existing saveBookingPayment, deleteBookingPayment and confirmation authorization/UI paths are untouched. Booking plans, shares and payment schedules are not synchronized by this stage; an unseeded/new installment makes payment mirroring fail with PAYMENT_INSTALLMENT_MISSING until its dependency is synchronized. No guessed relationships or partial payment copies are allowed.

The production paymentShadowWrite flag is off until preview acceptance. Budget synchronization remains enabled. An authenticated organizer with Money or Payments open can synchronize every ~15 seconds. Traveler Sheet saves are copied when an eligible organizer next opens that view. With no organizer online, synchronization pauses; the current verified read falls back to fresh Sheets on mismatches.

## Guarantees and limits

- The host validates current auth membership and the configured trip. The database independently requires active organizer membership. Names, device identity and Planning As confer no authority. RPC functions use SECURITY INVOKER with explicit grants and existing RLS.
- The source endpoint reads only persisted payment records for the finalized rental under the existing mutation lock. Browser drafts never become mirror input. It is a shared read endpoint, like existing payment reads, not a new write endpoint.
- Budget, payment and primary financial source reads share a busy flag. A yielded shadow reader retries after a short pause instead of repeatedly losing its slot. Terminal errors back off and remain visible.
- The SQL transaction locks the small payment/state tables and protects referenced rentals/travelers/installments from concurrent changes. It compares the complete destination snapshot before changing it, rejects older source timestamps and reused timestamps with different payloads, validates integer cents and links within the trip/rental, then verifies the result. Failures roll back the whole transaction.
- Source timestamps order replicas; they are not cryptographic proof of Sheet origin. Only an organizer who already has financial mutation rights can execute this RPC directly.
- Missing source rows are archived, preserving history. Unchanged rows do not bump their version; retries read back state and do not create duplicates.
- source_created_at and source_updated_at preserve Sheet concurrency tokens. Supabase's updated_at/version trigger remains active. The verified read bridge prefers source timestamps for mirrored payments and falls back to the original timestamps for untouched seed rows. The migration adds nullable columns without rewriting existing payments.
- Database atomicity does not make Sheets and Supabase one transaction. Source edits during sync may briefly leave the mirror stale; subsequent polling repairs it, while the full fresh fingerprint prevents stale primary reads.
- Initial source_record provenance is not used as an authority or updated by the mirror. Explicit typed columns contain the current mirrored fields.

## Verification

Run node tests/payment_shadow_write.test.js, node tests/budget_shadow_write.test.js and node tests/payments_budget_primary_read.test.js. These exercise actual host/iframe code, exact cents/source timestamps, membership and trip binding, stale destination/readback errors, frame ownership, disabled/non-organizer gates, persisted-only payloads, save/reader coordination and no optimistic-state overwrite. Existing payment, confirmation, pricing and authorization contracts remain applicable.

Execute tests/sql/payment_shadow_write.sql only inside BEGIN / ROLLBACK. It creates/edits/confirms/archives a fixture, checks source timestamp preservation despite the database update trigger, retries/version stability, stale-source/destination rejection, and a multirow failure after an earlier insert to prove full rollback. It checks organizer/member/nonmember/anonymous access and temporarily demotes a member only inside the rolled-back test transaction. No dummy payment survives. Migration installed as 20260917121714_payment_shadow_write_transaction; verification found the original one active payment and zero fixtures/state rows before preview use.

Security advisors found no issues for the new objects. The new rental FK index was reported unused because the table was newly created; it is retained to support FK checks ([linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)). Existing unrelated packing SECURITY DEFINER, password-protection and recommendation index notices are unchanged.

## Preview acceptance

Extract All from the exact preview ZIP. Stop the old server, run start-preview.cmd, sign in as organizer and open Payments or Money. Allow up to a minute for the coordinated checks. Expect Payments · SHADOW WRITE · MATCH · 1 record for the current source, alongside Budget · SHADOW WRITE · MATCH · 1 record and Payments/Budget · SUPABASE READ · VERIFIED · 51 records if saved source data is unchanged.

Check balances, due dates, confirmation display, navigation and refresh. Do not add dummy payments: Sheet saves are live. Mutation cases were verified in rollback-only tests. A legitimate saved payment change should synchronize on the next eligible poll. Send all badge states if a check fails.

Production promotion after acceptance enables the payment flag. The next synchronization slice covers installment/booking-plan/share dependencies before any primary-write authority switch.
