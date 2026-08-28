'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const index = read('AppsScriptIndex.html');
const styles = read('Styles_UI_Foundation.html');
const client = read('Client_UI_Foundation.html');
const organizerSummary = read('OrganizerSummary.gs');

assert(
  index.includes("include('Styles_UI_Foundation')"),
  'AppsScriptIndex.html must load Styles_UI_Foundation.'
);
assert(
  index.includes("include('Client_UI_Foundation')"),
  'AppsScriptIndex.html must load Client_UI_Foundation.'
);
assert(
  styles.includes('.main-nav') && styles.includes('border-radius:var(--ui-nav-radius)'),
  'Desktop navigation must use the softened UI foundation radius.'
);
assert(
  styles.includes('.mobile-simple-nav') && styles.includes('border-radius:14px'),
  'Mobile navigation must use softened corners.'
);
assert(
  styles.includes('.rental-admin-actions') && styles.includes('--ui-organizer-border'),
  'Rental Organizer actions must be visually separated.'
);
assert(
  client.includes("label.textContent='🔒 Organizer tools'"),
  'Visible rental administration copy must say Organizer tools.'
);
assert(
  client.includes('Vacation Portal → Set organizer access key'),
  'Organizer authorization guidance must point to the bound Google Sheet menu.'
);
assert(
  client.includes("eyebrow.textContent='ORGANIZER PROFILE'"),
  'Organizer profile UI must not present the administrative role as an Admin profile.'
);
assert(
  organizerSummary.includes("cabin.Nickname || cabin['Cabin Name']"),
  'Organizer vote summary must prioritize rental nicknames.'
);
assert(
  organizerSummary.includes('nickname: cabin ? cabinName_(cabin) : cabinId') &&
    organizerSummary.includes('cabinId: cabinId'),
  'Organizer vote summary must expose both the rental nickname/name and rental ID.'
);

console.log('PASS UI foundation contracts');
