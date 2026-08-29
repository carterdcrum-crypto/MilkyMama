const CACHE = 'milky-mama-v3'
const REMINDER_CACHE = 'milky-mama-reminders-v1'
const SCOPE = new URL(self.registration.scope)
const asset = path => new URL(path, SCOPE).toString()
const CORE = [asset('./'), asset('index.html'), asset('manifest.webmanifest'), asset('icon.svg')]
const CONFIG_URL = asset('__reminder-config__')

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE && key !== REMINDER_CACHE).map(key => caches.delete(key))))
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

self.addEventListener('message', event => {
  const message = event.data || {}
  if (message.type === 'REMINDER_CONFIG') {
    event.waitUntil(storeReminderConfig(message.config || {}))
  }
  if (message.type === 'CHECK_REMINDERS') {
    event.waitUntil(checkPumpReminder())
  }
})

self.addEventListener('periodicsync', event => {
  if (event.tag === 'milky-mama-pump-reminders') {
    event.waitUntil(checkPumpReminder())
  }
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windowClients) {
      if (client.url.startsWith(SCOPE.toString()) && 'focus' in client) return client.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(asset('./'))
    return undefined
  })())
})

function configVersion(config) {
  return JSON.stringify({
    enabled: Boolean(config.enabled),
    mode: config.mode === 'times' ? 'times' : 'interval',
    intervalMinutes: Number(config.intervalMinutes || 180),
    times: Array.isArray(config.times) ? config.times : [],
    anchorAt: Number(config.anchorAt || 0),
  })
}

async function storeReminderConfig(config) {
  const existing = await loadReminderConfig()
  const version = configVersion(config)
  const next = {
    enabled: Boolean(config.enabled),
    mode: config.mode === 'times' ? 'times' : 'interval',
    intervalMinutes: Math.min(1440, Math.max(15, Number(config.intervalMinutes || 180))),
    times: Array.isArray(config.times) ? [...new Set(config.times.filter(Boolean))].sort() : [],
    anchorAt: Number(config.anchorAt || Date.now()),
    version,
    lastFiredKey: existing?.version === version ? existing.lastFiredKey || null : null,
  }
  const cache = await caches.open(REMINDER_CACHE)
  await cache.put(CONFIG_URL, new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } }))
}

async function loadReminderConfig() {
  const cache = await caches.open(REMINDER_CACHE)
  const response = await cache.match(CONFIG_URL)
  if (!response) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function saveWorkerState(config) {
  const cache = await caches.open(REMINDER_CACHE)
  await cache.put(CONFIG_URL, new Response(JSON.stringify(config), { headers: { 'content-type': 'application/json' } }))
}

function dateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dueReminderKey(config, now = new Date()) {
  if (!config?.enabled) return null

  if (config.mode === 'times') {
    const times = [...new Set((config.times || []).filter(Boolean))].sort()
    if (!times.length) return null
    const nowMs = now.getTime()
    let latest = null
    for (const time of times) {
      const [hour, minute] = time.split(':').map(Number)
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue
      const candidate = new Date(now)
      candidate.setHours(hour, minute, 0, 0)
      if (candidate.getTime() <= nowMs && (!latest || candidate > latest)) latest = candidate
    }
    if (!latest) return null
    const lateBy = nowMs - latest.getTime()
    if (lateBy > 60 * 60 * 1000) return null
    const hh = String(latest.getHours()).padStart(2, '0')
    const mm = String(latest.getMinutes()).padStart(2, '0')
    return `time:${dateKey(latest)}:${hh}:${mm}`
  }

  const intervalMs = Math.min(1440, Math.max(15, Number(config.intervalMinutes || 180))) * 60000
  const anchor = Number(config.anchorAt || now.getTime())
  const slot = Math.floor((now.getTime() - anchor) / intervalMs)
  if (slot < 1) return null
  return `interval:${config.version}:${slot}`
}

async function checkPumpReminder() {
  const config = await loadReminderConfig()
  if (!config?.enabled) return
  const key = dueReminderKey(config)
  if (!key || key === config.lastFiredKey) return

  try {
    await self.registration.showNotification('Time to pump', {
      body: 'Your Milky Mama pumping reminder is due.',
      icon: asset('icon.svg'),
      badge: asset('icon.svg'),
      tag: 'milky-mama-pump-reminder',
      renotify: true,
      data: { url: asset('./') },
    })
    config.lastFiredKey = key
    await saveWorkerState(config)
  } catch {
    // Notification permission or platform support can prevent delivery.
  }
}
