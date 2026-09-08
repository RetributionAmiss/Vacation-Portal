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

  // Domain cutovers are release-level flags. Travel Plans is fully primary in
  // Supabase with a non-blocking Sheets backup. Packing remains Sheets-primary,
  // but successful Sheets mutations are now mirrored into Supabase and checked
  // for authenticated field-for-field equivalence.
  supabaseDomains: {
    travelPlans: {
      shadowRead: false,
      shadowWrite: false,
      read: true,
      write: true
    },
    packingItems: {
      shadowRead: true,
      shadowWrite: true,
      read: false,
      write: false
    }
  },

  // The PWA shell sends this value to the Apps Script iframe URL. Bump it
  // whenever the deployed shell changes so browsers cannot keep showing stale
  // HTML/CSS/host behavior from a prior release.
  release: 'V4.4.0-alpha2.13'
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
