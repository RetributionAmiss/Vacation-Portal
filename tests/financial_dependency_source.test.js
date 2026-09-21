'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const contract=require('../payments-budget-contract.js');
const source=fs.readFileSync(path.join(root,'PaymentsBudgetRead.gs'),'utf8');
const plan={'Booking Plan ID':'BOOK-A','Cabin ID':'CABIN-A','Booking Traveler IDs':'TRV-001','Agency Name':'Agency','Booking Total':100,'Split Basis':'Adult','Notes':'','Created At':'2026-09-01T00:00:00.000Z','Updated At':'2026-09-01T00:00:00.000Z'};
const share={'Share ID':'SHARE-A','Cabin ID':'CABIN-A','Traveler ID':'TRV-001','Split Basis':'Adult','Source Total':100,'Calculated Share':100,'Adjusted Share':100,'Notes':'','Created At':'2026-09-01T00:00:00.000Z','Updated At':'2026-09-01T00:00:00.000Z'};
const schedule={'Schedule ID':'DUE-A','Cabin ID':'CABIN-A','Label':'Deposit','Due Date':'2026-10-01','Amount Due':100,'Expected Payer Traveler ID':'TRV-001','Recipient Type':'Agency','Recipient Traveler ID':'','Recipient Name':'Agency','Notes':'','Created At':'2026-09-01T00:00:00.000Z','Updated At':'2026-09-01T00:00:00.000Z'};
function fixture({rental='CABIN-A',missing='',extra=false,wrong=false}={}){
 let locks=0,reads=0,writes=0;
 const ctx={
  Date,
  PaymentsBudgetContract:contract,
  finalizedRentalFocusId_:()=>rental,
  withPortalMutationLock_:fn=>{locks++;return fn();},
  getSpreadsheet_:()=>({getSheetByName:name=>name===missing?null:{}}),
  buildPaymentData_:()=>{reads++;return {plans:[{...plan,...(extra?{Unexpected:'private'}:{})}],shares:[{...share}],schedule:[{...schedule,'Cabin ID':wrong?'CABIN-B':'CABIN-A'}],payments:[{Secret:'must not leak'}]};},
  filterPaymentDataForFinalRental_:data=>data,
  readSheet_:()=>{writes++;throw Error('unnecessary_sheet_read');}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,stats:()=>({locks,reads,writes})};
}
let f=fixture();let result=vm.runInContext('getFinancialDependencyShadowSource()',f.ctx);
assert.equal(result.finalizedRentalId,'CABIN-A');
assert.equal(result.plans.length,1);assert.equal(result.shares.length,1);assert.equal(result.schedule.length,1);
assert(!('payments' in result)&&!('budget' in result)&&!JSON.stringify(result).includes('must not leak'));
assert(Number.isFinite(Date.parse(result.serverTime)));assert.deepEqual(f.stats(),{locks:1,reads:1,writes:0});
for(const [options,code] of [
 [{rental:''},'FINALIZED_RENTAL_REQUIRED'],
 [{missing:'Payment Shares'},'FINANCIAL_DEPENDENCY_SOURCE_MISSING'],
 [{extra:true},'UNSUPPORTED_FINANCIAL_DEPENDENCY_COLUMN'],
 [{wrong:true},'FINANCIAL_DEPENDENCY_WRONG_RENTAL']
]){
 f=fixture(options);
 assert.throws(()=>vm.runInContext('getFinancialDependencyShadowSource()',f.ctx),e=>e.message===code);
 assert.equal(f.stats().locks,1,'Every read must hold mutation lock');
 assert.equal(f.stats().writes,0,'Read-only source must not issue a write');
}
assert(!/\.getPaymentShadowSource\s*\(/.test(source),'Source must not depend on a second payment read');
console.log('PASS: fixed finalized-rental dependency source is locked, persisted-only, scoped, allowlisted, and read-only.');
