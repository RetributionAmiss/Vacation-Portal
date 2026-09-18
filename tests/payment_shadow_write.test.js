'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..'),contract=require('../payments-budget-contract.js');
const hostCode=fs.readFileSync(path.join(root,'supabase-payment-shadow-write-bridge.js'),'utf8').replace(/^import .*;\n/,'');
const childCode=fs.readFileSync(path.join(root,'Client_Supabase_Payment_Shadow_Write.html'),'utf8').replace(/<\/?script>/g,'');
const source={payments:[{'Payment ID':'PAY-TEST','Cabin ID':'CABIN-A','Paid By Traveler ID':'TRV-001','Paid To Type':'Agency','Paid To Name':'Agency',Amount:12.34,'Payment Date':'2027-06-01','Created At':'2026-08-30T21:25:04.861Z','Updated At':'2026-08-30T21:25:05.861Z'}],finalizedRentalId:'CABIN-A',serverTime:'2026-09-17T09:00:00.000Z'};
function host({role='organizer',enabled=true,trip='TRIP-2027-TN',writeError=null,readbackMismatch=false}={}){
  const calls=[],events={},output=[],window={};let stored=[];
  const chain={select(){return chain;},eq(){return chain;},is(){return chain;},limit(){return chain;},then(ok,no){return Promise.resolve({data:chain.table==='trip_members'?[{trip_id:'trip-id',role}]:chain.table==='rentals'?[{id:'rental-id'}]:[{legacy_id:trip}]}).then(ok,no);}};
  window.VACATION_PORTAL_CONFIG={paymentShadowWrite:{enabled,sourceTripLegacyId:'TRIP-2027-TN'}};
  window.addEventListener=(n,f)=>events[n]=f;
  window.VacationSupabase={auth:{getUser:async()=>({data:{user:{id:'auth-user'}}})},from(table){chain.table=table;return chain;},async rpc(name,args){calls.push({name,args});if(name==='payment_shadow_snapshot')return {data:readbackMismatch&&calls.length>2?[]:stored};if(writeError)return {error:{code:writeError}};stored=args.p_rows;return {data:{status:'synced',count:stored.length}};}};
  const ctx=vm.createContext({window,URL,PaymentsBudgetContract:contract});vm.runInContext(hostCode,ctx);
  const frame={top:window,postMessage:(payload,origin)=>output.push({payload,origin})};
  return {ctx,calls,events,output,frame,read:request=>{ctx.request=request;return vm.runInContext('paymentHandle(request)',ctx);}};
}
const flush=()=>new Promise(r=>setImmediate(r));
function child(){
  const sent=[],calls=[],listeners={},timers=new Map();let tick,id=0;
  const top={postMessage:m=>sent.push(m)};
  const ctx=vm.createContext({window:{top,addEventListener:(name,fn)=>listeners[name]=fn},setInterval:fn=>tick=fn,setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id),google:{script:{get run(){let ok,no;const c={withSuccessHandler(f){ok=f;return c;},withFailureHandler(f){no=f;return c;},getPaymentShadowSource(){calls.push({ok,no});}};return c;}}}});
  vm.runInContext("let DATA={deferredLoaded:true,payment:[{Amount:999}]};let currentView='payments';let backgroundSaveState_={pending:new Map()};",ctx);
  vm.runInContext(childCode,ctx);
  return {ctx,sent,calls,timers,tick:()=>tick(),response:(req,data,sourceWindow=top)=>listeners.message({source:sourceWindow,data:{type:'vacation-portal-payment-shadow-write-response',requestId:req.requestId,ok:true,data}})};
}
(async()=>{
  let h=host();let r=await h.read({operation:'paymentShadow.sync',source});assert.equal(r.status,'match');
  const write=h.calls.find(c=>c.name==='sync_payment_shadow');assert.equal(write.args.p_rows[0][7],'1234');assert.equal(write.args.p_rows[0][10],source.payments[0]['Created At']);assert.equal(write.args.p_rental_legacy_id,'CABIN-A');assert.equal(write.args.p_trip_id,'trip-id');assert.deepEqual(write.args.p_expected_rows,[]);
  h=host({enabled:false});assert.equal((await h.read({operation:'paymentShadow.status'})).enabled,false);await assert.rejects(h.read({operation:'paymentShadow.sync',source}),/feature_disabled/);assert.equal(h.calls.length,0);
  h=host({role:'traveler'});assert.equal((await h.read({operation:'paymentShadow.status'})).canSync,false);await assert.rejects(h.read({operation:'paymentShadow.sync',source}),/organizer_required/);assert.equal(h.calls.length,0);
  h=host({trip:'OTHER'});await assert.rejects(h.read({operation:'paymentShadow.sync',source}),/source_trip_mismatch/);assert.equal(h.calls.length,0);
  for(const bad of [{...source,payments:null},{...source,payments:[...source.payments,...source.payments]},{...source,payments:[{...source.payments[0],Amount:1.001}]},{...source,payments:[{...source.payments[0],Secret:'no'}]},{...source,serverTime:'yesterday'}]){h=host();await assert.rejects(h.read({operation:'paymentShadow.sync',source:bad}));assert.equal(h.calls.length,0);}
  h=host({writeError:'PAYMENT_DESTINATION_CHANGED'});await assert.rejects(h.read({operation:'paymentShadow.sync',source}),e=>e.code==='PAYMENT_DESTINATION_CHANGED');assert.equal(h.calls.length,2);
  h=host({readbackMismatch:true});await assert.rejects(h.read({operation:'paymentShadow.sync',source}),/payment_readback_mismatch/);
  h=host();const request={type:'vacation-portal-payment-shadow-write-request',requestId:'test',operation:'paymentShadow.sync',source};
  h.events.message({source:h.frame,origin:'https://attacker.example',data:request});assert.equal(h.calls.length,0);
  h.events.message({source:{...h.frame,top:{}},origin:'https://script.google.com',data:request});assert.equal(h.calls.length,0);
  h.events.message({source:h.frame,origin:'https://script.google.com',data:request});h.events.message({source:h.frame,origin:'https://script.google.com',data:request});await flush();assert(h.output.some(r=>r.payload.error&&r.payload.error.code==='sync_busy'));assert(h.output.some(r=>r.payload.ok&&r.origin==='https://script.google.com'));
  let c=child();let p=c.tick();c.response(c.sent[0],{enabled:true,canSync:true});await flush();assert.equal(c.calls.length,1);c.calls[0].ok(source);await flush();assert.equal(c.sent.find(x=>x.operation==='paymentShadow.sync').source.payments[0].Amount,12.34,'Only persisted source may be copied');c.response(c.sent.find(x=>x.operation==='paymentShadow.sync'),{status:'match',count:1});await p;assert.equal(vm.runInContext('DATA.payment[0].Amount',c.ctx),999,'Shadow sync must not replace UI or optimistic data');
  c=child();p=c.tick();c.response(c.sent[0],{enabled:false});await p;assert.equal(c.calls.length,0);
  c=child();p=c.tick();c.response(c.sent[0],{enabled:true,canSync:false});await p;assert.equal(c.calls.length,0);
  c=child();vm.runInContext("backgroundSaveState_.pending.set('save',{})",c.ctx);await c.tick();assert.equal(c.sent.length,0);
  c=child();p=c.tick();c.response(c.sent[0],{enabled:true,canSync:true},{});assert.equal(c.calls.length,0);for(const fn of [...c.timers.values()])fn();await p;assert.equal(c.calls.length,0);
  c=child();p=c.tick();c.response(c.sent[0],{enabled:true,canSync:true});await flush();vm.runInContext('DATA={deferredLoaded:true,payment:[]}',c.ctx);c.calls[0].ok(source);await p;assert.equal(c.sent.filter(x=>x.operation).length,1,'Navigation must discard old-owner snapshot');
  c=child();vm.runInContext('let paymentState_={loading:true}',c.ctx);await c.tick();assert.equal(c.sent.length,0,'Payment must yield to financial reads');
  c=child();p=c.tick();c.response(c.sent[0],{enabled:true,canSync:true});await flush();assert.equal(c.ctx.window.__budgetShadowSourceBusy,true);c.calls[0].no();await p;assert.equal(c.ctx.window.__budgetShadowSourceBusy,false);assert(c.sent.some(x=>x.type==='vacation-portal-payment-shadow-write-diagnostic'&&x.status==='unavailable'));const callsBefore=c.calls.length;await c.tick();assert.equal(c.calls.length,callsBefore,'Source failure must back off');
  c=child();c.ctx.window.__budgetShadowSourceBusy=true;await c.tick();assert.equal(c.sent.length,0,'Payment must yield to Budget source');
  c=child();vm.runInContext('let paymentOptimisticQueue_={running:true,jobs:[]}',c.ctx);await c.tick();assert.equal(c.sent.length,0,'Pending payment saves must settle first');
  const endpoint=vm.createContext({finalizedRentalFocusId_:()=> 'CABIN-A',withPortalMutationLock_:fn=>fn(),getSpreadsheet_:()=>({getSheetByName:name=>name==='Payments'}),readSheet_:name=>{assert.equal(name,'Payments');return source.payments;},Date});
  vm.runInContext(fs.readFileSync(path.join(root,'PaymentsBudgetRead.gs'),'utf8'),endpoint);assert.equal(vm.runInContext('getPaymentShadowSource().payments.length',endpoint),1);
  console.log('PASS Payment shadow write host/client: source-only data, exact cents, trip/organizer binding, disabled/traveler gates, conflict/readback, frame ownership and no UI/save interference.');
})().catch(e=>{console.error(e);process.exitCode=1;});
