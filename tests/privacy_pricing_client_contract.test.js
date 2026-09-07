'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const raw=fs.readFileSync(path.join(root,'Client_Privacy_Pricing_Integration.html'),'utf8');
const source=raw.replace(/^\s*<script>\s*/,'').replace(/\s*<\/script>\s*$/,'');
const index=fs.readFileSync(path.join(root,'AppsScriptIndex.html'),'utf8');

new Function(source);

let organizer=false;
const pricing={
  cabinId:'CAB-1',
  configured:true,
  rentalTotal:1000,
  includedExtras:200,
  splitTotal:1200,
  adult:{
    rows:[
      {travelerId:'A',travelerName:'Alex',base:500,amount:400,capped:true,extra:0,weighted:false,policyAdjusted:true},
      {travelerId:'B',travelerName:'Blair',base:700,amount:800,capped:false,extra:100,weighted:true,policyAdjusted:true}
    ],
    unresolved:0,total:1200,covered:1200
  },
  adultRentalOnly:{
    rows:[
      {travelerId:'A',travelerName:'Alex',base:450,amount:400,capped:true,extra:0,weighted:false,policyAdjusted:true},
      {travelerId:'B',travelerName:'Blair',base:550,amount:600,capped:false,extra:50,weighted:true,policyAdjusted:true}
    ],
    unresolved:0,total:1000,covered:1000
  },
  bedroom:{rows:[],unresolved:1200,total:1200,covered:0},
  bedroomRentalOnly:{rows:[],unresolved:1000,total:1000,covered:0}
};

const sandbox={
  Object,Array,String,Number,Boolean,Math,JSON,Date,Error,isFinite,
  cappedAdultSplit_:function(){return {legacy:true};},
  cappedBedroomSplit_:function(){return {legacy:true};},
  rentalPricingPrimary_:function(){return {legacy:true};},
  rentalBedroomSharingBreakout_:function(){return 'legacy';},
  rentalCurrentAssignmentBreakout_:function(){return 'legacy';},
  openCapPricingBreakdown_:function(){return 'legacy';},
  privacyOrganizerRowsPresent_:function(){return organizer;},
  privacyCloneSplit_:function(split){return JSON.parse(JSON.stringify(split));},
  privacyPricingEntry_:function(){return pricing;},
  rentalCostBasis_:function(){return 1200;},
  pricingTotal_:function(cabin,state){return state&&state.includeExtras===false?1000:1200;},
  money:function(value){return '$'+Number(value||0).toFixed(2);},
  includedBudgetExtrasTotal_:function(){return 200;},
  activeAdultTravelers_:function(){return [{},{},];},
  rentalPricingState_:function(){return {mode:'adult',includeExtras:true};},
  bedroomCountForPricing_:function(){return 2;},
  assignedBedroomForTraveler_:function(){return null;},
  capSplitRowHtml_:function(){return '<div></div>';},
  displayName:function(){return 'Cabin';},
  esc:function(value){return String(value||'');},
  openModal:function(){},
  toast:function(){},
  currentTravelerId:'A',
  DATA:{assignments:[],cabins:[{'Cabin ID':'CAB-1','Total Rental Cost':1000,bedrooms:[]}]}
};

vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'Client_Privacy_Pricing_Integration.html'});

const cabin={'Cabin ID':'CAB-1','Total Rental Cost':1000,bedrooms:[]};
let split=sandbox.cappedAdultSplit_(cabin);
assert.strictEqual(split.total,1200,'default participant split must use the exact server-derived full total');
assert.strictEqual(split.rows[0].amount,400);
assert.strictEqual(split.rows[1].amount,800);

split=sandbox.cappedAdultSplit_(cabin,1000);
assert.strictEqual(split.total,1000,'shared-extras-off must use the separately derived rental-only split');
assert.strictEqual(split.rows[0].amount,400,'fixed organizer caps must not be linearly scaled');
assert.strictEqual(split.rows[1].amount,600,'redistribution must be recalculated server-side for rental-only totals');

split=sandbox.cappedAdultSplit_(cabin,1100);
assert.strictEqual(split.privacyPending,true,'unsupported totals must not be approximated from private policy data');
assert.strictEqual(split.rows.length,0,'unsupported totals should wait for an exact source instead of showing invented shares');

const primary=sandbox.rentalPricingPrimary_(cabin,{mode:'adult',includeExtras:false});
assert.strictEqual(primary.value,400);
assert(!/100%|cost\s*%|cap\s*\$/i.test(primary.note),'participant pricing note must not reconstruct or imply missing raw policy values');

organizer=true;
split=sandbox.cappedAdultSplit_(cabin,1000);
assert.strictEqual(split.legacy,true,'authorized organizer UI must continue to use the original exact client calculation with organizer DTOs');

assert(!/privacyScaleSplit_|const\s+factor\s*=/.test(source),'final participant pricing layer must not linearly scale capped allocations');
assert(!/row\.costPercent|row\.cap\b|row\.payMore/.test(source),'participant pricing layer must not render raw organizer pricing fields');
assert(/adultRentalOnly/.test(source)&&/bedroomRentalOnly/.test(source),'client must consume separately derived rental-only variants');

const base=index.indexOf("include('Client_Privacy_Integration')");
const exact=index.indexOf("include('Client_Privacy_Pricing_Integration')");
assert(base>=0&&exact>base,'exact participant pricing layer must load after the base privacy integration');

console.log('privacy_pricing_client_contract.test.js: PASS');
