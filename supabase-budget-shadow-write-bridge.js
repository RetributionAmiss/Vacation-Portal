import './payments-budget-contract.js';
// Authenticated organizer-only shadow replication. Never used as a save authority.
const budgetWriteFlags=(window.VACATION_PORTAL_CONFIG||{}).budgetShadowWrite||{};
const BUDGET_REQUEST='vacation-portal-budget-shadow-write-request';
const BUDGET_RESPONSE='vacation-portal-budget-shadow-write-response';
const budgetActive=new Map();
function budgetError(code){const error=new Error(code);error.code=code;throw error;}
function budgetEligible(event){
  try{
    if(!event.source||event.source===window||event.source.top!==window)return false;
    const url=new URL(event.origin),host=url.hostname;
    return url.protocol==='https:'&&(host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('.script.googleusercontent.com')||host.endsWith('-script.googleusercontent.com'));
  }catch(error){return false;}
}
async function budgetMembership(){
  const client=window.VacationSupabase;if(!client)budgetError('auth_starting');
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError)throw authError;if(!auth||!auth.user)budgetError('not_signed_in');
  const {data:members,error}=await client.from('trip_members').select('trip_id,role').eq('auth_user_id',auth.user.id).eq('active',true).is('archived_at',null).limit(2);
  if(error)throw error;if(!Array.isArray(members)||members.length!==1)budgetError('single_membership_required');
  const member=members[0];
  const {data:trips,error:tripError}=await client.from('trips').select('legacy_id').eq('id',member.trip_id).is('archived_at',null).limit(2);
  if(tripError)throw tripError;
  if(!Array.isArray(trips)||trips.length!==1||trips[0].legacy_id!==budgetWriteFlags.sourceTripLegacyId)budgetError('source_trip_mismatch');
  return {client,member};
}
function budgetSourceRows(source){
  if(!source||!Array.isArray(source.budget)||source.budget.length>2000)budgetError('incomplete_budget_source');
  if(!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(source.serverTime||'')||!Number.isFinite(Date.parse(source.serverTime)))budgetError('invalid_source_time');
  const fields=PaymentsBudgetContract.fields.budget,seen=new Set();
  return source.budget.map(row=>{
    if(!row||typeof row!=='object'||Object.keys(row).some(k=>!fields.includes(k)))budgetError('unsupported_budget_column');
    const id=String(row['Budget ID']||'');
    if(!/^BUDGET-[A-Z0-9]+$/.test(id)||seen.has(id)||!String(row.Description||'').trim())budgetError('invalid_budget_id_or_description');
    seen.add(id);
    return fields.map(field=>{
      const value=PaymentsBudgetContract.normalize(field,row[field]);
      if(value.length>10000)budgetError('budget_field_too_long');return value;
    });
  }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
}
async function budgetHandle(request){
  const enabled=budgetWriteFlags.enabled===true;
  if(request.operation==='budgetShadow.status'&&!enabled)return {enabled:false};
  if(!enabled)budgetError('feature_disabled');
  if(!['budgetShadow.status','budgetShadow.sync'].includes(request.operation))budgetError('unsupported_operation');
  const {client,member}=await budgetMembership();
  if(request.operation==='budgetShadow.status')return {enabled:true,canSync:member.role==='organizer'};
  if(member.role!=='organizer')budgetError('organizer_required');
  const rows=budgetSourceRows(request.source);
  const {data:before,error:readError}=await client.rpc('budget_shadow_snapshot',{p_trip_id:member.trip_id});
  if(readError)throw readError;if(!Array.isArray(before))budgetError('invalid_destination_snapshot');
  const {data:result,error:writeError}=await client.rpc('sync_budget_shadow',{
    p_trip_id:member.trip_id,p_source_time:request.source.serverTime,p_rows:rows,p_expected_rows:before
  });
  if(writeError)throw writeError;
  if(!result||!['synced','unchanged'].includes(result.status)||result.count!==rows.length)budgetError('invalid_sync_response');
  const {data:after,error:verifyError}=await client.rpc('budget_shadow_snapshot',{p_trip_id:member.trip_id});
  if(verifyError)throw verifyError;if(JSON.stringify(after)!==JSON.stringify(rows))budgetError('budget_readback_mismatch');
  return {status:'match',writeStatus:result.status,count:rows.length,sourceTime:request.source.serverTime};
}
function budgetBadge(status,count){
  if(budgetWriteFlags.previewBadge!==true)return;
  let badge=document.getElementById('budget-shadow-write-badge');
  if(!badge){badge=document.createElement('div');badge.id='budget-shadow-write-badge';badge.setAttribute('role','status');badge.style.cssText='position:fixed;bottom:64px;right:8px;z-index:2147483647;max-width:480px;background:#121827;color:#f7f5ef;border:1px solid #8795ad;border-radius:12px;padding:12px;font:700 13px/1.4 Arial;pointer-events:none';document.body.appendChild(badge);}
  const labels={match:'SHADOW WRITE · MATCH',syncing:'SYNCING SHEET SAVES',unavailable:'SHADOW SYNC UNAVAILABLE',member:'ORGANIZER SYNC REQUIRED'};
  badge.textContent='Budget · '+(labels[status]||'WAITING');
  if(Number.isSafeInteger(count))badge.textContent+=' · '+count+(count===1?' record':' records');
  badge.style.borderColor=status==='match'?'#68c792':'#e1ac60';
}
window.addEventListener('message',event=>{
  const request=event.data||{};
  if(request.type!==BUDGET_REQUEST||!budgetEligible(event)||typeof request.requestId!=='string'||request.requestId.length>100)return;
  const reply=payload=>event.source.postMessage({type:BUDGET_RESPONSE,requestId:request.requestId,...payload},event.origin);
  if(budgetActive.has(event.source)){reply({ok:false,error:{code:'sync_busy'}});return;}
  if(request.operation==='budgetShadow.sync')budgetBadge('syncing');
  const task=Promise.resolve().then(()=>budgetHandle(request));budgetActive.set(event.source,task);
  task.then(result=>{
    if(request.operation==='budgetShadow.sync')budgetBadge(result.status,result.count);
    else if(result.enabled&&!result.canSync)budgetBadge('member');
    reply({ok:true,data:result});
  }).catch(error=>{
    budgetBadge('unavailable');reply({ok:false,error:{code:String(error.code||'budget_sync_unavailable')}});
  }).finally(()=>{if(budgetActive.get(event.source)===task)budgetActive.delete(event.source);});
});
