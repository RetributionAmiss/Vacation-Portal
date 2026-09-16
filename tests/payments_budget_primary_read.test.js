'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const path=require('path'),root=path.join(__dirname,'..');
const contract=require('../payments-budget-contract.js');
assert.equal(fs.readFileSync(path.join(root,'payments-budget-contract.js'),'utf8'),fs.readFileSync(path.join(root,'PaymentsBudgetContract.gs'),'utf8'),'Server/browser canonical contract must be identical.');
const iso='2026-08-30T21:25:04.861Z',later='2026-08-30T21:25:05.861Z';
function fixture(){return {plans:[{'Booking Plan ID':'BOOK-A','Cabin ID':'CABIN-A','Booking Traveler IDs':'TRV-001','Booking Total':100,'Created At':iso,'Updated At':iso}],shares:[],schedule:[],payments:[],budget:[{'Budget ID':'BUDGET-A',Description:'Food',Amount:50,'Paid By':'Everyone','Split Between':'Everyone','Include in Rental Split':'Yes'}],serverTime:iso,finalizedRentalId:'CABIN-A'};}
const original=fixture(),before=JSON.stringify(original),canonical=contract.canonical(original,'CABIN-A');
assert.equal(JSON.stringify(original),before);
let s=fixture();s.plans[0]['Booking Total']='100.00';assert.equal(contract.canonical(s,'CABIN-A'),canonical);
s=fixture();s.plans[0]['Updated At']=later;assert.notEqual(contract.canonical(s,'CABIN-A'),canonical);
s=fixture();s.budget[0].Amount=51;assert.notEqual(contract.canonical(s,'CABIN-A'),canonical);
s=fixture();s.budget[0]['Due Date']='2027-02-30';assert.throws(()=>contract.canonical(s,'CABIN-A'));
s=fixture();s.budget.push({...s.budget[0]});assert.throws(()=>contract.canonical(s,'CABIN-A'),/duplicate/);
s=fixture();s.plans[0]['Booking Total']='100.001';assert.throws(()=>contract.canonical(s,'CABIN-A'),/invalid_money/);
s=fixture();s.plans[0]['Cabin ID']='CABIN-B';assert.throws(()=>contract.canonical(s,'CABIN-A'),/wrong_rental/);
const server=vm.createContext({PaymentsBudgetContract:contract,Date,withPortalMutationLock_:f=>f(),finalizedRentalFocusId_:()=> 'CABIN-A',getSpreadsheet_:()=>({getSheetByName:()=>true}),buildPaymentData_:fixture,filterPaymentDataForFinalRental_:x=>x,readSheet_:()=>fixture().budget,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(alg,txt)=>[...crypto.createHash(alg).update(txt).digest()]}});
vm.runInContext(fs.readFileSync(path.join(root,'PaymentsBudgetRead.gs'),'utf8'),server);
const manifest=vm.runInContext('getPaymentsBudgetReadManifest()',server);
assert.equal(manifest.fingerprint,crypto.createHash('sha256').update(canonical).digest('hex'));
assert(!JSON.stringify(manifest).includes('Food'));
const hostCode=fs.readFileSync(path.join(root,'supabase-payments-budget-read-bridge.js'),'utf8').replace(/^import .*;\n/,'');
const database={trip_members:[{trip_id:'trip'}],trips:[{id:'trip',legacy_id:'TRIP-TEST'}],rentals:[{id:'rental',legacy_id:'CABIN-A'}],travelers:[{id:'person',legacy_id:'TRV-001'}],booking_plans:[{id:'plan',legacy_id:'BOOK-A',rental_id:'rental',booking_total_cents:10000,created_at:iso,updated_at:iso}],booking_plan_travelers:[{booking_plan_id:'plan',traveler_id:'person'}],payment_shares:[],payment_schedules:[],payments:[],budget_items:[{id:'budget',legacy_id:'BUDGET-A',description:'Food',amount_cents:5000,paid_by_text:'Everyone',split_between_text:'Everyone',include_in_rental_split:true}]};
function host(changes={}){
 const db={...database,...changes},queries=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){const q={table};queries.push(q);const chain={select(cols){assert(!cols.includes('source_record')&&!cols.includes('*'));return chain;},eq(k,v){q[k]=v;return chain;},is(){return chain;},limit(){return chain;},order(){return chain;},range(){return chain;},then(ok,no){return Promise.resolve({data:db[table]}).then(ok,no);}};return chain;}};
 const context=vm.createContext({window:{VACATION_PORTAL_CONFIG:{paymentsBudgetRead:{read:true,sourceTripLegacyId:'TRIP-TEST'}},VacationSupabase:client,addEventListener:()=>{}},PaymentsBudgetContract:contract,URL,TextEncoder,crypto:crypto.webcrypto,manifest});
 vm.runInContext(hostCode,context);return {context,queries,read:()=>vm.runInContext("handle({operation:'paymentsBudget.read',manifest})",context)};
}
const childCode=fs.readFileSync(path.join(root,'Client_Supabase_Payments_Budget_Read.html'),'utf8').replace(/<\/?script>/g,'');
function child(){
 const sent=[],listeners={},calls=[],timers=new Map();let timerId=0;
 const top={postMessage:x=>sent.push(x)};
 const google={script:{get run(){let ok,no;const chain={withSuccessHandler(f){ok=f;return chain;},withFailureHandler(f){no=f;return chain;},getPaymentsBudgetReadManifest(){calls.push({method:'manifest',ok,no});},getPaymentsBudgetFreshData(){calls.push({method:'fallback',ok,no});}};return chain;}}};
 const ctx=vm.createContext({window:{top,addEventListener:(n,f)=>listeners[n]=f},google,Date,Promise,setInterval:()=>{},setTimeout:f=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id),fixture:fixture()});
 vm.runInContext("let DATA={trip:{'Selected Cabin ID':'CABIN-A'},budget:fixture.budget,deferredLoaded:true};let currentView='payments';const paymentState_={...fixture,loaded:true,loading:false};const backgroundSaveState_={pending:new Map()};let originalLoads=0;let renders=0;function render(){renders++;}function loadPaymentData_(){originalLoads++;}function applyPaymentData_(data){if(Date.parse(data.serverTime)<Date.parse(paymentState_.serverTime))return false;Object.assign(paymentState_,data);return true;}",ctx);
 vm.runInContext(childCode,ctx);
 const response=(req,data,ok=true,source=top)=>listeners.message({source,data:{type:'vacation-portal-payments-budget-read-response',requestId:req.requestId,ok,data,error:ok?null:{code:data}}});
 const enable=()=>response(sent.find(x=>x.operation==='paymentsBudget.status'),{enabled:true});
 return {ctx,sent,calls,timers,response,enable,start:()=>vm.runInContext('loadPaymentData_(true)',ctx),state:()=>vm.runInContext('DATA.paymentsBudgetRead',ctx),data:()=>vm.runInContext('JSON.stringify({budget:DATA.budget,payments:paymentState_.payments})',ctx)};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 let h=host(),candidate=await h.read();assert.equal(candidate.primary,true);
 assert(h.queries.filter(q=>!['trip_members','trips','booking_plan_travelers'].includes(q.table)).every(q=>q.trip_id==='trip'));
 h=host({budget_items:[{...database.budget_items[0],amount_cents:5100}]});await assert.rejects(h.read(),/source_changed_since_seed/);
 h=host({trip_members:[]});await assert.rejects(h.read(),/single_membership_required/);
 h=host({trips:[{legacy_id:'TRIP-OTHER'}]});await assert.rejects(h.read(),/source_trip_mismatch/);
 let c=child();assert.equal(c.ctx.window.DATA,undefined);c.enable();await flush();let p=c.start();c.calls[0].ok(manifest);await flush();
 let req=c.sent.findLast(x=>x.operation==='paymentsBudget.read');c.response(req,candidate);await p;assert.equal(c.state().status,'primary');assert.equal(c.calls.length,1);
 assert.equal(vm.runInContext("paymentState_.plans[0]['Updated At']",c.ctx),iso,'Preserve Sheet concurrency timestamps.');
 c=child();c.enable();await flush();p=c.start();c.calls[0].ok(manifest);await flush();req=c.sent.findLast(x=>x.operation==='paymentsBudget.read');c.response(req,'source_changed_since_seed',false);await flush();
 assert.equal(c.calls[1].method,'fallback');const fresh=fixture();fresh.budget[0].Amount=55;fresh.serverTime=later;c.calls[1].ok(fresh);await p;assert.equal(c.state().status,'sheets');assert.equal(vm.runInContext('DATA.budget[0].Amount',c.ctx),55);
 c=child();c.enable();await flush();p=c.start();c.calls[0].ok(manifest);await flush();req=c.sent.findLast(x=>x.operation==='paymentsBudget.read');vm.runInContext('DATA.budget[0].Amount=99',c.ctx);c.response(req,candidate);await p;assert.equal(c.state().status,'waiting');assert.equal(vm.runInContext('DATA.budget[0].Amount',c.ctx),99);
 c=child();c.enable();await flush();p=c.start();c.calls[0].ok(manifest);await flush();req=c.sent.findLast(x=>x.operation==='paymentsBudget.read');vm.runInContext("applyPaymentData_({...fixture,serverTime:'2026-09-16T00:00:00Z'})",c.ctx);c.response(req,candidate);await p;assert.equal(c.state().status,'waiting');
 c=child();c.enable();await flush();vm.runInContext("backgroundSaveState_.pending.set('saving',{})",c.ctx);await c.start();assert.equal(c.calls.length,0);
 c=child();c.enable();await flush();p=c.start();c.calls[0].no(Error('offline'));await flush();assert.equal(c.calls[1].method,'fallback');c.calls[1].no(Error('offline'));await p;assert.equal(c.state().status,'unavailable');assert.equal(vm.runInContext('DATA.budget[0].Amount',c.ctx),50);
 c=child();c.enable();await flush();p=c.start();c.calls[0].ok({...manifest,rentalId:'CABIN-B'});await flush();assert.equal(c.sent.some(x=>x.operation==='paymentsBudget.read'),false);assert.equal(c.calls[1].method,'fallback');c.calls[1].ok({...fixture(),finalizedRentalId:'CABIN-B'});await p;assert.equal(c.state().status,'unavailable');assert.equal(vm.runInContext("paymentState_.plans[0]['Cabin ID']",c.ctx),'CABIN-A');
 c=child();c.enable();await flush();p=c.start();c.calls[0].ok(manifest);await flush();req=c.sent.findLast(x=>x.operation==='paymentsBudget.read');c.response(req,'source_changed_since_seed',false);await flush();vm.runInContext('DATA.budget[0].Amount=99',c.ctx);c.calls[1].ok(fixture());await p;assert.equal(vm.runInContext('DATA.budget[0].Amount',c.ctx),99);assert.equal(c.state().status,'waiting');
 c=child();c.enable();await flush();p=c.start();c.calls[0].ok(manifest);await flush();req=c.sent.findLast(x=>x.operation==='paymentsBudget.read');c.response(req,candidate,true,{});assert.equal(c.state().status,'checking');for(const f of [...c.timers.values()])f();await flush();assert.equal(c.calls[1].method,'fallback');c.calls[1].ok(fixture());await p;assert.equal(c.state().status,'sheets');
 c=child();c.response(c.sent[0],{enabled:false});await flush();await c.start();assert.equal(vm.runInContext('originalLoads',c.ctx),1);
 console.log('PASS Payments/Budget primary reads: shared manifest, authenticated trip binding, fresh fallback, exact timestamps, concurrent saves and late-response protection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
