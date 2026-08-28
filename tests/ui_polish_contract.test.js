'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const index = read('AppsScriptIndex.html');
const styles = read('Styles_Polish.html');
const client = read('Client_Polish.html');

assert(
  index.includes("include('Styles_Polish')") &&
    index.includes("include('Client_Polish')"),
  'Final polish styles and client behavior must be loaded by AppsScriptIndex.'
);

assert(
  styles.includes(':focus-visible') &&
    styles.includes('--ui-focus-ring') &&
    styles.includes('@media(pointer:coarse)'),
  'Polish styles must provide keyboard focus visibility and coarse-pointer tap targets.'
);

assert(
  styles.includes('@media(prefers-reduced-motion:reduce)') &&
    styles.includes('animation-duration:.01ms!important'),
  'Polish styles must honor reduced-motion preferences.'
);

assert(
  styles.includes('max-height:calc(100dvh - 20px)') &&
    styles.includes('.form-actions') &&
    styles.includes('position:sticky'),
  'Mobile modals must stay within the dynamic viewport and keep actions reachable.'
);

const source = client
  .replace(/^\s*<script>\s*/, '')
  .replace(/\s*<\/script>\s*$/, '');
new Function(source);

[
  "panel.setAttribute('role','dialog')",
  "panel.setAttribute('aria-modal','true')",
  "closeButton.setAttribute('aria-label','Close dialog')",
  "event.key==='Escape'",
  "event.key!=='Tab'",
  'modalReturnFocus_',
  "button.setAttribute('aria-current','page')",
  "header.setAttribute('role','button')",
  "header.setAttribute('tabindex','0')"
].forEach((signature) => {
  assert(client.includes(signature), `Missing accessibility behavior: ${signature}`);
});

assert(
  client.includes("title:'No meals planned yet'") &&
    client.includes("title:'The grocery list is empty'") &&
    client.includes("title:'No activities scheduled yet'") &&
    client.includes("title:'No budget items yet'"),
  'Planner empty states must be contextual instead of generic.'
);

assert(
  client.includes("loading.setAttribute('role','status')") &&
    client.includes("toastElement.setAttribute('aria-live','polite')"),
  'Loading and toast feedback must be announced to assistive technology.'
);

console.log('PASS final UI polish and accessibility contracts');
