
const CACHE = "wildlife-whm-v1";
const APP_SHELL = ["./","./index.html","./styles.css","./app.js","./manifest.webmanifest"];
self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)));
});
self.addEventListener("fetch", e=>{
  const url = new URL(e.request.url);
  if(url.origin === location.origin){
    e.respondWith(caches.match(e.request).then(r=>r || fetch(e.request)));
  }
});
