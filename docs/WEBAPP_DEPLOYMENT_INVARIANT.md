# Apps Script web app deployment invariant

The production Apps Script project is deployed as the backend iframe for the GitHub Pages PWA.

Automated deployments must preserve the `webapp` block in `appsscript.json`:

- `access: ANYONE_ANONYMOUS`
- `executeAs: USER_DEPLOYING`

`clasp push --force` replaces the project manifest. If the `webapp` block is missing, a subsequent deployment can still report success while the `/exec` URL no longer has a web-app entry point. The user-facing symptom is a Google Drive page saying the file cannot be opened.

The production workflow therefore validates the manifest before pushing and performs an HTTP smoke test against the existing `/exec` URL after deployment. A deployment is not considered successful until that URL returns the Family Vacation Portal shell.
