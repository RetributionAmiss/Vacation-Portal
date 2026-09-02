'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const index = read('AppsScriptIndex.html');
const theme = read('Styles_Midnight_Gold_Command_Center.html');

assert(
  index.includes('<meta name="theme-color" content="#080c16">') &&
    index.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'),
  'Apps Script shell must use the Midnight Gold browser/PWA chrome colors.'
);

const mobileContainment = index.indexOf("include('Styles_P3_Mobile_Containment')");
const midnightGold = index.indexOf("include('Styles_Midnight_Gold_Command_Center')");
assert(
  mobileContainment >= 0 && midnightGold > mobileContainment,
  'Midnight Gold must load after existing feature/mobile styles as the final visual theme layer.'
);

[
  '--bg:#080c16',
  '--surface:#121827',
  '--surface2:#191f31',
  '--ink:#f7f5ef',
  '--muted:#9fa7b5',
  '--gold:#d8b565',
  '--gold-soft:#f1d892',
  '--line:#2a3141',
  'color-scheme:dark',
  '.p1-dashboard-command-center',
  '.p1-primary-nav-button.active',
  '.p1-action-card',
  '.mobile-simple-nav',
  '.modal-panel',
  '.live-notification'
].forEach((needle) => {
  assert(theme.includes(needle), `Missing Midnight Gold visual contract: ${needle}`);
});

assert(
  theme.includes('radial-gradient(circle at 85% 0%,rgba(216,181,101,.08),transparent 28%)') &&
    theme.includes('linear-gradient(160deg,#070b13,#0b1020 55%,#080c16)'),
  'Portal background must preserve the Midnight Gold command-center treatment.'
);

[
  'grid-template-columns',
  'display:none',
  'visibility:hidden',
  '<script',
  'google.script.run'
].forEach((needle) => {
  assert(!theme.includes(needle), `Theme layer must remain visual-only and not alter portal behavior/layout: ${needle}`);
});

console.log('PASS Midnight Gold Command Center visual theme contract');
