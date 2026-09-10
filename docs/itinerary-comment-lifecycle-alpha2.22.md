# V4.4.0-alpha2.22 Itinerary comment lifecycle verification

This slice extends the Supabase-primary Itinerary write cutover with comment freshness and deletion.

## Automated gates

- Supabase Itinerary read cutover contract
- Supabase Itinerary write cutover contract
- dual-source signup concurrency contract
- Itinerary comment freshness/removal contract
- Authorization contract
- Travel cutover contract
- Packing cutover contract

## Manual preview gate

1. Open Itinerary on a fresh preview load with an existing Itinerary comment. The comment must be visible without opening the comment composer.
2. Add a new Itinerary comment. It must appear immediately and remain after refresh.
3. Remove a comment owned by the signed-in traveler. The Remove action must be visible, the comment must disappear after confirmation, and the success diagnostic should report `Supabase Itinerary comment removal passed — Sheets backup matches.`
4. Refresh Itinerary and confirm the removed comment does not return.
5. If testing with an organizer membership, remove another traveler's Itinerary comment. Apps Script organizer authorization may be requested for the Sheets rollback backup; the Supabase primary delete remains authorized by RLS.
6. Open Meals and confirm Meal comments remain present and unchanged.
7. Perform a quick signup update/leave smoke check to confirm the late comment lifecycle bridge did not regress the previously verified social-write routing.

Do not merge PR #62 until this manual preview gate passes and explicit merge authorization is given.
