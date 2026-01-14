const CACHE_NAME = 'hybrid-voice-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/overlay.html',
  '/styles.css',
  '/app.js',
  '/wake-word-processor.js',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/ort.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests that aren't in our cache list (like some fonts if dynamic)
  // or WebSocket connections (which fetch doesn't handle anyway, but good to be safe logically)
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response if found
      if (response) {
        return response;
      }
      
      // Clone request for fetching
      const fetchRequest = event.request.clone();
      
      return fetch(fetchRequest).then((response) => {
        // Check if valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Cache new static assets dynamically if valid
        // (Optional: restrict this to avoid caching API calls if ever added)
        const responseToCache = response.clone();
        
        // Cache only same-origin requests unless explicitly handled
        if (event.request.url.startsWith(self.location.origin)) {
            caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
            });
        }

        return response;
      });
    })
  );
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
});
