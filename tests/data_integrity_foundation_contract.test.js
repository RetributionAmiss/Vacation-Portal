const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'DataIntegrity.gs'),'utf8');
const paymentsSource=fs.readFileSync(path.join(root,'Payments.gs'),'utf8');
const paymentClientSource=fs.readFileSync(
  path.join(root,'Client_Payments_Optimistic.html'),
  'utf8'
);

const cache=new Map();
let locked=false;
let released=0;

const sandbox={
  console,
  Date,
  Number,
  JSON,
  Math,
  Error,
  isFinite,
  LockService:{
    getScriptLock(){
      return {
        tryLock(){
          if(locked) return false;
          locked=true;
          return true;
        },
        releaseLock(){
          locked=false;
          released+=1;
        }
      };
    }
  },
  CacheService:{
    getScriptCache(){
      return {
        get(key){return cache.has(key)?cache.get(key):null;},
        put(key,value){cache.set(key,value);}
      };
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'DataIntegrity.gs'});
vm.runInContext(paymentsSource,sandbox,{filename:'Payments.gs'});

assert.strictEqual(sandbox.portalMoneyToCents_(12.34),1234);
assert.strictEqual(sandbox.portalMoneyToCents_('$1,234.56'),123456);
assert.strictEqual(sandbox.portalMoneyToCents_(0.1+0.2),30);
assert.strictEqual(sandbox.portalMoneyToCents_(10.075),1008);
assert.strictEqual(sandbox.portalCentsToMoney_(123456),1234.56);
assert.throws(()=>sandbox.portalMoneyToCents_(-1),/cannot be negative/i);
assert.strictEqual(sandbox.portalMoneyToCents_(-1,{allowNegative:true}),-100);
assert.throws(()=>sandbox.portalMoneyToCents_('not-money'),/valid money amount/i);

assert.strictEqual(sandbox.assertExpectedVersion_('2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','Payment'),true);
assert.strictEqual(sandbox.assertExpectedVersion_('','anything','Payment'),true);
assert.throws(
  ()=>sandbox.assertExpectedVersion_('old','new','Payment'),
  /DATA_CONFLICT: Payment changed on another device/
);

assert.strictEqual(sandbox.normalizeMutationRequestId_('  abc-123 !@#  '),'abc-123');
assert.strictEqual(sandbox.portalMutationCacheKey_('payment share','req-1'),'PORTAL_MUTATION_paymentshare_req-1');

assert.strictEqual(sandbox.readMutationResult_('payment','req-1'),null);
sandbox.rememberMutationResult_('payment','req-1',{ok:true,value:42});
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(sandbox.readMutationResult_('payment','req-1'))),
  {ok:true,value:42}
);

const value=sandbox.withPortalMutationLock_(()=>42);
assert.strictEqual(value,42);
assert.strictEqual(released,1,'successful mutations must release the lock');

assert.throws(
  ()=>sandbox.withPortalMutationLock_(()=>{throw new Error('boom');}),
  /boom/
);
assert.strictEqual(released,2,'failed mutations must release the lock');

locked=true;
assert.throws(
  ()=>sandbox.withPortalMutationLock_(()=>1),
  /SAVE_BUSY/
);
locked=false;

function functionSlice(text,name,nextName){
  const start=text.indexOf('function '+name+'(');
  assert(start>=0,'missing function '+name);
  const end=nextName?text.indexOf('function '+nextName+'(',start+1):text.length;
  assert(end>start,'missing next function after '+name);
  return text.slice(start,end);
}

const replaceSharesSource=functionSlice(
  paymentsSource,
  'replacePaymentShareRows_',
  'normalizePaymentShareRows_'
);
assert(!/clearContents\s*\(/.test(replaceSharesSource),'payment shares must never clear/rewrite the whole sheet');
assert(/deleteRow\s*\(/.test(replaceSharesSource),'surplus cabin share rows must be deleted surgically');
assert(/setValues\s*\(/.test(replaceSharesSource),'replacement share rows must use targeted setValues writes');

function makeSheet(initialRows){
  const rows=initialRows.map(row=>row.slice());

  function blankRow(width){
    return Array.from({length:width},()=> '');
  }

  return {
    rows,
    getLastColumn(){return rows.length?rows[0].length:0;},
    getLastRow(){return rows.length;},
    getRange(row,column,numRows=1,numColumns=1){
      return {
        getValues(){
          const result=[];
          for(let r=0;r<numRows;r++){
            const sourceRow=rows[row-1+r]||blankRow(rows[0].length);
            result.push(sourceRow.slice(column-1,column-1+numColumns));
          }
          return result;
        },
        setValues(values){
          for(let r=0;r<values.length;r++){
            while(rows.length<row+r){
              rows.push(blankRow(rows[0].length));
            }
            const target=rows[row-1+r];
            values[r].forEach((value,c)=>{
              target[column-1+c]=value;
            });
          }
          return this;
        }
      };
    },
    deleteRow(row){
      rows.splice(row-1,1);
    }
  };
}

const headers=[
  'Share ID','Cabin ID','Traveler ID','Split Basis','Source Total',
  'Calculated Share','Adjusted Share','Notes','Created At','Updated At'
];
const preservedB=[
  'B-1','CAB-B','TRAV-B','Adult',500,500,500,'keep-b','created-b','updated-b'
];
const sheet=makeSheet([
  headers,
  ['A-1','CAB-A','TRAV-1','Adult',100,50,50,'old-a1','created-a1','updated-a1'],
  preservedB,
  ['A-2','CAB-A','TRAV-2','Adult',100,50,50,'old-a2','created-a2','updated-a2']
]);

sandbox.getSpreadsheet_=()=>({
  getSheetByName(name){
    assert.strictEqual(name,'Payment Shares');
    return sheet;
  }
});

function share(id,traveler,amount){
  return {
    'Share ID':id,
    'Cabin ID':'CAB-A',
    'Traveler ID':traveler,
    'Split Basis':'Adult',
    'Source Total':300,
    'Calculated Share':amount,
    'Adjusted Share':amount,
    'Notes':'new-'+traveler,
    'Created At':'created-'+id,
    'Updated At':'updated-'+id
  };
}

sandbox.replacePaymentShareRows_('CAB-A',[
  share('A-10','TRAV-1',100),
  share('A-20','TRAV-2',100),
  share('A-30','TRAV-3',100)
]);

let cabinARows=sheet.rows.slice(1).filter(row=>row[1]==='CAB-A');
let cabinBRows=sheet.rows.slice(1).filter(row=>row[1]==='CAB-B');
assert.strictEqual(cabinARows.length,3,'replacement must create the requested cabin share count');
assert.deepStrictEqual(cabinBRows,[preservedB],'unrelated cabin rows must remain byte-for-byte unchanged');
assert.deepStrictEqual(sheet.rows[0],headers,'header row must never be rewritten or deleted');

sandbox.replacePaymentShareRows_('CAB-A',[
  share('A-40','TRAV-4',300)
]);
cabinARows=sheet.rows.slice(1).filter(row=>row[1]==='CAB-A');
cabinBRows=sheet.rows.slice(1).filter(row=>row[1]==='CAB-B');
assert.strictEqual(cabinARows.length,1,'surplus rows must be deleted when a cabin has fewer shares');
assert.strictEqual(cabinARows[0][0],'A-40');
assert.deepStrictEqual(cabinBRows,[preservedB],'deleting surplus target rows must not alter another cabin');

sandbox.paymentTravelerMap_=()=>({
  'TRAV-1':{'Traveler ID':'TRAV-1','Traveler Type':'Adult'}
});
sandbox.uid_=prefix=>prefix+'-NEW';
const normalized=sandbox.normalizePaymentShareRows_(
  'CAB-A',
  {
    splitBasis:'Adult',
    sourceTotal:10.075,
    shares:[{
      travelerId:'TRAV-1',
      calculatedShare:3.335,
      adjustedShare:3.335,
      notes:'stable row'
    }]
  },
  [{
    'Share ID':'SHARE-EXISTING',
    'Cabin ID':'CAB-A',
    'Traveler ID':'TRAV-1',
    'Created At':'2026-01-01T00:00:00.000Z',
    'Updated At':'2026-01-02T00:00:00.000Z'
  }]
)[0];
assert.strictEqual(normalized['Share ID'],'SHARE-EXISTING','editing a traveler share must preserve its stable ID');
assert.strictEqual(normalized['Created At'],'2026-01-01T00:00:00.000Z','editing a share must preserve Created At');
assert.strictEqual(normalized['Source Total'],10.08,'share source totals must be canonicalized at integer-cent boundaries');
assert.strictEqual(normalized['Calculated Share'],3.34);
assert.strictEqual(normalized['Adjusted Share'],3.34);
assert.strictEqual(
  sandbox.paymentShareVersion_([
    {'Updated At':'2026-01-02T00:00:00.000Z'},
    {'Updated At':'2026-01-04T00:00:00.000Z'},
    {'Updated At':'2026-01-03T00:00:00.000Z'}
  ]),
  '2026-01-04T00:00:00.000Z'
);

const saveSharesSource=functionSlice(paymentsSource,'savePaymentShares','saveBookingPlan');
assert(/withPortalMutationLock_\s*\(/.test(saveSharesSource),'payment-share saves must run inside the shared mutation lock');
assert(/assertExpectedVersion_\s*\(/.test(saveSharesSource),'payment-share saves must support stale-client conflict detection');
assert(/rememberMutationResult_\s*\(/.test(saveSharesSource),'payment-share saves must support idempotent retries');

const savePlanSource=functionSlice(paymentsSource,'saveBookingPlan','paymentScheduleRecord_');
assert(/withPortalMutationLock_\s*\(/.test(savePlanSource),'booking-plan saves must share the payment mutation lock');
assert(/portalMoneyToCents_\s*\(/.test(savePlanSource),'booking totals must cross an integer-cent boundary before persistence');
assert(/existingShares/.test(savePlanSource),'booking-plan share updates must preserve stable existing share IDs');

const saveScheduleSource=functionSlice(
  paymentsSource,
  'savePaymentScheduleItem',
  'deletePaymentScheduleItem'
);
assert(/withPortalMutationLock_\s*\(/.test(saveScheduleSource),'schedule saves must use the shared payment mutation lock');
assert(/portalMoneyToCents_\s*\(/.test(saveScheduleSource),'scheduled amounts must be canonicalized through integer cents');
assert(/assertExpectedVersion_\s*\(/.test(saveScheduleSource),'schedule edits must reject stale versions');
assert(/rememberMutationResult_\s*\(/.test(saveScheduleSource),'schedule creates/updates must be idempotent by request ID');

const deleteScheduleSource=functionSlice(
  paymentsSource,
  'deletePaymentScheduleItem',
  'bookingPaymentRecord_'
);
assert(/withPortalMutationLock_\s*\(/.test(deleteScheduleSource),'schedule deletes must run under the shared lock');
assert(/assertExpectedVersion_\s*\(/.test(deleteScheduleSource),'schedule deletes must reject stale versions');

const savePaymentSource=functionSlice(
  paymentsSource,
  'saveBookingPayment',
  'deleteBookingPayment'
);
assert(/withPortalMutationLock_\s*\(/.test(savePaymentSource),'ledger saves must use the shared payment mutation lock');
assert(/portalMoneyToCents_\s*\(/.test(savePaymentSource),'ledger amounts must be canonicalized through integer cents');
assert(/assertExpectedVersion_\s*\(/.test(savePaymentSource),'payment edits must reject stale versions');
assert(/rememberMutationResult_\s*\(/.test(savePaymentSource),'payment creates/updates must be idempotent by request ID');

const deletePaymentSource=functionSlice(paymentsSource,'deleteBookingPayment',null);
assert(/withPortalMutationLock_\s*\(/.test(deletePaymentSource),'payment deletes must run under the shared lock');
assert(/assertExpectedVersion_\s*\(/.test(deletePaymentSource),'payment deletes must reject stale versions');

const prepareClientStart=paymentClientSource.indexOf('function paymentOptimisticPrepareMutation_(');
const applyClientStart=paymentClientSource.indexOf('function paymentOptimisticApply_(',prepareClientStart);
assert(prepareClientStart>=0&&applyClientStart>prepareClientStart,'payment client must prepare mutation metadata before optimistic apply');
const prepareClientSource=paymentClientSource.slice(prepareClientStart,applyClientStart);
assert(/requestId/.test(prepareClientSource)&&/paymentOptimisticId_\('REQ'\)/.test(prepareClientSource),'payment client must issue a stable request ID for every queued mutation');
assert(/expectedUpdatedAt/.test(prepareClientSource)&&/paymentOptimisticExpectedVersion_/.test(prepareClientSource),'payment client must send the server version the user edited');
assert(/earlierSameKey/.test(prepareClientSource),'same-device queued writes must avoid self-conflicting on optimistic timestamps');

const queueClientStart=paymentClientSource.indexOf('function paymentOptimisticQueueWrite_(');
const pumpClientStart=paymentClientSource.indexOf('function paymentOptimisticPump_(',queueClientStart);
const queueClientSource=paymentClientSource.slice(queueClientStart,pumpClientStart);
assert(
  queueClientSource.indexOf('paymentOptimisticPrepareMutation_')<
    queueClientSource.indexOf('paymentOptimisticApply_'),
  'request/version metadata must be captured before local optimistic state changes'
);

assert(/DATA_CONFLICT/.test(source),'conflict errors must have a stable machine-readable prefix');
assert(/LockService\.getScriptLock/.test(source),'critical mutations must have a centralized ScriptLock helper');
assert(/CacheService\.getScriptCache/.test(source),'idempotent mutation results must use a bounded server cache');

console.log('data_integrity_foundation_contract.test.js: PASS');
