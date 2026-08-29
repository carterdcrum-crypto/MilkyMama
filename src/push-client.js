const STORAGE_KEY = 'milkyMama.v1'
const DEVICE_KEY = 'milkyMama.pushDeviceId'
const LAST_SYNC_KEY = 'milkyMama.pushLastSync'
const PUSH_URL = 'https://qgpjkmitexjvciftpkzh.supabase.co/functions/v1/push-reminders'
const VAPID_PUBLIC_KEY = 'BO6cOfVUDyGVGh7XRJvpoV7iKxLVjJUEfB6dPt9LrP6BR38zQoTVSeqjak058RExTPthY7dfTedeuyV0qhwQD9Q'

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
}

function deviceId() {
  let value = localStorage.getItem(DEVICE_KEY)
  if (!value) {
    value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_KEY, value)
  }
  return value
}

function readReminderState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const reminders = data.reminders || {}
    return {
      enabled: Boolean(reminders.enabled),
      mode: reminders.mode === 'times' ? 'times' : 'interval',
      intervalMinutes: Number(reminders.intervalMinutes || 180),
      times: Array.isArray(reminders.times) ? reminders.times : [],
      anchorAt: reminders.anchorAt || Date.now(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }
  } catch {
    return null
  }
}

async function post(body) {
  const response = await fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Push sync failed: ${response.status}`)
  return response.json()
}

async function ensureSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null
  if (Notification.permission !== 'granted') return null
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  return subscription
}

async function syncNow(force = false) {
  const reminders = readReminderState()
  if (!reminders) return

  const fingerprint = JSON.stringify(reminders)
  if (!force && localStorage.getItem(LAST_SYNC_KEY) === fingerprint) return

  if (!reminders.enabled) {
    await post({ action: 'disable', deviceId: deviceId() }).catch(() => {})
    localStorage.setItem(LAST_SYNC_KEY, fingerprint)
    return
  }

  const subscription = await ensureSubscription()
  if (!subscription) return

  await post({
    action: 'save',
    deviceId: deviceId(),
    subscription: subscription.toJSON(),
    ...reminders,
  })
  localStorage.setItem(LAST_SYNC_KEY, fingerprint)
}

function isHomeScreenApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

window.addEventListener('load', () => {
  setTimeout(() => syncNow(true).catch(() => {}), 1200)
  setInterval(() => syncNow(false).catch(() => {}), 5000)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncNow(true).catch(() => {})
})

window.addEventListener('focus', () => syncNow(true).catch(() => {}))

window.MilkyMamaPush = {
  sync: () => syncNow(true),
  test: async () => {
    await syncNow(true)
    return post({ action: 'test', deviceId: deviceId() })
  },
  supported: () => isHomeScreenApp() && 'PushManager' in window && 'Notification' in window,
}
