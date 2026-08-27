# Vacation Portal deployment runbook

## Mandatory deployment header

Before any deployment or synchronization step, identify all three values:

- **Version**
- **GitHub branch**
- **Target environment**

Example:

> VERSION: V4.4.0 Alpha2  
> BRANCH: `v4.4.0-alpha2-deployment-structure`  
> TARGET: TEST Apps Script  
> PRODUCTION: DO NOT TOUCH

## Current production baseline

- Version: V4.4.0 Alpha1
- GitHub source: `main`
- Production Apps Script is a separate project with separate Script Properties.
- Production should not receive development-branch code before TEST verification.

## Repository boundary

### Apps Script runtime

Clasp may deploy only:

- `*.gs`
- `appsscript.json`
- `Portal_Index.html`
- `Styles.html`
- `Client_*.html`

`App.gs` renders `Portal_Index`.

### GitHub Pages / PWA host

These remain on GitHub Pages and must never be pushed to Apps Script:

- `index.html`
- `config.js`
- `manifest.webmanifest`
- `service-worker.js`
- app icons
- `push/**`

Development/test files such as `tests/**`, `docs/**`, and `.github/**` are also excluded from clasp.

## Why Portal_Index exists

The previous repository contained both `Index.html` and `index.html`. Windows uses a case-insensitive filesystem, so the two paths collided and could cause the PWA shell to overwrite the Apps Script template during checkout/copy/deployment.

V4.4.0 Alpha2 removes that ambiguity:

- Apps Script: `Portal_Index.html`
- GitHub Pages: `index.html`

Never recreate a root `Index.html`.

## Safe clasp workflow

1. Check out the exact development branch.
2. Verify the target Apps Script project before pushing.
3. Run `clasp show-file-status`.
4. Confirm only the allow-listed Apps Script runtime files appear.
5. Push to TEST first.
6. Deploy a TEST web-app version.
7. Run smoke tests.
8. Only after review/merge should a production deployment be considered.

Never copy Script Properties between TEST and production. Organizer access keys and other secrets are configured independently in each Apps Script project.
