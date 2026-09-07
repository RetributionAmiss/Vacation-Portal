'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'PortalPrivacy.gs'), 'utf8');

const sandbox = {Object, Array, String};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, {filename: 'PortalPrivacy.gs'});

const traveler = {
  'Traveler ID': 'TRAV-1',
  'Name': 'Alex Example',
  'Email': 'alex@example.com',
  'Group': 'Family A',
  'Traveler Type': 'Adult',
  'Parent/Guardian ID': '',
  'Adults': 1,
  'Children': 0,
  'Price Cap': 1250,
  'Cost %': 80,
  'Pay More': 'Yes',
  'Willing to Share Room': 'Yes',
  'Home Location': 'Knoxville, TN',
  'Notes': 'Private note',
  'Active': 'Yes',
  'Future Sensitive Column': 'must not leak',
  parentName: ''
};

const shared = sandbox.serializeSharedTraveler_(traveler);
assert.strictEqual(shared['Traveler ID'], 'TRAV-1');
assert.strictEqual(shared.Name, 'Alex Example');
assert.strictEqual(shared['Willing to Share Room'], 'Yes');
[
  'Email',
  'Home Location',
  'Notes',
  'Price Cap',
  'Cost %',
  'Pay More',
  'Future Sensitive Column'
].forEach((field) => {
  assert(!Object.prototype.hasOwnProperty.call(shared, field), `${field} must not appear in shared traveler DTOs`);
});

const privateProfile = sandbox.serializeTravelerPrivateProfile_(traveler);
assert.strictEqual(privateProfile.Email, 'alex@example.com');
assert.strictEqual(privateProfile['Home Location'], 'Knoxville, TN');
assert.strictEqual(privateProfile.Notes, 'Private note');
['Price Cap', 'Cost %', 'Pay More', 'Future Sensitive Column'].forEach((field) => {
  assert(!Object.prototype.hasOwnProperty.call(privateProfile, field), `${field} must not appear in traveler-private DTOs`);
});

const organizer = sandbox.serializeOrganizerTraveler_(traveler);
assert.strictEqual(organizer['Price Cap'], 1250);
assert.strictEqual(organizer['Cost %'], 80);
assert.strictEqual(organizer['Pay More'], 'Yes');
assert(!Object.prototype.hasOwnProperty.call(organizer, 'Future Sensitive Column'), 'Organizer DTOs must still use an allowlist');

const secondTraveler = Object.assign({}, traveler, {
  'Traveler ID': 'TRAV-2',
  'Name': 'Blair Example',
  'Email': 'blair@example.com'
});

const participantPayload = sandbox.buildTravelerPrivacyPayload_([traveler, secondTraveler], 'TRAV-1', false);
assert.strictEqual(participantPayload.travelers.length, 2);
assert.strictEqual(participantPayload.travelerPrivate.Email, 'alex@example.com');
assert.strictEqual(participantPayload.organizerTravelers.length, 0);
assert(!participantPayload.travelers.some((row) => Object.prototype.hasOwnProperty.call(row, 'Email')), 'Shared traveler list must never contain email addresses');

const organizerPayload = sandbox.buildTravelerPrivacyPayload_([traveler, secondTraveler], 'TRAV-1', true);
assert.strictEqual(organizerPayload.organizerTravelers.length, 2);
assert.strictEqual(organizerPayload.organizerTravelers[1].Email, 'blair@example.com');
assert.strictEqual(organizerPayload.organizerTravelers[1]['Cost %'], 80);

assert(/PORTAL_SHARED_TRAVELER_FIELDS_/.test(source), 'Shared traveler fields must be explicitly allowlisted');
assert(/PORTAL_PRIVATE_TRAVELER_FIELDS_/.test(source), 'Traveler-private fields must be explicitly allowlisted');
assert(/PORTAL_ORGANIZER_TRAVELER_FIELDS_/.test(source), 'Organizer-only traveler fields must be explicitly allowlisted');

console.log('privacy_trust_boundaries_contract.test.js: PASS');
