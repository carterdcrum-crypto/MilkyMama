const CLOUD_URL = 'https://qgpjkmitexjvciftpkzh.supabase.co/functions/v1/cloud-state'
const KEY_NAME = 'milkyMama.cloudSyncKey'

function bytesToBase64Url(bytes) {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function makeKey() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

export function getCloudKey() {
  let key = localStorage.getItem(KEY_NAME)
  if (!key) {
    key = makeKey()
    localStorage.setItem(KEY_NAME, key)
  }
  return key
}

export function setCloudKey(value) {
  const key = String(value || '').trim()
  if (key.length < 32) throw new Error('That sync key is not valid.')
  localStorage.setItem(KEY_NAME, key)
  return key
}

async function post(body) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(CLOUD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `Cloud sync failed: ${response.status}`)
    return data
  } finally {
    clearTimeout(timeout)
  }
}

export async function pullCloud() {
  return post({ action: 'pull', syncKey: getCloudKey() })
}

export async function pushCloud(payload) {
  return post({ action: 'push', syncKey: getCloudKey(), payload })
}

export function maskCloudKey() {
  const key = getCloudKey()
  return `${key.slice(0, 6)}••••••••${key.slice(-6)}`
}
