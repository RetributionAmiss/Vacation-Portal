'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const workflow = read('.github/workflows/authorization-contract.yml');
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
    workflow.includes('secrets.CLASPRC_JSON') &&
    workflow.includes("'$HOME/.clasprc.json'") === false,
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
  'Apps Script manifest must preserve the production web-app entry point, anonymous family access, and deployer execution identity.'
);

assert(
  workflow.includes('Verify web app manifest') &&
    workflow.includes("manifest.webapp.access !== 'ANYONE_ANONYMOUS'") &&
    workflow.includes("manifest.webapp.executeAs !== 'USER_DEPLOYING'"),
  'Deployment must fail before clasp push if the web-app manifest entry point is missing or changed.'
);

assert(
  workflow.includes('npx --yes @google/clasp@3.4.0 push --force') &&
    workflow.includes('npx --yes @google/clasp@3.4.0 deploy') &&
    workflow.includes('-i "$APPS_SCRIPT_DEPLOYMENT_ID"'),
  'Deployment must push source and update the existing production web-app deployment in place.'
);

assert(
  workflow.includes('config.match(/https:\\/\\/script\\.google\\.com\\/macros\\/s\\/') &&
    /portalUrl:\s*'https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec'/.test(config),
  'Production deployment ID must be resolved from the same public portalUrl used by the PWA.'
);

assert(
  workflow.includes('Smoke test production web app') &&
    workflow.includes('curl -LfsS') &&
    workflow.includes('<meta name="application-name" content="Family Vacation Portal">') &&
    workflow.includes('Production Apps Script /exec URL did not return'),
  'Deployment must verify that the production /exec URL actually serves the portal shell before reporting success.'
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

console.log('PASS Apps Script production deployment automation contract');
