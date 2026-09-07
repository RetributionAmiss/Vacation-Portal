'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const index = read('AppsScriptIndex.html');
const theme = read('Styles_Midnight_Gold_Command_Center.html');
const contrast = read('Styles_Midnight_Gold_Feature_Contrast.html');
const rentalContrast = read('Styles_Midnight_Gold_Rental_Contrast.html');

assert(
  index.includes('<meta name="theme-color" content="#080c16">') &&
    index.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'),
  'Apps Script shell must use the Midnight Gold browser/PWA chrome colors.'
);

const mobileContainment = index.indexOf("include('Styles_P3_Mobile_Containment')");
const midnightGold = index.indexOf("include('Styles_Midnight_Gold_Command_Center')");
const featureContrast = index.indexOf("include('Styles_Midnight_Gold_Feature_Contrast')");
const rentalContrastIndex = index.indexOf("include('Styles_Midnight_Gold_Rental_Contrast')");
assert(
  mobileContainment >= 0 &&
    midnightGold > mobileContainment &&
    featureContrast > midnightGold &&
    rentalContrastIndex > featureContrast,
  'Midnight Gold contrast layers must load after existing feature/mobile styles in final override order.'
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

[
  '.winner-rental-panel',
  '.p21-final-family-summary',
  '.p3-travel-person',
  '.native-bedroom-traveler',
  '.traveler-cost-row',
  '.p1-money-summary-card',
  '.payment-schedule-row',
  '.payment-share-edit-row',
  '.p3-pack-item',
  '.p3p-help-card',
  '.p3-today-hero',
  '.p22-meal-calendar-shell',
  '.compare-grid',
  '.sortable-planner-table tbody tr'
].forEach((needle) => {
  assert(contrast.includes(needle), `Missing Midnight Gold feature contrast coverage: ${needle}`);
});

[
  '.rental-pricing-console',
  '.pricing-console-main>div>strong',
  '.pricing-toggle-row>label',
  '.pricing-mode-switch button.active',
  '.my-rating.reviewed',
  '.family-review-progress',
  '.review-progress-track'
].forEach((needle) => {
  assert(rentalContrast.includes(needle), `Missing Midnight Gold rental contrast coverage: ${needle}`);
});

assert(
  contrast.includes('linear-gradient(135deg,#f1d892,#c89e4f)') &&
    contrast.includes('background:#121827!important') &&
    contrast.includes('color:var(--ink)!important') &&
    contrast.includes('color:var(--muted)!important'),
  'Cross-feature contrast layer must normalize dark surfaces, readable text, and selected gold controls.'
);

assert(
  rentalContrast.includes('linear-gradient(145deg,#151b2a,#101522)') &&
    rentalContrast.includes('color:var(--gold-soft)!important') &&
    rentalContrast.includes('background:#262e3e!important'),
  'Rental contrast layer must normalize pricing and review surfaces to the Midnight Gold palette.'
);

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
  assert(!contrast.includes(needle), `Feature contrast layer must remain visual-only and not alter portal behavior/layout: ${needle}`);
  assert(!rentalContrast.includes(needle), `Rental contrast layer must remain visual-only and not alter portal behavior/layout: ${needle}`);
});

console.log('PASS Midnight Gold Command Center visual theme + cross-feature + rental contrast contract');
