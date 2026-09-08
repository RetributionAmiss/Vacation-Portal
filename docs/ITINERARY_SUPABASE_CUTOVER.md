# Itinerary Supabase guarded cutover

Release `V4.4.0-alpha2.16` starts the Itinerary migration with a read-only shadow comparison.

## Scope

The comparison treats the Itinerary experience as one bundle:

- Itinerary activities (`itinerary_items`)
- Traveler activity signups (`itinerary_signups`)
- Itinerary planner comments (`planner_comments` where `planner_type = 'Itinerary'`)

Sheets remains authoritative for both reads and writes in this stage. The installed PWA reads the same bundle from Supabase under the signed-in user's RLS session, maps UUID foreign keys back to the legacy IDs used by the Apps Script UI, and compares normalized legacy-shaped data.

## Live gate

A successful installed-app test shows:

`Supabase Itinerary check passed — data matches Sheets.`

A mismatch or unavailable Supabase read leaves Sheets in control and emits an explicit diagnostic. No Itinerary mutations are sent to Supabase in this release.

## Promotion sequence

1. Shadow read equivalence
2. Shadow write equivalence for activity, signup, comment, and delete paths
3. Supabase primary reads with Sheets fallback
4. Supabase primary writes with Sheets backup

Travel and Packing remain fully Supabase-primary throughout this slice.
