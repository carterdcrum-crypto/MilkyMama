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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || `Push request failed: ${response.status}`)
    return payload
  } finally {
    clearTimeout(timeout)
  }
}

function isHomeScreenApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function supportState() {
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
    return { supported: false, reason: 'Web Push is not available in this browser.' }
  }
  if (!isHomeScreenApp()) {
    return { supported: false, reason: 'Add Milky Mama to your iPhone Home Screen first, then open it from the Home Screen.' }
  }
  return { supported: true, reason: '' }
}

async function requestPermission() {
  const support = supportState()
  if (!support.supported) throw new Error(support.reason)
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') throw new Error('Notifications are blocked. Allow Milky Mama notifications in iPhone Settings.')
  const result = await Notification.requestPermission()
  if (result !== 'granted') throw new Error('Notification permission was not granted.')
  return result
}

async function ensureSubscription({ askPermission = false } = {}) {
  const support = supportState()
  if (!support.supported) throw new Error(support.reason)
  if (askPermission) await requestPermission()
  if (Notification.permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (subscription) return subscription

  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
    })
  } catch {
    const stale = await registration.pushManager.getSubscription().catch(() => null)
    if (stale) await stale.unsubscribe().catch(() => {})
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  return subscription
}

async function syncNow(force = false, { askPermission = false } = {}) {
  const reminders = readReminderState()
  if (!reminders) return { ok: false, reason: 'missing_state' }

  const fingerprint = JSON.stringify(reminders)
  if (!force && localStorage.getItem(LAST_SYNC_KEY) === fingerprint) return { ok: true, skipped: true }

  if (!reminders.enabled) {
    await post({ action: 'disable', deviceId: deviceId() }).catch(() => {})
    localStorage.setItem(LAST_SYNC_KEY, fingerprint)
    return { ok: true, disabled: true }
  }

  const subscription = await ensureSubscription({ askPermission })
  if (!subscription) return { ok: false, reason: 'permission_required' }

  const result = await post({
    action: 'save',
    deviceId: deviceId(),
    subscription: subscription.toJSON(),
    ...reminders,
  })
  localStorage.setItem(LAST_SYNC_KEY, fingerprint)
  return result
}

window.addEventListener('load', () => {
  setTimeout(() => syncNow(true).catch(() => {}), 800)
  setInterval(() => syncNow(false).catch(() => {}), 4000)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncNow(true).catch(() => {})
})

window.addEventListener('focus', () => syncNow(true).catch(() => {}))

window.MilkyMamaPush = {
  sync: options => syncNow(true, options),
  requestPermission,
  supported: () => supportState().supported,
  supportState,
}
