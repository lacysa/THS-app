/* THS Operations Hub service worker.
   Intentionally network-first with no operational-data cache.
   This enables installability without risking stale housekeeping,
   room-check, breakfast, or maintenance data. */

const VERSION = 'ths-pwa-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))
      ),
      self.clients.claim()
    ])
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  // Operational pages and API data should always come from the network.
  // Static framework assets are already efficiently cached by the browser/CDN.
  event.respondWith(fetch(event.request))
})
