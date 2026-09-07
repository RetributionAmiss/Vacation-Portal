'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'PortalPricingPrivacy.gs'),'utf8');
const sandbox={Object,Array,String,Number,Boolean,Math,JSON,Date,Error,isFinite};
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'PortalPricingPrivacy.gs'});

function money(value){
  return Math.round(Math.max(0,Number(value||0))*100)/100;
}

function priceCap(traveler){
  return Math.max(0,Number(traveler&&traveler['Price Cap']||0));
}

function costPercent(traveler){
  if(!traveler) return 100;
  const raw=traveler['Cost %'];
  if(raw===''||raw===null||raw===undefined) return 100;
  const value=Number(raw);
  if(!isFinite(value)) return 100;
  return Math.max(0,Math.min(100,value));
}

function payMore(traveler){
  return String(traveler&&traveler['Pay More']||'No')==='Yes';
}

function activeAdults(travelers){
  return travelers.filter(function(traveler){
    return String(traveler.Active||'Yes').toLowerCase()!=='no' &&
      String(traveler['Traveler Type']||'Adult')==='Adult';
  });
}

function legacyRedistribute(baseRows,totalCost){
  const epsilon=.005;
  const rows=baseRows.map(function(row){
    const traveler=row.traveler;
    const cap=priceCap(traveler);
    const base=Math.max(0,Number(row.base||0));
    const capped=cap>0&&base>cap;
    return {
      travelerId:traveler['Traveler ID'],
      travelerName:traveler.Name||'Traveler',
      base:base,
      amount:capped?cap:base,
      capped:capped,
      extra:0,
      cap:cap,
      payMore:payMore(traveler),
      costPercent:costPercent(traveler)
    };
  });

  let remainder=Math.max(0,Number(totalCost||0)-rows.reduce(function(sum,row){return sum+row.amount;},0));
  let safety=0;
  while(remainder>epsilon&&safety<50){
    safety++;
    const eligible=rows.filter(function(row){
      if(!row.payMore) return false;
      if(row.cap<=0) return true;
      return row.amount<row.cap-epsilon;
    });
    if(!eligible.length) break;

    const equalExtra=remainder/eligible.length;
    let distributed=0;
    eligible.forEach(function(row){
      const capacity=row.cap>0?Math.max(0,row.cap-row.amount):equalExtra;
      const add=row.cap>0?Math.min(equalExtra,capacity):equalExtra;
      row.amount+=add;
      row.extra+=add;
      distributed+=add;
    });
    if(distributed<=epsilon) break;
    remainder=Math.max(0,remainder-distributed);
  }

  return {rows:rows,unresolved:remainder,total:Number(totalCost||0),covered:Number(totalCost||0)-remainder};
}

function legacyAdultSplit(travelers,total){
  const adults=activeAdults(travelers);
  if(!adults.length||!total) return {rows:[],unresolved:0,total:total,covered:0};

  let totalWeight=adults.reduce(function(sum,traveler){return sum+costPercent(traveler)/100;},0);
  if(totalWeight<=0) totalWeight=adults.length;
  const unit=total/totalWeight;

  return legacyRedistribute(adults.map(function(traveler){
    const weight=costPercent(traveler)/100;
    return {
      traveler:traveler,
      base:totalWeight===adults.length&&weight===0?unit:unit*weight
    };
  }),total);
}

function legacyBedroomSplit(travelers,cabin,assignments,total){
  const adults=activeAdults(travelers);
  const bedrooms=cabin&&cabin.bedrooms||[];
  const bedroomCount=bedrooms.length||Number(cabin&&cabin.Bedrooms||0);
  if(!adults.length||!total||!bedroomCount){
    return {rows:[],unresolved:total||0,total:total,covered:0};
  }

  const roomShare=total/bedroomCount;
  const adultAssignmentMap={};
  assignments.filter(function(a){return a['Cabin ID']===cabin['Cabin ID'];}).forEach(function(a){
    const traveler=adults.find(function(t){return t['Traveler ID']===a['Traveler ID'];});
    if(traveler) adultAssignmentMap[a['Traveler ID']]=a['Bedroom ID'];
  });

  const baseByTraveler={};
  adults.forEach(function(traveler){baseByTraveler[traveler['Traveler ID']]=0;});

  const bedroomIds=bedrooms.length
    ? bedrooms.map(function(room){return room['Bedroom ID'];})
    : Array.from({length:bedroomCount},function(_,i){return 'ROOM-'+i;});

  bedroomIds.forEach(function(bedroomId){
    const roomAdults=adults.filter(function(traveler){
      return adultAssignmentMap[traveler['Traveler ID']]===bedroomId;
    });
    if(!roomAdults.length) return;

    let roomWeight=roomAdults.reduce(function(sum,traveler){return sum+costPercent(traveler)/100;},0);
    if(roomWeight<=0) roomWeight=roomAdults.length;

    roomAdults.forEach(function(traveler){
      const weight=costPercent(traveler)/100;
      baseByTraveler[traveler['Traveler ID']]+=roomShare*(
        roomWeight===roomAdults.length&&weight===0
          ? 1/roomAdults.length
          : weight/roomWeight
      );
    });
  });

  return legacyRedistribute(adults.map(function(traveler){
    return {traveler:traveler,base:Number(baseByTraveler[traveler['Traveler ID']]||0)};
  }),total);
}

function closeEnough(actual,expected,label){
  assert(Math.abs(Number(actual||0)-Number(expected||0))<=.011,label+': expected '+expected+', got '+actual);
}

function compareSplit(actual,expected,label){
  assert(actual,label+' missing');
  const expectedById={};
  expected.rows.forEach(function(row){expectedById[row.travelerId]=row;});
  assert.strictEqual(actual.rows.length,expected.rows.length,label+' traveler count changed');

  actual.rows.forEach(function(row){
    const prior=expectedById[row.travelerId];
    assert(prior,label+' returned unexpected traveler '+row.travelerId);
    closeEnough(row.base,money(prior.base),label+' '+row.travelerId+' base');
    closeEnough(row.amount,money(prior.amount),label+' '+row.travelerId+' amount');
    closeEnough(row.extra,money(prior.extra),label+' '+row.travelerId+' extra');
    assert.strictEqual(Boolean(row.capped),Boolean(prior.capped),label+' '+row.travelerId+' cap outcome changed');

    ['cap','costPercent','payMore','traveler','Price Cap','Cost %','Pay More'].forEach(function(field){
      assert(!Object.prototype.hasOwnProperty.call(row,field),label+' leaked private policy field '+field);
    });
  });

  closeEnough(actual.unresolved,money(expected.unresolved),label+' unresolved');
  closeEnough(actual.total,money(expected.total),label+' total');
  closeEnough(actual.covered,money(expected.covered),label+' covered');
}

const travelers=[
  {'Traveler ID':'A',Name:'Alex','Traveler Type':'Adult',Active:'Yes','Price Cap':400,'Cost %':100,'Pay More':'No'},
  {'Traveler ID':'B',Name:'Blair','Traveler Type':'Adult',Active:'Yes','Price Cap':0,'Cost %':75,'Pay More':'Yes'},
  {'Traveler ID':'C',Name:'Casey','Traveler Type':'Adult',Active:'Yes','Price Cap':350,'Cost %':50,'Pay More':'No'},
  {'Traveler ID':'D',Name:'Devon','Traveler Type':'Adult',Active:'Yes','Price Cap':0,'Cost %':25,'Pay More':'Yes'},
  {'Traveler ID':'K',Name:'Kid','Traveler Type':'Child',Active:'Yes','Price Cap':1,'Cost %':1,'Pay More':'Yes'}
];

const cabin={
  'Cabin ID':'CAB-1','Total Rental Cost':1000,Bedrooms:3,
  bedrooms:[
    {'Bedroom ID':'BED-1','Cabin ID':'CAB-1'},
    {'Bedroom ID':'BED-2','Cabin ID':'CAB-1'},
    {'Bedroom ID':'BED-3','Cabin ID':'CAB-1'}
  ]
};
const assignments=[
  {'Cabin ID':'CAB-1','Bedroom ID':'BED-1','Traveler ID':'A'},
  {'Cabin ID':'CAB-1','Bedroom ID':'BED-1','Traveler ID':'B'},
  {'Cabin ID':'CAB-1','Bedroom ID':'BED-2','Traveler ID':'C'}
];

compareSplit(
  sandbox.portalPricingAdultSplit_(travelers,1200),
  legacyAdultSplit(travelers,1200),
  'adult split with weights/caps/redistribution'
);
compareSplit(
  sandbox.portalPricingBedroomSplit_(travelers,cabin,assignments,1200),
  legacyBedroomSplit(travelers,cabin,assignments,1200),
  'bedroom split with empty room and unassigned adult'
);

const zeroWeightTravelers=[
  {'Traveler ID':'Z1',Name:'Zero One','Traveler Type':'Adult',Active:'Yes','Cost %':0,'Price Cap':0,'Pay More':'No'},
  {'Traveler ID':'Z2',Name:'Zero Two','Traveler Type':'Adult',Active:'Yes','Cost %':0,'Price Cap':0,'Pay More':'No'}
];
compareSplit(
  sandbox.portalPricingAdultSplit_(zeroWeightTravelers,501),
  legacyAdultSplit(zeroWeightTravelers,501),
  'all-zero weighting fallback'
);

const snapshot=sandbox.buildPortalPricingSnapshot_({
  travelers:travelers,
  cabins:[cabin],
  assignments:assignments,
  budget:[{'Budget ID':'BUD-1',Amount:200,'Include in Rental Split':'Yes'}]
});
const pricing=snapshot['CAB-1'];
assert(pricing,'pricing snapshot missing cabin');
assert.strictEqual(pricing.rentalTotal,1000);
assert.strictEqual(pricing.includedExtras,200);
assert.strictEqual(pricing.splitTotal,1200);
compareSplit(pricing.adult,legacyAdultSplit(travelers,1200),'snapshot adult incl extras');
compareSplit(pricing.bedroom,legacyBedroomSplit(travelers,cabin,assignments,1200),'snapshot bedroom incl extras');
compareSplit(pricing.adultRentalOnly,legacyAdultSplit(travelers,1000),'snapshot adult rental only');
compareSplit(pricing.bedroomRentalOnly,legacyBedroomSplit(travelers,cabin,assignments,1000),'snapshot bedroom rental only');

console.log('privacy_pricing_equivalence_contract.test.js: PASS');
