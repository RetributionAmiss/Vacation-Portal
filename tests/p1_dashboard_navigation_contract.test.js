'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const index = read('AppsScriptIndex.html');
const client = read('Client_P1_Dashboard_Navigation.html');
const styles = read('Styles_P1_Dashboard_Navigation.html');

assert(
  index.includes("include('Styles_P1_Dashboard_Navigation')") &&
    index.includes("include('Client_P1_Dashboard_Navigation')"),
  'P1 dashboard/navigation layers must be loaded by the Apps Script index.'
);

const js = client
  .replace(/^\s*<script>\s*/, '')
  .replace(/\s*<\/script>\s*$/, '');
assert.doesNotThrow(() => new Function(js), 'P1 client layer must parse.');

[
  "{id:'home',label:'Home'",
  "{id:'rental',label:'Rental'",
  "{id:'stay',label:'Stay'",
  "{id:'plan',label:'Plan'",
  "{id:'money',label:'Money'",
  "{id:'organizer',label:'Organizer'"
].forEach((needle) => {
  assert(client.includes(needle), `Missing grouped navigation area: ${needle}`);
});

assert(
  client.includes("grid-template-columns:repeat(5") === false,
  'Layout CSS should stay in the P1 style layer rather than client JS.'
);

assert(
  client.includes("p1NavigateView_('dashboard')") &&
    client.includes("p1NavigateView_('rentals')") &&
    client.includes("p1NavigateGroup_('plan')") &&
    client.includes("p1NavigateView_('payments')") &&
    client.includes('openMobileSectionMenu_()'),
  'Mobile primary navigation must expose Home, Rental, Plan, Payments, and More.'
);

assert(
  client.includes('Here is what needs your attention next.') &&
    client.includes('p1TripCountdown_') &&
    client.includes('p1VotingAction_') &&
    client.includes('p1PaymentAction_') &&
    client.includes('p1RoomAction_') &&
    client.includes('p1GroceryAction_'),
  'Dashboard must provide a personalized trip countdown and actionable traveler tasks.'
);

assert(
  client.includes("loadPaymentData_(false)") &&
    client.includes("currentView!=='dashboard'") &&
    client.includes('paymentState_.loaded'),
  'Dashboard payment status must load lazily without blocking startup.'
);

assert(
  client.includes("html.replace(/\\s*<div class=\"release-banner\">") &&
    client.includes("if(view==='travelers'||view==='settings') return p1OrganizerUi_();"),
  'Traveler-facing P1 UI must hide release chrome and preserve Organizer-only navigation.'
);

assert(
  styles.includes('.p1-dashboard-command-center') &&
    styles.includes('.p1-action-grid') &&
    styles.includes('.p1-primary-nav') &&
    styles.includes('.p1-secondary-nav') &&
    styles.includes('.p1-mobile-nav') &&
    styles.includes('grid-template-columns:repeat(5,minmax(0,1fr))') &&
    styles.includes('@media(max-width:650px)'),
  'P1 navigation and dashboard must have responsive desktop/mobile styling.'
);

console.log('PASS P1 personalized dashboard and grouped navigation contracts');
