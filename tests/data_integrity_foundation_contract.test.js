const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'DataIntegrity.gs'),'utf8');

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

assert.strictEqual(sandbox.portalMoneyToCents_(12.34),1234);
assert.strictEqual(sandbox.portalMoneyToCents_('$1,234.56'),123456);
assert.strictEqual(sandbox.portalMoneyToCents_(0.1+0.2),30);
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

assert(/DATA_CONFLICT/.test(source),'conflict errors must have a stable machine-readable prefix');
assert(/LockService\.getScriptLock/.test(source),'critical mutations must have a centralized ScriptLock helper');
assert(/CacheService\.getScriptCache/.test(source),'idempotent mutation results must use a bounded server cache');

console.log('data_integrity_foundation_contract.test.js: PASS');
