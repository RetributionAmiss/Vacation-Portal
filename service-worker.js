const CACHE_NAME='family-vacation-pwa-v4-4-0-alpha2';

const APP_SHELL=[
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './app-icon-192.png',
  './app-icon-512.png',
  './app-icon-maskable-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys
          .filter(key=>key!==CACHE_NAME)
          .map(key=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

async function cacheSuccessfulResponse(request,response){
  if(
    request.method==='GET' &&
    response &&
    response.status===200
  ){
    const cache=await caches.open(CACHE_NAME);
    await cache.put(request,response.clone());
  }

  return response;
}

async function networkFirst(request,fallbackUrl){
  try{
    const response=await fetch(request,{cache:'no-store'});
    return await cacheSuccessfulResponse(request,response);
  }catch(error){
    const cached=await caches.match(request,{ignoreSearch:true});
    if(cached) return cached;

    if(fallbackUrl){
      const fallback=await caches.match(fallbackUrl,{ignoreSearch:true});
      if(fallback) return fallback;
    }

    throw error;
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(url.origin!==self.location.origin){
    return;
  }

  // The Apps Script deployment URL is stored in config.js. Always try the
  // network first so changing the backend never requires travelers to use a
  // different GitHub Pages address. Fall back to the last cached config when
  // the device is offline.
  if(
    request.method==='GET' &&
    url.pathname.endsWith('/config.js')
  ){
    event.respondWith(networkFirst(request,'./config.js'));
    return;
  }

  // Keep the shell current when online while preserving offline startup.
  if(request.method==='GET' && request.mode==='navigate'){
    event.respondWith(networkFirst(request,'./index.html'));
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached=>{
        if(cached) return cached;

        return fetch(request)
          .then(response=>cacheSuccessfulResponse(request,response));
      })
      .catch(()=>caches.match('./index.html'))
  );
});
