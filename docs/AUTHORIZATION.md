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
8. `revokeOrganizerSessions` invalidates all active organizer sessions and obtains Spreadsheet UI context before deleting any sessions.

Traveler name, Traveler ID, `Planning As`, hidden controls, and Device ID do not grant organizer authorization.

## Classification key

- **A** — public/read-only traveler-safe
- **B** — traveler self-service
- **C** — normal/shared traveler mutation
- **D** — organizer-only portal operation
- **E** — spreadsheet-menu/admin maintenance or separately authenticated external integration
- **F** — private/internal helper; should not be exposed through `google.script.run`

## Public-method security classification

| Public method | Classification | Authorization / trust boundary |
| --- | --- | --- |
| `doGet` | A | Public web-app bootstrap |
| `include` | A/F-compatible templating helper | Returns project HTML includes; carries no organizer privilege or secret material |
| `getPortalData` | A | Public portal data used by the existing application |
| `getPortalStartupData` | A | Device ID affects convenience traveler identity only; never organizer auth |
| `getPortalDeferredData` | A | Existing portal data |
| `getRentalImportUpdates` | A | Existing import progress data |
| `getPortalDelta` | A | Existing lightweight live-sync data |
| `getPortalLiveActivity` | A | Existing portal activity data |
| `submitPortalFeedback` | C | Normal feedback submission; submitted traveler metadata is informational |
| `createOrganizerSession` | D/auth bootstrap | Requires correct organizer access key; issues time-limited bearer token |
| `getOrganizerAuthorizationStatus` | D/auth status | Server validates session token hash, expiration, and device binding |
| `saveTripSettings` | D | `assertOrganizerFromValues_` |
| `saveFinalists` | D | `assertOrganizerFromValues_` |
| `startFinalVoting` | D | `assertOrganizerFromValues_` |
| `closeFinalVoting` | D | `assertOrganizerFromValues_` |
| `reopenFinalVoting` | D | `assertOrganizerFromValues_` |
| `restartPreliminaryVoting` | D | `assertOrganizerFromValues_` |
| `resetPlanningPortalToGathering` | D | `assertOrganizerFromValues_` |
| `getOrganizerVotingSummary` | D | `assertOrganizerFromValues_` |
| `removeRentalForOrganizer` | D | `assertOrganizerFromValues_` |
| `queueCabinEdit` | D | `assertOrganizerFromValues_`; current portal edit/review path |
| `refreshCabinPhotos` | D | `assertOrganizerFromValues_`; external fetch/Apify-capable maintenance cannot run anonymously |
| `enrichCabinNow` | D | `assertOrganizerFromValues_`; Gemini/Apify-capable maintenance cannot run anonymously |
| `getOneSignalStatus` | D | `assertOrganizerFromValues_` |
| `sendPortalPushNotification` | D | `assertOrganizerFromValues_` |
| `runPortalDiagnostics` | D | `assertOrganizerFromValues_` |
| `saveTraveler` | B/D | Own permanent device binding for limited self-service fields, otherwise organizer session |
| `deleteTraveler` | D | `assertOrganizerFromValues_` |
| `saveVoteFast` | C | Existing traveler voting workflow; no organizer privilege |
| `saveVote` | C | Legacy traveler voting path; tracked for later data-integrity/dead-code cleanup |
| `toggleFavorite` | C | Existing traveler workflow |
| `saveComment` | C | Existing traveler workflow |
| `submitRental` | C | Existing add-rental workflow; queues work but does not grant maintenance/admin privilege |
| `saveBedroom` / `deleteBedroom` | C | Existing shared room-planner mutation; not organizer-only in alpha1 |
| `saveAssignment` / `removeAssignment` / `saveRoomAssignmentsBatch` | C | Existing shared room-planner mutation |
| `replaceBedroomLayout` | C | Existing shared room-planner mutation; concurrency review belongs to data-integrity phase |
| `selectRoomPlannerCabin` | C | Existing room-planner state mutation |
| `saveBudget` / `saveMeal` / `saveGrocery` / `saveItinerary` | C | Narrow planner-specific mutation APIs |
| `deletePlannerItem` | C | Fixed allow-list maps planner names to known sheet/ID pairs |
| `saveDeviceTravelerBinding` / `markDeviceTravelerInstalled` / `clearDeviceTravelerBinding` | B/convenience identity | Device profile only; expressly not organizer authentication |
| `doPost` | E/external integration | Chrome-extension shared submission key validated server-side; independent of organizer session |
| `setupVacationPortal` | E | `assertSpreadsheetAdminContext_` before mutation |
| `openRentalGathering` / `openPreliminaryVoting` / `openFinalistVoting` | E | `assertSpreadsheetAdminContext_` before mutation |
| `clearCabinData` | E | `assertSpreadsheetAdminContext_` before mutation |
| `repairGeminiImports` | E | `assertSpreadsheetAdminContext_` before mutation |
| `repairRentalProcessing` | E | `assertSpreadsheetAdminContext_` before mutation |
| `retryFailedRentalEdits` | E | `assertSpreadsheetAdminContext_` before mutation |
| `retryFailedRentalImports` | E | `assertSpreadsheetAdminContext_` before mutation |
| `processRentalEnrichmentQueueMenu` | E | Spreadsheet-admin guard then delegates to private worker |
| `runSetupDiagnostics` | E | Spreadsheet UI context is obtained before setup/diagnostic work |
| `testGeminiConnection` / `testApifyConnection` / `testOneSignalSetup` | E | Spreadsheet-admin/UI context before secret-backed external request |
| `setGeminiApiKey` / `setApifyApiToken` / `setOneSignalApiKey` / `setExtensionSubmissionKey` | E | Spreadsheet UI prompt occurs before Script Property mutation |
| `showExtensionSetup` | E | Spreadsheet UI only |
| `setOrganizerAccessKey` / `revokeOrganizerSessions` | E | Spreadsheet UI only; session revocation does not occur before UI context is established |
| `startNewVacation` | E | `safeUiConfirm_` requires Spreadsheet UI before any archive/data mutation |

### Private/internal surfaces relevant to authorization

| Private method | Classification | Purpose |
| --- | --- | --- |
| `processRentalEnrichmentQueue_` | F | Time-driven worker named by `IMPORT_TRIGGER_FUNCTION`; processes queues without requiring a browser session |
| `processRentalQuickPhase_` / `processRentalEnrichmentPhase_` | F | Worker phases; not exposed through `google.script.run` |
| `processRentalEditQueue_` / `processExtensionCaptureQueue_` | F | Background queue workers |
| `saveCabin_` / `archiveCabin_` / `reviewCabin_` | F | Legacy cabin-admin implementations retained only for internal compatibility; no public alternate admin path |
| `deletePlannerRecord_` / `deletePlannerRecordFast_` | F | Generic sheet/id deletion helpers hidden behind allow-listed public API |
| `readSheet_` / `appendObject_` / `updateById_` / `deleteById_` | F | Core data helpers |
| `setCabinOriginalUrl_` / `getRentalQueueHealth_` | F | Maintenance helpers not exposed to the portal |

The old public `getJustinVotingSummary(requestingTravelerId)` endpoint is removed. The client uses only `getOrganizerVotingSummary` for the organizer voting report.

## Rental import and maintenance boundary

The automatic rental pipeline preserves its existing behavior without giving a web caller an unrestricted quota-consuming worker endpoint:

- normal travelers may use `submitRental` to enqueue a rental under the existing workflow;
- the time-driven trigger calls private `processRentalEnrichmentQueue_` via `IMPORT_TRIGGER_FUNCTION`;
- Spreadsheet menu “Process rental queues now” calls `processRentalEnrichmentQueueMenu`, which requires spreadsheet-admin context and delegates to the same private worker;
- `refreshCabinPhotos`, `enrichCabinNow`, and `queueCabinEdit` are organizer-session protected when called from the portal;
- failed import/edit retry menu operations require spreadsheet-admin context.

This prevents an unauthenticated `google.script.run` caller from directly launching the generic enrichment worker or organizer-only external API maintenance calls.

## Generic mutation review

The generic planner deletion functions `deletePlannerRecord` and `deletePlannerRecordFast` were removed from the public Apps Script surface by renaming them with trailing underscores. The public `deletePlannerItem(plannerName, id)` endpoint maps only the allow-listed `Budget`, `Meals`, `Grocery List`, and `Itinerary` planners to fixed sheet/ID pairs.

Core arbitrary-sheet helpers in `Data.gs` (`readSheet_`, `appendObject_`, `updateById_`, `deleteById_`) are private.

Legacy public cabin mutations `saveCabin`, `archiveCabin`, and `reviewCabin` were also made private after confirming the current client uses `queueCabinEdit` and `removeRentalForOrganizer` for organizer cabin administration.

## Traveler self-service

An existing traveler profile can be saved without organizer authorization only when the server-backed Device ID is currently bound to that same Traveler ID. The self-service path preserves organizer-only fields instead of accepting submitted values.

Organizer-only traveler fields include:

- Traveler Type
- Parent/Guardian ID
- Price Cap
- Cost %
- Pay More
- Active
- traveler creation
- traveler deletion

A temporary `Planning As` switch does not overwrite the permanent device traveler binding in the normal UI flow.

### Accepted alpha1 limitation: device binding is not strong traveler authentication

The device-profile binding was designed as convenience identity for a family/shared-device application. `saveDeviceTravelerBinding` intentionally permits changing the default traveler on a device. A determined caller can therefore create/rebind a Device ID to another normal Traveler ID and then satisfy the self-service device check.

That limitation is **not an organizer bypass**. A device re-bound to Justin still has no organizer bearer token, and `assertOrganizer_('', deviceId)` fails. Admin-only traveler fields and every organizer-only endpoint continue to require the independent organizer access-key/session mechanism.

Strong normal-traveler authentication (for example a traveler PIN, authenticated account identity, or removal of remote self-service) is a separate product/security decision for a later phase. Alpha1 records the limitation rather than silently introducing a new login workflow.

## Organizer session security properties

- plaintext organizer access key is never stored;
- only salted SHA-256 access-key hash is stored;
- organizer bearer token is generated from multiple UUID values and is returned only to the unlocking client;
- only SHA-256 token hash is used as the server-side Script Property key;
- session expiration is enforced server-side;
- expired and malformed sessions fail closed;
- spreadsheet revocation deletes all organizer-session records;
- device-bound sessions reject a different Device ID;
- Device ID, Traveler ID, traveler name, and `Planning As` cannot create a valid organizer session.

## Spreadsheet-menu/admin maintenance

Functions intended only for spreadsheet administration obtain Spreadsheet UI context before mutation, either directly or through `assertSpreadsheetAdminContext_()`. This separates owner/editor maintenance operations from portal `google.script.run` operations. Menu functions that prompt for API keys obtain Spreadsheet UI before storing a secret.

## Secret handling

The organizer access key, organizer session token, OneSignal API key, Gemini API key, Apify token, and extension submission key must never be committed to source. API/service keys live in Script Properties. The organizer access key is stored only as a salted hash; organizer session tokens are stored server-side only by SHA-256 hash.

CI runs `tests/secret_scan.js` to flag common committed API-token/private-key formats and literal assignments to the known Script Property secret names. The public OneSignal App ID UUID is intentionally not treated as a secret.

## Automated verification

The branch runs three CI checks:

1. `node tests/authorization_contract.test.js`
   - static authorization contracts;
   - executable organizer-session behavior using Apps Script mocks;
   - rental-maintenance authorization contracts;
   - explicit test that rebinding the device traveler to Justin does not create organizer authorization.
2. `node tests/public_surface_audit.js`
   - inventories non-underscore `.gs` function declarations;
   - rejects the known forbidden/generic server surfaces.
3. `node tests/secret_scan.js`
   - checks source for common committed secret formats and literal known-secret assignments.

The public-surface script is a conservative source audit; nested local function declarations can appear in its printed inventory and require human classification. Its failure rules target known top-level forbidden/generic surfaces.

## Deployment

1. Deploy this branch to a test Apps Script deployment first.
2. Run `setOrganizerAccessKey` from the spreadsheet-bound Apps Script project and authorize the script if prompted.
3. Use a strong private passphrase of at least 12 characters.
4. Open the portal while Planning As Justin and invoke a protected action. The portal asks for the organizer access key and stores only the issued 12-hour session on that device.
5. Run `revokeOrganizerSessions` from the spreadsheet context to invalidate all organizer sessions.

Do not put the organizer access key into source code, Trip Settings, the spreadsheet, GitHub Pages, or PWA configuration.

## Alpha1 completion status

The organizer/admin bypasses identified in the alpha1 audit are closed in the branch:

- legacy Justin-ID voting-summary endpoint removed;
- generic planner arbitrary-sheet delete endpoints private;
- rental removal/edit/photo-refresh/enrichment organizer protected;
- generic rental enrichment worker private while remaining trigger-compatible;
- rental retry and other maintenance entry points spreadsheet-admin guarded;
- legacy public cabin-admin mutation paths private;
- organizer session behavior covered by executable tests.

The remaining device-binding limitation affects normal-traveler self-service identity only and cannot cross the organizer authorization boundary. It is documented for a later product/security decision rather than treated as an alpha1 organizer-boundary blocker.
