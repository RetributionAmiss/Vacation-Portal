'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const workflow = read('.github/workflows/authorization-contract.yml');
const deploymentVerifier = read('scripts/verify_apps_script_webapp.mjs');
const gitignore = read('.gitignore');
const claspignore = read('.claspignore');
const config = read('config.js');
const manifest = JSON.parse(read('appsscript.json'));

assert(
  /push:\s*[\s\S]*branches:\s*[\s\S]*- main/.test(workflow),
  'Authorization Contract must run after commits land on main.'
);

assert(
  workflow.includes('deploy-apps-script:') &&
    workflow.includes('needs: authorization-contract') &&
    workflow.includes("github.ref == 'refs/heads/main'") &&
    workflow.includes("github.event_name == 'push'"),
  'Production Apps Script deployment must run only from main after the contract suite succeeds.'
);

assert(
  workflow.includes('secrets.APPS_SCRIPT_ID') &&
    workflow.includes('secrets.CLASPRC_JSON'),
  'Deployment must load the Apps Script project identity and clasp OAuth data from GitHub Actions secrets.'
);

assert(
  workflow.includes("$HOME/.clasprc.json") &&
    workflow.includes("'.clasp.json'") &&
    workflow.includes('JSON.stringify({ scriptId: process.env.APPS_SCRIPT_ID'),
  'Deployment must construct local clasp configuration at runtime rather than commit credentials.'
);

assert(
  manifest.webapp &&
    manifest.webapp.access === 'ANYONE_ANONYMOUS' &&
    manifest.webapp.executeAs === 'USER_DEPLOYING',
  'Apps Script manifest must preserve anonymous family access and deployer execution identity.'
);

assert(
  workflow.includes('Verify web app manifest') &&
    workflow.includes("manifest.webapp.access !== 'ANYONE_ANONYMOUS'") &&
    workflow.includes("manifest.webapp.executeAs !== 'USER_DEPLOYING'"),
  'Deployment must fail before clasp push if the web-app manifest configuration is missing or changed.'
);

assert(
  deploymentVerifier.includes("entry.entryPointType==='WEB_APP'") &&
    deploymentVerifier.includes("config.access!=='ANYONE_ANONYMOUS'") &&
    deploymentVerifier.includes("config.executeAs!=='USER_DEPLOYING'") &&
    deploymentVerifier.includes('script.googleapis.com/v1/projects/'),
  'Deployment verifier must inspect live Apps Script WEB_APP metadata when the persisted OAuth token is current.'
);

assert(
  deploymentVerifier.includes("@google/clasp@3.4.0','deployments'") &&
    deploymentVerifier.includes("response.status===401||response.status===403") &&
    deploymentVerifier.includes('Family Vacation Portal') &&
    deploymentVerifier.includes('Opening the family portal') &&
    deploymentVerifier.includes('configured production deployment ID is not present'),
  'When the persisted access token is stale, verification must fall back to refreshed clasp ownership plus the anonymous live portal shell rather than disabling the safety gate.'
);

const preflightIndex = workflow.indexOf('Verify current production WEB_APP entry point');
const pushIndex = workflow.indexOf('Push main to Apps Script');
const updateIndex = workflow.indexOf('Update existing web app deployment');
const postflightIndex = workflow.indexOf('Verify WEB_APP entry point survived deployment');
assert(
  preflightIndex >= 0 && pushIndex > preflightIndex && updateIndex > pushIndex && postflightIndex > updateIndex,
  'The existing WEB_APP entry point must be verified before mutation and verified again after deployment.'
);

assert(
  workflow.includes('npx --yes @google/clasp@3.4.0 push --force') &&
    workflow.includes('npx --yes @google/clasp@3.4.0 deploy') &&
    workflow.includes('-i "$APPS_SCRIPT_DEPLOYMENT_ID"'),
  'Deployment must push source and update the existing production deployment in place.'
);

assert(
  workflow.includes('config.match(/https:\\/\\/script\\.google\\.com\\/macros\\/s\\/') &&
    /portalUrl:\s*'https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec'/.test(config),
  'Production deployment ID must be resolved from the same portalUrl used by the PWA.'
);

assert(
  workflow.includes('Smoke test production web app') &&
    workflow.includes('Family Vacation Portal') &&
    workflow.includes('loadingScreen') &&
    workflow.includes('Opening the family portal') &&
    workflow.includes('Sorry, unable to open the file at this time') &&
    workflow.includes('Production Apps Script /exec URL did not return'),
  'Deployment must verify stable rendered-shell markers and diagnose the Google Drive failure page before reporting success.'
);

assert(
  gitignore.split(/\r?\n/).includes('.clasp.json') &&
    gitignore.split(/\r?\n/).includes('.clasprc.json'),
  'Local clasp project and OAuth files must never be committed.'
);

assert(
  claspignore.split(/\r?\n/).includes('index.html'),
  'GitHub Pages index.html must remain excluded from Apps Script pushes.'
);

console.log('PASS Apps Script production deployment automation + WEB_APP preservation contract');
