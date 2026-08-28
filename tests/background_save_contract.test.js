const fs = require('fs');
const path = require('path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const index = read('AppsScriptIndex.html');
const client = read('Client_Background_Save.html');
const styles = read('Styles_Background_Save.html');

assert(
  index.includes("include('Styles_Background_Save')") &&
    index.includes("include('Client_Background_Save')"),
  'Background save style/client includes must be loaded by AppsScriptIndex.html.'
);

[
  'beginBackgroundSave_',
  'completeBackgroundSave_',
  'failBackgroundSave_',
  'renderBackgroundSaveStatus_',
  'isLatestBackgroundSave_'
].forEach((name) => {
  assert(client.includes(name), `Missing background save manager function ${name}.`);
});

assert(
  client.includes('Request captured') && client.includes('keep editing or navigate'),
  'Pending-save UI must explicitly tell the traveler the request was captured and navigation can continue.'
);

[
  'savePlannerForm=function',
  'saveRoomForm=function',
  'savePastedBedroomLayout_=function',
  'saveBulkRoomAssignments_=function',
  'saveTravelerForm=function',
  'saveCabinForm=function',
  'saveCommentForm=function',
  'saveVoteForm=function'
].forEach((signature) => {
  assert(client.includes(signature), `Missing non-blocking save override: ${signature}`);
});

const runMapMatch = client.match(/const BACKGROUND_RUN_FUNCTIONS_=\{([\s\S]*?)\};/);
assert(runMapMatch, 'Missing BACKGROUND_RUN_FUNCTIONS_ map.');
const runMap = runMapMatch[1];

assert(runMap.includes('saveTripSettings'), 'Trip settings must use the background save manager.');
assert(runMap.includes('saveFinalists'), 'Save finalists must use the background save manager.');

[
  'startFinalVoting',
  'closeFinalVoting',
  'reopenFinalVoting',
  'restartPreliminaryVoting',
  'resetPlanningPortalToGathering'
].forEach((dangerousAction) => {
  assert(
    !runMap.includes(dangerousAction),
    `${dangerousAction} must remain a confirmed state transition, not a background save.`
  );
});

assert(
  styles.includes('.background-save-status.is-success') &&
    styles.includes('.background-save-status.is-error'),
  'Background save status needs distinct success and failure states.'
);

console.log('PASS unified background save UX contracts');
