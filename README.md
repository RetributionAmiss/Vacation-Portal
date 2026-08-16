# Family Vacation Portal — PWA Host

This folder is the installable Progressive Web App shell for Portal V4.0.0.

## What it does

- provides the Web App Manifest required for the installable PWA shell
- provides 192px, 512px, and maskable app icons
- registers a service worker for the static application shell
- launches the existing Google Apps Script portal full-screen inside the PWA
- keeps the current Google Sheet and Apps Script backend unchanged
- shows an offline notice when live trip data cannot be reached

## Configure

Open `config.js` and replace:

    PASTE_CURRENT_APPS_SCRIPT_EXEC_URL_HERE

with the current deployed Apps Script `/exec` URL.

## Host

Publish this entire folder on an HTTPS static host. The files must remain together.

After it is hosted, open the hosted PWA URL on the phone and install/add it to the
home screen. The PWA host becomes the installable app address while the Apps Script
exec URL continues to provide the existing portal.

## Important

The service worker caches the PWA shell only. Live vacation data still comes from
Google Apps Script and therefore requires an internet connection.

This wrapper is intentionally separated from Apps Script because Apps Script HTML
Service runs in a sandboxed iframe and Content Service responses redirect to a
one-time googleusercontent.com URL. A same-origin static host is the reliable place
for the manifest/service-worker layer.
