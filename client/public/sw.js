const CACHE_NAME = 'contract-crown-v1';

// Only cache essential static files that we know exist
const urlsToCache = [
  '/',
  '/manifest.json',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching essential files');
        // Only cache files that definitely exist
        return cache.addAll(urlsToCache.filter(url => {
          // Skip caching files that might not exist in development
          return url === '/' || url === '/manifest.json' || url === '/favicon.ico';
        }));
      })
      .catch((error) => {
        console.error('[SW] Failed to cache files:', error);
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Skip caching for API requests and websocket connections
  if (event.request.url.includes('/api/') ||
    event.request.url.includes('/socket.io/') ||
    event.request.url.includes('chrome-extension://')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          return response;
        }

        // Fetch from network with error handling
        return fetch(event.request)
          .then((response) => {
            // Check if response is valid
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response for caching
            const responseToCache = response.clone();

            // Cache successful responses for static assets
            if (event.request.url.includes('/assets/') ||
              event.request.url.endsWith('.js') ||
              event.request.url.endsWith('.css') ||
              event.request.url.endsWith('.html')) {
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }

            return response;
          })
          .catch((error) => {
            console.log('[SW] Fetch failed for:', event.request.url, error);

            // Return a fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }

            // For other requests, just let them fail
            throw error;
          });
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});