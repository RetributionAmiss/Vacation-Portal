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
const rooms = read('Rooms.gs');

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
  'renderRooms=function()',
  'renderNativeBedroomPlanner_',
  'nativeBedroomDropZone_',
  'nativeBedroomTravelerChip_',
  'moveBedroomTraveler_',
  'nativeBedroomDrop_',
  'bedroomPlannerDraftOriginalSignature_',
  'syncBedroomPlannerDraftDirty_',
  'Save bedroom layout',
  'Clear Travelers',
  'Remove all Bedrooms',
  'showBedroomPlannerExitPrompt_',
  'Save &amp; continue',
  "navigate=function(view)",
  "changeRoomPlannerCabin=function(cabinId)",
  "window.addEventListener('beforeunload'"
].forEach((signature) => {
  assert(client.includes(signature), `Missing native bedroom planner behavior: ${signature}`);
});

assert(
  !client.includes("openBulkRoomAssignmentPlanner_('${cabinId}')") &&
    !client.includes('Assign travelers'),
  'The Room Planner must not require the separate Assign travelers window.'
);

assert(
  client.includes("roomAssignmentDraft_[travelerId]=String(bedroomId||'')") &&
    client.includes('render();'),
  'Traveler moves must update the local room draft immediately.'
);

assert(
  client.includes('.saveRoomAssignmentsBatch(cabinId,payload)') &&
    !client.includes('.saveAssignment(') &&
    !client.includes('.removeAssignment('),
  'Traveler moves must persist only through the explicit whole-layout save, never per move.'
);

assert(
  client.includes('withBedroomDraftAssignments_') &&
    client.includes('renderTravelerCostSummary_(cabinId)'),
  'Room cost summaries must render from the unsaved bedroom draft.'
);

assert(
  rooms.includes('function removeAllBedrooms(cabinId)') &&
    rooms.includes('clearRoomAssignmentsForCabin_(cabinId)') &&
    rooms.includes("replaceCabinBedrooms_(cabinId, [])") &&
    rooms.includes("'Bedrooms': 0"),
  'Remove all Bedrooms must clear bedroom cards, traveler assignments, and the cabin bedroom count together.'
);

assert(
  styles.includes('.bedroom-native-toolbar') &&
    styles.includes('.native-bedroom-traveler') &&
    styles.includes('.native-bedroom-savebar') &&
    styles.includes('position:sticky'),
  'Native Room Planner controls must stay compact and keep save state/actions reachable.'
);

console.log('PASS bedroom planner native draft contracts');
