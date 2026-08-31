'use strict';

const assert=require('assert');
const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function scriptBody(source){return source.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');}

const server=read('FinalizedRentalFocus.gs');
const client=read('Client_Finalized_Rental_Mode.html');
const styles=read('Styles_Finalized_Rental_Mode.html');
const index=read('AppsScriptIndex.html');

assert(
  server.includes("stage === 'Voting Closed'") &&
  server.includes("closedFlag || stage === 'Voting Closed'"),
  'Finalized-rental server focus must recognize the closed voting stage as well as the stored flag.'
);
assert(
  server.includes('focusPortalPayloadToFinalRental_') &&
  server.includes("payload.cabins = filterRowsForFinalRental_") &&
  server.includes("result.schedule = filterRowsForFinalRental_") === false,
  'Finalized-rental focus must filter portal cabin payloads without introducing a second schedule model.'
);
assert(
  client.includes("stage==='Voting Closed'") &&
  client.includes('DATA.finalizedRentalOnly&&DATA.finalizedRentalId'),
  'Client finalized mode must survive both stage-based and already-focused payloads.'
);
assert(
  client.includes('visibleRentalCabins_=function()') &&
  client.includes('if(cabin) return [cabin]'),
  'Every shared rental selector must resolve to the single selected winner after finalization.'
);
assert(
  client.includes('p21-finalized-rental-view') &&
  client.includes('p21FinalResultsBanner_') &&
  client.includes('p21FamilyFinalVotingSummary_') &&
  !client.includes('Compare all 3 finalists'),
  'Final Rentals view must be winner board + final results + family voting summary with no finalist comparison action.'
);
assert(
  client.includes("html=html.replace(/<label class=\"compare-checkbox\"") &&
  !client.includes('rental-filter-toolbar'),
  'Final winner rendering must remove comparison controls and must not render the old rental filters.'
);
assert(
  client.includes("'Property to plan'") &&
  client.includes("'Rental / booking'") &&
  client.includes('p21-finalized-selector'),
  'Room Planner and Payments must replace redundant finalized-rental dropdowns with a fixed winner label.'
);
assert(
  client.includes("['plans','shares','schedule','payments']") &&
  client.includes('p21FilterExistingPaymentState_'),
  'Payment state returned by later writes must remain restricted to the final rental.'
);
assert(
  styles.includes('.p21-winning-rental-grid') &&
  styles.includes('.p21-final-family-summary') &&
  styles.includes('.p21-finalized-selector'),
  'Finalized rental view needs dedicated winner, voting summary, and fixed-selector styling.'
);
assert(
  index.includes("include('Styles_Finalized_Rental_Mode')") &&
  index.includes("include('Client_Finalized_Rental_Mode')") &&
  index.indexOf("include('Client_Finalized_Rental_Mode')") > index.indexOf("include('Client_Pricing_Branch_Polish')"),
  'Finalized rental client must load after the pricing-branch override layer.'
);

assert.doesNotThrow(function(){new Function(scriptBody(client));},'Finalized rental client layer must parse.');
console.log('PASS finalized selected-rental mode contracts');
