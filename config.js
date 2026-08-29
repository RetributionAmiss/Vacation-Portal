window.VACATION_PORTAL_CONFIG = {
  // Internal Apps Script backend. Travelers should always use the GitHub Pages URL.
  portalUrl: 'https://script.google.com/macros/s/AKfycbyJP-qpnZX2o-5h0_cfCFluzswoKmegIKyJcBO2KQHL9XVIc1QOarJniLxh6dKAVR9jVg/exec',

  appName: 'Family Vacation Portal',
  shortName: 'Family Trip',
  oneSignalAppId: 'fac4d46d-ba5b-4755-b5b1-8740f59c3b1d',
  release: 'V4.4.0-alpha2'
};

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
