'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'PortalTypes.gs'), 'utf8');
const dataSource = fs.readFileSync(path.join(__dirname, '..', 'Data.gs'), 'utf8');

function formatDate(date, timeZone, pattern) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  if (pattern === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (pattern === 'HH:mm') return `${parts.hour}:${parts.minute}`;
  return date.toISOString();
}

const sandbox = {
  console,
  Intl,
  Utilities: { formatDate },
  getSettings_: () => ({ 'Time Zone': 'America/New_York' })
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'PortalTypes.gs' });
vm.runInContext(dataSource, sandbox, { filename: 'Data.gs' });

function evaluate(expression) {
  return vm.runInContext(expression, sandbox);
}

assert.strictEqual(evaluate("portalFieldType_('Departure Date')"), 'date');
assert.strictEqual(evaluate("portalFieldType_('Arrival Time')"), 'time');
assert.strictEqual(evaluate("portalFieldType_('Updated At')"), 'datetime');
assert.strictEqual(evaluate("portalFieldType_('Amount Due')"), 'money');
assert.strictEqual(evaluate("portalFieldType_('Cost %')"), 'percentage');
assert.strictEqual(evaluate("portalFieldType_('Traveler ID')"), 'id');
assert.strictEqual(evaluate("portalFieldType_('Event URL')"), 'url');

assert.strictEqual(
  evaluate("serializeFieldValue_('Departure Date', new Date('2026-07-04T01:30:00.000Z'))"),
  '2026-07-03'
);
assert.strictEqual(
  evaluate("serializeFieldValue_('Departure Time', new Date('2026-07-04T01:30:00.000Z'))"),
  '21:30'
);
assert.strictEqual(
  evaluate("serializeFieldValue_('Created At', new Date('2026-07-04T01:30:00.000Z'))"),
  '2026-07-04T01:30:00.000Z'
);
assert.strictEqual(
  evaluate("serializeValue_(new Date('2026-07-04T01:30:00.000Z'))"),
  '2026-07-04T01:30:00.000Z'
);

assert.strictEqual(evaluate("portalNormalizeDate_('2026-10-09')"), '2026-10-09');
assert.throws(() => evaluate("portalNormalizeDate_('10/09/2026')"), /YYYY-MM-DD/);
assert.strictEqual(evaluate("portalNormalizeTime_('7:05 PM')"), '19:05');
assert.strictEqual(evaluate("portalNormalizeTime_('7:05')"), '07:05');
assert.throws(() => evaluate("portalNormalizeTime_('25:10')"), /valid time/);

assert.strictEqual(evaluate("portalNormalizePercent_('37.5%')"), 37.5);
assert.strictEqual(evaluate("portalNormalizePercent_('', {defaultValue:100})"), 100);
assert.throws(() => evaluate("portalNormalizePercent_(101)"), /0 to 100/);
assert.strictEqual(evaluate("portalNormalizeInteger_('4', {min:1,max:10})"), 4);
assert.throws(() => evaluate("portalNormalizeInteger_(4.2)"), /whole number/);

assert.strictEqual(evaluate("portalNormalizeBoolean_('Yes')"), true);
assert.strictEqual(evaluate("portalNormalizeBoolean_('off')"), false);
assert.strictEqual(evaluate("portalNormalizeEnum_('Adult', ['Adult','Child'], 'Traveler type')"), 'Adult');
assert.throws(() => evaluate("portalNormalizeEnum_('Other', ['Adult','Child'], 'Traveler type')"), /Traveler type/);
assert.strictEqual(evaluate("portalNormalizeId_('TRAV-ABC_123')"), 'TRAV-ABC_123');
assert.throws(() => evaluate("portalNormalizeId_('bad id')"), /record ID/);
assert.strictEqual(evaluate("portalNormalizeUrl_('https://example.com/a?b=1')"), 'https://example.com/a?b=1');
assert.throws(() => evaluate("portalNormalizeUrl_('javascript:alert(1)')"), /http or https/);

assert(
  /serializeFieldValue_\(header, row\[index\]\)/.test(dataSource),
  'readSheet_ must serialize Date values using their field type instead of blindly converting every Date to ISO.'
);

console.log('PASS typed data and validation contract');
