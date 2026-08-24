# Smoky Mountain Family Vacation Portal — Portal V2.5.0

This build adds a two-stage rental importer and changes travelers to one-person records.

## What changed

### Rental importer

The importer no longer depends on Gemini URL Context alone.

1. **Fast import**
   - preserves the full original URL, including dates and guest counts
   - creates a clean canonical URL for duplicate detection
   - attempts a normal HTTP fetch
   - extracts Open Graph metadata, JSON-LD, title, images, and basic counts
   - creates the cabin card immediately

2. **AI enrichment**
   - queues the property for a second pass
   - uses both the original date-specific URL and canonical property URL
   - combines Gemini URL Context with the conservative fast-import data
   - stores photos, amenities, bedroom details, confidence, logs, and AI history
   - can also be run immediately from a cabin card with **Enrich now**

New diagnostic sheets:

- `Cabin Details`
- `Cabin Photos`
- `Cabin Amenities`
- `Rental Import Queue`
- `Rental Import Log`
- `AI History`

### Travelers

Each row now represents exactly one person.

- `Traveler Type` is either `Adult` or `Child`
- adults always count as 1 adult
- children always count as 1 child
- every child must have a `Parent/Guardian ID`
- the old Adults/Children columns remain for compatibility but are automatically set to 1/0

Existing rows are migrated when setup runs. Existing child rows will still need a parent/guardian selected if that information was not previously available.

## Files added

- `RentalProviders.gs`
- `RentalImportEngine.gs`

## Installation

1. Replace all files in the Apps Script project with this package.
2. Make sure old duplicate files are removed or renamed.
3. Show and replace `appsscript.json`.
4. Save the project.
5. Run `setupVacationPortal`.
6. Approve the new external-request and trigger permissions.
7. Run `runSetupDiagnostics`.
8. Refresh the spreadsheet.
9. Deploy a new Web App version.
10. Open Travelers and assign a parent/guardian to each child.
11. Paste the full Vrbo search-result URL when importing. Keep dates and guest counts in it.

## Important behavior

A cabin card can appear before Gemini enrichment finishes. That is intentional.

- `Fast Import Complete` means the first card was created.
- `Queued` or `Processing` means enrichment is pending.
- `Needs Review` means the importer finished but important fields are still missing.
- `Imported` means the core fields were successfully populated.

Apps Script time-driven triggers do not run at an exact second. The queued enrichment may begin roughly a minute later. The **Enrich now** button runs it immediately.


## V2.1 improvements

- scans `__NEXT_DATA__`, `application/json`, initial-state, and Apollo-state scripts
- recursively collects rental names, images, amenities, counts, ratings, and price candidates
- validates image candidates by HTTP status and image content type
- sends extracted structured fragments to Gemini for stronger normalization
- saves Gemini URL Context retrieval metadata in `AI History`
- derives Pool, Hot Tub, Theater, and Arcade/Game Room detail fields from amenities and descriptions
- normalizes Vrbo ratings to a five-point scale
- prevents `NaN%` confidence values in both server and browser code
- adds **Vacation Portal → Clear Cabin Data**
  - removes cabin-related records only
  - retains Travelers, Trip, Budget, Meals, Grocery List, and Itinerary
  - asks for confirmation before clearing data


## V2.1.1 hotfix

- fixes `Assignment to constant variable` during AI enrichment
- the merge object is now mutated by `deriveFeatureDetails_()` instead of being reassigned


## V2.1.2 photo extraction hotfix

- keeps image context while recursively walking embedded Vrbo/Expedia JSON
- recognizes image objects whose final property is `url`, `src`, `href`, or `uri`
- extracts CDN URLs and `/lodging/` image paths
- accepts trusted Vrbo/Expedia CDN image URLs when Apps Script receives a misleading response
- adds a **Refresh photos** action to each cabin card


## V2.1.3 Vrbo photo fallback

- adds a reader-rendered fallback for JavaScript-heavy Vrbo pages
- parses the actual `media.vrbo.com/lodging/...` gallery URLs
- prioritizes property-gallery URLs over unrelated page images
- requests larger `rw=1200` image variants for cabin cards and galleries
- records reader fallback status and image count in the import diagnostics


## V2.2.0 reliable Vrbo extraction

V2.2 adds an optional Apify-backed extractor because Vrbo's JavaScript gallery is not reliably exposed to Apps Script.

1. Create an Apify account and API token.
2. Refresh the spreadsheet.
3. Select **Vacation Portal → Set Apify API token**.
4. Paste the token.
5. Run **Vacation Portal → Test Apify connection**.
6. Click **Refresh photos** on the cabin.

The default actor is `one-api~vrbo-scraper`. The full URL, `expediaPropertyId`, and Vrbo path ID are supplied to the actor.


## V2.2.1 Apify hotfix

- fixes the Apify Actor endpoint from `/actors/` to `/acts/`
- retries with the actor's complete documented input structure
- stores the first portion of the Apify response body in diagnostics
- improves no-photo error guidance


## V2.2.2 Expedia ID and Raw JSON fix

- uses `expediaPropertyId` as the Actor's authoritative numeric property ID
- no longer submits the public Vrbo path ID when an Expedia property ID exists
- parses JSON stored inside Apify's `Raw` / `Raw JSON` string field
- recognizes cover-photo fields
- adds the original full rental URL to the cabin review form so older imports can be repaired

For Vrbo URL `/3681841?...&expediaPropertyId=99983116`, the Actor now receives `99983116`.


## V2.3.0 scraper replacement

The previous `one-api~vrbo-scraper` Actor returned successful but empty rows for this Vrbo property.

V2.3 switches the default Actor to:

`memo23~vrbo-scraper`

Input used:

```json
{
  "startUrls": ["FULL_VRBO_PROPERTY_URL"],
  "proxy": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

This Actor is designed for direct Vrbo property URLs and returns photos, amenities, pricing, capacity, and host data.


## V2.3.1 property, pricing, and review mapping

- maps the memo23 Actor's documented property fields directly:
  - `bedrooms`
  - `bathrooms`
  - `sleeps`
  - `pricePerNight`
  - `rates.totalPrice`
  - `rating`
  - `ratingScale`
  - `reviewCount`
- sends check-in, check-out, and adult count from the original Vrbo URL
- enables rate/availability enrichment
- normalizes ten-point ratings to the portal's five-point display
- shows trip total prominently on cabin cards and nightly price beneath it
- displays review count directly on the cabin card

Important: date-specific total pricing requires the cabin's **Original full rental URL** to retain `chkin`, `chkout`, and `adults` parameters.


## V2.3.2 background submission and duplicate prevention

- rental submission now performs only:
  - URL normalization
  - initial duplicate validation
  - placeholder cabin creation
  - queue creation
- all HTTP fetching, Apify scraping, and Gemini enrichment run in the background
- the URL modal closes as soon as the rental is queued
- a placeholder card appears immediately with `Queued for Import`
- the background worker runs every minute while queued items remain
- duplicate checking happens during initial entry, before a cabin or queue row is created
- duplicate identity checks compare:
  - canonical rental URL
  - provider and public property ID
  - `expediaPropertyId`
- duplicate checking includes queued, processing, completed, needs-review, and archived cabin records
- a script lock prevents simultaneous users from submitting the same property at the same time


## V2.4.0 automatic two-phase background imports

### Phase 1 — core cabin card

The automatic queue retrieves and displays:

- property name
- main image and gallery
- sleeps
- bedrooms
- bathrooms
- trip total
- nightly price
- rating
- review count

### Phase 2 — detailed enrichment

The next automatic queue pass adds:

- amenities
- bedroom layouts
- policies
- house rules
- parking
- accessibility
- nearby highlights
- AI-normalized description and details

No **Enrich Now** action is required for a new rental. The button remains available as **Refresh details** or **Retry import**.

The browser silently polls every 10 seconds while imports are active and refreshes cabin cards when their status changes.

Queue stages:

- `Quick Queued`
- `Quick Processing`
- `Core Card Ready`
- `Enrichment Queued`
- `Enriching`
- `Imported` or `Needs Review`

The Apps Script background trigger runs every minute while work remains and removes itself when the queue is empty.


## V2.4.1 instant queue response

The rental submission call now does only:

1. normalize the URL
2. acquire a short submission lock
3. run the duplicate check
4. append the placeholder cabin, import, and queue rows
5. return the single placeholder card

It no longer calls `getPortalData()` after submission. That full portal reload was reading every sheet and causing the 20+ second delay.

The browser inserts the returned placeholder into its existing cabin list immediately and begins silent background polling.

The submission lock timeout was reduced from 20 seconds to 5 seconds.


## V2.4.2 Apify quota protection
- detects Apify quota/usage-limit responses
- pauses affected imports in `Quota Waiting`
- preserves existing images and other cabin data
- never replaces a gallery with an empty result
- retry after quota reset with **Retry import**
- manual photo URLs remain available in **Review import**


## V2.5.0 Chrome extension capture

This release keeps both intake methods:

1. **Chrome extension:** captures the photos and visible listing data from the traveler's open browser page.
2. **Add rental link:** preserves the original portal URL-entry queue for travelers who cannot install the extension.

### Organizer setup

1. Push and deploy the Apps Script portal as a web app.
2. In the spreadsheet, choose:
   - `Vacation Portal → Set Chrome extension key`
   - `Vacation Portal → Show Chrome extension setup`
3. Give trusted travelers:
   - the deployed web-app URL
   - the shared submission key
   - the unpacked Chrome extension folder

### Web-app deployment

The web app must execute as the spreadsheet owner and be accessible to the intended travelers. The shared extension key is still required for extension submissions.

### Extension behavior

The extension:

- captures loaded Vrbo/Expedia images from the DOM, JSON-LD, embedded scripts, `srcset`, and browser performance entries
- sends the full original listing URL, including dates and guest count
- performs duplicate checking on the server before writing
- writes the cabin and gallery immediately
- does not require Apify
- does not automatically run Apify afterward, so browser-captured photos cannot be erased by an empty scrape
- leaves **Refresh details** available in the portal for optional later enrichment


## V2.6.0 — instant extension spool

Extension submissions now use a two-stage workflow:

1. The web request validates the family key and appends one compact payload to `Extension Capture Queue`.
2. The permanent one-minute portal worker performs duplicate checking and creates the cabin in the background.

The extension confirms **Queued** and closes automatically, allowing the traveler to continue browsing immediately.

After deploying V2.6.0, run **Vacation Portal → Set up / repair portal** once. This creates the new queue sheet and installs the permanent worker trigger.


## V2.7.0 — beta feedback and live rental notices

### Feedback

The header now includes a **Feedback** button. Submissions are written automatically to
the `Feedback` sheet with:

- selected traveler and entered name
- feedback type and summary
- actual and expected behavior
- reproduction steps
- current portal view
- web-app URL
- browser user-agent
- status and timestamps

### Live notifications

While the portal remains open, it performs a lightweight activity check every 12 seconds.
When another traveler adds a rental, a **New rental added** notification appears and the
portal quietly refreshes its data. The notification opens the Rentals view when selected.

This is polling rather than push messaging, so notifications appear only while the portal
tab is open. Extension queue processing may still take up to approximately one minute
before the cabin is created by the background worker.


## V2.8.0 — resilient browser photo updates and rental filters

### Photo strategy

Apify and direct Apps Script requests cannot guarantee that every JavaScript-heavy listing
will expose its gallery. V2.8 treats the traveler browser extension as the authoritative
photo source:

- extension captures can update an existing cabin created through **Add rental link**
- duplicate detection still prevents a second cabin record
- newly captured photos are merged with existing photos
- empty scraper results never remove an existing gallery
- Apify remains an optional fallback rather than the required photo path

### Rental filters

The Rentals page now supports:

- text search
- amenity keyword
- minimum bedrooms
- minimum review count
- minimum rating
- maximum trip total
- maximum nightly price
- sorting by total price, nightly price, reviews, rating, bedrooms, sleeps, votes, or date
- visible-result count and one-click filter reset


## V2.9.0 — selectable room planner and planning-detail synchronization

- Room Planner now includes a property dropdown and remembers the selected cabin.
- The selected property shows sleeps, bedroom count, and bathroom count.
- When a listing has a bedroom total but no detailed layout, placeholder Bedroom rows
  are created without overwriting manually entered or imported room layouts.
- Cabin detail views now show Sleeps, Bedrooms, Bathrooms, rating, and review count.
- Pool, Hot Tub, Theater, and Arcade/Game Room are derived from the title,
  description, and amenities and stored in Cabin Details.
- Edit Rental now exposes those four feature fields for manual confirmation.
- Running **Vacation Portal → Set up / repair portal** backfills details and bedroom
  placeholders for existing active cabins.


## V2.9.1 hotfix

- fixes extension captures blocked by orphaned Rental Import rows after a cabin
  was manually deleted only from the Cabins sheet
- Refresh Details is now non-destructive
- empty Apify/Gemini responses can no longer clear populated cabin fields,
  photos, amenities, or room layouts
- adds **Vacation Portal → Repair rental processing**
- repair command reinstalls the worker trigger, resets stuck extension rows,
  and processes the queue immediately


## V2.9.2 — instant queued rental edits

Rental detail edits now use a spool-first workflow:

1. The save request validates the cabin and appends one compact payload to `Rental Edit Queue`.
2. The modal closes immediately and the browser updates the visible rental card locally.
3. The permanent background worker writes photos, amenities, details, room placeholders,
   and review status without making the traveler wait.

The Rentals page temporarily shows `Saving Edits…` or `Review Saving…` until background
processing completes. Failed edits retain their payload and error in the queue and can be
retried from **Vacation Portal → Retry failed rental edits**.


## V2.9.3 — remembered traveler identity

- first-time visitors are prompted to choose their traveler identity
- the selection is stored in browser local storage
- votes, favorites, comments, feedback, room requests, and other existing
  traveler-specific features continue using the same Traveler ID
- the existing **Planning as** selector remains available
- a new **Change traveler** button reopens the chooser
- invalid or deleted saved traveler IDs are detected and the chooser opens again
- no existing portal functionality or data structure was removed


## V2.9.4 — immediate-close save dialogs

- rental edit and review dialogs close immediately after client-side validation
- cards update optimistically before the server queue response returns
- durable queue writes continue after the traveler is back in the portal
- a compact background-saving indicator replaces the blocking dialog
- failed queue writes restore the prior local card and show an error
- feedback dialogs also close before their server write completes
- no existing portal functionality was removed


## V2.9.5 — lightweight live sync and visible loading progress

- the main loading screen now includes an animated spinner
- rotating status text shows which section is being prepared:
  trip settings, travelers, rentals, voting activity, room plans, and planning sheets
- no additional initial server calls were added; one existing `getPortalData()` request
  still performs the initial load
- a lightweight 15-second delta sync retrieves only cabins whose records, votes,
  comments, favorites, or assignments changed since the prior check
- changed rentals are merged into the current browser state without a full page reload
- dialog close behavior remains immediate and is not tied to live synchronization
- transient sync failures retry quietly at a slower interval


## V2.9.6 — clearer loading, voting, and listing access

- spins the existing yellow triangle during startup instead of showing a separate circle
- loading text now names the data section being prepared
- Vote is now a prominent gold **Vote 1–5** button
- cards explain that 1 is least liked and 5 is most liked
- each card includes a direct **Open original listing** link
- current background-save and live-sync behavior remains unchanged


## V3.0.0 — collaborative voting

- removes the 1–5 scale bar from rental cards
- shows each traveler whether they have reviewed a rental and their current score
- Vote changes to **Edit rating · X/5** after review
- vote dialog preloads the existing score, notes, and reasons
- saving updates the same traveler/cabin/round row rather than creating duplicates
- vote dialogs close immediately and update optimistically
- each card displays family review completion and progress
- filters include reviewed/unreviewed and personal score
- sorts include personal score, family review progress, favorites, and comments
- optional “Why I like it” reasons are limited to three and summarized on cards
- Top Picks highlights current family leaders
- users can select two or three rentals for side-by-side comparison
- existing voting rounds, favorites, comments, import queues, live sync,
  room planning, and background saves remain intact


## V3.0.1 — triangle loader hotfix

- removes any remaining circular loading-spinner markup
- removes circular-spinner CSS left over from earlier versions
- restores the existing yellow triangle as the only startup loading icon
- applies one authoritative triangle rotation animation
- collaborative voting and all V3.0 functionality remain unchanged


## V3.0.2 — Rentals page hotfix

- initializes personal vote, family review progress, and top-reason data before each card renders
- fixes the blank Rentals view caused by undefined client variables
- removes reliance on the browser global event object for comparison selection
- preserves the rotating yellow triangle and all V3 collaborative voting features


## V3.0.3 — rental action toolbar cleanup

- moves the original listing link to the end of each rental card's action row
- pushes the external listing link to the far right on wider screens
- keeps it last when the actions wrap on smaller screens
- changes the label dynamically to View on Vrbo, Airbnb, Booking.com, Expedia,
  or the detected provider
- preserves all V3 voting, comparison, live sync, imports, and background saves


## V3.0.4 — Gemini model and stuck-import repair

- updates the default enrichment model to `gemini-3.6-flash`
- removes the obsolete `gemini-2.5-flash` fallback
- ignores retired Gemini 1.x, 2.x, and 3.5 model values stored by older releases
- removes deprecated sampling parameters from Gemini 3.6 requests
- automatically migrates the Trip sheet's obsolete Gemini Model setting
- adds **Vacation Portal → Repair Gemini imports**
- the repair command resets matching HTTP 404 enrichment failures, clears attempts
  and errors, and returns affected rentals to the background enrichment queue


## V3.0.5 — Top Picks review-count consistency

- Top Picks and rental cards now use the same authoritative family-vote summary
- older duplicate vote rows are collapsed to the latest vote per traveler
- family score and reviewed count are calculated from that same deduplicated set
- clicking a Top Pick scrolls to and highlights the exact matching rental card
- this makes similarly named rentals easier to distinguish


## V3.0.6 — Top Pick identity clarification

- Top Picks and card badges now come from the same ranked list
- matching rental cards display Top Pick #1, #2, or #3
- Top Picks and rental cards both display the provider property ID
- clicking a Top Pick still scrolls to and highlights its exact card
- this prevents similarly named cabins from being mistaken for the same property


## V3.0.7 — organizer rental removal and card separation

- adds **Remove rental** to rental cards only when planning as the Justin profile
- repeats the Justin check on the server before allowing removal
- uses soft removal so votes, comments, photos, bedrooms, and history remain intact
- cancels pending import, edit, and extension queue work for the removed rental
- removes the card optimistically so the dialog closes immediately
- restores the card automatically if the server rejects the removal
- increases spacing, borders, rounding, and shadows between rental cards


## V3.1.0 — cabin comparison

- select two or three cabins using the Compare checkbox
- sticky Compare Selected bar appears once two cabins are selected
- compare photos, original listing links, price, capacity, reviews, family voting, and amenities
- best numeric values are highlighted automatically
- confirmed amenities receive a check indicator
- opens entirely from data already loaded in the browser, so there is no server wait


## V3.2.0 — bedroom layout capture and editing

- Chrome Extension V1.4.0 captures the Vrbo Rooms & beds section room-by-room
- captured room names, floors, bed configurations, and estimated sleeping capacity
  replace generic Bedroom 1 / Bedroom 2 placeholders
- existing cabins can be rescanned with the extension to populate detailed bedrooms
- Room Planner bedroom cards now have Edit and Delete controls
- Add Bedroom remains available
- new Paste Bedroom Layout tool accepts copied Rooms & beds text from a listing
- pasted room layouts become fully editable portal bedroom cards


## V3.2.1 — Vrbo multi-column bedroom parser fix

- extension now recognizes Vrbo's current card/grid format:
  Bedroom 1 → 1 King Bed, Bedroom 7 → 4 Queen Beds, etc.
- parser scans compact DOM room cards first, then falls back to section text
- supports multi-column layouts that do not serialize cleanly into adjacent text lines
- captures the visible Rooms & beds section as diagnostics in Cabin Details raw data
- Paste Bedroom Layout now accepts the same Bedroom N / bed-description format

## V3.3.0 — Final Voting
- Justin selects exactly three finalists from Trip Settings.
- Preliminary votes are preserved; final votes use Voting Round = Final.
- Rentals shows only the three finalists during Final Voting and Voting Closed.
- Travelers rate all three and may designate exactly one #1 choice.
- A new #1 choice automatically replaces the previous #1.
- Family aggregate results stay hidden until Justin closes voting.
- Top Picks is hidden during the final round.
- Compare All 3 Finalists opens instantly from already-loaded data.
- Dashboard becomes a final-voting progress/results screen.


## V3.3.1 — per-adult traveler cost

- rental cards show Total Rental Cost divided by active Adult travelers
- Child travelers are excluded from the divisor
- the adult count used in the calculation is shown beneath the value
- Compare includes Per adult traveler in the Price section
- the lowest per-adult value is automatically highlighted
- calculation is client-side and adds no server calls or loading delay


## V3.3.2 — bedroom-based cost splitting

- rental cards now show Per Bedroom cost in addition to Per Adult Traveler
- Per Bedroom = Total Rental Cost divided by the property's bedroom count
- cards show example splits for 2, 3, and 4 adults sharing one bedroom
- Compare includes Per Bedroom and 2 Adults Sharing a Bedroom
- lowest bedroom-based cost is highlighted automatically in Compare
- Room Planner bedroom cards show that bedroom's trip share
- once travelers are assigned to a bedroom, the Room Planner shows the equal
  per-person split for the assigned travelers in that bedroom
- all calculations happen client-side and add no server calls


## V3.3.3 — assigned traveler lodging cost

- once room assignments exist, rental cards show the current traveler's actual
  assigned-room lodging share
- assigned-room share = one equal bedroom share divided by the number of Adult
  travelers assigned to that bedroom
- Child travelers are displayed as assigned but do not increase the paying-adult divisor
- Compare includes My Assigned-Room Cost
- Room Planner includes a Traveler Lodging Cost panel listing each assigned traveler,
  their bedroom, and their calculated amount owed
- the current traveler is highlighted in the traveler-cost panel
- calculations remain client-side and add no server requests

## V3.4.0 — fast drag/drop room assignment
- Assign Travelers opens a drag-and-drop planner.
- Drag names between Unassigned and bedroom columns.
- Add Multiple lets users select several travelers for one room at once.
- Nothing is written to Sheets until Save Room Assignments.
- Save closes immediately and uses one batch server call for the entire cabin.
- Room-cost calculations update optimistically before the server response.


## V3.5.0 — traveler price caps and Pay More redistribution

- Adult travelers now have Maximum Lodging Cost (Price Cap) and Pay More fields
- a cap of 0 / blank means no maximum
- Child travelers do not receive lodging charges
- Adult split: each adult starts at Total Rental Cost / active adults
- Bedroom split: each bedroom starts at Total Rental Cost / bedrooms; assigned
  adults split their bedroom's share
- when a base share exceeds a traveler's cap, that traveler is reduced to the cap
- the remaining balance is redistributed equally among adults marked Pay More = Yes
- Pay More travelers with their own caps only absorb extra up to their remaining capacity
- if the willing/capped group cannot cover the total, the Room Planner shows the
  unresolved balance and prompts for another volunteer or a higher cap
- rental cards and Compare show the current traveler's cap-adjusted estimates
- Room Planner shows base, cap, extra absorbed, and final amount for every adult


## V3.6.0 — fast planning tools and shared-trip extras

- Budget, Meals, Grocery List, and Itinerary forms now close immediately after Save
- planner edits update optimistically in the browser while one compact background write runs
- every planner row has a Delete button and edit dialogs also include Delete
- planner deletes update the UI immediately and sync in the background
- Grocery List adds Store Section with common grocery-store sections and free-text support
- Grocery List column headers are clickable and toggle ascending / descending sorting
- Meals adds Clean Up for assigning post-meal cleanup responsibility
- Budget adds Include in Rental Split
- budget items marked Include in Rental Split are added to every rental's pricing basis
- adult split, bedroom split, room-assignment pricing, traveler price caps, Pay More
  redistribution, rental cards, and Compare all use Rental + Included Budget Extras
- Compare separately shows Rental Total, Included Budget Extras, and Total Incl. Extras

## V3.7.1 — corrected cumulative mobile release

Rebuilt directly from V3.6.0 Complete and verified to retain:
- Include in Rental Split
- Clean Up
- Store Section
- grocery sorting
- optimistic planner saves/deletes
- shared budget extras in pricing
- traveler caps / Pay More redistribution

Responsive mobile layout is layered on top without removing those features.

## V3.7.2 — fast traveler editing
- Add/Edit Traveler closes immediately after Save.
- traveler changes update optimistically in the browser.
- the server writes the entire traveler row in one operation instead of one cell at a time.
- saveTraveler returns only the saved traveler instead of rebuilding the complete portal dataset.
- the compact result is merged into the current browser data in the background.
- failed saves restore the prior traveler data automatically.

## V3.7.3 — itinerary event URL and cost basis
- Itinerary adds Event URL.
- Event URL displays as a clickable Open event link.
- Itinerary adds Cost Per with Per person and Group total choices.
- Existing fast optimistic itinerary saving/deleting remains intact.


## V3.7.4 — visible cap-adjusted pricing

- fixes Room Planner so Traveler lodging cost with caps is actually rendered
- rental cards now show a prominent Price Caps Applied panel whenever any adult
  traveler has a Price Cap or Pay More enabled
- card shows the current traveler's base and cap-adjusted adult/bedroom amounts
- View Full Split opens a complete traveler-by-traveler breakdown
- full split shows base, personal cap, Pay More status, redistributed extra, and final amount
- uncovered balances are clearly flagged
- Compare adds Adult Split Coverage and Bedroom Split Coverage
- existing budget extras remain included in the cap calculations


## V3.7.5 — bedroom pricing by actual room occupancy

- Per Bedroom pricing now detects the number of Adult travelers actually assigned
  to each bedroom
- rooms are grouped by occupancy so cards can show:
  2 bedrooms @ 1 adult — $X per adult
  4 bedrooms @ 2 adults — $Y per adult
  1 bedroom @ 4 adults — $Z per adult
- Child travelers do not increase the paying-adult occupancy count
- bedrooms with no paying adult assigned are clearly flagged
- before rooms are assigned, the card still shows 1/2/3/4-adult examples
- Compare adds Current Bedroom Assignments using the same grouped calculation
- calculation continues to use the rental + included budget extras cost basis


## V3.8.0 — simplified mobile readability

- mobile-only typography increased substantially; desktop remains unchanged
- mobile body text, labels, muted text, comparison cells, planner rows, and
  room-pricing details use larger minimum sizes
- rental cards simplify to a vertical reading flow on phones
- pricing blocks become full-width, one-per-row summaries
- actual bedroom occupancy pricing is emphasized and easier to scan
- rental action buttons become one full-width button per row
- planner tables become simple label/value cards rather than compressed two-column rows
- Room Planner traveler cost cards become vertical and easier to read
- navigation uses larger touch-friendly labels
- forms, voting, and comparison typography are enlarged for phones
- no spreadsheet, pricing, voting, room assignment, or save logic changed


## V4.0.0 — PWA foundation

- begins the transition from web portal to installable mobile application
- existing Apps Script portal receives mobile-app metadata and standalone-mode detection
- adds an Install App helper to the portal header
- iPhone / Android install guidance is available directly in the portal
- Complete package now includes a separate PWA_Host folder
- PWA_Host contains the web app manifest, service worker, app icons, install shell, and config
- PWA shell embeds the current Apps Script /exec deployment, so the existing Google
  Sheet backend and all portal functionality remain intact
- no data/schema migrations are required
- true offline trip data is not enabled yet; V4.0.0 caches only the PWA application shell


## V4.0.1 — iPhone PWA viewport fix + release indicator

- fixes the GitHub Pages PWA shell so the embedded Apps Script portal fills the
  complete iPhone viewport instead of collapsing to the iframe's intrinsic height
- PWA shell uses dynamic viewport height plus visualViewport synchronization
- PWA shell removes parent overflow and explicitly sizes the root/iframe
- Dashboard now displays the current Portal Release
- release indicator appears on both the normal dashboard and final-voting dashboard
- current release is V4.0.1
- service-worker cache version bumped so GitHub Pages clients receive the new shell


## V4.0.2 — room-sharing preference + preliminary voting restart

- Adult Traveler profiles add Willing to Share Room
- Traveler roster shows Share Room? status
- Room assignment planner labels adults who volunteered to share
- Justin-only Trip Settings control can restart Preliminary Voting
- restart confirmation explains that all current Preliminary and Final vote rows
  will be cleared while rentals/travelers/planning data remain intact
- restart returns Portal Stage to Preliminary Voting, Voting Round to Preliminary,
  clears finalists, and reopens all active rentals for voting
- Chrome extension package bumped to 1.4.2 and remains compatible with the current backend


## V4.1.0 — simplified end-user experience

Header:
- removes Change Traveler, Install App, and Feedback
- adds Traveler Info beside Planning As
- Diagnostics is visible only while Planning As Justin
- every full page load / Refresh asks the user to verify the selected traveler

Voting:
- Voting Completion is available in every active voting round
- completed traveler cards turn light green

Rentals:
- rental name moved above the photo
- favorited heart turns red
- provider Rental tag removed
- amenities use lighter text-chip styling
- pricing consolidated into one interactive block
- price toggles: shared budget extras, Trip Total / Per Adult / Per Bedroom,
  shared-bedroom breakout, and current-room-assignment breakout
- normal travelers see only Vote, View Details, listing button, and Bedroom Planner
- Refresh Details, Photo Import, Edit, and Remove are Justin-only
- listing link is a button next to View Details
- Bedroom Planner can open directly in a rental-card modal
- more visual separation is added between cards

Traveler pricing:
- adds Cost % with a default of 100%
- Cost % creates weighted adult equivalents in the adult split
- room shares are weighted by Cost % among adults assigned to the room
- price caps and Pay More redistribution run after Cost % weighting

Room Planner:
- Property to Plan shows only rentals currently visible for the active portal round

Planning tables:
- Travelers, Budget, Meals, Grocery List, and Itinerary headers can sort ascending/descending

Portal reset:
- Justin can Archive & Reset the portal to Gathering from Trip Settings
- keeps rentals and traveler profiles
- archives then clears votes, favorites, comments, room assignments,
  Budget, Meals, Grocery List, and Itinerary


## V4.1.1 — selective reset to Gathering

- Reset to Gathering now presents checkboxes for each planning section
- portal stage/finalist/final-voting state always resets to Gathering
- selectable content sections:
  Votes, Favorites, Comments, Room Assignments, Budget, Meals, Grocery List, Itinerary
- default selections are Votes, Favorites, Comments, and Room Assignments
- Budget, Meals, Grocery List, and Itinerary are preserved by default
- Select All and Clear Selections controls are available
- a full archive of the current planning sheets is still created before any live data is cleared
- Rentals and Traveler profiles are always retained


## V4.1.2 — rental padding + Grocery Bringing

- Rental cards add 20px left/right inner padding on desktop and 14px on phones
- Grocery List adds Bringing and Brought By
- Bringing indicates an item is coming from home rather than being purchased
- Brought By uses the traveler-name selector
- Grocery rows include an inline Bringing checkbox for quick changes
- unchecking Bringing automatically clears Brought By
- Grocery toolbar adds Show items being brought
- turn that toggle off to hide all Bringing items during the actual shopping trip
- Grocery sorting works with the new Bringing / Brought By columns


## V4.1.3 — rental-card inner gutter correction

- fixes the rental-board spacing issue by insetting the entire rental-body wrapper
  instead of relying only on padding applied to individual content
- desktop rental content now sits 18px inside the left and right card borders
- mobile rental content uses a 12px inset
- rental photos remain edge-to-edge
- pricing, voting, action controls, notices, and Justin tools all share the same gutter
- V4.1.2 Grocery Bringing/Brought By functionality remains unchanged


## V4.1.4 — Justin-only Travelers and Trip Settings

- Travelers tab is visible only while Planning As Justin
- Trip Settings tab is visible only while Planning As Justin
- non-Justin navigation to either admin view redirects to Dashboard
- Traveler Info remains available in the header so each traveler can edit their own profile
- Diagnostics remains Justin-only


## V4.2.0 — Fast Start architecture

Initial loading:
- portal no longer performs a complete Setup/Repair scan on every normal page load
- a PORTAL_SCHEMA_VERSION marker runs the schema check only after an upgrade or when needed
- initial request loads only Trip, Travelers, Cabins, Votes, and import summary
- Dashboard becomes usable immediately after that small startup payload returns
- full bedrooms, photos, amenities, comments, favorites, room assignments,
  Budget, Meals, Grocery List, Itinerary, and queue details load in the background
- non-Dashboard navigation automatically ensures the deferred data load is underway
- the previous successful startup snapshot is stored locally for visual Fast Start
- repeat visits can display the last-known Dashboard immediately while fresh data is retrieved
- server-side startup payload has a short 15-second shared cache
- full portal assembly now indexes sheet data once instead of repeatedly filtering
  full sheets once per rental

Grocery List:
- V4.2.0 explicitly includes Bringing and Brought By in the Grocery schema and UI
- Bringing is available as an inline checkbox and in Add/Edit Grocery Item
- Brought By uses active traveler names
- Show items being brought is visible in the Grocery toolbar
- unchecking the toolbar toggle hides Bringing items during the shopping trip


## V4.2.1 — sticky navigation, full bedroom modals, instant comments
- section navigation is sticky on desktop as well as mobile
- Bedroom Planner-related popups use the full available viewport
- room cards and bulk assignment columns wrap vertically instead of horizontal scrolling
- Post Comment closes the detail popup immediately
- comments appear optimistically and save to Sheets in the background
- saveComment returns only the saved comment instead of rebuilding the full portal


# V4.3.0 — App Install + Push Notifications

## What travelers get

- A simple **App setup** card on the Dashboard.
- Android / compatible desktop browsers: one-tap browser installation when available.
- iPhone / iPad: a short guided Add-to-Home-Screen walkthrough.
- A persistent **Notifications** control in the PWA shell.
- Push subscriptions are linked to the currently selected Traveler ID.
- Push notifications can arrive even when the Vacation Portal is closed.

## Why iPhone cannot be fully automatic

Apple requires the traveler to explicitly add the web app to the Home Screen.
A website cannot press the system “Add to Home Screen” control on the user's behalf.
After installation, the traveler must also explicitly allow notifications.

## One-time OneSignal setup

1. Create a OneSignal account/app.
2. In OneSignal configure **Web Push** for:
   `https://retributionamiss.github.io`
   and use the Custom Code integration.
3. Use this service worker path:
   `Vacation-Portal/push/onesignal/OneSignalSDKWorker.js`
4. Use this service worker scope:
   `/Vacation-Portal/push/onesignal/`
5. Copy the OneSignal **App ID**.
6. In Vacation Portal → Trip Settings (Planning as Justin), paste it into
   **OneSignal App ID** and save.
7. In the Google Sheet menu choose:
   **Vacation Portal → Set OneSignal API key**
   and paste the OneSignal App API key.
   The secret key is stored only in Apps Script Script Properties.
8. Push the PWA_Host folder to the existing GitHub Pages repository.
9. Deploy the Apps Script V4.3.0 source as a new web-app version.
10. Open the GitHub PWA on a test phone, install it, select the correct traveler,
    and tap **Enable Notifications**.
11. In Trip Settings use **Send a push notification** to send a test.

## Admin notification composer

Justin can send to:
- Everyone
- Adults only
- Specific travelers

Each subscribed browser/device is associated with its Traveler ID using OneSignal
External ID, so a traveler may subscribe on more than one device.

## Security

The OneSignal App ID is public and may be sent to the browser.
The OneSignal App API key is secret:
- it is never stored in GitHub,
- never returned to the browser,
- and is stored in Apps Script Script Properties.

## Deployment

Apps Script:
- push `Apps_Script_Portal`
- Deploy → Manage deployments → Edit → New version → Deploy
- run Setup / Repair once because V4.3.0 adds Trip settings for PWA URL / OneSignal App ID

PWA:
- replace the files in the GitHub Pages `Vacation-Portal` repository with `PWA_Host`
- commit and wait for GitHub Pages to publish

Chrome extension:
- no update required


## V4.3.1 — sticky navigation / modal stacking fix

- fixes the section navigation appearing on top of Bedroom Planner dialogs
- raises the global modal layer above the sticky navigation
- applies to Bedroom Planner, rental detail, voting, comment, traveler, and all other portal dialogs
- sticky navigation remains visible during ordinary page scrolling
- toast messages remain above modal content


## V4.3.2 — persistent Rental filters

- Rental filters and sort selection no longer reset when a rental action causes the page to render again
- current filters are held in client state and localStorage
- filters survive Vote, Favorite, View Details, Bedroom Planner, admin edits, live-data refreshes, and returning to Rentals
- the current sort mode is also preserved
- Clear Filters intentionally resets the entire filter/sort state


## V4.3.3 — OneSignal App ID save fix

- fixes Trip Settings silently ignoring OneSignal App ID
- saveTripSettings now persists OneSignal App ID to the Trip settings sheet
- validates the App ID as a UUID before replacing a working value
- a blank submitted App ID will not erase an already-configured App ID
- adds a UI reminder that the public App ID belongs in Trip Settings while
  the secret App API Key belongs in the Google Sheet menu


## V4.3.4 — traveler device notifications
- adds App & Notifications directly to Traveler Info for the currently selected traveler
- shows whether this device has notification permission
- provides Add / Install App and Enable Notifications actions
- iPhone users are directed to install/open the Home Screen PWA before permission is requested
- initializes OneSignal on demand and logs in with the selected Traveler ID
- re-links the Traveler ID after permission is granted so targeted sends can match the subscription
- other traveler profiles cannot accidentally register the current device


## V4.3.5 — OneSignal same-origin fix
- fixes the OneSignal origin error from V4.3.4
- Apps Script iframe no longer loads or initializes OneSignal
- Traveler Info delegates notification enable/status requests to the GitHub PWA parent
- GitHub Pages performs OneSignal init, permission, subscription, and Traveler ID login
- result/status is returned to Traveler Info with postMessage


## V4.3.6 — notification enable hang fix

- fixes Enable Notifications getting stuck at "Enabling…"
- initializes OneSignalDeferred before the OneSignal SDK script loads
- keeps a persistent OneSignal client after initialization
- notification actions no longer depend on a second deferred callback firing
- OneSignal initialization now has a 10-second timeout and returns a useful error state
- Traveler Info also has a 12-second safety timeout so the button can never remain stuck indefinitely
- OneSignal service worker path is now absolute under /Vacation-Portal/


## V4.3.7 — notification timeout diagnostics + service-worker path correction

- corrects OneSignal serviceWorkerPath to the documented no-leading-slash form
  for the GitHub Pages project site
- keeps registration scope at /Vacation-Portal/push/onesignal/
- PWA host now acknowledges notification commands immediately
- Apps Script no longer reports a generic timeout if the host received the request
- adds PWA host release handshake so stale/cached GitHub shells can be identified
- final notification status includes the active PWA host release


## V4.3.8 — robust PWA host bridge

- fixes notification command timeouts caused by strict iframe parent/source assumptions
- Apps Script sends bridge messages to both parent and top ancestors
- GitHub PWA accepts Vacation Portal messages without requiring an exact iframe source
- GitHub PWA announces Host Ready repeatedly after load
- Apps Script Traveler Info now shows PWA Host connected + host version
- Enable Notifications stays disabled until the host handshake succeeds
- notification acknowledgements/results are broadcast back to embedded frames


## V4.3.9 — notification setup without iframe messaging

- removes postMessage/iframe bridge as a requirement for notification registration
- Traveler Info opens a top-level GitHub PWA notification-setup route
- Traveler ID, traveler name, and public OneSignal App ID are passed only for that setup launch
- GitHub PWA captures those values and removes them from the visible URL
- the PWA displays its own Enable Notifications button at the GitHub origin
- the final permission request therefore comes from a direct user gesture in the installed PWA
- this bypasses Google Apps Script's nested/sandboxed iframe behavior entirely


## V4.3.10 — direct notification setup hash route
- fixes notification setup appearing to refresh without opening the setup dialog
- uses a URL hash instead of query parameters for the top-level PWA notification route
- GitHub PWA decodes the traveler/App ID payload locally, removes the hash, and opens the setup dialog
- permission request still occurs directly on the GitHub Pages origin


## V4.3.11 — top-level PWA notification control

- stops trying to navigate out of the Google Apps Script iframe from Traveler Info
- Traveler Info now explains exactly where to enable notifications
- PWA shell has a persistent, high-z-index 🔔 Enable Notifications button at top-right
- PWA button runs directly on the GitHub Pages origin registered with OneSignal
- notification permission workflow no longer depends on iframe navigation or postMessage


## V4.3.12 — mobile notification UI reset
- removes the intrusive App Installed pill
- replaces the large floating Notifications control with a compact bell
- stops automatic setup/install popups
- puts public OneSignal App ID directly in PWA config: fac4d46d-ba5b-4755-b5b1-8740f59c3b1d
- PWA can initialize OneSignal without waiting for iframe-delivered App ID


## V4.3.14 — remembered traveler profile per device

- first visit on a device shows Who are you? and requires a traveler selection
- selected Traveler ID is stored in localStorage as the device traveler profile
- future launches automatically use that traveler without asking again
- removed the every-refresh Are you X? verification prompt
- new/unknown devices never default to the first traveler/Justin
- if the saved traveler no longer exists, the device profile is cleared and chooser reopens
- changing Planning As now requires deliberate confirmation before replacing the saved device profile
- switching to Justin gets an explicit Admin Profile warning because Justin-only developer/admin tools become available

## V4.3.15 — simplified mobile navigation
- desktop navigation remains unchanged
- mobile presents Dashboard and More instead of the full section button row
- More opens a touch-friendly section chooser
- Justin-only Travelers and Trip Settings remain hidden from other travelers

## V4.3.16 — mobile navigation correction
- fixes Dashboard / More appearing above traveler chooser
- fixes More button JavaScript errors
- hides the actual #mainNav row on phones
- uses navigate(), isJustinCurrentTraveler_(), and real portal view IDs


## V4.3.17 — App Setup moved into mobile More menu

- mobile Dashboard no longer shows the Put the trip on your phone / App setup card
- More menu now includes 📲 Install App
- tapping Install App opens the existing PWA installation/setup workflow
- desktop Dashboard keeps the existing App Setup card
- no notification, install, or PWA behavior was otherwise changed


## V4.3.18 — shared-device traveler profiles

- separates the saved device traveler from the currently active traveler
- changing Planning As now offers Use temporarily or Make default on this device
- temporary switching never overwrites the saved device traveler
- a visible Return to <saved traveler> button appears while using a temporary profile
- first-time traveler selection still becomes the saved/default profile
- making a new default requires a second confirmation
- Justin receives a stronger Admin Profile warning for temporary use
- saving Justin as the permanent default receives a second admin-specific warning
- temporary traveler state is intentionally not stored in localStorage, so a fresh
  app/page launch returns to the saved device traveler

## V4.3.19 — traveler onboarding
- first browser visit shows a dedicated Vacation Portal welcome/install screen
- installed PWA skips onboarding and opens the portal directly
- iPhone gets concise Safari → Share → Add to Home Screen instructions
- compatible Android browsers get an Install Vacation App action
- Continue in Browser remains available
- package includes a shareable QR code and traveler install text


## V4.3.20 — consistent traveler chooser identity

- Who are you? now always renders two lines for every traveler
- line 1: Traveler Name
- line 2: Family
- if Family is blank, an em dash placeholder keeps card spacing consistent
- no other traveler/profile behavior changed


## V4.3.21 — traveler Family / Group mapping correction

- fixes Who are you? cards showing family data for only some travelers
- traveler editor stores Family / group in the canonical Group field
- chooser now reads Group first and legacy Family second
- keeps the two-line Traveler Name + Family / group layout from V4.3.20

## V4.3.22 — durable saved traveler profile
- fixes installed app asking Who are you? every launch
- saved/default traveler is persisted in GitHub PWA shell localStorage
- Apps Script asks PWA shell for saved profile before showing chooser
- first-time selection and Make default save to both storage layers
- temporary traveler use does not overwrite durable saved profile


## V4.3.23 — reinforced device-profile persistence

- fixes saved traveler still being lost after force-closing the installed PWA
- permanent traveler ID now rides on the existing vacation-portal-context channel,
  the same bridge already proven to work for OneSignal traveler identity
- GitHub PWA persists savedTravelerId whenever context arrives
- GitHub PWA re-sends the durable profile after the embedded Apps Script iframe
  finishes loading, when the receiver is guaranteed to exist
- migrates the existing OneSignal traveler context into the durable profile once
  when no durable profile exists yet
- startup waits slightly longer before deciding a device has no saved traveler
- temporary traveler switches remain excluded from savedTravelerId


## V4.3.24 — deterministic device traveler restore

- fixes saved traveler still not restoring after force-close on iPhone
- GitHub PWA now reads its durable device profile before creating the Apps Script iframe
- saved Traveler ID/name are appended directly to the iframe launch URL
- Apps Script reads that launch identity synchronously before portal startup
- restore no longer depends on postMessage timing
- existing postMessage/profile sync remains as a fallback and for future changes
- temporary traveler switching is still excluded from the permanent saved profile


## V4.3.25 — server-backed device traveler identity

- replaces cross-frame/localStorage-only restore with a deterministic device ID mapping
- GitHub PWA creates one stable random Device ID and stores it on the installed app origin
- Device ID is appended to every Apps Script iframe launch
- Apps Script doGet receives that Device ID server-side
- first-time/default traveler choice is saved in Script Properties as Device ID → Traveler ID
- startup data looks up that mapping and returns the saved traveler before Who are you? is shown
- shared startup cache never contains device-specific identity
- temporary traveler switching does not update the server device binding
- Make default on this device and first-time selection do update the binding


## V4.3.26 — Justin Voting Summary

Trip Settings now includes a Justin-only Voting Summary with:
- Traveler name / family
- current-round rentals voted for vs eligible rentals
- each traveler's current top three rentals by their own vote score
- Final-round First Choice is used as the first tie-break priority
- installed mobile/PWA status and installed-device count
- manual Refresh button
- responsive card layout on mobile

PWA device bindings now record whether the device was actually launched in
standalone/installed mode, so the summary can distinguish Installed from merely
Browser/device linked.


## V4.3.27 — automatic device-profile commit

- choosing a traveler on the first Who are you? screen now immediately commits
  that traveler as the saved/default device profile
- no Traveler Info → Save Settings step is required
- the permanent profile is written to local storage, PWA host storage, and the
  server-backed Device ID mapping automatically
- host/server persistence is retried at 250ms, 900ms, and 2200ms to survive
  mobile iframe/load timing
- Make default on this device uses the same automatic commit path
- editing your own saved traveler later automatically refreshes the stored
  device profile, but editing is no longer necessary to establish it

## V4.3.28 — 1-2-3 verified device save modal
- first-time traveler selection now opens a non-dismissible 1, 2, 3 second save modal
- the modal remains visible while local/PWA/server device profile writes occur
- server-backed Device ID → Traveler ID save now returns explicit confirmation
- save retries run during the countdown
- after three seconds the modal closes only when the server has confirmed the binding
- if confirmation is still missing, the modal stays open and offers Try Again
- Make default on this device uses the same verified save workflow


## V4.3.29 — installed-app status correction
- fixes Voting Summary showing Browser/device linked but Not installed while the
  traveler is visibly using the installed Home Screen PWA
- GitHub PWA host now reports its live standalone/install state in every
  host-ready message
- Apps Script immediately upgrades the current Device ID binding to
  pwaInstalled=true when the host confirms standalone mode
- notification acknowledgements/results also carry installed state as a fallback
- avoids relying solely on the initial iframe query-string install flag


## V4.3.30 — mobile voting dialog layout fix

- fixes vote-reason checkboxes inheriting mobile form width:100%
- prevents reason text from being pushed outside the modal
- mobile voting dialog uses full-screen width/height
- keeps 1–5 rating choices in a compact five-column row
- hides redundant rating descriptions on narrow screens
- reason choices use compact two-column cards (one column on very narrow phones)
- Cancel / Save Rating no longer use the generic sticky footer that covered content
- final-round #1 choice checkbox is also explicitly sized for mobile
