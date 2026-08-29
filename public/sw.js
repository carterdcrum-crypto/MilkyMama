const CACHE = 'milky-mama-v2'
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
