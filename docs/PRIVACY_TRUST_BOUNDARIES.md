# Privacy and Trust Boundaries

PR #34 introduces explicit data-transfer contracts before the Supabase migration.

## Traveler data classes

| Class | Examples | Default browser visibility |
| --- | --- | --- |
| Shared trip profile | Traveler ID, name, group, traveler type, parent/guardian relationship, room-sharing preference, active status | Shared with trip participants |
| Traveler-private | Email, home location, personal notes | Only the traveler represented by the authenticated/bound device; organizer access must be explicit |
| Organizer-only | Price cap, cost percentage, Pay More preference and other administrative controls | Organizer-authorized endpoints only |

The browser must not receive a complete `Travelers` sheet row merely because a screen needs a display name.

## Read-path direction

The target API shape is:

- shared endpoints return `serializeSharedTraveler_` records;
- traveler-private endpoints return one `serializeTravelerPrivateProfile_` record after traveler identity is validated;
- organizer endpoints return `serializeOrganizerTraveler_` records only after organizer authorization succeeds.

During PR #34 the existing endpoints will be migrated incrementally so UI behavior remains stable while the payload surface shrinks.

## Trust rules

1. UI hiding is not authorization.
2. Device binding identifies the traveler for convenience/self-service but does not grant organizer privilege.
3. Organizer-only values must not be embedded in anonymous/shared startup payloads.
4. Secrets remain in Script Properties and must never be serialized to the browser.
5. DTO allowlists are preferred over blocklists so newly added sheet columns are private by default.
6. Supabase Row Level Security will inherit these same shared/private/organizer boundaries.
