const CACHE_NAME = 'hybrid-voice-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/overlay.html',
  '/styles.css',
  '/app.js',
  '/ui_utils.js',
  '/wake-word-processor.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort.min.js',
  '/libs/ort.wasm.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strategy: Cache First for Models (Large, static)
  if (url.pathname.includes('/models/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;
        
        try {
            const networkResponse = await fetch(event.request);
            if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
        } catch (e) {
            // If offline and no cache, we can't do much for models
            throw e;
        }
      })
    );
    return;
  }

  // Strategy: Network First for API/WebSocket (Not applicable here mostly) but generic fallback
  // Strategy: Stale-While-Revalidate for other assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Update cache if valid response
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      }).catch(() => {
        // If offline and no cache
        if (event.request.mode === 'navigate') {
            return caches.match('/overlay.html'); // Fallback to overlay
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
