# Payments/Budget write migration — Budget shadow stage

Production entering this PR: #69, Apps Script @226, verified Supabase reads with fresh Sheet fallback.

Budget participates in server-side rental pricing, so Budget cannot independently become write authority while those calculations still consume Sheets. This PR implements the first write stage: mirror the current saved Budget snapshot into Supabase. Payment records, booking plans, shares, installments and confirmations still save through their existing Sheet paths. This is not the final primary-write cutover.

## Behavior

- `budgetShadowWrite.enabled` defaults to false in the proposed production config. The isolated preview enables it and displays a separate Budget badge.
- Every 15 seconds while Payments, Money or Budget is open, an authenticated organizer can synchronize persisted Budget data. The client reads the dedicated Budget-only fresh Apps Script endpoint; it never sends optimistic UI rows or intercepts/retries a Sheet save.
- The SQL transaction checks active organizer membership and the fixed accepted trip. It serializes changes to the small Budget/relationship/state tables, compares the destination snapshot captured before the write, rejects older source times, validates all rows, then inserts/updates/archives and verifies the complete result atomically.
- Amounts use integer cents. Text values such as Everyone remain text; names are never guessed into traveler UUIDs. Existing typed Budget relationships block synchronization for manual reconciliation.
- Missing rows are archived; unchanged rows keep their versions. Retry after a lost response reads the destination again, so it does not duplicate an expense.
- A successful mirror does not replace UI state. Existing verified reads still compare the entire financial snapshot with fresh Sheets before displaying it as primary. A source edit during synchronization can temporarily make the shadow stale; the next poll repairs it, and #69's freshness check prevents stale data from becoming primary.
- Source timestamps order mirror snapshots; they are not cryptographic proof of source origin. Only an authenticated organizer, already allowed to edit Budget by existing RLS, can call the RPC. Traveler/device/name/Planning As values grant no authority.
- If no organizer is signed in to an open relevant view, mirroring pauses. It resumes from current persisted Sheets on the next eligible poll. Shared traveler Sheet saves keep their existing behavior.
- `source_record` retains initial seed provenance; new mirrors use explicit typed columns. No raw payloads, credentials or private traveler records are introduced.

## Validation

`node tests/budget_shadow_write.test.js` exercises the actual host and iframe code: exact cents, source-only snapshots, authenticated membership/trip binding, disabled/traveler gates, unknown fields, malformed data, readback mismatch, stale-destination errors, frame ownership, overlapping requests and unchanged UI state.

`tests/sql/budget_shadow_write.sql` is run only inside BEGIN / ROLLBACK against the deployed migration. It tests actual authenticated-role insert/update/archive behavior, preserved versions on retries, stale source times, source-time reuse, compare-and-swap rejection, invalid amounts and no partial writes, nonmember/normal traveler rejection, member read access and denied anonymous execution. It temporarily demotes the organizer only within the rolled-back test transaction. Do not run it without the outer rollback transaction.

Migration history is aligned to `20260916092322_budget_shadow_write_transaction`. Tests left zero fixture records, one original active Budget row and zero synchronization markers. Post-change advisors reported no findings for the new objects. Existing unrelated notices concern the packing SECURITY DEFINER RPC, leaked-password protection, recommendation-feedback indexes and unused indexes; no unrelated changes were made. References: [function security](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## Preview acceptance

Extract the exact preview ZIP with Extract All, stop the prior local server, then run start-preview.cmd. Sign in with the organizer account and open Budget. Allow one polling cycle. Expect a separate `Budget · SHADOW WRITE · MATCH · 1 record` badge for the current one-row source. Existing Payments/Budget verified-read badge should continue to reach 51 records if the saved source is unchanged. Check Budget totals, Money, Payments, and navigation/refresh.

Do not create dummy expenses or payments in the shared trip: Sheet saves are live. Create/edit/delete behavior was tested transactionally and rolled back. If a legitimate Budget edit is made, the shadow should match the saved source on the next polling cycle. Report unavailable/mismatch badges.

## Subsequent stages

1. Accept this Budget shadow-write preview; explicitly enable production mirroring in the promotion change.
2. Add financial write synchronization for payment records, confirmation lifecycle, installments, plans and shares, preserving each server authorization boundary and calculation contract.
3. Move server pricing consumers and shared Budget write permissions to the new authority, then promote primary writes. Never fall back to old Sheet writes after an ambiguous primary commit.

Preview freshness fix: Budget source reads now yield to financial reads and expose a shared busy flag while reading. The financial reader yields to that flag. The read badge distinguishes Sheet verification, Supabase verification, and Sheet fallback; failures remain visible during a 30-second backoff. Budget source failures are reported on its own badge. No freshness validation or save authorization was removed.
