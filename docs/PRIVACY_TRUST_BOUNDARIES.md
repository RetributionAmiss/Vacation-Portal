# Privacy and Trust Boundaries

PR #34 introduces explicit data-transfer contracts before the Supabase migration.

## Traveler data classes

| Class | Examples | Default browser visibility |
| --- | --- | --- |
| Shared trip profile | Traveler ID, name, group, traveler type, parent/guardian relationship, room-sharing preference, active status | Shared with trip participants |
| Traveler-private | Email, home location, personal notes | Removed from shared payloads; loaded only for the traveler profile bound to the current device or through organizer authorization |
| Organizer-only | Price cap, cost percentage, Pay More preference and other administrative controls | Organizer-authorized endpoints only |

The browser must not receive a complete `Travelers` sheet row merely because a screen needs a display name.

## Read-path contract

The API shape is now:

- shared endpoints return `serializeSharedTraveler_` records;
- traveler-private endpoints return one `serializeTravelerPrivateProfile_` record after the current device/traveler binding is checked;
- organizer endpoints return `serializeOrganizerTraveler_` records only after organizer authorization succeeds;
- shared rental/import payloads use explicit allowlists and omit raw provider payloads, confidence JSON, importer URLs, retry counts, and raw queue errors;
- shared rental pricing is calculated from the full organizer policy on the server and returns derived allocations rather than the underlying Price Cap / Cost % / Pay More fields.

The performance startup cache is also shared-only. Viewer-specific/private traveler data is never written to that cross-device cache.

## Pricing accuracy boundary

Organizer pricing rules are intentionally absent from normal traveler rows, so the browser must not try to recreate them from missing values.

For each rental the server produces exact derived splits for both supported pricing totals:

1. rental + included shared budget extras;
2. rental-only when the traveler turns shared extras off.

These are calculated with the same weighting, cap, redistribution, empty-bedroom, and unassigned-adult behavior as the established Rental board calculation. Unsupported arbitrary totals are shown as pending instead of being approximated by linearly scaling a capped result.

## Device identity limitation

Device ID binding is **convenience identity, not strong traveler authentication**. It is useful for preventing accidental cross-traveler display in normal portal use, but a determined caller who can manipulate device-binding requests can impersonate another normal traveler under the current Apps Script architecture.

Therefore PR #34 does **not** claim that Email, Home Location, or Notes are cryptographically protected from malicious trip participants. What it does accomplish now is:

- those fields are no longer distributed automatically to every browser in shared startup/deferred payloads;
- temporary `Planning As` changes do not automatically expose another traveler's private profile;
- organizer-only pricing/admin fields remain behind the strong organizer session boundary;
- the API is shaped so future Supabase authentication + Row Level Security can enforce the same classes with strong traveler identity.

Strong normal-traveler confidentiality requires a future authenticated traveler identity layer (for example Supabase Auth + RLS), not merely a stronger-looking Device ID check.

## Trust rules

1. UI hiding is not authorization.
2. Device binding identifies a traveler for convenience/self-service but is not strong authentication and never grants organizer privilege.
3. Organizer-only values must not be embedded in anonymous/shared startup payloads.
4. Secrets remain in Script Properties and must never be serialized to the browser.
5. DTO allowlists are preferred over blocklists so newly added sheet columns are private by default.
6. Server-derived pricing may expose final trip allocations needed by the family, but not the raw organizer policy fields used to calculate them.
7. Supabase Row Level Security should inherit these same shared/private/organizer classes when strong traveler authentication is introduced.
