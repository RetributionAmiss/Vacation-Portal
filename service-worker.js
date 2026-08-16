const CACHE_NAME='family-vacation-pwa-v4-0-1';

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

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(url.origin!==self.location.origin){
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached=>{
        if(cached) return cached;

        return fetch(request)
          .then(response=>{
            if(
              request.method==='GET' &&
              response &&
              response.status===200
            ){
              const copy=response.clone();
              caches.open(CACHE_NAME)
                .then(cache=>cache.put(request,copy));
            }
            return response;
          });
      })
      .catch(()=>caches.match('./index.html'))
  );
});
