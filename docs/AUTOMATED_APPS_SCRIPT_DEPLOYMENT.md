# Automated Apps Script deployment

The production Apps Script project is deployed automatically after a commit lands on `main` and the full `Authorization Contract` workflow passes.

The workflow performs the same steps that previously had to be done by hand:

1. check out the exact `main` commit;
2. create the local `.clasp.json` project binding at runtime;
3. restore clasp OAuth credentials from a GitHub Actions secret;
4. run `clasp status` so the push scope is visible in the job log;
5. run `clasp push --force`;
6. resolve the existing production Web App deployment ID from `config.js`;
7. update that existing deployment in place so the `/exec` URL does not change.

## One-time GitHub setup

Create these **repository Actions secrets** in GitHub under:

`Settings -> Secrets and variables -> Actions -> New repository secret`

### `APPS_SCRIPT_ID`

Use the `scriptId` from the local `.clasp.json` that is already connected to the bound Apps Script project.

PowerShell:

```powershell
Get-Content .clasp.json
```

Do not commit `.clasp.json` and do not paste the Script ID into issues, PR comments, or chat.

### `CLASPRC_JSON`

Use the complete contents of the local clasp OAuth file for the Google account that owns/manages the Apps Script project.

PowerShell:

```powershell
Get-Content "$HOME\.clasprc.json" -Raw | Set-Clipboard
```

macOS/Linux:

```bash
cat "$HOME/.clasprc.json"
```

Paste the JSON directly into the GitHub secret value. This file contains OAuth credentials and must never be committed or shared in chat.

If local `clasp push` is not already working, run `clasp login` locally first and complete Google's authorization flow, then populate the secret from the resulting `.clasprc.json`.

## Normal release flow

After the two secrets are configured:

1. open a PR;
2. wait for the contract suite to pass;
3. merge the PR into `main`;
4. GitHub Actions reruns the full contract suite on the exact merge commit;
5. only if that run passes, GitHub automatically pushes the source to Apps Script and updates the existing production deployment.

No manual `clasp push` and no manual `Deploy -> Manage deployments -> New version` step should be required for normal releases.

## Manual redeploy

The workflow also supports `workflow_dispatch`. In GitHub Actions, open **Authorization Contract**, choose **Run workflow**, select `main`, and run it. After the tests pass, it redeploys the current `main` commit.

## Safety rules

- Deployment never runs for pull-request code.
- Deployment only runs from `main` after the full contract suite succeeds.
- The existing production deployment ID is reused, so the public `/exec` URL remains stable.
- `.clasp.json` and `.clasprc.json` are ignored by Git.
- `.claspignore` continues to exclude the GitHub Pages `index.html` from Apps Script pushes.
- The workflow pins `@google/clasp` to a known version instead of using an unbounded latest release.

## If deployment fails

Check the `Deploy Apps Script production` job. Common causes are:

- missing `APPS_SCRIPT_ID` or `CLASPRC_JSON` secret;
- revoked/expired Google OAuth authorization;
- the Apps Script API being disabled for the Google account;
- the production `portalUrl` in `config.js` no longer matching an existing deployment.

If OAuth access is revoked, run `clasp login` locally again and replace the `CLASPRC_JSON` GitHub secret with the newly generated file contents.
