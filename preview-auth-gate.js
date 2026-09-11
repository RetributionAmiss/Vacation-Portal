const PREVIEW_GATE_ID='vacationPreviewSupabaseAuthGate';
const PREVIEW_STATUS_ID='vacationPreviewSupabaseAuthStatus';
const PORTAL_FRAME_ID='portalFrame';
let portalReloadedForAuth=false;
let authReady=false;

function previewGateStyles_(){
  if(document.getElementById('vacationPreviewSupabaseAuthGateStyles')) return;
  const style=document.createElement('style');
  style.id='vacationPreviewSupabaseAuthGateStyles';
  style.textContent=`
    #${PREVIEW_GATE_ID}{
      position:fixed;inset:0;z-index:7999;display:grid;place-items:center;
      padding:20px;background:rgba(5,9,16,.82);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)
    }
    #${PREVIEW_GATE_ID}[hidden]{display:none!important}
    #${PREVIEW_GATE_ID} .preview-auth-card{
      width:min(520px,100%);box-sizing:border-box;padding:24px;border:1px solid #38435a;border-radius:20px;
      color:#f7f5ef;background:#121827;box-shadow:0 24px 80px rgba(0,0,0,.5)
    }
    #${PREVIEW_GATE_ID} .eyebrow{margin:0 0 6px;color:#d8b565;font-size:11px;font-weight:900;letter-spacing:.12em}
    #${PREVIEW_GATE_ID} h2{margin:0 0 10px;font-family:Georgia,serif;color:#f7f5ef}
    #${PREVIEW_GATE_ID} p{margin:9px 0;color:#c7cfda;line-height:1.5}
    #${PREVIEW_GATE_ID} .preview-auth-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
    #${PREVIEW_GATE_ID} button{
      min-height:44px;padding:10px 15px;border:1px solid #45506a;border-radius:10px;
      color:#f1d892;background:#191f31;font-weight:850;cursor:pointer
    }
    #${PREVIEW_GATE_ID} button.primary{color:#080c16;border-color:#d8b565;background:#d8b565}
    #${PREVIEW_GATE_ID} .preview-auth-ok{color:#9ee6bb}
    #${PREVIEW_GATE_ID} .preview-auth-warn{color:#f1d892}
  `;
  document.head.appendChild(style);
}

function ensurePreviewGate_(){
  previewGateStyles_();
  let gate=document.getElementById(PREVIEW_GATE_ID);
  if(gate) return gate;
  gate=document.createElement('div');
  gate.id=PREVIEW_GATE_ID;
  gate.innerHTML=`
    <section class="preview-auth-card" role="dialog" aria-modal="true" aria-labelledby="previewAuthTitle">
      <p class="eyebrow">ALPHA2.25 PREVIEW GATE</p>
      <h2 id="previewAuthTitle">Supabase sign-in required before testing</h2>
      <p>This preview intentionally falls back to Sheets when no Supabase browser session exists. Testing while signed out does <strong>not</strong> exercise the new Meals-comment primary path.</p>
      <p id="${PREVIEW_STATUS_ID}" class="preview-auth-warn">Checking Supabase session…</p>
      <div class="preview-auth-actions">
        <button class="primary" type="button" id="previewOpenAccount">Sign in to Supabase</button>
        <button type="button" id="previewRecheckAuth">Recheck session</button>
      </div>
    </section>`;
  document.body.appendChild(gate);
  gate.querySelector('#previewOpenAccount').addEventListener('click',openAccountForPreview_);
  gate.querySelector('#previewRecheckAuth').addEventListener('click',()=>checkPreviewAuth_(true));
  return gate;
}

function authOverlayOpen_(){
  const overlay=document.getElementById('supabaseAuthOverlay');
  return Boolean(overlay&&!overlay.hidden);
}

function openAccountForPreview_(){
  const gate=ensurePreviewGate_();
  const account=document.getElementById('supabaseAccountButton');
  if(account){
    gate.hidden=true;
    account.click();
    return true;
  }
  const status=document.getElementById(PREVIEW_STATUS_ID);
  status.textContent='The account control is still loading. Try again in a moment.';
  status.className='preview-auth-warn';
  gate.hidden=false;
  return false;
}

async function waitForSupabase_(timeoutMs=12000){
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    if(window.VacationSupabase&&window.VacationSupabase.auth) return window.VacationSupabase;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  return null;
}

function reloadPortalFrameForAuth_(gate,status){
  if(portalReloadedForAuth) return true;
  const frame=document.getElementById(PORTAL_FRAME_ID);
  if(!frame) return false;

  portalReloadedForAuth=true;
  status.textContent='Supabase session confirmed. Restarting the portal in primary mode…';
  status.className='preview-auth-ok';
  gate.hidden=false;

  try{
    const current=new URL(frame.src,window.location.href);
    current.searchParams.set('previewAuthReady',Date.now().toString());
    frame.src=current.toString();
  }catch(error){
    frame.src=frame.src;
  }

  frame.addEventListener('load',()=>{
    status.textContent='Supabase session + active trip membership confirmed. Preview is ready for primary-path testing.';
    status.className='preview-auth-ok';
    authReady=true;
    setTimeout(()=>{gate.hidden=true;},700);
  },{once:true});
  return true;
}

async function checkPreviewAuth_(interactive=false){
  const gate=ensurePreviewGate_();
  const status=document.getElementById(PREVIEW_STATUS_ID);
  const client=await waitForSupabase_();

  if(!client){
    authReady=false;
    status.textContent='Supabase auth did not initialize. Do not run the checklist yet.';
    status.className='preview-auth-warn';
    gate.hidden=false;
    return false;
  }

  try{
    const result=await client.auth.getSession();
    const session=result&&result.data?result.data.session:null;
    if(!session||!session.user){
      authReady=false;
      portalReloadedForAuth=false;
      status.textContent='Signed out. Sign in before testing Meals.';
      status.className='preview-auth-warn';
      if(!authOverlayOpen_()) gate.hidden=false;
      if(interactive) openAccountForPreview_();
      return false;
    }

    const membership=await client
      .from('trip_members')
      .select('trip_id,traveler_id,role,active')
      .eq('auth_user_id',session.user.id)
      .eq('active',true);

    if(membership.error||!(membership.data||[]).length){
      authReady=false;
      status.textContent='Signed in, but no active trip membership resolved. Do not run the checklist yet.';
      status.className='preview-auth-warn';
      if(!authOverlayOpen_()) gate.hidden=false;
      return false;
    }

    if(!portalReloadedForAuth){
      if(!reloadPortalFrameForAuth_(gate,status)){
        status.textContent='Portal frame is still loading. Waiting to start primary-mode testing…';
        status.className='preview-auth-warn';
        gate.hidden=false;
      }
      return true;
    }

    if(!authReady){
      status.textContent='Supabase session confirmed. Waiting for the portal restart…';
      status.className='preview-auth-ok';
      gate.hidden=false;
      return true;
    }

    gate.hidden=true;
    return true;
  }catch(error){
    authReady=false;
    status.textContent='Supabase session check failed. Do not run the checklist yet.';
    status.className='preview-auth-warn';
    if(!authOverlayOpen_()) gate.hidden=false;
    return false;
  }
}

function startPreviewAuthWatch_(){
  checkPreviewAuth_(false);
  setInterval(()=>checkPreviewAuth_(false),1500);
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',startPreviewAuthWatch_,{once:true});
}else{
  startPreviewAuthWatch_();
}
