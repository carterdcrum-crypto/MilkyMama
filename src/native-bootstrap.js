import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

const STORAGE_KEY = 'milkyMama.v1'
const PERMISSION_KEY = 'milkyMama.nativeReminderPermission'
const FINGERPRINT_KEY = 'milkyMama.nativeReminderFingerprint'
const NativeAlarm = registerPlugin('MilkyMamaAlarm')
const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

const clamp = (n, a, b) => Math.min(Math.max(Number(n) || 0, a), b)
const parseClock = value => {
  const [h, m] = String(value || '00:00').split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}
const isDayClock = (date, smart = {}) => {
  const minute = date.getHours() * 60 + date.getMinutes()
  const start = parseClock(smart.dayStart || '06:00')
  const end = parseClock(smart.nightStart || '22:00')
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}

function readState() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return { reminders: state.reminders || {}, sessions: Array.isArray(state.sessions) ? state.sessions : [] }
  } catch {
    return { reminders: {}, sessions: [] }
  }
}

function latestSessionEnd(sessions = []) {
  return sessions.reduce((latest, session) => {
    const started = new Date(session.startedAt || 0).getTime()
    const end = started + Number(session.durationSec || 0) * 1000
    return Math.max(latest, Number.isFinite(end) ? end : 0)
  }, 0)
}

function buildOccurrences(reminders, sessions, limit = 32) {
  if (!reminders?.enabled) return []
  const now = new Date()
  const horizon = now.getTime() + 14 * 86400000
  const results = []

  if (reminders.mode === 'times') {
    const times = [...new Set((reminders.times || []).filter(v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)))].sort()
    for (let day = 0; day < 14 && results.length < limit; day += 1) {
      for (const time of times) {
        const [hour, minute] = time.split(':').map(Number)
        const date = new Date(now)
        date.setDate(now.getDate() + day)
        date.setHours(hour, minute, 0, 0)
        if (date > now) results.push(date)
        if (results.length >= limit) break
      }
    }
    return results
  }

  const sessionAnchor = latestSessionEnd(sessions)
  let cursor = Number(reminders.anchorAt || sessionAnchor || now.getTime())
  let guard = 0

  while (results.length < limit && cursor < horizon && guard++ < 3000) {
    let minutes
    if (reminders.mode === 'smart') {
      const cursorDate = new Date(cursor)
      const temporary = reminders.temporary && new Date(reminders.temporary.until).getTime() > cursor
      minutes = temporary
        ? Number(reminders.temporary.intervalMinutes)
        : isDayClock(cursorDate, reminders.smart)
          ? Number(reminders.smart?.dayIntervalMinutes || 180)
          : Number(reminders.smart?.nightIntervalMinutes || 240)
    } else {
      minutes = Number(reminders.intervalMinutes || 180)
    }

    cursor += clamp(minutes, 15, 1440) * 60000
    if (cursor > now.getTime() && cursor <= horizon) results.push(new Date(cursor))
  }

  return results
}

async function alarmKitAvailable() {
  if (!isNativeIOS) return false
  try { return Boolean((await NativeAlarm.isAvailable()).available) } catch { return false }
}

async function localPermission() {
  try { return (await LocalNotifications.checkPermissions()).display } catch { return 'prompt' }
}

function setPermission(value) {
  localStorage.setItem(PERMISSION_KEY, value)
  if (window.Notification && typeof window.Notification === 'object') window.Notification.permission = value
}

async function requestPermission() {
  if (!isNativeIOS) throw new Error('Native reminders are only available inside the iPhone app.')
  if (await alarmKitAvailable()) {
    const result = await NativeAlarm.requestAuthorization()
    const granted = result.status === 'authorized'
    setPermission(granted ? 'granted' : 'denied')
    if (!granted) throw new Error('Alarm permission was not granted. You can change it in iPhone Settings.')
    return 'granted'
  }

  const result = await LocalNotifications.requestPermissions()
  const granted = result.display === 'granted'
  setPermission(granted ? 'granted' : 'denied')
  if (!granted) throw new Error('Notification permission was not granted. You can change it in iPhone Settings.')
  return 'granted'
}

async function cancelFallbackNotifications() {
  try {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications?.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(item => ({ id: item.id })) })
  } catch {}
}

async function syncNow(force = false) {
  if (!isNativeIOS) return { ok: false, reason: 'not_native_ios' }
  const { reminders, sessions } = readState()
  const occurrences = buildOccurrences(reminders, sessions)
  const fingerprint = JSON.stringify({ reminders, latest: latestSessionEnd(sessions), occurrences: occurrences.map(d => d.getTime()) })
  if (!force && localStorage.getItem(FINGERPRINT_KEY) === fingerprint) return { ok: true, skipped: true }

  if (!reminders.enabled) {
    await NativeAlarm.cancelAll().catch(() => {})
    await cancelFallbackNotifications()
    localStorage.setItem(FINGERPRINT_KEY, fingerprint)
    return { ok: true, disabled: true }
  }

  if (await alarmKitAvailable()) {
    const status = await NativeAlarm.authorizationStatus().catch(() => ({ status: 'unknown' }))
    if (status.status !== 'authorized') return { ok: false, reason: 'permission_required' }
    await cancelFallbackNotifications()
    const result = await NativeAlarm.replaceSchedule({ occurrences: occurrences.map(date => ({ fireAt: date.getTime() })) })
    setPermission('granted')
    localStorage.setItem(FINGERPRINT_KEY, fingerprint)
    return { ...result, engine: 'AlarmKit' }
  }

  const permission = await localPermission()
  if (permission !== 'granted') return { ok: false, reason: 'permission_required' }
  await NativeAlarm.cancelAll().catch(() => {})
  await cancelFallbackNotifications()
  if (occurrences.length) {
    await LocalNotifications.schedule({
      notifications: occurrences.map((date, index) => ({
        id: 760000 + index,
        title: 'Time to Pump',
        body: 'Your Milky Mama pumping reminder is due.',
        schedule: { at: date },
        extra: { kind: 'pump' },
      })),
    })
  }
  setPermission('granted')
  localStorage.setItem(FINGERPRINT_KEY, fingerprint)
  return { ok: true, scheduled: occurrences.length, engine: 'local-notifications' }
}

if (isNativeIOS) {
  if (!('Notification' in window)) {
    const shim = { permission: localStorage.getItem(PERMISSION_KEY) || 'default', requestPermission }
    Object.defineProperty(window, 'Notification', { configurable: true, value: shim })
  }

  window.MilkyMamaPush = {
    sync: () => syncNow(true),
    requestPermission,
    supported: () => true,
    supportState: () => ({ supported: true, reason: '' }),
  }
  window.MilkyMamaNative = { isNative: true, platform: 'ios', syncReminders: () => syncNow(true) }

  window.addEventListener('load', () => setTimeout(() => syncNow(true).catch(() => {}), 700))
  window.addEventListener('focus', () => syncNow(true).catch(() => {}))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow(true).catch(() => {})
  })
  setInterval(() => syncNow(false).catch(() => {}), 5000)
}

export { isNativeIOS, syncNow as syncNativeReminders }
