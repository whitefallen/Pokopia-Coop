const SESSION_PARAM = 'session'
const SESSION_STORAGE_KEY = 'pokopia-coop-session-id'

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const randomBytes = new Uint32Array(1)
    crypto.getRandomValues(randomBytes)
    return `session-${Date.now().toString(36)}-${randomBytes[0].toString(36)}`
  }

  return `session-${Date.now().toString(36)}`
}

export function resolveSessionId(): string {
  const url = new URL(window.location.href)
  const fromUrl = url.searchParams.get(SESSION_PARAM)?.trim()
  if (fromUrl) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, fromUrl)
    return fromUrl
  }

  const fromStorage = sessionStorage.getItem(SESSION_STORAGE_KEY)?.trim()
  const sessionId = fromStorage || createSessionId()

  sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId)
  url.searchParams.set(SESSION_PARAM, sessionId)
  window.history.replaceState({}, '', url)

  return sessionId
}
