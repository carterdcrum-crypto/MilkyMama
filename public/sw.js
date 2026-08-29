const CACHE = 'milky-mama-v4'
const SCOPE = new URL(self.registration.scope)
const asset = path => new URL(path, SCOPE).toString()
const CORE = [asset('./'), asset('index.html'), asset('manifest.webmanifest'), asset('icon.svg')]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(event.request, copy))
        }
        return response
      })
      .catch(async () => {
        const hit = await caches.match(event.request)
        if (hit) return hit
        if (event.request.mode === 'navigate') return caches.match(asset('index.html'))
        return Response.error()
      })
  )
})

self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { payload = { body: event.data?.text() || '' } }
  const title = payload.title || 'Time to pump'
  const options = {
    body: payload.body || 'Your Milky Mama pumping reminder is due.',
    icon: asset('icon.svg'),
    badge: asset('icon.svg'),
    tag: 'milky-mama-pump-reminder',
    renotify: true,
    data: { url: payload.url ? new URL(payload.url, self.location.origin).toString() : asset('./') },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = event.notification.data?.url || asset('./')
  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windowClients) {
      if (client.url.startsWith(SCOPE.toString()) && 'focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(target)
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target)
  })())
})
