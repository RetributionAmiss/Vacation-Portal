# Vacation Portal engineering rules

## Production baseline

The current production baseline is V4.4.0 Alpha1 on `main`. V4.4.0 Alpha2 work must occur on a named development branch and must be verified against a test Apps Script deployment before production changes.

## Authorization invariants

- Never authorize an organizer/admin action from traveler name, Traveler ID, `Planning As`, hidden UI state, or PWA Device ID alone.
- Every organizer-only server mutation or organizer-only data endpoint must call the centralized `assertOrganizer_()` / `assertOrganizerFromValues_()` boundary.
- Client-side Justin checks are presentation only. They are never security controls.
- Organizer sessions are server-issued, time-limited bearer tokens backed by Script Properties. Do not persist the organizer access key itself.
- Changing `Planning As` to Justin must never create organizer authorization.
- A temporary traveler switch must never overwrite the permanent device traveler binding.
- Generic server helpers that accept arbitrary sheet names or ID headers must remain private (trailing underscore). Public planner APIs must use allow-listed planner names.
- Traveler self-service and traveler administration are separate concerns. Creating/deleting travelers and changing administrative cost/type/parent/active fields require organizer authorization.
- Device IDs identify an app/browser instance; they are not organizer credentials.
- A Device ID binding is convenience identity, not strong traveler authentication. Do not claim that it prevents a malicious caller from impersonating another normal traveler unless a separate traveler authentication mechanism has been added.
- No Justin/admin functionality may rely solely on client-side visibility, `Planning As` state, traveler name, caller-supplied Traveler ID, or Device ID.

## Sensitive configuration

Never commit organizer access keys, OneSignal API keys, Gemini API keys, Apify tokens, Chrome extension submission secrets, session tokens, or other secrets. Secrets belong in Apps Script Script Properties.

## Change discipline

- Do not alter voting math, room-cost math, pricing, mobile layout, or PWA behavior as a side effect of security work.
- Prefer focused branches and pull requests.
- Add regression tests for security boundaries and high-risk calculations before refactoring them.
- Do not merge stabilization branches directly to `main`; use a pull request and manual verification.


## Deployment targets and file separation

Every deployment instruction must explicitly identify the **version**, **GitHub branch**, and **target environment** (TEST Apps Script, PRODUCTION Apps Script, or GitHub Pages/PWA) before any file is changed or pushed.

- `main` is the source of the currently approved production release. Do not develop directly on `main`.
- Apps Script runtime files are the `.gs` files plus the capital-I `Index.html`, `Styles.html`, and `Client_*.html` includes.
- GitHub Pages/PWA host files include the lowercase `index.html`, `config.js`, `manifest.webmanifest`, `service-worker.js`, icons, and push-worker assets.
- Never deploy the lowercase GitHub Pages `index.html` to Apps Script as `Index.html`.
- Windows uses a case-insensitive filesystem, so a working tree containing both `Index.html` and `index.html` is unsafe for direct clasp deployment.
- Do not run `clasp push --force` against production from a mixed repository checkout containing both PWA and Apps Script host files.
- Production Script Properties are project-specific. Test/Alpha Script Properties do not configure production.
- Organizer access keys must be configured in the target Apps Script project using the authorized setup flow; never copy plaintext keys or assume a test-project configuration applies to production.
