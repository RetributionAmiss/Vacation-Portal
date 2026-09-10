window.VACATION_PORTAL_CONFIG = {
  // Internal Apps Script backend. Travelers should always use the GitHub Pages URL.
  portalUrl: 'https://script.google.com/macros/s/AKfycbzfo6ZXGGxQFApb6h0XTUmTKdeCLtSvTjoGXR1mKIuv1laEjZnREhHyJ01wguFfRxWOpA/exec',

  appName: 'Family Vacation Portal',
  shortName: 'Family Trip',
  oneSignalAppId: 'fac4d46d-ba5b-4755-b5b1-8740f59c3b1d',

  // Browser-safe Supabase configuration. The publishable key identifies the
  // project; Row Level Security and the signed-in user session enforce access.
  // Never place a service-role key or database password in this file.
  supabaseUrl: 'https://rlmsojrxmrfawvdsodkk.supabase.co',
  supabasePublishableKey: 'sb_publishable_yjxTF_SnLstt0Duuv9-M5A_sPMARO-2',

  // Domain cutovers are release-level flags. Travel Plans, Packing, and now
  // Itinerary use Supabase as the primary read/write source. Itinerary keeps
  // its validated Sheets path available as a non-blocking rollback backup and
  // automatically falls back to the Sheets-first path when Supabase reads are
  // unavailable for the current runtime.
  supabaseDomains: {
    travelPlans: {
      shadowRead: false,
      shadowWrite: false,
      read: true,
      write: true
    },
    packingItems: {
      shadowRead: false,
      shadowWrite: false,
      read: true,
      write: true
    },
    itinerary: {
      shadowRead: false,
      shadowWrite: false,
      read: true,
      write: true
    }
  },

  // The PWA shell sends this value to the Apps Script iframe URL. Bump it
  // whenever the deployed shell changes so browsers cannot keep showing stale
  // HTML/CSS/host behavior from a prior release.
  release: 'V4.4.0-alpha2.22'
};

(function loadVacationSupabaseAuth_(){
  try{
    const script=document.createElement('script');
    script.type='module';
    script.src='./supabase-auth.js?v='+encodeURIComponent(
      String(window.VACATION_PORTAL_CONFIG.release||'')
    );
    document.head.appendChild(script);
  }catch(error){
    console.warn('Supabase account shell could not be loaded.',error);
  }
})();

(function loadVacationSupabaseDomainBridge_(){
  try{
    const script=document.createElement('script');
    script.type='module';
    script.src='./supabase-domain-bridge.js?v='+encodeURIComponent(
      String(window.VACATION_PORTAL_CONFIG.release||'')
    );
    document.head.appendChild(script);
  }catch(error){
    console.warn('Supabase domain bridge could not be loaded.',error);
  }
})();

(function loadVacationSupabasePackingWriteBridge_(){
  try{
    const script=document.createElement('script');
    script.type='module';
    script.src='./supabase-packing-write-bridge.js?v='+encodeURIComponent(
      String(window.VACATION_PORTAL_CONFIG.release||'')
    );
    document.head.appendChild(script);
  }catch(error){
    console.warn('Supabase Packing write bridge could not be loaded.',error);
  }
})();

(function loadVacationSupabasePackingPrimaryWriteBridge_(){
  try{
    const script=document.createElement('script');
    script.type='module';
    script.src='./supabase-packing-primary-write-bridge.js?v='+encodeURIComponent(
      String(window.VACATION_PORTAL_CONFIG.release||'')
    );
    document.head.appendChild(script);
  }catch(error){
    console.warn('Supabase Packing primary-write bridge could not be loaded.',error);
  }
})();

(function loadVacationSupabaseItineraryBridge_(){
  try{
    const script=document.createElement('script');
    script.type='module';
    script.src='./supabase-itinerary-bridge.js?v='+encodeURIComponent(
      String(window.VACATION_PORTAL_CONFIG.release||'')
    );
    document.head.appendChild(script);
  }catch(error){
    console.warn('Supabase Itinerary bridge could not be loaded.',error);
  }
})();

(function loadVacationSupabaseItineraryWriteBridge_(){
  try{
    const script=document.createElement('script');
    script.type='module';
    script.src='./supabase-itinerary-write-bridge.js?v='+encodeURIComponent(
      String(window.VACATION_PORTAL_CONFIG.release||'')
    );
    document.head.appendChild(script);
  }catch(error){
    console.warn('Supabase Itinerary write bridge could not be loaded.',error);
  }
})();

(function loadVacationSupabaseItineraryCommentBridge_(){
  try{
    const script=document.createElement('script');
    script.type='module';
    script.src='./supabase-itinerary-comment-bridge.js?v='+encodeURIComponent(
      String(window.VACATION_PORTAL_CONFIG.release||'')
    );
    document.head.appendChild(script);
  }catch(error){
    console.warn('Supabase Itinerary comment bridge could not be loaded.',error);
  }
})();

(function installVacationPaymentSnapshotBridge_(){
  const key='vacationPortalPaymentSnapshotV1';

  function broadcast(payload){
    try{
      document.querySelectorAll('iframe').forEach(function(frame){
        if(frame.contentWindow){
          frame.contentWindow.postMessage(payload,'*');
        }
      });
    }catch(error){}
  }

  function readSnapshot(){
    try{
      return JSON.parse(localStorage.getItem(key)||'null');
    }catch(error){
      return null;
    }
  }

  window.addEventListener('message',function(event){
    const data=event.data||{};

    if(data.type==='vacation-portal-save-payment-snapshot'){
      try{
        localStorage.setItem(key,JSON.stringify(data.snapshot||null));
      }catch(error){}
      return;
    }

    if(data.type==='vacation-portal-request-payment-snapshot'){
      broadcast({
        type:'vacation-portal-payment-snapshot',
        snapshot:readSnapshot()
      });
    }
  });
})();