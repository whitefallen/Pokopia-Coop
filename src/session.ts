const SESSION_PARAM = 'session'
const SESSION_STORAGE_KEY = 'pokopia-coop-session-id'
const PLAYER_PARAM = 'player'
const PLAYER_STORAGE_PREFIX = 'pokopia-coop-player:'
// Keep names short for compact share URLs and predictable UI rendering.
export const MAX_PLAYER_NAME_LENGTH = 40

export function createSessionId(): string {
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

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_PLAYER_NAME_LENGTH)
}

export function resolvePlayerName(sessionId: string): string {
  const url = new URL(window.location.href)
  const fromUrl = normalizePlayerName(url.searchParams.get(PLAYER_PARAM) ?? '')
  if (fromUrl) {
    localStorage.setItem(`${PLAYER_STORAGE_PREFIX}${sessionId}`, fromUrl)
    return fromUrl
  }

  return normalizePlayerName(localStorage.getItem(`${PLAYER_STORAGE_PREFIX}${sessionId}`) ?? '')
}

export function setPlayerName(sessionId: string, playerName: string): void {
  const normalized = normalizePlayerName(playerName)
  const url = new URL(window.location.href)

  if (normalized) {
    localStorage.setItem(`${PLAYER_STORAGE_PREFIX}${sessionId}`, normalized)
    url.searchParams.set(PLAYER_PARAM, normalized)
  } else {
    localStorage.removeItem(`${PLAYER_STORAGE_PREFIX}${sessionId}`)
    url.searchParams.delete(PLAYER_PARAM)
  }

  window.history.replaceState({}, '', url)
}
