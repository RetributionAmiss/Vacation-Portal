'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path'),root=path.join(__dirname,'..');
const hostCode=fs.readFileSync(path.join(root,'supabase-payments-budget-shadow-bridge.js'),'utf8');
const childCode=fs.readFileSync(path.join(root,'Client_Supabase_Payments_Budget_Shadow.html'),'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g,'');
function child(source){
 const messages=[],listeners={},intervals=[];const top={postMessage:data=>messages.push(data)};
 const context=vm.createContext({window:{top,addEventListener:(name,cb)=>listeners[name]=cb},setInterval:cb=>intervals.push(cb),setTimeout:()=>1,clearTimeout:()=>{},sourceFixture:JSON.parse(JSON.stringify(source)),Date,console});
 vm.runInContext('let DATA={budget:sourceFixture.budget}; const paymentState_={...sourceFixture,loaded:true,loading:false,fromSnapshot:false};',context);
 vm.runInContext(childCode,context);
 return {context,messages,top,check:intervals[0],respond(data){const req=messages.findLast(x=>x.operation==='paymentsBudget.read');assert(req);listeners.message({source:top,data:{type:'vacation-portal-payments-budget-shadow-response',requestId:req.requestId,ok:true,data:{source:'supabase-shadow',primary:false,domains:data}}});},status:()=>vm.runInContext('DATA.supabasePaymentsBudgetShadow',context)};
}
const source={plans:[],shares:[],schedule:[],payments:[],budget:[{'Budget ID':'BUDGET-A',Description:'Groceries',Amount:50,'Paid By':'Everyone','Split Between':'Everyone','Include in Rental Split':'Yes'}]};
let c=child(source);assert.equal(c.context.window.DATA,undefined);c.check();c.respond(source);assert.equal(c.status().status,'match');
assert.equal(vm.runInContext('DATA.budget[0].Amount',c.context),50);
c=child(source);c.check();c.respond({...source,budget:[]});assert.equal(c.status().status,'mismatch');
c=child(source);c.check();c.respond({...source,budget:[{...source.budget[0],Amount:51}]});assert.equal(c.status().mismatchCount,1);
c=child(source);c.check();c.respond({...source,budget:[source.budget[0],source.budget[0]]});assert.equal(c.status().status,'unavailable');
c=child(source);c.check();vm.runInContext('DATA.budget[0].Amount=52',c.context);c.respond(source);assert.equal(c.status().status,'waiting');
c=child(source);vm.runInContext('paymentState_.fromSnapshot=true',c.context);c.check();assert.equal(c.messages.some(x=>x.operation),false);
c=child({...source,budget:[]});c.check();c.respond({...source,budget:[]});assert.equal(c.status().errorCode,'empty_source_snapshot');
const fractional={...source,shares:[{'Share ID':'SHARE-A','Cabin ID':'CABIN-A','Traveler ID':'TRV-001','Source Total':100,'Calculated Share':12.3456,'Adjusted Share':12.35}]};
c=child(fractional);c.check();c.respond({...fractional,shares:[{...fractional.shares[0],'_Calculated Share Cents':'1235'}]});assert.equal(c.status().status,'match');
c=child(fractional);c.check();c.respond({...fractional,shares:[{...fractional.shares[0],'_Calculated Share Cents':'1234'}]});assert.equal(c.status().status,'mismatch');
function host(overrides={}){
 const queries=[];
 const db={trip_members:[{trip_id:'trip'}],rentals:[{id:'rental',legacy_id:'CABIN-A'}],travelers:[{id:'person',legacy_id:'TRV-001'}],booking_plans:[],payment_shares:[],payment_schedules:[],payments:[],budget_items:[{id:'budget',legacy_id:'BUDGET-A',description:'Groceries',amount_cents:5000,paid_by_text:'Everyone',split_between_text:'Everyone',include_in_rental_split:true}],...overrides};
 const client={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){const query={table};queries.push(query);const chain={select(columns){assert(!columns.includes('*'));assert(!columns.includes('source_record'));query.columns=columns;return chain;},eq(k,v){query[k]=v;return chain;},is(){return chain;},limit(){return chain;},order(){return chain;},range(){return chain;},then(resolve,reject){return Promise.resolve({data:db[table]}).then(resolve,reject);}};return chain;}};
 const context=vm.createContext({window:{VACATION_PORTAL_CONFIG:{supabaseDomains:{paymentsBudget:{shadowRead:true}}},VacationSupabase:client,addEventListener:()=>{}},URL,console});vm.runInContext(hostCode,context);
 return {context,queries,read:()=>vm.runInContext('readShadow()',context)};
}
(async()=>{
 let h=host(),result=await h.read();assert.equal(result.primary,false);assert.equal(result.domains.budget[0].Amount,50);
 assert(h.queries.filter(q=>q.table!=='trip_members').every(q=>q.trip_id==='trip'));
 h=host({trip_members:[]});await assert.rejects(h.read(),/single_membership_required/);
 h=host({trip_members:[{trip_id:'one'},{trip_id:'two'}]});await assert.rejects(h.read(),/single_membership_required/);
 h=host({budget_items:[{id:'budget',amount_cents:'9007199254740993'}]});await assert.rejects(h.read(),/unsafe_destination_cents/);
 h=host({payments:[{id:'payment',amount_cents:50,paid_by_traveler_id:'missing'}]});await assert.rejects(h.read(),/unresolved_shadow_relationship/);
 h=host();vm.runInContext('flags.write=true',h.context);await assert.rejects(h.read(),/feature_disabled/);
 console.log('PASS authenticated shadow runtime: lexical state, fidelity, missing/duplicate records, stale responses, strict cents, memberships and read-only flags.');
})().catch(e=>{console.error(e);process.exitCode=1;});
