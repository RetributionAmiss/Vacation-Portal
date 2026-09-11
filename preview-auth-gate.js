const PREVIEW_GATE_ID='vacationPreviewSupabaseAuthGate';
const PREVIEW_STATUS_ID='vacationPreviewSupabaseAuthStatus';
const PREVIEW_FRAME_ID='previewPortalFrame';
let lastReady=false;

function targetWindow_(){
  const frame=document.getElementById(PREVIEW_FRAME_ID);
  return frame&&frame.contentWindow?frame.contentWindow:window;
}

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
  gate.querySelector('#previewOpenAccount').addEventListener('click',()=>openTargetAccount_());
  gate.querySelector('#previewRecheckAuth').addEventListener('click',()=>checkPreviewAuth_(true));
  return gate;
}

function targetAuthOverlayOpen_(){
  try{
    const target=targetWindow_();
    const overlay=target.document.getElementById('supabaseAuthOverlay');
    return Boolean(overlay&&!overlay.hidden);
  }catch(error){
    return false;
  }
}

function openTargetAccount_(){
  const gate=ensurePreviewGate_();
  try{
    const target=targetWindow_();
    const account=target.document.getElementById('supabaseAccountButton');
    if(account){
      gate.hidden=true;
      account.click();
      return true;
    }
  }catch(error){}
  const status=document.getElementById(PREVIEW_STATUS_ID);
  status.textContent='The account control is still loading. Try again in a moment.';
  status.className='preview-auth-warn';
  gate.hidden=false;
  return false;
}

async function waitForSupabase_(timeoutMs=12000){
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    try{
      const target=targetWindow_();
      if(target.VacationSupabase&&target.VacationSupabase.auth) return target.VacationSupabase;
    }catch(error){}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  return null;
}

async function checkPreviewAuth_(interactive=false){
  const gate=ensurePreviewGate_();
  const status=document.getElementById(PREVIEW_STATUS_ID);
  const client=await waitForSupabase_();
  if(!client){
    lastReady=false;
    status.textContent='Supabase auth did not initialize. Do not run the checklist yet.';
    status.className='preview-auth-warn';
    gate.hidden=false;
    return false;
  }
  try{
    const result=await client.auth.getSession();
    const session=result&&result.data?result.data.session:null;
    if(!session||!session.user){
      lastReady=false;
      status.textContent='Signed out. Sign in before testing Meals.';
      status.className='preview-auth-warn';
      if(!targetAuthOverlayOpen_()) gate.hidden=false;
      if(interactive) openTargetAccount_();
      return false;
    }
    const membership=await client
      .from('trip_members')
      .select('trip_id,traveler_id,role,active')
      .eq('auth_user_id',session.user.id)
      .eq('active',true);
    if(membership.error||!(membership.data||[]).length){
      lastReady=false;
      status.textContent='Signed in, but no active trip membership resolved. Do not run the checklist yet.';
      status.className='preview-auth-warn';
      if(!targetAuthOverlayOpen_()) gate.hidden=false;
      return false;
    }
    status.textContent='Supabase session + active trip membership confirmed. Preview is ready for primary-path testing.';
    status.className='preview-auth-ok';
    if(!lastReady) setTimeout(()=>{gate.hidden=true;},700);
    else gate.hidden=true;
    lastReady=true;
    return true;
  }catch(error){
    lastReady=false;
    status.textContent='Supabase session check failed. Do not run the checklist yet.';
    status.className='preview-auth-warn';
    if(!targetAuthOverlayOpen_()) gate.hidden=false;
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