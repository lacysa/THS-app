/* THS Operations Hub PWA.
 * Installable shell only. Never intercept page, auth, or asset requests.
 * Navigation and authentication must always use the live server.
 */
const VERSION = 'ths-pwa-v2-no-fetch-interception'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})
