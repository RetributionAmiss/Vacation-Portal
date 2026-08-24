# V4.4.0-alpha1 authorization architecture

## Why a server-issued organizer session

The portal is an Apps Script web app embedded by a GitHub Pages PWA shell. In this deployment shape, Google account identity is not guaranteed to be available to the web app in a form suitable for authorization. The previous implementation treated a caller-supplied Traveler ID whose row name started with `Justin` as organizer identity. That is not authentication.

V4.4.0-alpha1 introduces a private organizer access key and server-issued session token.

1. The organizer access key is configured from the spreadsheet-bound Apps Script project by running `setOrganizerAccessKey`.
2. Apps Script generates a random salt and stores only a SHA-256 salted hash in Script Properties. The plaintext access key is never stored.
3. The portal submits the access key only when unlocking organizer tools.
4. Apps Script verifies it and creates a cryptographically random 12-hour session token.
5. Only a SHA-256 hash of that session token is stored server-side.
6. The client stores the issued bearer token locally on that organizer device and supplies it to protected calls.
7. `assertOrganizer_()` validates the server-side session and its optional device binding on every privileged request.
8. `revokeOrganizerSessions` invalidates all active organizer sessions and can only be run from the spreadsheet UI context.

Traveler name, Traveler ID, `Planning As`, hidden controls, and Device ID do not grant organizer authorization.

## Public-method security classification

| Public method | Classification | Authorization / trust boundary |
| --- | --- | --- |
| `doGet` | A — public/read-only entry point | Public web-app bootstrap |
| `getPortalData` | A — traveler-safe read | Public portal data currently visible to all travelers |
| `getPortalStartupData` | A — traveler-safe read | Device ID affects convenience profile only; not organizer auth |
| `getPortalDeferredData` | A — traveler-safe read | Public portal data |
| `getRentalImportUpdates` | A — traveler-safe read | Public import progress |
| `getPortalLiveActivity` | A — traveler-safe read | Public portal activity |
| `submitPortalFeedback` | C — normal traveler mutation | No organizer privilege; submitted traveler metadata is informational |
| `createOrganizerSession` | Authentication bootstrap | Organizer access key verified server-side; issues time-limited token |
| `getOrganizerAuthorizationStatus` | Authentication status | Server validates session token/hash and device binding |
| `saveTripSettings` | D — organizer-only | `assertOrganizerFromValues_` |
| `saveFinalists` | D — organizer-only | `assertOrganizerFromValues_` |
| `startFinalVoting` | D — organizer-only | `assertOrganizerFromValues_` |
| `closeFinalVoting` | D — organizer-only | `assertOrganizerFromValues_` |
| `reopenFinalVoting` | D — organizer-only | `assertOrganizerFromValues_` |
| `restartPreliminaryVoting` | D — organizer-only | `assertOrganizerFromValues_` |
| `resetPlanningPortalToGathering` | D — organizer-only | `assertOrganizerFromValues_` |
| `getOrganizerVotingSummary` | D — organizer-only | `assertOrganizerFromValues_` |
| `removeRentalForOrganizer` | D — organizer-only | `assertOrganizerFromValues_` |
| `queueCabinEdit` | D — organizer-only | `assertOrganizerFromValues_` |
| `getOneSignalStatus` | D — organizer-only | `assertOrganizerFromValues_` |
| `sendPortalPushNotification` | D — organizer-only | `assertOrganizerFromValues_` |
| `runPortalDiagnostics` | D — organizer-only | `assertOrganizerFromValues_` |
| `saveTraveler` | B/D — self-service or organizer | Own permanent device binding for limited fields, otherwise organizer session |
| `deleteTraveler` | D — organizer-only | `assertOrganizerFromValues_` |
| `saveVoteFast` | C — normal traveler mutation | Existing traveler workflow; not organizer authorization |
| `saveVote` | C — legacy traveler mutation | Existing workflow; scheduled for later dead-code cleanup |
| `toggleFavorite` | C — normal traveler mutation | Existing traveler workflow |
| `saveComment` | C — normal traveler mutation | Existing traveler workflow |
| `submitRental` | C — normal traveler mutation | Existing add-rental workflow |
| `saveAssignment` / `removeAssignment` / `saveRoomAssignmentsBatch` | C — shared planning mutation | Existing room-planner workflow; not organizer-only in alpha1 |
| `replaceBedroomLayout` | C — shared planning mutation | Existing room-planner workflow; review in data-integrity phase |
| planner save endpoints | C — shared planning mutation | Narrow planner-specific APIs |
| `deletePlannerItem` | C — shared planning mutation | Server allow-list restricts target sheets/ID columns |
| `saveDeviceTravelerBinding` / `markDeviceTravelerInstalled` / `clearDeviceTravelerBinding` | Device-profile convenience | Device identity only; explicitly not organizer authorization |
| `doPost` | External integration endpoint | Chrome extension shared submission key, independent of organizer session |
| `setupVacationPortal` | E — spreadsheet admin maintenance | `assertSpreadsheetAdminContext_` before mutation |
| `openRentalGathering` / `openPreliminaryVoting` / `openFinalistVoting` | E — spreadsheet admin maintenance | `assertSpreadsheetAdminContext_` before mutation |
| `clearCabinData` | E — spreadsheet admin maintenance | `assertSpreadsheetAdminContext_` before mutation |
| `repairGeminiImports` | E — spreadsheet admin maintenance | `assertSpreadsheetAdminContext_` before mutation |
| `repairRentalProcessing` | E — spreadsheet admin maintenance | `assertSpreadsheetAdminContext_` before mutation |
| `retryFailedRentalEdits` | E — spreadsheet admin maintenance | `assertSpreadsheetAdminContext_` before mutation |
| `retryFailedRentalImports` | E — spreadsheet admin maintenance | Must be reviewed before alpha1 is merge-ready |
| `testGeminiConnection` / `testApifyConnection` / `testOneSignalSetup` | E — spreadsheet admin maintenance | Spreadsheet UI context required before secret-backed diagnostic calls |
| `setGeminiApiKey` / `setApifyApiToken` / `setOneSignalApiKey` / `setExtensionSubmissionKey` | E — spreadsheet admin configuration | Direct spreadsheet UI prompt; secrets stored in Script Properties |
| `startNewVacation` | E — spreadsheet admin maintenance | Spreadsheet confirmation UI is required before mutation |
| `processRentalEnrichmentQueue` | F — legacy worker exposure | **Blocking residual:** public worker still exists; trigger now targets private wrapper but public worker should be made private |
| `refreshCabinPhotos` / `enrichCabinNow` | D — organizer maintenance | **Blocking residual:** still public without organizer assertion in legacy import-engine file |

The old public `getJustinVotingSummary(requestingTravelerId)` endpoint was removed. The client uses only `getOrganizerVotingSummary` for the organizer voting report.

## Generic mutation review

The generic planner deletion functions `deletePlannerRecord` and `deletePlannerRecordFast` were removed from the public Apps Script surface by renaming them with trailing underscores. The public `deletePlannerItem(plannerName, id)` endpoint maps only the allow-listed `Budget`, `Meals`, `Grocery List`, and `Itinerary` planners to fixed sheet/ID pairs.

Core arbitrary-sheet helpers in `Data.gs` (`readSheet_`, `appendObject_`, `updateById_`, `deleteById_`) are private.

`setCabinOriginalUrl` was also made private because no web-client caller requires it.

## Traveler self-service

An existing traveler profile can be saved without organizer authorization only when the server-backed Device ID is currently bound to that same Traveler ID. The self-service path preserves organizer-only fields instead of accepting the submitted values.

Organizer-only traveler fields include:

- Traveler Type
- Parent/Guardian ID
- Price Cap
- Cost %
- Pay More
- Active
- traveler creation
- traveler deletion

A temporary `Planning As` switch does not overwrite the permanent device traveler binding, so temporarily planning as another traveler does not satisfy the normal self-service check in the ordinary UI flow.

### Blocking limitation: device binding is not strong traveler authentication

The device-profile binding was designed as a convenience identity for a family/shared-device application. `saveDeviceTravelerBinding` is intentionally public so a person can select or change the default traveler on a device. A determined caller can therefore create/rebind a Device ID to another Traveler ID and then satisfy the current self-service device check.

This does **not** grant organizer privileges, because organizer authorization requires the independent organizer access key/session. It does mean that the requirement “a normal traveler cannot maliciously edit another traveler” is not cryptographically satisfied by device binding alone.

Closing that gap requires a separate traveler-authentication decision (for example a per-traveler PIN/secret, authenticated account identity, or removal of server-side self-service edits). That would change the existing user workflow and is therefore not silently introduced in alpha1. PR #1 must remain Draft until that decision is made or the product owner explicitly accepts device-bound self-service as a trust assumption.

## Spreadsheet-menu/admin maintenance

Functions intended only for spreadsheet administration are required to call `SpreadsheetApp.getUi()` before mutation, either directly or through `assertSpreadsheetAdminContext_()`. That separates owner/editor maintenance operations from portal `google.script.run` operations. Menu functions that prompt for API keys already obtain the Spreadsheet UI before storing a secret.

## Secret handling

The organizer access key, organizer session token, OneSignal API key, Gemini API key, Apify token, and extension submission key must never be committed to source. API/service keys live in Script Properties. The organizer access key is stored only as a salted hash; organizer session tokens are stored server-side only by SHA-256 hash.

## Deployment

1. Deploy this branch to a test Apps Script deployment first.
2. Run `setOrganizerAccessKey` from the spreadsheet-bound Apps Script project and authorize the script if prompted.
3. Use a strong private passphrase of at least 12 characters.
4. Open the portal while Planning As Justin and invoke a protected action. The portal asks for the organizer access key and stores only the issued 12-hour session on that device.
5. Run `revokeOrganizerSessions` from the spreadsheet context to invalidate all organizer sessions.

Do not put the organizer access key into source code, Trip Settings, the spreadsheet, GitHub Pages, or PWA configuration.

## Alpha1 merge blockers after completion audit

1. `refreshCabinPhotos` and `enrichCabinNow` remain public legacy organizer-maintenance endpoints without `assertOrganizer_`.
2. `processRentalEnrichmentQueue` remains a public legacy worker and can be invoked outside the time-driven trigger/menu wrapper, potentially consuming API quota.
3. Traveler self-service uses a rebindable Device ID convenience identity rather than strong traveler authentication.
4. `retryFailedRentalImports` still needs the spreadsheet-admin guard verified/added in its large legacy import-engine file.

Until these are resolved or an explicit product/security decision accepts the traveler self-service trust assumption, PR #1 remains Draft.
