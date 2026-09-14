// Diagnostic reads only. All authorization comes from Supabase Auth and RLS.
const config=window.VACATION_PORTAL_CONFIG||{};
const flags=(config.supabaseDomains||{}).paymentsBudget||{};
const REQUEST='vacation-portal-payments-budget-shadow-request';
const RESPONSE='vacation-portal-payments-budget-shadow-response';
const MAP={
 booking_plans:{'Booking Plan ID':'legacy_id','Agency Name':'agency_name','Booking Total':'booking_total_cents','Split Basis':'split_basis','Notes':'notes'},
 payment_shares:{'Share ID':'legacy_id','Split Basis':'split_basis','Source Total':'source_total_cents','Calculated Share':'calculated_share_source','Adjusted Share':'adjusted_share_cents','Notes':'notes'},
 payment_schedules:{'Schedule ID':'legacy_id','Label':'label','Due Date':'due_date','Amount Due':'amount_due_cents','Recipient Type':'recipient_type','Recipient Name':'recipient_name','Notes':'notes'},
 payments:{'Payment ID':'legacy_id','Paid To Type':'paid_to_type','Paid To Name':'paid_to_name','Amount':'amount_cents','Payment Date':'payment_date','Notes':'notes','Confirmation Status':'confirmation_status','Confirmation Source':'confirmation_source','Confirmed At':'confirmed_at'},
 budget_items:{'Budget ID':'legacy_id','Category':'category','Description':'description','Amount':'amount_cents','Paid By':'paid_by_text','Split Between':'split_between_text','Split Method':'split_method','Date':'legacy_date_text','Due Date':'due_date','Status':'status','Notes':'notes','Include in Rental Split':'include_in_rental_split'}
};
const LINKS={
 booking_plans:{'Cabin ID':['rental_id','rentals']},
 payment_shares:{'Cabin ID':['rental_id','rentals'],'Traveler ID':['traveler_id','travelers']},
 payment_schedules:{'Cabin ID':['rental_id','rentals'],'Expected Payer Traveler ID':['expected_payer_traveler_id','travelers'],'Recipient Traveler ID':['recipient_traveler_id','travelers']},
 payments:{'Cabin ID':['rental_id','rentals'],'Schedule ID':['schedule_id','payment_schedules'],'Paid By Traveler ID':['paid_by_traveler_id','travelers'],'Paid To Traveler ID':['paid_to_traveler_id','travelers'],'Confirmed By Traveler ID':['confirmed_by_traveler_id','travelers']},budget_items:{}
};
function fail(code){const e=new Error(code);e.code=code;throw e;}
function money(value){if(value==null||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value)))fail('unsafe_destination_cents');return Number(value)/100;}
async function rows(client,table,columns,tripId){
 const result=[];
 for(let start=0;start<=2000;start+=500){
  const {data,error}=await client.from(table).select(columns).eq('trip_id',tripId).is('archived_at',null).order('id').range(start,start+499);
  if(error)throw error;if(!Array.isArray(data))fail('incomplete_shadow_response');result.push(...data);
  if(data.length<500)return result;if(start===2000)fail('shadow_record_limit');
 }
}
async function readShadow(){
 if(flags.shadowRead!==true||flags.read===true||flags.write===true||flags.shadowWrite===true)fail('feature_disabled');
 const client=window.VacationSupabase;if(!client)fail('auth_starting');
 const {data:auth,error:authError}=await client.auth.getUser();if(authError)throw authError;if(!auth||!auth.user)fail('not_signed_in');
 const {data:members,error:memberError}=await client.from('trip_members').select('trip_id').eq('auth_user_id',auth.user.id).eq('active',true).is('archived_at',null).limit(2);
 if(memberError)throw memberError;if(!Array.isArray(members)||members.length!==1)fail('single_membership_required');
 const tripId=members[0].trip_id;
 const data={};
 await Promise.all(['rentals','travelers',...Object.keys(MAP)].map(async table=>{
  const columns=MAP[table]?['id','legacy_id',...Object.values(MAP[table]),...Object.values(LINKS[table]).map(l=>l[0]),...(table==='payment_shares'?['calculated_share_cents','booking_plan_id']:[])]:['id','legacy_id'];
  data[table]=await rows(client,table,[...new Set(columns)].join(','),tripId);
 }));
 const resolve=(table,id)=>{
  if(!id)return '';const found=data[table].filter(r=>r.id===id);
  if(found.length!==1||!found[0].legacy_id)fail('unresolved_shadow_relationship');return found[0].legacy_id;
 };
 const joins=[];
 for(const plan of data.booking_plans){
  const {data:links,error}=await client.from('booking_plan_travelers').select('booking_plan_id,traveler_id').eq('booking_plan_id',plan.id).limit(1000);
  if(error)throw error;if(!Array.isArray(links)||links.length>=1000)fail('incomplete_booking_travelers');joins.push(...links);
 }
 const output={};
 for(const [domain,table] of Object.entries({plans:'booking_plans',shares:'payment_shares',schedule:'payment_schedules',payments:'payments',budget:'budget_items'})){
  output[domain]=data[table].map(row=>{
   const dto={};
   for(const [header,col] of Object.entries(MAP[table])){
    let v=row[col];
    if(col.endsWith('_cents'))v=money(v);
    else if(col==='calculated_share_source'){if(v==null||!Number.isFinite(Number(v)))fail('missing_calculated_source');v=Number(v);}
    else if(col==='include_in_rental_split')v=v?'Yes':'No';
    dto[header]=v==null?'':v;
   }
   for(const [header,[col,parent]] of Object.entries(LINKS[table]))dto[header]=resolve(parent,row[col]);
   if(table==='booking_plans')dto['Booking Traveler IDs']=joins.filter(j=>j.booking_plan_id===row.id).map(j=>resolve('travelers',j.traveler_id)).sort().join(',');
   if(table==='payment_shares'){
    const plan=data.booking_plans.find(p=>p.id===row.booking_plan_id);
    if(!plan||plan.rental_id!==row.rental_id)fail('invalid_share_plan');
    dto['_Calculated Share Cents']=String(row.calculated_share_cents);
   }
   return dto;
  });
 }
 return {source:'supabase-shadow',primary:false,domains:output};
}
function eligible(event){
 try{
  if(!event.source||event.source===window||event.source.top!==window)return false;
  const u=new URL(event.origin),host=u.hostname;
  return u.protocol==='https:'&&(host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('.script.googleusercontent.com')||host.endsWith('-script.googleusercontent.com'));
 }catch(e){return false;}
}
window.addEventListener('message',event=>{
 const request=event.data||{};if(request.type!==REQUEST||!eligible(event)||typeof request.requestId!=='string'||request.requestId.length>100)return;
 const send=payload=>event.source.postMessage({type:RESPONSE,requestId:request.requestId,...payload},event.origin);
 Promise.resolve().then(()=>{if(request.operation!=='paymentsBudget.read')fail('unsupported_operation');return readShadow();})
 .then(data=>send({ok:true,data})).catch(error=>send({ok:false,error:{code:String(error.code||'shadow_read_failed')}}));
});

// Enabled only by the isolated preview configuration.
if(flags.previewBadge===true){
 window.addEventListener('message',event=>{
  const data=event.data||{};
  if(data.type!=='vacation-portal-payments-budget-shadow-diagnostic'||!eligible(event))return;
  let badge=document.getElementById('payments-budget-shadow-badge');
  if(!badge){badge=document.createElement('div');badge.id='payments-budget-shadow-badge';badge.setAttribute('role','status');badge.style.cssText='position:fixed;bottom:8px;right:8px;z-index:2147483647;max-width:480px;background:#121827;color:#f7f5ef;border:1px solid #8795ad;border-radius:12px;padding:12px;font:700 13px/1.4 Arial;pointer-events:none';document.body.appendChild(badge);}
  const state=['waiting','checking','match','mismatch','unavailable'].includes(data.status)?data.status:'unavailable';
  badge.textContent='Payments/Budget · Sheets visible · Shadow '+state.toUpperCase();
  if(state==='waiting')badge.textContent+=' · Open Payments to load the comparison';
  if(state==='match'&&data.counts)badge.textContent+=' · '+Object.values(data.counts).reduce((n,v)=>n+(Number.isSafeInteger(v)?v:0),0)+' records';
  if(state==='unavailable')badge.textContent+=' · '+String(data.errorCode||'').slice(0,80);
  if(state==='mismatch')badge.textContent+=' · '+String(data.mismatchCount||0)+' differences';
  badge.style.borderColor=state==='match'?'#68c792':state==='mismatch'?'#e1ac60':'#8795ad';
 });
}
