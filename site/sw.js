/* AgroSphere — service worker minimal: NU pune site-ul în cache (totul vine de pe rețea, ca înainte).
   Singurul rol: când nu există internet și omul deschide o pagină, îi arată offline.html („Nu ai internet”)
   în loc de eroarea browserului. Pagina și imaginile ei sunt salvate la instalare. */
var CACHE = 'agrosphere-offline-v1';
var FILES = ['offline.html', 'assets/logo-agrosphere.svg', 'assets/err-wifi.webp', 'assets/hero-camp.webp', 'favicon.ico', 'assets/favicon-32.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('agrosphere-offline-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () { return caches.match('offline.html'); }));
  } else if (url.origin === location.origin && /\/(assets\/(logo-agrosphere\.svg|err-wifi\.webp|hero-camp\.webp|favicon-32\.png)|favicon\.ico)$/.test(url.pathname)) {
    /* imaginile paginii offline: rețeaua întâi, copia salvată doar dacă rețeaua nu răspunde */
    e.respondWith(fetch(req).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
  }
});
