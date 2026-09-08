# Supabase migration runbook

## Current phase: Planner + Packing + Travel controlled runtime cutover

Google Sheets remains the visible read/write source in this release slice. The first browser runtime step is an authenticated Travel Plans shadow read through the top-level PWA Supabase session. The Apps Script iframe never receives Supabase session tokens. The normal Apps Script/Sheets Travel Plans load still runs, while the signed-in PWA reads the same domain from Supabase in parallel and records whether the normalized records match.

### Production shadow snapshot

The connected production Supabase project has been reconciled against the current Google Sheet with these row counts:

| Domain | Google Sheet | Supabase shadow |
| --- | ---: | ---: |
| Travelers | 18 | 18 |
| Meals | 7 | 7 |
| Grocery items | 10 | 10 |
| Itinerary items | 10 | 10 |
| Itinerary signups | 3 | 3 |
| Planner comments | 0 | 0 |
| Packing items | 3 | 3 |
| Travel plans | 1 | 1 |

These counts are validation checkpoints, not seed fixtures. Personally identifying traveler data and live vacation records must not be committed to this repository.

## Source-shape corrections discovered during shadow copy

The live Sheets data exposed three important schema facts that are now reflected in PostgreSQL:

1. Itinerary ideas can exist before a date is chosen, so `itinerary_items.event_date` is nullable.
2. Itinerary `Cost Per` is a semantic label such as `Person` or `Group`, not a monetary value. It is stored as `cost_per text`; the actual amount remains `cost_cents bigint`.
3. Grocery quantity is intentionally free-form (`2lb`, `5 Cups`, `2-3 Boxes (12 oz)`, etc.), so `grocery_items.quantity` is text rather than an integer.

## Identity bridge

Traveler rows were copied using their existing Sheet `Traveler ID` as `legacy_id`. Supabase uses UUID primary keys internally. Private and organizer-only traveler fields are stored separately in `traveler_private` and `traveler_admin`.

Known traveler emails have pending trip invitations. When a traveler signs in with a verified matching email, the invitation claim RPC can link that Supabase user to the correct traveler row. No organizer role is inferred from Sheet data; organizer elevation occurs only after the signed-in identity is confirmed.

## Cutover gates

Do not make Supabase the application source for a domain until all of these are true:

1. Supabase Auth returns to the GitHub PWA successfully and the test account is linked to the expected traveler.
2. RLS confirms a traveler can read shared trip data, update only their allowed traveler-owned records, and cannot read `traveler_admin`.
3. An organizer account is explicitly confirmed and can perform organizer-only mutations.
4. A shadow comparison shows Sheets and Supabase contain equivalent Planner/Packing/Travel records after normalization.
5. The browser integration has an explicit rollback switch back to Sheets.
6. Writes are tested for duplicate retry/idempotency behavior and optimistic-concurrency conflicts.

The identity/RLS prerequisites and stored Travel Plans snapshot are ready for live browser validation. Travel Plans therefore enters authenticated shadow-read validation first. Supabase is not promoted to the visible read source until the live PWA reports equivalent normalized Travel Plans data. Write cutover still requires gate 6 plus live mutation validation.

## Planned cutover order

Within this release slice, move domains individually rather than all at once:

1. Travel plans
2. Packing items
3. Itinerary + signups + planner comments
4. Meals
5. Grocery list

For each domain: shadow read -> compare -> Supabase read -> dual validation -> Supabase write -> remove Sheets as the interactive source only after live validation.

### Travel Plans current runtime state

- `supabaseDomains.travelPlans.shadowRead = true`
- `supabaseDomains.travelPlans.read = false`
- `supabaseDomains.travelPlans.write = false`
- Sheets remains the visible Travel Plans source and continues to handle save/delete operations.
- Signed-in PWA sessions also read active Travel Plans through RLS-protected Supabase tables in parallel.
- Supabase UUID traveler IDs are mapped back to Sheet-compatible `legacy_id` values before comparison.
- The iframe records `sheets+supabase-shadow-match`, `sheets+supabase-shadow-mismatch`, or `sheets+supabase-shadow-unavailable` for diagnostics.
- A later release can promote the same bridge response to `supabase-primary` by enabling the primary read flag after equivalence is validated.

## Rollback

For the current Travel Plans stage, rollback is a release-level feature flag: set `supabaseDomains.travelPlans.shadowRead` to `false`. Sheets remains untouched as the visible source, so disabling the shadow read changes no user data. No Supabase session token is sent into the iframe.

After a domain is promoted to Supabase primary reads or writes, retain a release-level feature flag that can restore the last validated Sheets path until that domain has completed its live-test period.
