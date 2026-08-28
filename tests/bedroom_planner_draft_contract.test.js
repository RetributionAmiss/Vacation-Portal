'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const index = read('AppsScriptIndex.html');
const styles = read('Styles_Bedroom_Draft.html');
const client = read('Client_Bedroom_Draft.html');

assert(
  index.includes("include('Styles_Bedroom_Draft')") &&
    index.includes("include('Client_Bedroom_Draft')"),
  'Bedroom planner draft styles and client behavior must be loaded by AppsScriptIndex.'
);

const source = client
  .replace(/^\s*<script>\s*/, '')
  .replace(/\s*<\/script>\s*$/, '');
new Function(source);

[
  'bedroomPlannerDraftOriginalSignature_',
  'syncBedroomPlannerDraftDirty_',
  "roomAssignmentDraft_[travelerId]=bedroomId||''",
  "Save bedroom layout",
  'requestBedroomPlannerExit_',
  'saveBedroomPlannerDraftAndExit_',
  'discardBedroomPlannerDraftAndExit_',
  'resumeBedroomPlanner_',
  "window.addEventListener('beforeunload'"
].forEach((signature) => {
  assert(client.includes(signature), `Missing bedroom planner draft behavior: ${signature}`);
});

assert(
  client.includes('saveBulkRoomAssignmentsBeforeBedroomDraft_') &&
    !client.includes('.saveRoomAssignmentsBatch('),
  'Draft movement code must delegate to the existing explicit batch save and must not save directly on each move.'
);

assert(
  client.includes('removeRoomAssignment=function(id)') &&
    client.includes("roomAssignmentDraft_[assignment['Traveler ID']]=''"),
  'Removing a traveler from a room must stage the change in the bedroom draft instead of saving immediately.'
);

assert(
  client.includes("closeModal=function()") &&
    client.includes("navigate=function(view)") &&
    client.includes('Save &amp; exit'),
  'Closing or navigating away with bedroom draft changes must show an explicit save/discard decision.'
);

assert(
  styles.includes('.bedroom-draft-status') &&
    styles.includes('.bedroom-exit-confirm') &&
    styles.includes('.bulk-room-planner-footer') &&
    styles.includes('position:sticky'),
  'Bedroom planner must visibly show draft state and keep save/exit controls reachable.'
);

console.log('PASS bedroom planner draft contracts');
