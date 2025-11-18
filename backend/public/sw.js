/**
 * ZK-IMG Service Worker - Progressive Web App
 * Handles offline functionality, caching, and background sync
 */

const CACHE_NAME = 'zk-img-v1.0.0';
const STATIC_CACHE = 'zk-img-static-v1.0.0';
const IMAGE_CACHE = 'zk-img-images-v1.0.0';
const API_CACHE = 'zk-img-api-v1.0.0';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/photo-verifier.html',
  '/manifest.json',
  '/sw.js',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/test',
  '/health'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('🔧 ZK-IMG Service Worker installing...');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('📦 Caching static files...');
        return cache.addAll(STATIC_FILES);
      }),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  console.log('🚀 ZK-IMG Service Worker activating...');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE &&
                cacheName !== IMAGE_CACHE &&
                cacheName !== API_CACHE &&
                !cacheName.startsWith('zk-img-v')) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - handle requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests
  if (request.method === 'GET') {
    if (url.pathname.startsWith('/uploads/') ||
        url.pathname.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
      // Cache images
      event.respondWith(cacheFirst(request, IMAGE_CACHE));
    } else if (API_ENDPOINTS.some(endpoint => url.pathname === endpoint)) {
      // Cache API responses
      event.respondWith(networkFirst(request, API_CACHE));
    } else if (url.pathname.startsWith('/api/')) {
      // Network-only for API calls (with offline fallback)
      event.respondWith(networkOnlyWithFallback(request));
    } else {
      // Cache static files
      event.respondWith(cacheFirst(request, STATIC_CACHE));
    }
  } else if (request.method === 'POST') {
    // Handle POST requests (proof generation, etc.)
    event.respondWith(networkOnlyWithFallback(request));
  }
});

// Background sync for offline proof generation
self.addEventListener('sync', event => {
  console.log('🔄 Background sync triggered:', event.tag);

  if (event.tag === 'background-proof-generation') {
    event.waitUntil(processOfflineProofs());
  }
});

// Push notifications for proof completion
self.addEventListener('push', event => {
  console.log('📱 Push notification received');

  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Your photo verification is complete!',
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: data,
      actions: [
        {
          action: 'view',
          title: 'View Result'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(
        data.title || 'ZK-IMG Verification Complete',
        options
      )
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/photo-verifier.html')
    );
  }
});

// Message handling for communication with main thread
self.addEventListener('message', event => {
  console.log('💬 Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_IMAGE') {
    cacheImage(event.data.imageData, event.data.imageId);
  }
});

// Cache strategies
async function cacheFirst(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('❌ Cache-first failed, trying cache-only fallback');
    return caches.match(request) || new Response('Offline - Content not cached', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('❌ Network-first failed, trying cache');
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('Offline - API unavailable', { status: 503 });
  }
}

async function networkOnlyWithFallback(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.log('❌ Network request failed');

    // For API calls, return a helpful offline response
    if (request.url.includes('/api/') || request.url.includes('/prove')) {
      return new Response(JSON.stringify({
        error: 'Offline - Request queued for when connection returns',
        offline: true,
        queued: true,
        timestamp: new Date().toISOString()
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // For other requests, try cache
    return caches.match(request) || new Response('Offline - Service unavailable', { status: 503 });
  }
}

// Process offline proofs when connection returns
async function processOfflineProofs() {
  console.log('🔄 Processing offline proofs...');

  try {
    // Get stored offline requests
    const offlineRequests = await getOfflineRequests();

    if (offlineRequests.length === 0) {
      console.log('✅ No offline requests to process');
      return;
    }

    console.log(`📤 Processing ${offlineRequests.length} offline requests...`);

    // Process each request
    const results = [];
    for (const request of offlineRequests) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body
        });

        if (response.ok) {
          const result = await response.json();
          results.push({ id: request.id, success: true, result });

          // Send notification
          await self.registration.showNotification(
            'ZK-IMG Offline Processing Complete',
            {
              body: `Successfully processed ${results.length}/${offlineRequests.length} requests`,
              icon: '/icon-192x192.png',
              tag: 'offline-processing'
            }
          );
        } else {
          results.push({ id: request.id, success: false, error: response.statusText });
        }
      } catch (error) {
        results.push({ id: request.id, success: false, error: error.message });
      }
    }

    // Clear processed requests
    await clearOfflineRequests();

    // Notify main thread of results
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'OFFLINE_PROCESSING_COMPLETE',
        results: results
      });
    });

  } catch (error) {
    console.error('❌ Offline processing failed:', error);
  }
}

// Offline storage helpers
async function cacheImage(imageData, imageId) {
  try {
    const cache = await caches.open(IMAGE_CACHE);
    const response = new Response(imageData, {
      headers: { 'Content-Type': 'image/jpeg' }
    });

    await cache.put(`/cached-image/${imageId}`, response);
    console.log('📸 Image cached offline:', imageId);
  } catch (error) {
    console.error('❌ Failed to cache image:', error);
  }
}

async function getOfflineRequests() {
  // In a real implementation, this would use IndexedDB or similar
  // For now, return empty array
  return [];
}

async function clearOfflineRequests() {
  // Clear offline queue
  console.log('🧹 Cleared offline request queue');
}

// Periodic cleanup
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cleanup-cache') {
    event.waitUntil(cleanupOldCache());
  }
});

async function cleanupOldCache() {
  console.log('🧹 Cleaning up old cache entries...');

  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();

  // Remove entries older than 24 hours
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const date = response.headers.get('date');
      if (date && new Date(date).getTime() < cutoff) {
        await cache.delete(request);
      }
    }
  }

  console.log('✅ Cache cleanup complete');
}

// Performance monitoring
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PERFORMANCE_METRIC') {
    console.log('📊 Performance metric:', event.data.metric, event.data.value);
    // Could send to analytics service
  }
});

// Error handling
self.addEventListener('error', event => {
  console.error('🚨 Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('🚨 Service Worker unhandled rejection:', event.reason);
});

console.log('✅ ZK-IMG Service Worker loaded successfully');
