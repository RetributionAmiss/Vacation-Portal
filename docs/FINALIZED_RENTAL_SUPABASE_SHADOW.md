# Finalized rental Supabase shadow — alpha2.28

## Why this slice exists

The documented migration sequence reaches Payments next, but the normalized Supabase payment tables require a valid `rental_id` foreign key. The live payment ledger is tied to the trip's finalized `CABIN-*` record, while the live Supabase `rentals` table had no rows at the start of this slice.

Alpha2.28 therefore establishes only the finalized rental parent needed by later Payments work. It does **not** promote Rentals, Voting, Rooms, Payments, or Budget to Supabase authority.

## Authority

- Google Sheets remains authoritative for the visible Rentals UI.
- `supabaseDomains.rentals.shadowRead` is enabled.
- `supabaseDomains.rentals.read` and `.write` remain disabled.
- The Apps Script iframe compares the selected finalized Sheet cabin with an authenticated Supabase read in the background.
- The shadow result is stored only in `DATA.supabaseFinalizedRentalShadow` for diagnostics.
- The shadow comparator never replaces or mutates `DATA.cabins`.

## Trust boundary

The top-level bridge requires a signed-in Supabase session and an active `trip_members` row. The requested stable `CABIN-*` legacy ID is additionally constrained by the authenticated member's `trip_id`. Planning As, traveler names, device IDs, and Sheet role fields do not grant database access.

## Source-shape correction

The Sheets `Cabins` source stores `Fees and Taxes` as descriptive text. The initial normalized schema incorrectly provided only `fees_and_taxes_cents`. Alpha2.28 adds a non-destructive `fees_and_taxes text` column and leaves the old cents column in place until a future audited migration determines whether it has any legitimate numeric source.

## Seed scope

Only the current finalized rental parent is eligible for the initial live shadow seed. Photos, amenities, bedrooms, votes, favorites, comments, room assignments, raw import payloads, AI research fields, and payment data are outside this slice.

Production vacation records are not committed to the repository. The seed is a controlled live data operation after contracts pass.

## Acceptance gate

Before this PR can merge:

1. The finalized Sheet cabin must remain the visible rental authority.
2. Authenticated shadow diagnostics must report `match` for the selected finalized `CABIN-*` record.
3. Refreshing or navigating Rentals/Payments/Rooms must not cause Supabase shadow data to replace Sheet cabin state.
4. Existing payment calculations and payment loading behavior must remain unchanged.
5. Travel, Packing, Itinerary, planner comments, Meals, and Grocery regression contracts must remain green.
6. Any mismatch must remain diagnostic-only and block later Payments seeding/cutover work; it must not silently overwrite the Sheet state.
7. Production promotion still requires separate explicit authorization after isolated preview acceptance.
