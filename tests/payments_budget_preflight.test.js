'use strict';
const assert=require('assert');
const {audit,moneyToCents,planCalculatedShareNormalization}=require('../scripts/payments_budget_preflight.cjs');
function fixture(){
  return {
    tripLegacyId:'TRIP-TEST',rentalIds:['CABIN-A','CABIN-B'],travelerIds:['TRAV-A','TRAV-B'],
    plans:[{'Booking Plan ID':'BOOK-A','Cabin ID':'CABIN-A','Booking Traveler IDs':'TRAV-B','Booking Total':'100.00','Split Basis':'Adult'}],
    shares:[{'Share ID':'SHARE-A','Cabin ID':'CABIN-A','Traveler ID':'TRAV-A','Source Total':'100','Calculated Share':'50','Adjusted Share':'50'}],
    schedule:[{'Schedule ID':'DUE-A','Cabin ID':'CABIN-A','Amount Due':'50','Expected Payer Traveler ID':'TRAV-A','Recipient Type':'Traveler','Recipient Traveler ID':'TRAV-B'}],
    payments:[{'Payment ID':'PAY-A','Cabin ID':'CABIN-A','Schedule ID':'DUE-A','Paid By Traveler ID':'TRAV-A','Paid To Type':'Traveler','Paid To Traveler ID':'TRAV-B','Amount':'10.01'}],
    budget:[{'Budget ID':'BUDGET-A',Amount:'0.10','Paid By':'Legacy free text','Split Method':'Legacy method','Date':40000}]
  };
}
function has(snapshot,code){return audit(snapshot).issues.some(i=>i.code===code);}
const input=fixture(),original=JSON.stringify(input),result=audit(input);
assert(result.sourceChecksPassed);
assert.strictEqual(result.readyForCutover,false);
assert.strictEqual(result.totalsCents.payments.Amount,'1001');
assert.strictEqual(JSON.stringify(input),original,'Audit must never mutate source values.');
assert.strictEqual(moneyToCents('0.29'),29n);
assert.strictEqual(moneyToCents('92233720368547758.07'),9223372036854775807n);
for(const value of ['10.075',0.1+0.2,'','NaN','1e3','-1','1,000',Infinity,NaN,'92233720368547758.08']){
  assert.throws(()=>moneyToCents(value));
}
let s=fixture();delete s.budget;assert(has(s,'incomplete_snapshot'));
s=fixture();s.shares.push({...s.shares[0]});assert(has(s,'duplicate_stable_id'));assert(has(s,'duplicate_traveler_share'));
s=fixture();s.shares[0]['Share ID']='LOCAL-A';assert(has(s,'invalid_stable_id'));
s=fixture();s.payments[0]['Cabin ID']='CABIN-B';assert(has(s,'invalid_schedule_link'));
s=fixture();s.payments[0]['Schedule ID']='DUE-NOTFOUND';assert(has(s,'invalid_schedule_link'));
s=fixture();s.payments[0]['Paid To Traveler ID']='TRAV-UNKNOWN';assert(has(s,'unresolved_traveler'));
s=fixture();s.payments[0]['Confirmed By Traveler ID']='TRAV-UNKNOWN';assert(has(s,'unresolved_traveler'));
s=fixture();s.plans[0]['Booking Traveler IDs']='TRAV-B,TRAV-B';assert(has(s,'duplicate_booking_traveler'));
s=fixture();s.plans.push({...s.plans[0],'Booking Plan ID':'BOOK-B'});assert(has(s,'duplicate_rental_plan'));
s=fixture();s.shares[0]['Calculated Share']='12.3456';const fractional=audit(s);
assert(has(s,'invalid_money_precision'));assert.strictEqual(fractional.totalsComplete.shares['Calculated Share'],false);
s=fixture();s.payments[0]['Amount']='bogus';assert(has(s,'invalid_money_precision'));
s=fixture();s.payments[0]['Paid To Type']='Anything';assert(has(s,'invalid_recipient_type'));
s=fixture();s.payments.push(null);assert(has(s,'invalid_row'));
assert.strictEqual(audit({}).sourceChecksPassed,false);
assert.throws(()=>audit(null));
console.log('PASS Payments/Budget source preflight: precision, stable IDs, relationships, non-mutation and cutover lock.');

s=fixture();s.shares[0]['Calculated Share']=12.3456;
const snapshotBefore=JSON.stringify(s),plan=planCalculatedShareNormalization(s);
assert.strictEqual(JSON.stringify(s),snapshotBefore);
assert.strictEqual(plan.preservation[0].sourceValue,12.3456);
assert.strictEqual(plan.preservation[0].normalizedCents,'1235');
assert.strictEqual(plan.normalized.shares[0]['Calculated Share'],'12.35');
assert.strictEqual(plan.normalized.shares[0]['Adjusted Share'],'50');
assert.strictEqual(plan.applied,false);
assert(audit(plan.normalized).sourceChecksPassed);
s.shares[0]['Calculated Share']='not money';assert.throws(()=>planCalculatedShareNormalization(s));
console.log('PASS explicit calculated-share normalization plan preserves source and adjusted amounts.');

const fs=require('fs'),path=require('path'),vm=require('vm');
const integrity=fs.readFileSync(path.join(__dirname,'../DataIntegrity.gs'),'utf8');
const from=integrity.indexOf('function portalMoneyToCents_(');
const to=integrity.indexOf('function portalCentsToMoney_(',from);
assert(from>=0&&to>from);
const existing=vm.createContext({});
vm.runInContext(integrity.slice(from,to),existing);
for(const value of [10.075,1.005,12.3456,99.9999,0.001,100.555]){
  const f=fixture();f.shares[0]['Calculated Share']=value;
  const proposed=planCalculatedShareNormalization(f);
  assert.strictEqual(proposed.preservation[0].normalizedCents,String(existing.portalMoneyToCents_(value)));
}
console.log('PASS normalization equivalence against current DataIntegrity.gs implementation.');
