import './payments-budget-contract.js';
// Authenticated organizer-only shadow replication. Never used as a save authority.
const paymentWriteFlags=(window.VACATION_PORTAL_CONFIG||{}).paymentShadowWrite||{};
const PAYMENT_REQUEST='vacation-portal-payment-shadow-write-request';
const PAYMENT_RESPONSE='vacation-portal-payment-shadow-write-response';
const paymentActive=new Map();
function paymentError(code){const error=new Error(code);error.code=code;throw error;}
function paymentEligible(event){
  try{
    if(!event.source||event.source===window||event.source.top!==window)return false;
    const url=new URL(event.origin),host=url.hostname;
    return url.protocol==='https:'&&(host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('.script.googleusercontent.com')||host.endsWith('-script.googleusercontent.com'));
  }catch(error){return false;}
}
async function paymentMembership(){
  const client=window.VacationSupabase;if(!client)paymentError('auth_starting');
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError)throw authError;if(!auth||!auth.user)paymentError('not_signed_in');
  const {data:members,error}=await client.from('trip_members').select('trip_id,role').eq('auth_user_id',auth.user.id).eq('active',true).is('archived_at',null).limit(2);
  if(error)throw error;if(!Array.isArray(members)||members.length!==1)paymentError('single_membership_required');
  const member=members[0];
  const {data:trips,error:tripError}=await client.from('trips').select('legacy_id').eq('id',member.trip_id).is('archived_at',null).limit(2);
  if(tripError)throw tripError;
  if(!Array.isArray(trips)||trips.length!==1||trips[0].legacy_id!==paymentWriteFlags.sourceTripLegacyId)paymentError('source_trip_mismatch');
  return {client,member};
}
function paymentSourceRows(source){
  if(!source||!Array.isArray(source.payments)||source.payments.length>2000)paymentError('incomplete_payment_source');
  if(!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(source.serverTime||'')||!Number.isFinite(Date.parse(source.serverTime)))paymentError('invalid_source_time');
  if(!/^CABIN-[A-Z0-9]+$/.test(source.finalizedRentalId||''))paymentError('invalid_finalized_rental');
  const fields=PaymentsBudgetContract.fields.payments,seen=new Set();
  return source.payments.map(row=>{
    if(!row||typeof row!=='object'||Object.keys(row).some(k=>!fields.includes(k)))paymentError('unsupported_payment_column');
    const id=String(row['Payment ID']||'');
    if(!/^PAY-[A-Z0-9]+$/.test(id)||seen.has(id)||row['Cabin ID']!==source.finalizedRentalId)paymentError('invalid_payment_id_or_rental');
    seen.add(id);
    return fields.map(field=>{
      const value=PaymentsBudgetContract.normalize(field,row[field]);
      if(value.length>10000)paymentError('payment_field_too_long');return value;
    });
  }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
}
async function paymentHandle(request){
  const enabled=paymentWriteFlags.enabled===true;
  if(request.operation==='paymentShadow.status'&&!enabled)return {enabled:false};
  if(!enabled)paymentError('feature_disabled');
  if(!['paymentShadow.status','paymentShadow.sync'].includes(request.operation))paymentError('unsupported_operation');
  const {client,member}=await paymentMembership();
  if(request.operation==='paymentShadow.status')return {enabled:true,canSync:member.role==='organizer'};
  if(member.role!=='organizer')paymentError('organizer_required');
  const rows=paymentSourceRows(request.source);
  const {data:rentals,error:rentalError}=await client.from('rentals').select('id').eq('trip_id',member.trip_id).eq('legacy_id',request.source.finalizedRentalId).is('archived_at',null).limit(2);
  if(rentalError)throw rentalError;if(!Array.isArray(rentals)||rentals.length!==1)paymentError('rental_mapping_required');
  const rentalId=rentals[0].id;
  const {data:before,error:readError}=await client.rpc('payment_shadow_snapshot',{p_trip_id:member.trip_id,p_rental_id:rentalId});
  if(readError)throw readError;if(!Array.isArray(before))paymentError('invalid_destination_snapshot');
  const {data:result,error:writeError}=await client.rpc('sync_payment_shadow',{
    p_trip_id:member.trip_id,p_rental_legacy_id:request.source.finalizedRentalId,p_source_time:request.source.serverTime,p_rows:rows,p_expected_rows:before
  });
  if(writeError){if(/^PAYMENT_[A-Z_]+$/.test(writeError.message||''))paymentError(writeError.message);throw writeError;}
  if(!result||!['synced','unchanged'].includes(result.status)||result.count!==rows.length)paymentError('invalid_sync_response');
  const {data:after,error:verifyError}=await client.rpc('payment_shadow_snapshot',{p_trip_id:member.trip_id,p_rental_id:rentalId});
  if(verifyError)throw verifyError;if(JSON.stringify(after)!==JSON.stringify(rows))paymentError('payment_readback_mismatch');
  return {status:'match',writeStatus:result.status,count:rows.length,sourceTime:request.source.serverTime};
}
function paymentBadge(status,count){
  if(paymentWriteFlags.previewBadge!==true)return;
  let badge=document.getElementById('payment-shadow-write-badge');
  if(!badge){badge=document.createElement('div');badge.id='payment-shadow-write-badge';badge.setAttribute('role','status');badge.style.cssText='position:fixed;bottom:120px;right:8px;z-index:2147483647;max-width:480px;background:#121827;color:#f7f5ef;border:1px solid #8795ad;border-radius:12px;padding:12px;font:700 13px/1.4 Arial;pointer-events:none';document.body.appendChild(badge);}
  const labels={waiting:'WAITING FOR PAYMENTS VIEW',source:'READING SAVED PAYMENT',match:'SHADOW WRITE · MATCH',syncing:'SYNCING SHEET SAVES',unavailable:'SHADOW SYNC UNAVAILABLE',member:'ORGANIZER SYNC REQUIRED'};
  badge.textContent='Payments · '+(labels[status]||'WAITING');
  if(Number.isSafeInteger(count))badge.textContent+=' · '+count+(count===1?' record':' records');
  badge.style.borderColor=status==='match'?'#68c792':'#e1ac60';
}
window.addEventListener('message',event=>{
  const request=event.data||{};
  if(request.type==='vacation-portal-payment-shadow-write-diagnostic'&&paymentEligible(event)){
    paymentBadge(request.status);
    if(paymentWriteFlags.previewBadge===true){
      const badge=document.getElementById('payment-shadow-write-badge');
      if(badge&&request.status==='unavailable'&&request.reason)badge.textContent+=' · '+String(request.reason).slice(0,80);
    }
    return;
  }
  if(request.type!==PAYMENT_REQUEST||!paymentEligible(event)||typeof request.requestId!=='string'||request.requestId.length>100)return;
  const reply=payload=>event.source.postMessage({type:PAYMENT_RESPONSE,requestId:request.requestId,...payload},event.origin);
  if(paymentActive.has(event.source)){reply({ok:false,error:{code:'sync_busy'}});return;}
  if(request.operation==='paymentShadow.sync')paymentBadge('syncing');
  const task=Promise.resolve().then(()=>paymentHandle(request));paymentActive.set(event.source,task);
  task.then(result=>{
    if(request.operation==='paymentShadow.sync')paymentBadge(result.status,result.count);
    else if(result.enabled&&!result.canSync)paymentBadge('member');
    reply({ok:true,data:result});
  }).catch(error=>{
    paymentBadge('unavailable');reply({ok:false,error:{code:String(error.code||'payment_sync_unavailable')}});
  }).finally(()=>{if(paymentActive.get(event.source)===task)paymentActive.delete(event.source);});
});

paymentBadge('waiting');
