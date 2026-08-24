# V4.4.0-alpha1 authorization architecture

## Why a server-issued organizer session

The portal is an Apps Script web app embedded by a GitHub Pages PWA shell. In this deployment shape, Google account identity is not guaranteed to be available to the web app in a form suitable for authorization. The previous implementation treated a caller-supplied Traveler ID whose row name started with `Justin` as organizer identity. That is not authentication.

V4.4.0-alpha1 introduces a private organizer access key and server-issued session token.

1. The organizer access key is configured once by running `setOrganizerAccessKey` from the Apps Script editor while signed in as the spreadsheet owner/editor.
2. Apps Script generates a random salt and stores only a SHA-256 salted hash in Script Properties. The plaintext access key is never stored.
3. The portal submits the access key only when unlocking organizer tools.
4. Apps Script verifies it and creates a cryptographically random 12-hour session token.
5. Only a SHA-256 hash of that session token is stored server-side.
6. The client stores the issued bearer token locally on that organizer device and supplies it to protected calls.
7. `assertOrganizer_()` validates the server-side session and optional device binding on every privileged request.
8. `revokeOrganizerSessions` invalidates all active organizer sessions.

Traveler name, Traveler ID, `Planning As`, hidden controls, and Device ID do not grant organizer authorization.

## Protected web operations in alpha1

- Trip Settings save
- finalist selection
- start/close/reopen Final voting
- restart Preliminary voting
- selective reset to Gathering
- rental removal
- OneSignal setup-status endpoint
- sending portal push notifications
- portal diagnostics
- organizer voting summary (new `getOrganizerVotingSummary` endpoint)
- creating/deleting travelers
- administrative traveler fields

Spreadsheet-menu maintenance functions remain owner/editor workflows. Web diagnostics use the separately authorized `runPortalDiagnostics` endpoint.

## Traveler self-service

An existing traveler profile can be saved without organizer authorization only when the server-backed Device ID is currently bound to that same Traveler ID. Self-service fields are limited to ordinary profile information. Administrative fields such as traveler type, parent/guardian, Price Cap, Cost %, Pay More, Active, creation, and deletion require an organizer session.

The existing temporary `Planning As` workflow does not change the permanent device binding, so temporarily planning as another traveler does not satisfy the self-service device check.

## Deployment

1. Deploy the Apps Script branch to a test deployment first.
2. From the Apps Script editor, run `setOrganizerAccessKey` once and authorize the script if prompted.
3. Use a strong private passphrase of at least 12 characters.
4. Open the portal while Planning As Justin and invoke a protected action. The portal will ask for the organizer access key once and retain the resulting 12-hour session on that device.
5. To invalidate all organizer devices, run `revokeOrganizerSessions` from Apps Script.

Do not put the organizer access key into source code, Trip Settings, the spreadsheet, GitHub Pages, or the PWA configuration.

## Known alpha1 follow-up

The legacy `getJustinVotingSummary(requestingTravelerId)` function remains in `App.gs` for source compatibility with the V4.3.30 baseline, while the alpha1 client uses the protected `getOrganizerVotingSummary` endpoint. It must be removed or made private before V4.4.0 final; it is tracked as a blocking review item because Apps Script exposes non-private server functions to `google.script.run`.
