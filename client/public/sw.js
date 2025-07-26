const CACHE_NAME = 'contract-crown-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/src/main.js',
  '/src/styles/main.css',
  '/src/core/GameApp.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});